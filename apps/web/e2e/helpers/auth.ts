import type { Page } from "@playwright/test";
import { expect } from "../fixtures/test";
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

  await page.goto("/login");
  await page.locator('input[name="email"]').fill(user.email);
  await page.locator('input[name="password"]').fill(e2eUserPassword);
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/channels/);
}

export async function loginAs(page: Page, userKey: E2EUserKey): Promise<void> {
  const response = await page.request.post("/api/e2e/auth/session", {
    data: { userKey },
  });

  await assertSuccessfulE2EResponse(response);
  await page.goto("/channels");
  await expectLoggedIn(page);
}

export async function logout(page: Page): Promise<void> {
  const response = await page.request.delete("/api/e2e/auth/session");

  await assertSuccessfulE2EResponse(response);
  await page.goto("/login");
  await expectLoggedOut(page);
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
