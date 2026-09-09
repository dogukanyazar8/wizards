import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";

import { resolveE2ETimeoutPolicy } from "@/lib/e2e/timeout-policy";
import {
  WCAG_TAGS,
  formatViolation,
  partitionAxeViolations,
  reportNonBlockingViolations,
  type AxeViolation,
} from "../../helpers/a11y-gate";
import { test, expect } from "../../fixtures/test";
import { loginAs } from "../../helpers/auth";
import { getE2EServerRoute } from "../../helpers/db";
import { applyParityTheme } from "../../helpers/design-parity";
import {
  gotoAppRoute,
  gotoTextChannelRoute,
  openSettingsFromUserQuickMenu,
  visibleTestId,
} from "../../helpers/navigation";

test.describe.configure({ timeout: resolveE2ETimeoutPolicy().screenTestTimeoutMs });

/**
 * Etkinlikler Ş10 — tarama **duran** bir ekranda yapılır.
 *
 * `color-contrast` kuralı öğenin o andaki hesaplanmış rengini okuyor; giriş animasyonu
 * sürerken bir modalın kartı `opacity: 0.79` olur ve axe soluk renkleri gerçek renk sanar.
 * Oluştur modalı bu yüzden on beş sahte "serious" ihlali üretiyordu — üçü de gerçek değildi,
 * ölçüm anıydı. Bekleme her rotada zararsız: duran bir sayfada `getAnimations()` boştur.
 *
 * **Yalnız biten animasyonlar beklenir.** Sonsuz döngülü bir animasyonun (`iterations:
 * Infinity`) `finished` sözü hiçbir zaman çözülmez ve bekleme testi kilitler; 1,5 saniyelik
 * tavan ikinci güvenlik kemeri.
 */
async function settleAnimations(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const finite = document.getAnimations().filter((animation) => {
      const timing = animation.effect?.getComputedTiming();
      return Boolean(
        timing && timing.iterations !== Infinity && Number.isFinite(Number(timing.endTime ?? NaN)),
      );
    });

    await Promise.race([
      Promise.all(finite.map((animation) => animation.finished.catch(() => undefined))),
      new Promise((resolve) => {
        setTimeout(resolve, 1_500);
      }),
    ]);
  });
}

function assertNoBlockingViolations(violations: readonly AxeViolation[]): void {
  const partition = partitionAxeViolations(violations);

  reportNonBlockingViolations(partition, "app");

  expect(
    partition.blocking.map(formatViolation),
    "critical/serious WCAG A+AA violations must be fixed, not suppressed",
  ).toEqual([]);
}

