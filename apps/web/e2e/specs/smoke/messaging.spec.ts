import { test, expect } from "../../fixtures/test";
import { loginAs } from "../../helpers/auth";
import { getE2EServerRoute } from "../../helpers/db";
import { sendComposerMessage } from "../../helpers/messages";
import { gotoAppRoute } from "../../helpers/navigation";

test.describe("server messaging smoke", () => {
  test("user can send a server text message", async ({ page }) => {
    const { serverId, textChannelId } = await getE2EServerRoute();
    const message = `Smoke server message ${Date.now()}`;

    await loginAs(page, "alice");
    await gotoAppRoute(page, `/channels/${serverId}/${textChannelId}`, {
      readyTestId: "message-input",
    });
    await sendComposerMessage(page, message);

    await expect(page.getByTestId("message-item").filter({ hasText: message })).toBeVisible();
  });

  test("message links open in a new tab", async ({ page }) => {
    const { serverId, textChannelId } = await getE2EServerRoute();
    const link = `https://example.com/whispr-e2e-${Date.now()}`;

    await loginAs(page, "alice");
    await gotoAppRoute(page, `/channels/${serverId}/${textChannelId}`, {
      readyTestId: "message-input",
    });
    await sendComposerMessage(page, link);
    await expect(page.getByTestId("message-item").filter({ hasText: link })).toBeVisible();

    const [popup] = await Promise.all([
      page.waitForEvent("popup"),
      page.locator("a").filter({ hasText: link }).last().click(),
    ]);

    await expect(popup).toHaveURL(new RegExp(link.replaceAll(".", "\\.")));
    await popup.close();
  });
});
