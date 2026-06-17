import type { Page } from "@playwright/test";
import { test, expect } from "../../fixtures/test";
import { loginAs } from "../../helpers/auth";
import {
  getE2EUserPreferences,
  resetE2EUserPreferences,
} from "../../helpers/db";

const APP_UI_STORAGE_KEY = "wizards-ui";

async function openSettings(page: Page, path = "/settings"): Promise<void> {
  await page.goto(path);
  await expect(page.getByTestId("settings-panel")).toBeVisible({ timeout: 10_000 });
}

async function setRangeValue(page: Page, testId: string, value: number): Promise<void> {
  await page.getByTestId(testId).evaluate(
    (element, nextValue) => {
      const input = element as HTMLInputElement;
      const valueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      )?.set;

      valueSetter?.call(input, String(nextValue));
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    },
    value,
  );
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

    await page.getByTestId("language-option-tr").click();
    await expect(page.getByTestId("language-option-tr")).toHaveAttribute(
      "data-active",
      "true",
    );
    await expect
      .poll(() => getE2EUserPreferences("alice").then((preferences) => preferences.locale))
      .toBe("tr");

    await openSettings(page, "/settings?section=appearance&panel=theme");
    await expect(page.getByTestId("theme-picker")).toBeVisible();
    await page.getByTestId("theme-option-theme-light").click();
    await expect(page.getByTestId("theme-option-theme-light")).toHaveAttribute(
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
    await page.getByTestId("settings-desktop-notifications").click();
    await page.getByTestId("settings-email-notifications").click();

    await expect
      .poll(() => getE2EUserPreferences("alice"))
      .toMatchObject({
        desktopNotifications: false,
        emailNotifications: true,
        notificationLimit: 7,
      });

    await openSettings(page, "/settings?section=notifications&panel=sounds");
    await page.getByTestId("settings-notification-sound-profile").selectOption("pulse");
    await page.getByTestId("settings-notification-sound-toggle").click();

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

    await page.getByTestId("app-icon-option-wave-4").click();
    await expect(page.getByTestId("app-icon-option-wave-4")).toHaveAttribute(
      "data-selected",
      "true",
    );
    await expect(page.getByTestId("app-icon-feedback")).toBeVisible();
    await page.waitForFunction(() =>
      Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="icon"]')).some(
        (link) => link.href.includes("/app-icons/wave-4.png"),
      ),
    );

    await openSettings(page, "/settings?section=appearance&panel=serverRail");
    await expect(page.getByTestId("settings-server-rail-compact-preview")).toBeVisible();
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
    await expect(page.getByTestId("app-icon-option-wave-4")).toHaveAttribute(
      "data-selected",
      "true",
    );
  });

  test("voice device selectors and about contributors render", async ({ page }) => {
    await loginAs(page, "alice");
    await openSettings(page, "/settings?section=voice&panel=audio");

    await expect(page.getByTestId("audio-device-select-input-panel")).toBeVisible();
    await expect(page.getByTestId("audio-device-select-output-panel")).toBeVisible();
    await page.getByTestId("audio-device-select-input-trigger").click();
    await expect(page.getByTestId("audio-device-select-input-menu")).toBeVisible();
    await page.getByTestId("audio-device-select-input-menu-refresh").click();
    await expect(page.getByTestId("audio-device-select-input-menu")).toBeVisible();
    await page.getByTestId("audio-device-select-input-option").first().click();
    await expect(page.getByTestId("audio-device-select-input-menu")).toBeHidden();

    const outputTrigger = page.getByTestId("audio-device-select-output-trigger");
    await expect(outputTrigger).toBeVisible();
    if (await outputTrigger.isEnabled()) {
      await outputTrigger.click();
      await expect(page.getByTestId("audio-device-select-output-menu")).toBeVisible();
    }

    await openSettings(page, "/settings?section=about&panel=developer");
    await expect(page.getByText("Doğukan Yazar")).toBeVisible();
    await expect(page.getByText("Oğuz Güğümcüoğlu")).toBeVisible();
    await expect(page.getByText("Mehmet Uğur Çetin")).toBeVisible();
  });
});
