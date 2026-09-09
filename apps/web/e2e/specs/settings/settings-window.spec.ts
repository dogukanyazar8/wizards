import type { Page } from "@playwright/test";

import { test, expect } from "../../fixtures/test";
import { loginAs } from "../../helpers/auth";
import {
  enableE2EUserTwoFactor,
  getE2ENotificationPrefs,
  getE2EUserPreferences,
  getE2EUserTwoFactorEnabled,
  resetE2ENotificationPrefs,
  resetE2EUserPreferences,
  resetE2EUserTwoFactor,
  setE2EUserLocale,
} from "../../helpers/db";
import { gotoAppRoute, visibleTestId } from "../../helpers/navigation";
import { e2eUserPassword } from "../../helpers/test-data";
import { generateTotpCode } from "../../../src/lib/auth/totp";
import {
  ABOUT_UNAVAILABLE_ROWS,
  ACCOUNT_UNAVAILABLE_ROWS,
  APPEARANCE_UNAVAILABLE_ROWS,
  AV_UNAVAILABLE_ROWS,
  DESKTOP_UNAVAILABLE_ROWS,
  NOTIFICATION_UNAVAILABLE_ROWS,
} from "../../../src/lib/settings/availability";
import { walkSettingsRows } from "../../../src/lib/settings/tree";

/**
 * Ayarlar penceresi — Dalga 5 / Ş13 §7.
 *
 * Eski `settings.spec.ts` silinen `settings-panel.tsx`'i (K1) ve `?section=&panel=` sorgusunu
 * sürüyordu. Bu dosya onun **yerine** geçiyor ve iddiaları yeni yüzeye taşıyor: pencere bir
 * rotadır (K2), gezinme sol nav + alt sekme şeridi, satırlar ağaçtan (`SETTINGS_TREE`) ve
 * kayıt göstergesi gerçek yanıt üzerine kurulu (tuzak #14).
 *
 * Taşınan eski kapsam: dil + tema, bildirim tercihlerinin kalıcılığı, uygulama simgesi,
 * ses cihazı menüleri, Hakkında katkıcıları, 2FA kurma ve kapatma.
 */

const E2E_TOTP_SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

const UNAVAILABLE_ROWS_BY_SECTION = {
  about: ABOUT_UNAVAILABLE_ROWS,
  account: ACCOUNT_UNAVAILABLE_ROWS,
  appearance: APPEARANCE_UNAVAILABLE_ROWS,
  av: AV_UNAVAILABLE_ROWS,
  desktop: DESKTOP_UNAVAILABLE_ROWS,
  notifications: NOTIFICATION_UNAVAILABLE_ROWS,
} as const;

const WEB_UNAVAILABLE_ROUTES = new Map<string, Set<string>>();

for (const { row, section, tab } of walkSettingsRows()) {
  if (section.desktopOnly || !Object.hasOwn(UNAVAILABLE_ROWS_BY_SECTION[section.key], row.key)) {
    continue;
  }

  const path = `/settings/${section.key}/${tab.key}`;
  const keys = WEB_UNAVAILABLE_ROUTES.get(path) ?? new Set<string>();

  keys.add(row.key);
  WEB_UNAVAILABLE_ROUTES.set(path, keys);
}

async function openSettingsRoute(page: Page, path: string): Promise<void> {
  await gotoAppRoute(page, path, { readyTestId: "settings-window" });
  await expect(visibleTestId(page, "settings-window")).toBeVisible({ timeout: 15_000 });
}

/** Satırın kendi kutusu; `data-setting-row` ağacın anahtarını taşır. */
function settingRow(page: Page, rowKey: string) {
  return page.locator(`[data-setting-row="${rowKey}"]:visible`).first();
}

async function expectSaved(page: Page): Promise<void> {
  const indicator = visibleTestId(page, "settings-save-indicator");

  await expect(indicator).toHaveAttribute("data-save-state", "saved", { timeout: 15_000 });
}

