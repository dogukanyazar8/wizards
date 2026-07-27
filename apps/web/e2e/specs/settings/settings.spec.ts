import type { Page } from "@playwright/test";
import { test, expect } from "../../fixtures/test";
import { loginAs } from "../../helpers/auth";
import {
  enableE2EUserTwoFactor,
  getE2EUserTwoFactorEnabled,
  getE2EUserPreferences,
  resetE2EUserTwoFactor,
  resetE2EUserPreferences,
} from "../../helpers/db";
import { gotoAppRoute, visibleTestId } from "../../helpers/navigation";
import { e2eUserPassword } from "../../helpers/test-data";
import { generateTotpCode } from "../../../src/lib/auth/totp";

const APP_UI_STORAGE_KEY = "wizards-ui";
const E2E_TOTP_SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

async function openSettings(page: Page, path = "/settings"): Promise<void> {
  await gotoAppRoute(page, path, { readyTestId: "settings-panel" });
  await expect(page.getByTestId("settings-panel")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId("settings-panel")).toHaveAttribute("data-client-ready", "true", {
    timeout: 10_000,
  });
}

async function setRangeValue(page: Page, testId: string, value: number): Promise<void> {
  const range = visibleTestId(page, testId);

  await expect(range).toBeVisible();
  await range.focus();

  const currentValue = Number(await range.inputValue());
  const delta = value - currentValue;
  const key = delta > 0 ? "ArrowRight" : "ArrowLeft";

  for (let index = 0; index < Math.abs(delta); index += 1) {
    await page.keyboard.press(key);
  }

  await expect(range).toHaveValue(String(value));
}

async function getPersistedUiState(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate((storageKey) => {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw) as { state?: Record<string, unknown> };
    return parsed.state ?? {};
  }, APP_UI_STORAGE_KEY);
}

async function getManualTwoFactorSecret(page: Page): Promise<string> {
  const manualSecret = page
    .locator("code")
    .filter({ hasText: /^[A-Z2-7]{16,}$/ })
    .first();

  await expect(manualSecret).toBeVisible({ timeout: 10_000 });

  return (await manualSecret.innerText()).replace(/\s/g, "");
}

async function expectTwoFactorFeedback(page: Page, pattern: RegExp): Promise<void> {
  await expect(
    page.getByRole("alert").or(page.getByRole("status")).filter({ hasText: pattern }),
  ).toBeVisible({ timeout: 10_000 });
}

