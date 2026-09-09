import { test, expect } from "../../fixtures/test";
import { loginAs } from "../../helpers/auth";
import { resetE2ENotificationPrefs } from "../../helpers/db";
import { gotoAppRoute, visibleTestId } from "../../helpers/navigation";

/**
 * Bildirimler paneli — Dalga 5 / Ş13 §7.
 *
 * Panelin sözleşmesi bir kayıt defteri: satıra tıklamak durumu **çevirir**, sayaçlar hep
 * sunucudan gelir ve dişli paneli kapatıp 560 px pencereyi açar. Tur bunları gerçek bir
 * oturumda ölçüyor; tohumlu veride okunmamış bildirim olmayabildiği için sayaç iddiaları
 * satır varlığına koşullu.
 */

test.describe("Bildirimler paneli", () => {
  test.beforeEach(async () => {
    await resetE2ENotificationPrefs("alice");
  });

  test("zil paneli açıyor; okunmamış sayısı ile zil noktası tutarlı", async ({ page }) => {
    await loginAs(page, "alice");
    const countsReady = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/v1/notifications/unread-count" && response.ok(),
    );
    await gotoAppRoute(page, "/home", { readyTestId: "home-command-center" });
    const countsResponse = await countsReady;
    const countsBody = (await countsResponse.json()) as { counts: { all: number } };
    await expect(page.getByTestId("notification-bell-dot")).toHaveCount(
      countsBody.counts.all > 0 ? 1 : 0,
    );

    const dotBeforeOpen = await page.getByTestId("notification-bell-dot").count();

    await visibleTestId(page, "notification-bell-button").click();
    await expect(visibleTestId(page, "notification-panel")).toBeVisible({ timeout: 15_000 });
    await expect(visibleTestId(page, "notification-panel-tabs")).toBeVisible();

    const unreadCount = await page.getByTestId("notification-panel-unread-count").count();

    // Nokta ve sayaç aynı gerçeği söylüyor: biri varsa diğeri de var.
    expect(unreadCount > 0).toBe(dotBeforeOpen > 0);
  });

  test("satıra tıklamak okundu durumunu iki yönde çeviriyor", async ({ page }) => {
    await loginAs(page, "alice");
    await gotoAppRoute(page, "/home", { readyTestId: "home-command-center" });

    await visibleTestId(page, "notification-bell-button").click();
    await expect(visibleTestId(page, "notification-panel")).toBeVisible({ timeout: 15_000 });

    const rows = page.getByTestId("notification-panel-row");

    test.skip((await rows.count()) === 0, "Tohumlu veride bildirim satırı yok.");

    const row = rows.first();
    const unreadBefore = (await row.getAttribute("data-unread")) === "true";
    const dot = row.getByTestId("notification-panel-row-dot");

    await row.click();
    await expect(dot).toHaveCount(unreadBefore ? 0 : 1, { timeout: 15_000 });

    await row.click();
    await expect(dot).toHaveCount(unreadBefore ? 1 : 0, { timeout: 15_000 });
  });

  test("Tümünü okundu işaretle sonrası kırmızı sıfır pili yok", async ({ page }) => {
    await loginAs(page, "alice");
    await gotoAppRoute(page, "/home", { readyTestId: "home-command-center" });

    await visibleTestId(page, "notification-bell-button").click();
    await expect(visibleTestId(page, "notification-panel")).toBeVisible({ timeout: 15_000 });

    const markAll = page.getByTestId("notification-panel-mark-all");

    if ((await markAll.count()) > 0) {
      await markAll.first().click();
    }

    await expect(visibleTestId(page, "notification-panel-all-read")).toBeVisible({
      timeout: 15_000,
    });
    // Sıfır okunmamış = sayaç pili hiç çizilmiyor, `0` yazan kırmızı pil değil.
    await expect(page.getByTestId("notification-panel-unread-count")).toHaveCount(0);
    await expect(page.getByTestId("notification-bell-dot")).toHaveCount(0);
  });

  test("dişli paneli kapatıp 560 px bildirim ayarları penceresini açıyor", async ({ page }) => {
    await loginAs(page, "alice");
    await gotoAppRoute(page, "/home", { readyTestId: "home-command-center" });

    await visibleTestId(page, "notification-bell-button").click();
    await expect(visibleTestId(page, "notification-panel")).toBeVisible({ timeout: 15_000 });

    await visibleTestId(page, "notification-panel-gear").click();

    await expect(page.getByTestId("notification-panel")).toHaveCount(0);
    await expect(visibleTestId(page, "notification-prefs-dialog")).toBeVisible({
      timeout: 15_000,
    });
  });

  test("Tüm bildirim ayarları Bildirimler › Yüzeyler sekmesine götürüyor", async ({ page }) => {
    await loginAs(page, "alice");
    await gotoAppRoute(page, "/home", { readyTestId: "home-command-center" });

    await visibleTestId(page, "notification-bell-button").click();
    await visibleTestId(page, "notification-panel-gear").click();
    await expect(visibleTestId(page, "notification-prefs-dialog")).toBeVisible({
      timeout: 15_000,
    });

    await visibleTestId(page, "notification-prefs-open-all").click();

    await expect(page).toHaveURL(/\/settings\/notifications\/surfaces$/, { timeout: 15_000 });
    await expect(visibleTestId(page, "settings-window")).toBeVisible({ timeout: 15_000 });
  });

  test("Tüm bildirimleri gör Bahsedilmeler ekranına gidiyor", async ({ page }) => {
    await loginAs(page, "alice");
    await gotoAppRoute(page, "/home", { readyTestId: "home-command-center" });

    await visibleTestId(page, "notification-bell-button").click();
    await expect(visibleTestId(page, "notification-panel")).toBeVisible({ timeout: 15_000 });

    // K10 — `/inbox` silindi; panelin dışındaki tam liste Bahsedilmeler.
    await expect(visibleTestId(page, "notification-panel-see-all")).toHaveAttribute(
      "href",
      "/mentions",
    );

    await visibleTestId(page, "notification-panel-see-all").click();
    await expect(page).toHaveURL(/\/mentions$/, { timeout: 15_000 });
  });
});
