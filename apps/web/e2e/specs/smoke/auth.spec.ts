import { test, expect } from "../../fixtures/test";
import {
  expectLoginAlert,
  expectLoggedIn,
  expectLoggedOut,
  loginAs,
  loginViaUi,
  logout,
  submitLoginForm,
} from "../../helpers/auth";
import { gotoAppRoute } from "../../helpers/navigation";
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
    await gotoAppRoute(page, "/login");
    await page.locator('input[name="email"]').fill(e2eUsers.alice.email);
    await page.locator('input[name="password"]').fill(`${e2eUserPassword}-wrong`);
    await submitLoginForm(page);

    await expect(page).toHaveURL(/\/login/);
    await expectLoginAlert(
      page,
      /invalid|email|password|hatal|gecersiz|geçersiz|sifre|şifre/i,
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
