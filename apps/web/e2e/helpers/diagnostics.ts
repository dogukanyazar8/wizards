import type { ConsoleMessage, Page, Request, Response, TestInfo } from "@playwright/test";
import {
  formatE2EDiagnosticEntries,
  pushBoundedE2EDiagnosticEntry,
  type E2EDiagnosticEntry,
} from "../../src/lib/e2e/diagnostics";

type PageSnapshot = {
  activeElement: string;
  devicePixelRatio: number;
  documentHeight: number;
  loadMs: number | null;
  resourceCount: number;
  readyState: string;
  scrollWidthDelta: number;
  title: string;
  url: string;
  viewport: string;
  visibleDialogCount: number;
  visibleTestIds: string[];
};

export type E2EPageDiagnosticsHandle = {
  attachIfFailed: () => Promise<void>;
  dispose: () => void;
};

const VISIBLE_TEST_ID_LIMIT = 80;

function safeAttachmentName(label: string): string {
  return `${label.replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "") || "browser"}-diagnostics.txt`;
}

async function collectPageSnapshot(page: Page): Promise<PageSnapshot | null> {
  if (page.isClosed()) {
    return null;
  }

  return page.evaluate((testIdLimit) => {
    const describeElement = (element: Element | null): string => {
      if (!element) {
        return "none";
      }

      const tag = element.tagName.toLowerCase();
      const role = element.getAttribute("role");
      const testId = element.getAttribute("data-testid");
      const ariaLabel = element.getAttribute("aria-label");
      const id = element.id;
      const parts = [
        `tag=${tag}`,
        role ? `role=${role}` : null,
        testId ? `testid=${testId}` : null,
        ariaLabel ? `aria=${ariaLabel}` : null,
        id ? `id=${id}` : null,
      ].filter(Boolean);

      return parts.join(",");
    };

    const isVisible = (element: Element): boolean => {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);

      return (
        rect.width > 0 &&
        rect.height > 0 &&
        style.visibility !== "hidden" &&
        style.display !== "none"
      );
    };

    const visibleTestIds = Array.from(document.querySelectorAll("[data-testid]"))
      .filter(isVisible)
      .slice(0, testIdLimit)
      .map((element) => element.getAttribute("data-testid") ?? "")
      .filter(Boolean);

    const maxScrollWidth = Math.max(
      document.body.scrollWidth,
      document.documentElement.scrollWidth,
    );
    const maxScrollHeight = Math.max(
      document.body.scrollHeight,
      document.documentElement.scrollHeight,
    );
    const navigationEntry = performance.getEntriesByType("navigation")[0] as
      PerformanceNavigationTiming | undefined;
    const visibleDialogCount = Array.from(
      document.querySelectorAll('[role="dialog"],[data-notification-popup="true"]'),
    ).filter(isVisible).length;

    return {
      activeElement: describeElement(document.activeElement),
      devicePixelRatio: window.devicePixelRatio,
      documentHeight: maxScrollHeight,
      loadMs:
        navigationEntry && navigationEntry.loadEventEnd > 0
          ? Math.round(navigationEntry.loadEventEnd - navigationEntry.startTime)
          : null,
      resourceCount: performance.getEntriesByType("resource").length,
      readyState: document.readyState,
      scrollWidthDelta: maxScrollWidth - window.innerWidth,
      title: document.title,
      url: window.location.href,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      visibleDialogCount,
      visibleTestIds,
    };
  }, VISIBLE_TEST_ID_LIMIT);
}

async function pushPageSnapshot(
  page: Page,
  diagnostics: E2EDiagnosticEntry[],
  label: string,
): Promise<void> {
  try {
    const snapshot = await collectPageSnapshot(page);

    if (!snapshot) {
      pushBoundedE2EDiagnosticEntry(diagnostics, {
        message: `label=${label} page=closed`,
        type: "page",
      });
      return;
    }

    pushBoundedE2EDiagnosticEntry(diagnostics, {
      message: [
        `label=${label}`,
        `title=${snapshot.title}`,
        `readyState=${snapshot.readyState}`,
        `viewport=${snapshot.viewport}`,
        `activeElement=${snapshot.activeElement}`,
      ].join(" | "),
      type: "page",
      url: snapshot.url,
    });

    pushBoundedE2EDiagnosticEntry(diagnostics, {
      message: [
        `label=${label}`,
        `viewport=${snapshot.viewport}`,
        `dpr=${snapshot.devicePixelRatio}`,
        `scrollWidthDelta=${snapshot.scrollWidthDelta}`,
        `documentHeight=${snapshot.documentHeight}`,
        `visibleDialogs=${snapshot.visibleDialogCount}`,
      ].join(" | "),
      type: "viewport",
      url: snapshot.url,
    });

    pushBoundedE2EDiagnosticEntry(diagnostics, {
      message: [
        `label=${label}`,
        `loadMs=${snapshot.loadMs ?? "unavailable"}`,
        `resourceCount=${snapshot.resourceCount}`,
      ].join(" | "),
      type: "performance",
      url: snapshot.url,
    });

    pushBoundedE2EDiagnosticEntry(diagnostics, {
      message: `label=${label} visibleTestIds=${snapshot.visibleTestIds.join(",") || "none"}`,
      type: "dom",
      url: snapshot.url,
    });
  } catch (error) {
    pushBoundedE2EDiagnosticEntry(diagnostics, {
      message: error instanceof Error ? (error.stack ?? error.message) : String(error),
      type: "pageerror",
    });
  }
}

export function attachE2EPageDiagnostics(
  page: Page,
  testInfo: TestInfo,
  label = "browser",
): E2EPageDiagnosticsHandle {
  const diagnostics: E2EDiagnosticEntry[] = [];

  const recordConsole = (message: ConsoleMessage) => {
    const level = message.type();
    if (level !== "error" && level !== "warning") {
      return;
    }

    const location = message.location();
    pushBoundedE2EDiagnosticEntry(diagnostics, {
      level,
      message: message.text(),
      type: "console",
      url: location.url,
    });
  };

  const recordPageError = (error: Error) => {
    pushBoundedE2EDiagnosticEntry(diagnostics, {
      message: error.stack ?? error.message,
      type: "pageerror",
    });
  };

  const recordRequestFailed = (request: Request) => {
    pushBoundedE2EDiagnosticEntry(diagnostics, {
      failure: request.failure()?.errorText ?? "unknown",
      method: request.method(),
      type: "requestfailed",
      url: request.url(),
    });
  };

  const recordBadResponse = (response: Response) => {
    const status = response.status();

    if (status < 400) {
      return;
    }

    const request = response.request();
    pushBoundedE2EDiagnosticEntry(diagnostics, {
      failure: `status=${status}`,
      method: request.method(),
      type: "network",
      url: response.url(),
    });
  };

  page.on("console", recordConsole);
  page.on("pageerror", recordPageError);
  page.on("requestfailed", recordRequestFailed);
  page.on("response", recordBadResponse);

  return {
    attachIfFailed: async () => {
      if (testInfo.status === testInfo.expectedStatus && testInfo.errors.length === 0) {
        return;
      }

      await pushPageSnapshot(page, diagnostics, label);
      await testInfo.attach(safeAttachmentName(label), {
        body: formatE2EDiagnosticEntries(diagnostics),
        contentType: "text/plain",
      });
    },
    dispose: () => {
      page.off("console", recordConsole);
      page.off("pageerror", recordPageError);
      page.off("requestfailed", recordRequestFailed);
      page.off("response", recordBadResponse);
    },
  };
}
