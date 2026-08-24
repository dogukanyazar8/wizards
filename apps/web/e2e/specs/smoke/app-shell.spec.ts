import { test, expect } from "../../fixtures/test";
import { loginAs } from "../../helpers/auth";
import {
  closeInAppSettingsOverlay,
  expectSettingsOverlayClosed,
  gotoAppRoute,
  openSettingsFromUserQuickMenu,
} from "../../helpers/navigation";

test.describe("app shell smoke", () => {
  test("authenticated user lands on the DM home shell", async ({ page }) => {
    await loginAs(page, "alice");
    await gotoAppRoute(page, "/messages", { readyTestId: "server-rail" });

    await expect(page).toHaveURL(/\/messages$/);
    await expect(page.getByTestId("server-rail")).toBeVisible();
    // Mesajlar kendi rotasina tasindi: ucuncu sutun artik kanal listesi degil
    // sohbet rayi. `channel-sidebar` yalniz `/channels/[serverId]/*` altinda cizilir.
    await expect(page.getByTestId("messages-rail")).toBeVisible();
    await expect(page.getByTestId("user-bar")).toBeVisible();
  });

  test("settings opens and closes from the user bar", async ({ page }) => {
    await loginAs(page, "alice");
    await gotoAppRoute(page, "/messages", { readyTestId: "user-bar" });

    await openSettingsFromUserQuickMenu(page);
    await expect(page).toHaveURL(/\/messages/);

    await closeInAppSettingsOverlay(page);
    await expect(page).toHaveURL(/\/messages/);
    await expect(page.getByTestId("user-bar")).toBeVisible();

    await openSettingsFromUserQuickMenu(page);
    await page.keyboard.press("Escape");
    await expectSettingsOverlayClosed(page);
    await expect(page).toHaveURL(/\/messages/);
    await expect(page.getByTestId("user-bar")).toBeVisible();
  });
});
