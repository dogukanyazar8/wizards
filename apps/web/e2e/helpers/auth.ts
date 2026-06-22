import type { Page } from "@playwright/test";
import { expect } from "../fixtures/test";
import { gotoAppRoute } from "./navigation";
import { e2eUsers, e2eUserPassword, type E2EUserKey } from "./test-data";

async function assertSuccessfulE2EResponse(response: Awaited<ReturnType<Page["request"]["post"]>>) {
  if (response.ok()) {
    return;
  }

  const body = await response.text();
  throw new Error(`E2E auth helper failed with ${response.status()}: ${body}`);
}

export async function loginViaUi(page: Page, userKey: E2EUserKey): Promise<void> {
  const user = e2eUsers[userKey];

  await gotoAppRoute(page, "/login");
  await page.locator('input[name="email"]').fill(user.email);
  await page.locator('input[name="password"]').fill(e2eUserPassword);
  await submitLoginForm(page);
  await expect(page).toHaveURL(/\/channels/);
}

export async function loginAs(page: Page, userKey: E2EUserKey): Promise<void> {
  const response = await page.request.post("/api/e2e/auth/session", {
    data: { userKey },
  });

  await assertSuccessfulE2EResponse(response);
  await gotoAppRoute(page, "/channels", { readyTestId: "server-rail" });
  await expectLoggedIn(page);
}

export async function logout(page: Page): Promise<void> {
  const response = await page.request.delete("/api/e2e/auth/session");

  await assertSuccessfulE2EResponse(response);
  await gotoAppRoute(page, "/login");
  await expectLoggedOut(page);
}

export async function submitLoginForm(page: Page): Promise<void> {
  const submitButton = page.getByTestId("login-form").locator('button[type="submit"]');

  await expect(submitButton).toBeEnabled({ timeout: 20_000 });
  await submitButton.click();
}

export async function expectLoginAlert(page: Page, pattern: RegExp): Promise<void> {
  const alert = page.getByTestId("login-form").getByRole("alert");

  await expect(alert).toBeVisible({ timeout: 15_000 });
  await expect(alert).toContainText(pattern);
}

export async function logoutViaUi(page: Page): Promise<void> {
  await page.getByRole("button", { name: /logout|sign out|cikis|çıkış/i }).click();
  await expectLoggedOut(page);
}

export async function expectLoggedIn(page: Page): Promise<void> {
  await expect(page).toHaveURL(/\/channels/);
}

export async function expectLoggedOut(page: Page): Promise<void> {
  await expect(page).toHaveURL(/\/login/);
}
