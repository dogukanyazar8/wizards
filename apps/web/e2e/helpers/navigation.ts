import type { Page } from "@playwright/test";
import { expect } from "../fixtures/test";

type AppRouteReadyOptions = {
  navigationTimeout?: number;
  readyTestId?: string;
  timeout?: number;
};

export async function gotoAppRoute(
  page: Page,
  path: string,
  options: AppRouteReadyOptions = {},
): Promise<void> {
  await page.goto(path, {
    timeout: options.navigationTimeout ?? 45_000,
    waitUntil: "commit",
  });

  if (options.readyTestId) {
    await expect(page.getByTestId(options.readyTestId)).toBeVisible({
      timeout: options.timeout ?? 15_000,
    });
  }
}

export async function openUserQuickMenu(page: Page): Promise<void> {
  await page.getByTestId("user-settings-button").click();
  await expect(page.getByTestId("user-quick-menu")).toBeVisible();
}

export async function expectSettingsOverlayOpen(page: Page): Promise<void> {
  await expect(page.getByTestId("in-app-settings-overlay")).toBeVisible({
    timeout: 15_000,
  });
}

export async function expectSettingsOverlayClosed(page: Page): Promise<void> {
  await expect(page.getByTestId("in-app-settings-overlay")).toBeHidden({
    timeout: 10_000,
  });
}

export async function openSettingsFromUserQuickMenu(page: Page): Promise<void> {
  await openUserQuickMenu(page);
  await page.getByTestId("user-appearance-settings-button").click();
  await expectSettingsOverlayOpen(page);
}

export async function closeInAppSettingsOverlay(page: Page): Promise<void> {
  await page.getByTestId("in-app-settings-close").click();
  await expectSettingsOverlayClosed(page);
}