test.describe("settings and preferences", () => {
  test.beforeEach(async () => {
    await resetE2EUserPreferences("alice");
  });

  test("user can change language and theme preferences", async ({ page }) => {
    await loginAs(page, "alice");
    await openSettings(page, "/settings?section=appearance&panel=language");

    const turkishOption = visibleTestId(page, "language-option-tr");

    await turkishOption.click();
    await expect(visibleTestId(page, "language-option-tr")).toHaveAttribute("data-active", "true");
    await expect
      .poll(() => getE2EUserPreferences("alice").then((preferences) => preferences.locale))
      .toBe("tr");

    await openSettings(page, "/settings?section=appearance&panel=theme");
    await expect(page.getByTestId("theme-picker")).toBeVisible();
    const lightThemeOption = visibleTestId(page, "theme-option-theme-light");

    await lightThemeOption.click();
    await expect(visibleTestId(page, "theme-option-theme-light")).toHaveAttribute(
      "data-selected",
      "true",
    );
    await expect(page.locator("html")).toHaveClass(/theme-light/);
    await expect
      .poll(() => getE2EUserPreferences("alice").then((preferences) => preferences.theme))
      .toBe("theme-light");
  });

  test("notification settings update and persist", async ({ page }) => {
    await loginAs(page, "alice");
    await openSettings(page, "/settings?section=notifications&panel=general");

    await setRangeValue(page, "settings-notification-limit", 7);
    await visibleTestId(page, "settings-desktop-notifications").click();
    await visibleTestId(page, "settings-email-notifications").click();

    await expect
      .poll(() => getE2EUserPreferences("alice"))
      .toMatchObject({
        desktopNotifications: false,
        emailNotifications: true,
        notificationLimit: 7,
      });

    await openSettings(page, "/settings?section=notifications&panel=sounds");
    await visibleTestId(page, "settings-notification-sound-profile").selectOption("pulse");
    await visibleTestId(page, "settings-notification-sound-toggle").click();

    await expect
      .poll(() => getE2EUserPreferences("alice"))
      .toMatchObject({
        notificationSound: false,
        notificationSoundFile: "pulse",
      });
  });

  test("advanced appearance controls update layout and app icon preferences", async ({ page }) => {
    await loginAs(page, "alice");
    await openSettings(page, "/settings?section=appearance&panel=appIcon");

    const waveIconOption = visibleTestId(page, "app-icon-option-wave-4");

    await waveIconOption.click();
    await expect(visibleTestId(page, "app-icon-option-wave-4")).toHaveAttribute(
      "data-selected",
      "true",
    );
    await expect(visibleTestId(page, "app-icon-feedback")).toBeVisible();
    await page.waitForFunction(() =>
      Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="icon"]')).some((link) =>
        link.href.includes("/app-icons/wave-4.png"),
      ),
    );

    await openSettings(page, "/settings?section=appearance&panel=advanced");
    await expect(page.getByTestId("settings-server-rail-width")).toHaveCount(0);
    await expect(page.getByTestId("settings-server-rail-icon-size")).toHaveCount(0);
    await expect(page.getByTestId("settings-server-rail-collapse")).toHaveCount(0);
    await expect(page.getByTestId("settings-server-rail-expand")).toHaveCount(0);
    await expect
      .poll(() => getPersistedUiState(page))
      .toMatchObject({
        appIconId: "wave-4",
      });

    await page.reload();
    await openSettings(page, "/settings?section=appearance&panel=appIcon");
    await expect(visibleTestId(page, "app-icon-option-wave-4")).toHaveAttribute(
      "data-selected",
      "true",
    );
  });

  test("voice device selectors and about contributors render", async ({ page }) => {
    await loginAs(page, "alice");
    await openSettings(page, "/settings?section=voice&panel=audio");

    await expect(visibleTestId(page, "audio-device-select-input-panel")).toBeVisible();
    await expect(visibleTestId(page, "audio-device-select-output-panel")).toBeVisible();
    await visibleTestId(page, "audio-device-select-input-trigger").click();
    await expect(visibleTestId(page, "audio-device-select-input-menu")).toBeVisible();
    await visibleTestId(page, "audio-device-select-input-menu-refresh").click();
    await expect(visibleTestId(page, "audio-device-select-input-menu")).toBeVisible();
    await page.locator('[data-testid="audio-device-select-input-option"]:visible').first().click();
    await expect(page.getByTestId("audio-device-select-input-menu")).toBeHidden();

    const outputTrigger = visibleTestId(page, "audio-device-select-output-trigger");
    await expect(outputTrigger).toBeVisible();
    if (await outputTrigger.isEnabled()) {
      await outputTrigger.click();
      await expect(visibleTestId(page, "audio-device-select-output-menu")).toBeVisible();
    }

    await openSettings(page, "/settings?section=about&panel=developer");
    await expect(page.getByText("Doğukan Yazar")).toBeVisible();
    await expect(page.getByText("Oğuz Güğümcüoğlu")).toBeVisible();
    await expect(page.getByText("Mehmet Uğur Çetin")).toBeVisible();
  });

  test("two-factor setup rejects invalid codes and reveals recovery codes after a valid TOTP", async ({
    page,
  }) => {
    test.skip(!process.env.REDIS_URL, "2FA settings flow needs Redis-backed attempt tracking.");

    await resetE2EUserTwoFactor("alice");

    try {
      await loginAs(page, "alice");
      await openSettings(page);

      await page.getByRole("button", { name: /Set up 2FA|2FA kurulumu yap/i }).click();
      await expect(page.getByTestId("two-factor-setup-qr-code")).toBeVisible({
        timeout: 10_000,
      });
      await expect(page.getByText(/Manual setup key|Manuel kurulum anahtarı/i)).toBeVisible();

      const manualSecret = await getManualTwoFactorSecret(page);
      const setupCodeInput = page.getByPlaceholder(/6-digit code|6 haneli kod/i);
      await setupCodeInput.fill("not-a-code");
      await page.getByRole("button", { name: /Enable 2FA|2FA'yı etkinleştir/i }).click();
      await expectTwoFactorFeedback(page, /invalid|geçersiz/i);
      await expect.poll(() => getE2EUserTwoFactorEnabled("alice")).toBe(false);

      await setupCodeInput.fill(generateTotpCode(manualSecret));
      await page.getByRole("button", { name: /Enable 2FA|2FA'yı etkinleştir/i }).click();

      await expect(page.getByText(/Save your recovery codes|Yedek kodlarını kaydet/i)).toBeVisible({
        timeout: 10_000,
      });
      await expect(
        page.locator("code").filter({ hasText: /^[A-F0-9]{5}(?:-[A-F0-9]{5}){3}$/ }),
      ).toHaveCount(10);
      await expect.poll(() => getE2EUserTwoFactorEnabled("alice")).toBe(true);
    } finally {
      await resetE2EUserTwoFactor("alice");
    }
  });

  test("two-factor disable flow rejects wrong credentials before accepting a valid password and code", async ({
    page,
  }) => {
    test.skip(!process.env.REDIS_URL, "2FA settings flow needs Redis-backed attempt tracking.");

    await resetE2EUserTwoFactor("bob");
    await enableE2EUserTwoFactor("bob", E2E_TOTP_SECRET);

    try {
      await loginAs(page, "bob");
      await openSettings(page);

      const passwordInput = page.getByPlaceholder(/Current password|Mevcut şifre/i);
      const codeInput = page.getByPlaceholder(
        /Authenticator or recovery code|Authenticator veya yedek kod/i,
      );
      const disableButton = page.getByRole("button", {
        name: /Disable 2FA|2FA'yı kapat/i,
      });

      await passwordInput.fill(`${e2eUserPassword}-wrong`);
      await codeInput.fill(generateTotpCode(E2E_TOTP_SECRET));
      await disableButton.click();
      await expectTwoFactorFeedback(page, /password|şifre|invalid|geçersiz/i);
      await expect.poll(() => getE2EUserTwoFactorEnabled("bob")).toBe(true);

      await passwordInput.fill(e2eUserPassword);
      await codeInput.fill("not-a-code");
      await disableButton.click();
      await expectTwoFactorFeedback(page, /code|kod|invalid|geçersiz/i);
      await expect.poll(() => getE2EUserTwoFactorEnabled("bob")).toBe(true);

      await passwordInput.fill(e2eUserPassword);
      await codeInput.fill(generateTotpCode(E2E_TOTP_SECRET));
      await disableButton.click();

      await expect(
        page.getByText(/Two-factor authentication has been disabled|kapatıldı/i),
      ).toBeVisible({ timeout: 10_000 });
      await expect.poll(() => getE2EUserTwoFactorEnabled("bob")).toBe(false);
      await expect(
        page.getByRole("button", { name: /Set up 2FA|2FA kurulumu yap/i }),
      ).toBeVisible();
    } finally {
      await resetE2EUserTwoFactor("bob");
    }
  });
});
