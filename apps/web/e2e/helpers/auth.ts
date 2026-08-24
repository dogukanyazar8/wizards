import type { Page } from "@playwright/test";
import { resolveE2ETimeoutPolicy } from "@/lib/e2e/timeout-policy";
import { expect } from "../fixtures/test";
import { e2eRequestHeaders } from "./api-auth";
import { gotoAppRoute } from "./navigation";
import { e2eUsers, e2eUserPassword, type E2EUserKey } from "./test-data";

const { authRequestTimeoutMs } = resolveE2ETimeoutPolicy();

async function assertSuccessfulE2EResponse(response: Awaited<ReturnType<Page["request"]["post"]>>) {
  if (response.ok()) {
    return;
  }

  const body = await response.text();
  throw new Error(`E2E auth helper failed with ${response.status()}: ${body}`);
}

async function getEnabledLoginSubmitButton(page: Page) {
  const submitButton = page.getByTestId("login-form").locator('button[type="submit"]');

  await expect(submitButton).toBeEnabled({ timeout: 20_000 });

  return submitButton;
}

export async function fillLoginCredentials(
  page: Page,
  input: { email: string; password: string },
): Promise<void> {
  await getEnabledLoginSubmitButton(page);

  const emailInput = page.locator('input[name="email"]');
  const passwordInput = page.locator('input[name="password"]');

  await expect(emailInput).toBeEditable({ timeout: 10_000 });
  await expect(passwordInput).toBeEditable({ timeout: 10_000 });

  await emailInput.fill(input.email);
  await passwordInput.fill(input.password);

  await expect(emailInput).toHaveValue(input.email);
  await expect(passwordInput).toHaveValue(input.password);
}

export async function loginViaUi(page: Page, userKey: E2EUserKey): Promise<void> {
  const user = e2eUsers[userKey];

  await gotoAppRoute(page, "/login");
  await fillLoginCredentials(page, {
    email: user.email,
    password: e2eUserPassword,
  });
  await submitLoginForm(page);
  await expect(page).toHaveURL(/\/messages/);
}

export async function loginAs(page: Page, userKey: E2EUserKey): Promise<void> {
  const response = await page.request.post("/api/e2e/auth/session", {
    data: { userKey },
    headers: e2eRequestHeaders,
    timeout: authRequestTimeoutMs,
  });

  await assertSuccessfulE2EResponse(response);
  await gotoAppRoute(page, "/messages");
  await expect(
    page
      .locator(
        [
          '[data-testid="server-rail"]:visible',
          '[data-testid="mobile-workspace-drawer-button"]:visible',
        ].join(", "),
      )
      .first(),
  ).toBeVisible({ timeout: 15_000 });
  await expectLoggedIn(page);
}

export async function logout(page: Page): Promise<void> {
  const response = await page.request.delete("/api/e2e/auth/session", {
    headers: e2eRequestHeaders,
  });

  await assertSuccessfulE2EResponse(response);
  await gotoAppRoute(page, "/login");
  await expectLoggedOut(page);
}

export async function submitLoginForm(page: Page): Promise<void> {
  const submitButton = await getEnabledLoginSubmitButton(page);
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
  await expect(page).toHaveURL(/\/messages/);
}

export async function expectLoggedOut(page: Page): Promise<void> {
  await expect(page).toHaveURL(/\/login/);
}