test.describe("accessibility smoke", () => {
  test("login screen has no critical or serious WCAG A/AA violations", async ({ page }) => {
    await gotoAppRoute(page, "/login", { readyTestId: "login-form" });

    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();

    assertNoBlockingViolations(results.violations);
  });

  test("DM home shell has no critical or serious WCAG A/AA violations", async ({ page }) => {
    await loginAs(page, "alice");
    await gotoAppRoute(page, "/messages", { readyTestId: "server-rail" });

    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();

    assertNoBlockingViolations(results.violations);
  });

  test("server text channel view has no critical or serious WCAG A/AA violations", async ({
    page,
  }) => {
    const { serverId, textChannelId } = await getE2EServerRoute();

    await loginAs(page, "alice");
    await gotoTextChannelRoute(page, serverId, textChannelId);

    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();

    assertNoBlockingViolations(results.violations);
  });

  test("settings overlay has no critical or serious WCAG A/AA violations", async ({ page }) => {
    await loginAs(page, "alice");
    await gotoAppRoute(page, "/messages/friends", { readyTestId: "user-bar" });
    await openSettingsFromUserQuickMenu(page);

    // Wait for the loaded settings content, not the transient bootstrap
    // loading skeleton, so the scan is deterministic instead of racing
    // whichever state happens to be on screen when axe runs.
    // K2 sonrası Ayarlar bir **rota**: kabuk `settings-panel.tsx`'i sildi ve onunla birlikte
    // `data-client-ready` bayrağını da. Yükleme yarışının bugünkü karşılığı `Suspense`
    // iskeletidir — tarama iskelet ekrandan **düşene** kadar beklemeli.
    await expect(page.getByTestId("settings-window")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("settings-skeleton")).toHaveCount(0);
    await expect(page.getByTestId("in-app-settings-overlay")).toHaveCSS("opacity", "1");

    const results = await new AxeBuilder({ page })
      .include('[data-testid="in-app-settings-overlay"]')
      .withTags(WCAG_TAGS)
      .analyze();

    assertNoBlockingViolations(results.violations);
  });

  /**
   * Ana Sayfa 1a Faz 5 §8 — ekranın altı kartı ve komut paleti bu taramanın
   * kapsamına giriyor. Palet ayrı bir madde: overlay ancak açıkken var ve içinde
   * `listbox`/`option` gezinmesi var, kapalıyken taranan sayfada hiç görünmüyor.
   */
  test("home command centre has no critical or serious WCAG A/AA violations", async ({ page }) => {
    await loginAs(page, "alice");

    const hydrated = page.waitForResponse((response) =>
      response.url().includes("/api/v1/app/summary"),
    );
    await gotoAppRoute(page, "/home", { readyTestId: "home-command-center" });
    await hydrated;

    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();

    assertNoBlockingViolations(results.violations);
  });

  /**
   * Ana Sayfa 1a Faz 6 §7 — üç yan ekran. Filtre çipleri, segment kontrolü,
   * takvim ızgarası ve sonsuz listenin canlı bölgesi hep bu taramanın içinde.
   */
  for (const [label, path, readyTestId] of [
    // Ş5 sonrası Bahsedilmeler `AppScreen` değil; hazır işareti akış başlığı.
    ["mentions", "/mentions", "mentions-feed-header"],
    // Etkinlikler Ş10 sonrası da `AppScreen` değil: akış başlığı + hafta şeridi + ızgara +
    // 300'lük ajanda rayı. Üç durum ayrı ayrı taranıyor — modal ve panel ancak açıkken var.
    ["events", "/events", "events-feed-header"],
    ["events create modal", "/events?modal=create", "events-feed-header"],
    ["events live tab", "/events?tab=live", "events-feed-header"],
  ] as const) {
    test(`${label} screen has no critical or serious WCAG A/AA violations`, async ({ page }) => {
      await loginAs(page, "alice");
      await gotoAppRoute(page, path, { readyTestId });
      await expect(visibleTestId(page, readyTestId)).toBeVisible();
      await settleAnimations(page);

      const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();

      assertNoBlockingViolations(results.violations);
    });
  }

  /**
   * Faz 7 §2.6 — **açık temada** kontrast. Taramanın geri kalanı tohum hesabın kendi temasında
   * koşuyor; muted metnin kart zeminine karşı oranı yalnız açık temada eşiğe yakındı ve tam bu
   * yüzden hiçbir tarama onu görmemişti (`--text-muted` 52% → 46%).
   */
  test("home command centre passes WCAG A/AA in the light theme", async ({ page }) => {
    await applyParityTheme(page, "theme-light");
    await loginAs(page, "alice");

    const hydrated = page.waitForResponse((response) =>
      response.url().includes("/api/v1/app/summary"),
    );
    await gotoAppRoute(page, "/home", { readyTestId: "home-command-center" });
    await hydrated;

    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();

    assertNoBlockingViolations(results.violations);
  });

  /**
   * Faz 7 §3 — dar kırılım kendi işaretlemesini doğurur: tek kolon ızgara, kaydıran arkadaş
   * şeridi ve drawer'a taşınan nav paneli. Geniş ekranın taraması bunların hiçbirini görmüyor.
   */
  for (const [label, width] of [
    ["two column", 1100],
    ["single column", 720],
  ] as const) {
    test(`home command centre passes WCAG A/AA at ${width}px (${label})`, async ({ page }) => {
      await page.setViewportSize({ height: 900, width });
      await loginAs(page, "alice");

      const hydrated = page.waitForResponse((response) =>
        response.url().includes("/api/v1/app/summary"),
      );
      await gotoAppRoute(page, "/home", { readyTestId: "home-command-center" });
      await hydrated;

      const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();

      assertNoBlockingViolations(results.violations);
    });
  }

  test("command palette has no critical or serious WCAG A/AA violations", async ({ page }) => {
    await loginAs(page, "alice");

    const hydrated = page.waitForResponse((response) =>
      response.url().includes("/api/v1/app/summary"),
    );
    await gotoAppRoute(page, "/home", { readyTestId: "home-command-center" });
    await hydrated;

    await page.keyboard.press("Control+k");
    await expect(page.getByTestId("command-palette-row").first()).toBeVisible();

    const results = await new AxeBuilder({ page })
      .include('[data-testid="command-palette"]')
      .withTags(WCAG_TAGS)
      .analyze();

    assertNoBlockingViolations(results.violations);
  });
});
