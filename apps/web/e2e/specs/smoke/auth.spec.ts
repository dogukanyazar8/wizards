import { test, expect } from "../../fixtures/test";
import {
  expectLoggedIn,
  expectLoggedOut,
  loginAs,
  loginViaUi,
  logout,
} from "../../helpers/auth";
import { expectUserStatus } from "../../helpers/db";
import { e2eUserPassword, e2eUsers } from "../../helpers/test-data";

test.describe("auth smoke", () => {
  test("user can login through the UI", async ({ page }) => {
    await loginViaUi(page, "alice");

    await expectLoggedIn(page);
    await expect(page.getByTestId("server-rail")).toBeVisible();
    await expect(page.getByTestId("user-bar")).toBeVisible();
  });

  test("wrong password fails without entering the app", async ({ page }) => {
    await page.goto("/login");
    await page.locator('input[name="email"]').fill(e2eUsers.alice.email);
    await page.locator('input[name="password"]').fill(`${e2eUserPassword}-wrong`);
    await page.locator('button[type="submit"]').click();

    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByTestId("login-form").getByRole("alert")).toContainText(
      /invalid|email|password|hatal|gecersiz|geçersiz/i,
    );
  });

  test("login and logout update presence", async ({ page }) => {
    await loginAs(page, "alice");
    await expectUserStatus("alice", "ONLINE");

    await logout(page);
    await expectLoggedOut(page);
    await expectUserStatus("alice", "OFFLINE");
  });
});
