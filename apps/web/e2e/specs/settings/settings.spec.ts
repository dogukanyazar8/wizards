import type { Page } from "@playwright/test";
import { test, expect } from "../../fixtures/test";
import { loginAs } from "../../helpers/auth";
import {
  getE2EUserPreferences,
  resetE2EUserPreferences,
} from "../../helpers/db";
import { gotoAppRoute, visibleTestId } from "../../helpers/navigation";

const APP_UI_STORAGE_KEY = "wizards-ui";

async function openSettings(page: Page, path = "/settings"): Promise<void> {
  await gotoAppRoute(page, path, { readyTestId: "settings-panel" });
  await expect(page.getByTestId("settings-panel")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId("settings-panel")).toHaveAttribute(
    "data-client-ready",
    "true",
    { timeout: 10_000 },
  );
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

test.describe("settings and preferences", () => {
  test.beforeEach(async () => {
    await resetE2EUserPreferences("alice");
  });

  test("user can change language and theme preferences", async ({ page }) => {
    await loginAs(page, "alice");
    await openSettings(page, "/settings?section=appearance&panel=language");

    const turkishOption = visibleTestId(page, "language-option-tr");

    await turkishOption.click();
    await expect(visibleTestId(page, "language-option-tr")).toHaveAttribute(
      "data-active",
      "true",
    );
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

  test("advanced appearance controls update layout and app icon preferences", async ({
    page,
  }) => {
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
      Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="icon"]')).some(
        (link) => link.href.includes("/app-icons/wave-4.png"),
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
});
