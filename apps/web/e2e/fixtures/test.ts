import { expect, test as base, type ConsoleMessage, type Request } from "@playwright/test";
import {
  formatE2EDiagnosticEntries,
  pushBoundedE2EDiagnosticEntry,
  type E2EDiagnosticEntry,
} from "../../src/lib/e2e/diagnostics";

export const test = base.extend({
  page: async ({ page }, runPage, testInfo) => {
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

    page.on("console", recordConsole);
    page.on("pageerror", recordPageError);
    page.on("requestfailed", recordRequestFailed);

    try {
      await runPage(page);
    } finally {
      page.off("console", recordConsole);
      page.off("pageerror", recordPageError);
      page.off("requestfailed", recordRequestFailed);

      if (testInfo.status !== testInfo.expectedStatus) {
        await testInfo.attach("browser-diagnostics.txt", {
          body: formatE2EDiagnosticEntries(diagnostics),
          contentType: "text/plain",
        });
      }
    }
  },
});
export { expect };

