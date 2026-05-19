import type { Page } from "@playwright/test";
import { expect } from "../fixtures/test";

type AppRouteReadyOptions = {
  readyTestId?: string;
  timeout?: number;
};

export async function gotoAppRoute(
  page: Page,
  path: string,
  options: AppRouteReadyOptions = {},
): Promise<void> {
  await page.goto(path, { waitUntil: "domcontentloaded" });

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

export async function openSettingsFromUserQuickMenu(page: Page): Promise<void> {
  await openUserQuickMenu(page);
  await page.getByTestId("user-appearance-settings-button").click();
  await expect(page).toHaveURL(/\/settings/);
}
