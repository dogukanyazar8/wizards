import { test, expect } from "../../fixtures/test";
import { loginAs } from "../../helpers/auth";
import { gotoAppRoute, openSettingsFromUserQuickMenu } from "../../helpers/navigation";

test.describe("app shell smoke", () => {
  test("authenticated user lands on the DM home shell", async ({ page }) => {
    await loginAs(page, "alice");
    await gotoAppRoute(page, "/channels/@me", { readyTestId: "server-rail" });

    await expect(page).toHaveURL(/\/channels\/@me$/);
    await expect(page.getByTestId("server-rail")).toBeVisible();
    await expect(page.getByTestId("channel-sidebar")).toBeVisible();
    await expect(page.getByTestId("user-bar")).toBeVisible();
  });

  test("settings opens and closes from the user bar", async ({ page }) => {
    await loginAs(page, "alice");
    await gotoAppRoute(page, "/channels/@me", { readyTestId: "user-bar" });

    await openSettingsFromUserQuickMenu(page);

    await page.goBack({ waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/channels\/@me/);
    await expect(page.getByTestId("user-bar")).toBeVisible();
  });
});
