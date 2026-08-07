import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

test.describe.configure({ mode: "serial" });

async function waitForRun(page: Page) {
  await expect(page.locator("#completion-panel")).toBeVisible();
  await expect(page.locator("#cancel-run")).toBeDisabled();
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Kalite Kontrol Merkezi" })).toBeVisible();
  await expect(page.locator("#readiness-badge")).toHaveText("Bağımlılıklar hazır");
  const logo = page.locator('.brand-logo-image[src="/assets/whispr-logo.png"]');
  await expect(logo).toBeVisible();
  await expect
    .poll(() => logo.evaluate((image: HTMLImageElement) => image.naturalWidth))
    .toBeGreaterThan(0);
});

test("safe suite, failed-only rerun, individual run, and cancellation stay observable", async ({
  page,
}) => {
  await expect(page.locator("#history-list")).toHaveText("Henüz sonuç yok.");
  await page.getByRole("button", { name: "Güvenli Tümünü Çalıştır" }).click();
  await waitForRun(page);
  await expect(page.locator("#hero-state-text")).toHaveText("Başarısız");
  await expect(page.locator("#summary-pass")).toHaveText("4");
  await expect(page.locator("#summary-fail")).toHaveText("1");
  await expect(page.locator("#log-output")).toContainText(
    "tools/local-quality-dashboard/server.mjs:499:7 Error: deterministic CI contract failed",
  );
  await expect(page.locator("#log-output")).toContainText("Komut: test-only:CI");
  await expect(page.locator('[data-profile-id="CI"] .profile-exit')).toHaveText("exit 1");
  await expect(page.locator('[data-profile-id="CI"] .profile-impact')).toContainText("Etki:");
  await expect(page.locator("#issue-filter-fail")).toHaveAttribute("aria-selected", "true");
  const failedIssue = page.locator('.issue-card[data-status="FAIL"]');
  await expect(failedIssue).toHaveCount(1);
  await expect(failedIssue).toContainText("Deterministic CI contract failed.");
  await expect(failedIssue).toContainText("test-only:CI");
  await expect(failedIssue.locator(".issue-source")).toContainText(
    "tools/local-quality-dashboard/server.mjs:499:7",
  );
  await failedIssue.locator(".issue-evidence summary").click();
  await expect(failedIssue.locator(".issue-evidence pre")).toContainText(
    "Error: deterministic CI contract failed",
  );

  await page.locator("#issue-filter-blocked").click();
  await expect(page.locator("#issue-filter-blocked")).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#issue-list")).toHaveText("Engellenmiş kontrol yok.");
  await page.locator("#issue-filter-blocked").press("ArrowLeft");
  await expect(page.locator("#issue-filter-fail")).toBeFocused();
  await expect(failedIssue).toBeVisible();

  await page.getByRole("button", { name: "Başarısızları Yeniden Çalıştır" }).click();
  await waitForRun(page);
  await expect(page.locator("#hero-state-text")).toHaveText("Geçti");
  await expect(page.locator("#summary-total")).toHaveText("1");
  await expect(page.locator("#summary-pass")).toHaveText("1");
  await expect(page.locator("#issue-list")).toHaveText("Başarısız kontrol yok.");

  await page.locator(".history-button", { hasText: "safeAll" }).click();
  await expect(page.locator("#hero-state-text")).toHaveText("Başarısız");
  await expect(page.locator('.issue-card[data-status="FAIL"]')).toHaveCount(1);

  const fastCard = page.locator(".profile-card", {
    has: page.getByRole("heading", { name: "Fast" }),
  });
  await fastCard.getByRole("button", { name: "Tek Başına Çalıştır" }).click();
  await expect(page.locator("#log-output")).toContainText("Fast deterministic browser output");
  await waitForRun(page);
  await expect(fastCard.locator(".status-pill")).toHaveText("Geçti");

  const desktopCard = page.locator(".profile-card", {
    has: page.getByRole("heading", { name: "Desktop" }),
  });
  await desktopCard.getByRole("button", { name: "Tek Başına Çalıştır" }).click();
  await expect(page.locator("#log-output")).toContainText("Desktop deterministic browser output");
  await page.getByRole("button", { name: "Durdur" }).click();
  await waitForRun(page);
  await expect(page.locator("#hero-state-text")).toHaveText("İptal");
  await expect(desktopCard.locator(".status-pill")).toHaveText("İptal");
});

test("full acceptance is explicit, target-bound, and completes through the browser", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Tam Kabul Testleri" }).click();
  const dialog = page.getByRole("dialog", { name: "Tam Kabul Testleri" });
  await expect(dialog).toBeVisible();
  const confirmation = dialog.getByRole("textbox");
  await expect(confirmation).toBeFocused();
  await confirmation.fill("wizards_e2e");
  await dialog.getByRole("button", { name: "Onayla ve Çalıştır" }).click();
  await waitForRun(page);
  await expect(page.locator("#hero-state-text")).toHaveText("Geçti");
  await expect(page.locator("#summary-pass")).toHaveText("2");
  await expect(page.locator('[data-profile-id="E2EFull"] .status-pill')).toHaveText("Geçti");
  await expect(page.locator('[data-profile-id="MobileRelease"] .status-pill')).toHaveText("Geçti");
});

test("keyboard, theme, responsive layout, reduced motion, and WCAG checks hold", async ({
  page,
}) => {
  const initialScan = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(initialScan.violations).toEqual([]);

  await page.getByLabel("Dashboard teması").selectOption("light");
  await expect(page.locator("html")).toHaveClass(/theme-light/u);
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/theme-light/u);
  await page.getByLabel("Dashboard teması").selectOption("dark");
  await expect(page.locator("html")).toHaveClass(/theme-dark/u);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("button", { name: "Güvenli Tümünü Çalıştır" })).toBeVisible();
  await expect(page.locator(".profile-card").first()).toBeVisible();
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(
    true,
  );

  const acceptanceButton = page.getByRole("button", { name: "Tam Kabul Testleri" });
  await acceptanceButton.click();
  await expect(page.locator("#acceptance-input")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.locator("#acceptance-dialog")).not.toBeVisible();
  await expect(acceptanceButton).toBeFocused();
});
