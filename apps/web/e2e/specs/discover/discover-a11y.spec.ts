import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";

import { resolveE2ETimeoutPolicy } from "@/lib/e2e/timeout-policy";
import { expect, test } from "../../fixtures/test";
import { loginAs } from "../../helpers/auth";
import {
  cleanupE2EDiscoverData,
  resetE2EDiscoverMembership,
  seedE2EDiscoverData,
  setE2EUserTheme,
  type E2EDiscoverFixture,
} from "../../helpers/db";
import { applyParityTheme, type ParityTheme } from "../../helpers/design-parity";
import { WCAG_TAGS, partitionAxeViolations, type AxeViolation } from "../../helpers/a11y-gate";
import { gotoAppRoute, visibleTestId } from "../../helpers/navigation";

const THEMES = ["theme-light", "theme-dark"] as const satisfies readonly ParityTheme[];
const { screenTestTimeoutMs } = resolveE2ETimeoutPolicy();

function formatViolation(violation: AxeViolation): string {
  const nodes = violation.nodes
    .map((node) => {
      const summary = node.failureSummary?.replace(/\s+/gu, " ").trim() ?? "ayrıntı yok";
      return `${node.target.join(" ")}: ${summary}`;
    })
    .join(" | ");
  return `[${violation.impact ?? "unknown"}] ${violation.id}: ${violation.help} (${nodes})`;
}

async function scan(page: Page, label: string, selector: string): Promise<void> {
  const results = await new AxeBuilder({ page }).include(selector).withTags(WCAG_TAGS).analyze();
  const partition = partitionAxeViolations(results.violations);

  // Yerel biçimlendirici `failureSummary`yi de yazıyor; bölümleme ortak kapıdan geliyor ki
  // "bilinen sapma" tanımı bütün taramalarda tek olsun.
  for (const violation of [...partition.knownDeviations, ...partition.informational]) {
    // eslint-disable-next-line no-console
    console.log(`a11y (engellemeyen) ${label}: ${formatViolation(violation)}`);
  }

  expect(partition.blocking.map(formatViolation), `${label}: kritik/ciddi ihlal olamaz`).toEqual(
    [],
  );
}

async function openDiscover(page: Page, path = "/discover", readyTestId = "discover-grid") {
  await gotoAppRoute(page, path, { readyTestId, timeout: 30_000 });
  await expect(visibleTestId(page, "discover-page")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("discover-card-skeleton")).toHaveCount(0, { timeout: 30_000 });
  await expect(page.locator('[data-testid="app-startup-screen"]:visible')).toHaveCount(0, {
    timeout: 30_000,
  });
}

test.describe.configure({ mode: "serial", timeout: Math.max(screenTestTimeoutMs, 120_000) });

test.describe("Keşfet erişilebilirlik kapısı", () => {
  let fixture: E2EDiscoverFixture;

  test.beforeAll(async () => {
    fixture = await seedE2EDiscoverData();
  });

  test.afterAll(async () => {
    await cleanupE2EDiscoverData();
    await setE2EUserTheme("alice", "theme-dark");
  });

  test.beforeEach(async () => {
    await resetE2EDiscoverMembership("alice");
  });

  for (const theme of THEMES) {
    test(`ana yüzey, panel ve modal axe taraması · ${theme}`, async ({ page }) => {
      await page.setViewportSize({ height: 920, width: 1360 });
      await setE2EUserTheme("alice", theme);
      await applyParityTheme(page, theme);
      await loginAs(page, "alice");
      await openDiscover(page);
      await scan(page, `discover/${theme}`, '[data-testid="discover-page"]');

      const preview = page
        .getByTestId("discover-server-card")
        .filter({ hasText: fixture.panelServerName })
        .getByRole("button", { name: "Önizle" });
      await preview.click();
      await expect(page.getByTestId("server-profile-panel")).toBeVisible();
      await scan(page, `discover-panel/${theme}`, '[data-testid="server-profile-panel"]');

      await page.keyboard.press("Escape");
      const joinTrigger = page.getByRole("link", { name: "Sunucuya katıl" });
      await joinTrigger.click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await expect(page.getByRole("dialog")).toHaveCSS("opacity", "1");
      await scan(page, `discover-modal/${theme}`, '[role="dialog"]');
    });
  }

  test("klavye turu dizin → ızgara → panel → modal ve odak dönüşlerini korur", async ({ page }) => {
    await page.setViewportSize({ height: 920, width: 1360 });
    await loginAs(page, "alice");
    await openDiscover(page);

    expect(
      await page.evaluate(
        () =>
          Array.from(document.querySelectorAll("[tabindex]")).filter(
            (node) => Number(node.getAttribute("tabindex")) > 0,
          ).length,
      ),
    ).toBe(0);

    const directoryCategory = page.getByTestId("discover-category-row").filter({ hasText: "Oyun" });
    await directoryCategory.focus();
    await expect(directoryCategory).toBeFocused();
    await directoryCategory.press("Enter");
    await expect(page).toHaveURL(/cat=oyun/u);

    const card = page.getByTestId("discover-server-card").first();
    const cardOpen = card.getByTestId("discover-server-card-open");
    await cardOpen.focus();
    await cardOpen.press("Enter");
    await expect(page.getByTestId("server-profile-panel")).toBeVisible();
    await expect(page.getByRole("button", { name: "Paneli kapat" })).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(page.getByTestId("server-profile-panel")).toHaveCount(0);
    await expect(cardOpen).toBeFocused();

    await gotoAppRoute(page, "/discover", { readyTestId: "discover-grid", timeout: 30_000 });
    const modalTrigger = page.getByRole("link", { name: "Sunucuya katıl" });
    await modalTrigger.focus();
    await modalTrigger.press("Enter");
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByPlaceholder("davet-kodu")).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(modalTrigger).toBeFocused();
  });

  test("dar panel overlay odak tuzağı kurar; modal açıldığında tek tuzak kalır", async ({
    page,
  }) => {
    await page.setViewportSize({ height: 900, width: 1000 });
    await loginAs(page, "alice");
    await openDiscover(page, `/discover?panel=${fixture.panelServerId}`, "server-profile-panel");
    const panel = page.getByTestId("server-profile-panel");
    await expect(panel).toBeVisible();

    for (let index = 0; index < 20; index += 1) {
      await page.keyboard.press("Tab");
      expect(
        await page.evaluate(() => {
          const panelNode = document.querySelector('[data-testid="server-profile-panel"]');
          return Boolean(panelNode?.contains(document.activeElement));
        }),
      ).toBe(true);
    }

    await gotoAppRoute(page, `/discover?panel=${fixture.panelServerId}&modal=join`, {
      readyTestId: "server-profile-panel",
      timeout: 30_000,
    });
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByPlaceholder("davet-kodu")).toBeFocused();
  });
});
