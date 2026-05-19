import { test, expect } from "../../fixtures/test";
import { loginAs } from "../../helpers/auth";
import { gotoAppRoute } from "../../helpers/navigation";

test.describe("server smoke", () => {
  test("user can create and open a server", async ({ page }) => {
    const serverName = `Whispr Smoke ${Date.now()}`;

    await loginAs(page, "alice");
    await gotoAppRoute(page, "/channels/@me", { readyTestId: "create-server-button" });
    await page.getByTestId("create-server-button").click();

    await expect(page.getByTestId("server-create-form")).toBeVisible();
    await page.getByTestId("server-name-input").fill(serverName);
    await page.getByTestId("server-short-name-input").fill("SMK1");
    await page
      .getByTestId("server-description-input")
      .fill("Created by the Playwright smoke suite.");
    await page.getByTestId("server-submit-button").click();

    await expect(page).toHaveURL(/\/channels\/[0-9a-f-]+\/[0-9a-f-]+/i);
    const channelSidebar = page.getByTestId("channel-sidebar");
    await expect(channelSidebar).toContainText(serverName);
    await expect(channelSidebar).toContainText("welcome-chat");
    await expect(channelSidebar).toContainText("live-room");
  });
});
