import { test, expect } from "../../fixtures/test";
import { loginAs } from "../../helpers/auth";

test.describe("app shell smoke", () => {
  test("authenticated user lands on the DM home shell", async ({ page }) => {
    await loginAs(page, "alice");
    await page.goto("/channels/@me");

    await expect(page).toHaveURL(/\/channels\/@me$/);
    await expect(page.getByTestId("server-rail")).toBeVisible();
    await expect(page.getByTestId("channel-sidebar")).toBeVisible();
    await expect(page.getByTestId("user-bar")).toBeVisible();
  });

  test("settings opens and closes from the user bar", async ({ page }) => {
    await loginAs(page, "alice");
    await page.goto("/channels/@me");

    await page.getByTestId("user-settings-button").click();
    await expect(page).toHaveURL(/\/settings/);

    await page.goBack();
    await expect(page).toHaveURL(/\/channels\/@me/);
    await expect(page.getByTestId("user-bar")).toBeVisible();
  });
});
