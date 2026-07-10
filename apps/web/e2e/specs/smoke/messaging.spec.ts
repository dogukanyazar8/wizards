import { test, expect } from "../../fixtures/test";
import { loginAs } from "../../helpers/auth";
import {
  createReadOnlyServerForMessagingTest,
  deleteIsolatedE2EServer,
  getE2EServerRoute,
} from "../../helpers/db";
import { sendComposerMessage } from "../../helpers/messages";
import { gotoAppRoute, gotoTextChannelRoute } from "../../helpers/navigation";

test.describe("server messaging smoke", () => {
  test("user can send a server text message", async ({ page }) => {
    const { serverId, textChannelId } = await getE2EServerRoute();
    const message = `Smoke server message ${Date.now()}`;

    await loginAs(page, "alice");
    await gotoTextChannelRoute(page, serverId, textChannelId);
    await sendComposerMessage(page, message);

    await expect(page.getByTestId("message-item").filter({ hasText: message })).toBeVisible();
  });

  test("message links open in a new tab", async ({ page }) => {
    const { serverId, textChannelId } = await getE2EServerRoute();
    const link = `https://example.com/whispr-e2e-${Date.now()}`;

    await loginAs(page, "alice");
    await gotoTextChannelRoute(page, serverId, textChannelId);
    await sendComposerMessage(page, link);
    await expect(page.getByTestId("message-item").filter({ hasText: link })).toBeVisible();

    const [popup] = await Promise.all([
      page.waitForEvent("popup"),
      page.locator("a").filter({ hasText: link }).last().click(),
    ]);

    await expect(popup).toHaveURL(new RegExp(link.replaceAll(".", "\\.")));
    await popup.close();
  });

  test("empty server messages cannot be sent", async ({ page }) => {
    const { serverId, textChannelId } = await getE2EServerRoute();

    await loginAs(page, "alice");
    await gotoTextChannelRoute(page, serverId, textChannelId);

    const input = page.getByTestId("message-input");
    const sendButton = page.getByTestId("message-send-button");

    await expect(sendButton).toBeDisabled();
    await input.fill("   ");
    await expect(input).toHaveValue("   ");
    await expect(sendButton).toBeDisabled();
    await page.keyboard.press("Enter");
    await expect(sendButton).toBeDisabled();
  });

  test("members without channel send permission see a read-only composer", async ({ page }) => {
    const { serverId, textChannelId } = await createReadOnlyServerForMessagingTest("alice", "bob");

    try {
      await loginAs(page, "bob");
      await gotoAppRoute(page, `/channels/${serverId}/${textChannelId}`, {
        readyTestId: "message-input",
      });

      await expect(page.getByText(/^(?:Read-only|Salt okunur)$/i)).toBeVisible({
        timeout: 10_000,
      });
      await expect(page.getByTestId("message-input")).toBeDisabled();
      await expect(page.getByTestId("message-send-button")).toBeDisabled();
      await expect(page.getByTestId("message-file-button")).toBeDisabled();
      await expect(page.getByTestId("gif-picker-button")).toBeDisabled();
    } finally {
      await deleteIsolatedE2EServer(serverId);
    }
  });
});