test.describe("Ayarlar penceresi", () => {
  test.beforeEach(async () => {
    await resetE2EUserPreferences("alice");
    await resetE2ENotificationPrefs("alice");
  });

  test("kullanıcı barı dişlisi menüyü, menü Ayarlar penceresini açıyor", async ({ page }) => {
    await loginAs(page, "alice");
    await gotoAppRoute(page, "/home", { readyTestId: "home-command-center" });

    const gear = visibleTestId(page, "user-settings-button");

    await expect(gear).toBeVisible();
    await gear.click();
    await expect(visibleTestId(page, "user-quick-menu")).toBeVisible();

    await visibleTestId(page, "user-appearance-settings-button").click();

    await expect(visibleTestId(page, "settings-window")).toBeVisible({ timeout: 15_000 });
    await expect(page).toHaveURL(/\/settings\/account\/profile$/);
    // Kabuk yerinde: intercepting route modal olarak biniyor (K2).
    await expect(page.getByTestId("app-nav-panel")).toBeVisible();
  });

  test("sol nav bölümü, alt sekme şeridi sekmeyi adrese yazıyor", async ({ page }) => {
    await loginAs(page, "alice");
    await openSettingsRoute(page, "/settings/account/profile");

    await page.locator('[data-section="notifications"]').first().click();
    await expect(page).toHaveURL(/\/settings\/notifications\/general$/);

    await page.locator("#settings-tab-types").click();
    await expect(page).toHaveURL(/\/settings\/notifications\/types$/);
    await expect(page.locator("#settings-tab-types")).toHaveAttribute("aria-selected", "true");
    await expect(settingRow(page, "nt1")).toBeVisible();
  });

  test("anahtar çevrilince kayıt göstergesi ilerliyor ve değer yenilemeden sonra duruyor", async ({
    page,
  }) => {
    await loginAs(page, "alice");
    await openSettingsRoute(page, "/settings/notifications/types");

    const badges = visibleTestId(page, "setting-toggle-nt12");

    await expect(badges).toHaveAttribute("aria-checked", "false");
    await badges.click();

    await expectSaved(page);
    await expect
      .poll(() => getE2ENotificationPrefs("alice").then((prefs) => prefs.typeBadges))
      .toBe(true);

    await page.reload();
    await expect(visibleTestId(page, "settings-window")).toBeVisible({ timeout: 15_000 });
    await expect(visibleTestId(page, "setting-toggle-nt12")).toHaveAttribute(
      "aria-checked",
      "true",
      { timeout: 15_000 },
    );
  });

  test("kilitli satır değişmiyor ve sunucuya istek çıkmıyor", async ({ page }) => {
    await loginAs(page, "alice");
    await openSettingsRoute(page, "/settings/notifications/types");

    const writes: string[] = [];

    page.on("request", (request) => {
      if (
        request.method() === "PATCH" &&
        request.url().includes("/api/v1/users/me/notification-prefs")
      ) {
        writes.push(request.url());
      }
    });

    const locked = visibleTestId(page, "setting-toggle-nt13");

    await expect(locked).toHaveAttribute("aria-disabled", "true");
    await expect(locked).toHaveAttribute("aria-checked", "true");
    await locked.click({ force: true });

    await expect(locked).toHaveAttribute("aria-checked", "true");
    expect(writes).toHaveLength(0);
  });

  test("Web'de tüketicisi olmayan her ayar kilitli ve mutasyon üretmiyor", async ({ page }) => {
    test.setTimeout(75_000);
    await loginAs(page, "alice");

    const mutations: string[] = [];

    page.on("request", (request) => {
      if (
        ["DELETE", "PATCH", "POST", "PUT"].includes(request.method()) &&
        request.url().includes("/api/v1/")
      ) {
        mutations.push(`${request.method()} ${request.url()}`);
      }
    });

    expect(WEB_UNAVAILABLE_ROUTES.size).toBeGreaterThan(0);

    for (const [path, rowKeys] of WEB_UNAVAILABLE_ROUTES) {
      await openSettingsRoute(page, path);

      for (const rowKey of rowKeys) {
        const row = settingRow(page, rowKey);
        const gate = page.locator(`[data-setting-row-gate="${rowKey}"]:visible`).first();
        const controls = row.locator("button, input, textarea, select, a[href]");

        await expect(row).toBeVisible();

        const gateCount = await gate.count();
        if (gateCount > 0) {
          await expect(gate).toHaveAttribute("aria-disabled", "true");
          await expect(gate).toHaveAttribute("inert", "");
        }

        const states = await controls.evaluateAll((elements) =>
          elements.map((element) => ({
            ariaDisabled: element.getAttribute("aria-disabled") === "true",
            nativeDisabled:
              "disabled" in element && Boolean((element as HTMLButtonElement).disabled),
          })),
        );

        expect(
          gateCount > 0 || states.length > 0,
          `${path} içindeki ${rowKey} devre dışı bırakma kapısı taşımıyor`,
        ).toBe(true);
        for (const state of states) {
          expect(
            state.nativeDisabled || state.ariaDisabled,
            `${path} içindeki ${rowKey} etkileşime açık kaldı`,
          ).toBe(true);
        }

        // Native disabled eleman olay üretmez; aria-disabled kontrollerin handler kapısı burada
        // gerçek DOM tıklamasıyla doğrulanır.
        await controls.evaluateAll((elements) => {
          for (const element of elements) (element as HTMLElement).click();
        });
      }
    }

    expect(mutations).toEqual([]);
  });

  test("arama sonucu doğru sekmeye götürüyor", async ({ page }) => {
    await loginAs(page, "alice");
    await openSettingsRoute(page, "/settings/account/profile");

    /*
     * Ortak fixture arayüzü `tr` açıyor; arama indeksi arayüzün **gerçek** dilinden kuruluyor
     * (`buildSettingsSearchIndex(t)`). İngilizce bir sorgu Türkçe arayüzde hiçbir şey bulmaz.
     *
     * Sorgu bilerek `Başlangıç saati`: `Sessiz saatler` satırı (`nq1`) ağaçta **iki** sekmede birden
     * tanımlı (`Genel` ve `Sessiz saatler`, tuzak #4) ve indeks ikisini de taşıyor. İlk sonuç
     * o yüzden `Genel` sekmesine gidiyordu — sonuç doğru, testin varsayımı yanlıştı. `nq2`
     * yalnız `Sessiz saatler`te var, dolayısıyla varılan sekme tek bir şey olabilir.
     */
    await visibleTestId(page, "settings-search-input").fill("başlangıç saati");

    const hit = visibleTestId(page, "settings-search-hit");

    // 250 ms debounce (Ş5 §9) — ilk sonuç gelene kadar tıklanmıyor.
    await expect(hit).toBeVisible({ timeout: 15_000 });
    await hit.click();

    // Vurgulanan satır adrese `?highlight=` ile yazılıyor; iddia sekmenin kendisi.
    await expect(page).toHaveURL(/\/settings\/notifications\/quiet-hours(\?|$)/);
    await expect(settingRow(page, "nq2")).toBeVisible();
  });

  test("Esc pencereyi kapatıyor, focus dişliye dönüyor", async ({ page }) => {
    await loginAs(page, "alice");
    await gotoAppRoute(page, "/home", { readyTestId: "home-command-center" });

    await visibleTestId(page, "user-settings-button").click();
    await visibleTestId(page, "user-appearance-settings-button").click();
    await expect(visibleTestId(page, "settings-window")).toBeVisible({ timeout: 15_000 });

    await page.keyboard.press("Escape");

    await expect(page.getByTestId("settings-window")).toHaveCount(0, { timeout: 15_000 });
    await expect
      .poll(() => page.evaluate(() => document.activeElement?.getAttribute("data-testid") ?? null))
      .toBe("user-settings-button");
  });

  test("Esc merdiveninin ilk basamağı açık menü", async ({ page }) => {
    await loginAs(page, "alice");
    await openSettingsRoute(page, "/settings/notifications/quiet-hours");

    await visibleTestId(page, "setting-select-nq4").click();
    await expect(visibleTestId(page, "setting-select-nq4-menu")).toBeVisible();

    await page.keyboard.press("Escape");

    // Menü kapandı, pencere **durdu** — merdivenin ilk basamağı kabukta biliniyor (tuzak #12).
    await expect(page.getByTestId("setting-select-nq4-menu")).toHaveCount(0);
    await expect(visibleTestId(page, "settings-window")).toBeVisible();
  });

  test("geri tuşu önceki sekmeye dönüyor", async ({ page }) => {
    await loginAs(page, "alice");
    await openSettingsRoute(page, "/settings/notifications/general");

    await page.locator("#settings-tab-sounds").click();
    await expect(page).toHaveURL(/\/settings\/notifications\/sounds$/);

    await page.goBack();
    await expect(page).toHaveURL(/\/settings\/notifications\/general$/);
  });

  test("eski ?section=&panel= adresi yeni yola yönleniyor", async ({ page }) => {
    await loginAs(page, "alice");
    await gotoAppRoute(page, "/settings?section=notifications&panel=general", {
      readyTestId: "settings-window",
    });

    await expect(page).toHaveURL(/\/settings\/notifications\/general$/);
  });

  test("dil ve tema tercihleri kaydediliyor", async ({ page }) => {
    // Ortak fixture tarayıcıyı Türkçe açıyor. DB'yi de aynı başlangıca getir; ardından gerçekten
    // farklı olan İngilizce seçeneği seçerek yazımı doğrula.
    await setE2EUserLocale("alice", "tr");
    await loginAs(page, "alice");
    await openSettingsRoute(page, "/settings/account/privacy");

    // `l1` — Uygulama dili (segment). `LOCALE_BY_INDEX = ["tr", "en"]`.
    await visibleTestId(page, "setting-segment-l1-1").click();
    await expect
      .poll(() => getE2EUserPreferences("alice").then((preferences) => preferences.locale))
      .toBe("en");

    await openSettingsRoute(page, "/settings/appearance/theme");
    await expect(visibleTestId(page, "settings-block-t1")).toBeVisible();

    await visibleTestId(page, "settings-theme-theme-light").click();
    await expect(page.locator("html")).toHaveClass(/theme-light/);
    await expect
      .poll(() => getE2EUserPreferences("alice").then((preferences) => preferences.theme))
      .toBe("theme-light");
  });

  test("uygulama simgesi favicon'u değiştiriyor", async ({ page }) => {
    await loginAs(page, "alice");
    await openSettingsRoute(page, "/settings/appearance/layout");

    await visibleTestId(page, "settings-app-icon-wave-4").click();
    await expect(visibleTestId(page, "settings-app-icon-wave-4")).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await page.waitForFunction(() =>
      Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="icon"]')).some((link) =>
        link.href.includes("/app-icons/wave-4.png"),
      ),
    );
  });

  test("ses cihazı menüleri ve Hakkında katkıcıları çiziliyor", async ({ page }) => {
    await loginAs(page, "alice");
    await openSettingsRoute(page, "/settings/av/audio");

    await expect(settingRow(page, "i1")).toBeVisible();
    await expect(settingRow(page, "u1")).toBeVisible();

    await visibleTestId(page, "setting-select-i1").click();
    await expect(visibleTestId(page, "setting-select-i1-menu")).toBeVisible();
    await page.keyboard.press("Escape");

    await openSettingsRoute(page, "/settings/about/about");
    await expect(page.getByText("Doğukan Yazar")).toBeVisible();
  });

  test("iki aşamalı doğrulama satır içinde kuruluyor", async ({ page }) => {
    test.skip(!process.env.REDIS_URL, "2FA akışı Redis tabanlı deneme sayacı istiyor.");

    await resetE2EUserTwoFactor("alice");

    try {
      await loginAs(page, "alice");
      await openSettingsRoute(page, "/settings/account/security");

      await visibleTestId(page, "setting-risky-s1").click();

      await expect(page.getByTestId("settings-two-factor-qr")).toBeVisible({ timeout: 15_000 });

      const manualKey = (
        await visibleTestId(page, "settings-two-factor-manual-key").innerText()
      ).replace(/\s/g, "");
      // Alanlar gerçek `<label>` taşıyor, `placeholder` değil (a11y tercihi) ve düğme metni
      // tasarımdan geliyor (`Doğrula ve aç`). İkisi de dile bağlı; testid değil.
      const codeInput = visibleTestId(page, "settings-two-factor-setup-code");
      const confirmButton = visibleTestId(page, "settings-two-factor-confirm");

      await codeInput.fill("000000");
      await confirmButton.click();
      await expect.poll(() => getE2EUserTwoFactorEnabled("alice")).toBe(false);

      await codeInput.fill(generateTotpCode(manualKey));
      await confirmButton.click();

      await expect.poll(() => getE2EUserTwoFactorEnabled("alice")).toBe(true);
    } finally {
      await resetE2EUserTwoFactor("alice");
    }
  });

  test("iki aşamalı doğrulama satır içinde kapatılıyor", async ({ page }) => {
    test.skip(!process.env.REDIS_URL, "2FA akışı Redis tabanlı deneme sayacı istiyor.");

    await resetE2EUserTwoFactor("bob");
    await enableE2EUserTwoFactor("bob", E2E_TOTP_SECRET);

    try {
      await loginAs(page, "bob");
      await openSettingsRoute(page, "/settings/account/security");

      await visibleTestId(page, "setting-risky-s1").click();

      const passwordInput = visibleTestId(page, "settings-two-factor-password");
      const codeInput = visibleTestId(page, "settings-two-factor-code");
      const disableButton = visibleTestId(page, "settings-two-factor-disable");

      await passwordInput.fill(`${e2eUserPassword}-wrong`);
      await codeInput.fill(generateTotpCode(E2E_TOTP_SECRET));
      await disableButton.click();
      await expect.poll(() => getE2EUserTwoFactorEnabled("bob")).toBe(true);

      await passwordInput.fill(e2eUserPassword);
      await codeInput.fill(generateTotpCode(E2E_TOTP_SECRET));
      await disableButton.click();

      await expect.poll(() => getE2EUserTwoFactorEnabled("bob")).toBe(false);
    } finally {
      await resetE2EUserTwoFactor("bob");
    }
  });
});
