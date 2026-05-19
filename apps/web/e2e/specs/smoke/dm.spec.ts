import type { Page } from "@playwright/test";
import { test, expect } from "../../fixtures/test";
import { loginAs } from "../../helpers/auth";
import { getDMUnreadCount, getE2EDMConversationId } from "../../helpers/db";
import { gotoAppRoute } from "../../helpers/navigation";

async function sendMessage(page: Page, content: string) {
  await page.getByTestId("message-input").fill(content);
  await page.getByTestId("message-send-button").click();
}

test.describe("DM smoke", () => {
  test("user can open a DM and send a message", async ({ page }) => {
    const conversationId = await getE2EDMConversationId();
    const message = `Smoke DM message ${Date.now()}`;

    await loginAs(page, "alice");
    await gotoAppRoute(page, `/channels/@me/${conversationId}`, { readyTestId: "message-input" });
    await sendMessage(page, message);

    await expect(page.getByTestId("message-item").filter({ hasText: message })).toBeVisible();
  });

  test("recipient unread badge updates after a DM", async ({ browser }) => {
    const conversationId = await getE2EDMConversationId();
    const aliceContext = await browser.newContext();
    const bobContext = await browser.newContext();
    const alicePage = await aliceContext.newPage();
    const bobPage = await bobContext.newPage();
    const message = `Unread DM smoke ${Date.now()}`;

    try {
      await loginAs(alicePage, "alice");
      await gotoAppRoute(alicePage, `/channels/@me/${conversationId}`, {
        readyTestId: "message-input",
      });
      await sendMessage(alicePage, message);

      await expect
        .poll(() => getDMUnreadCount("bob", conversationId), { timeout: 10_000 })
        .toBeGreaterThan(0);

      await loginAs(bobPage, "bob");
      await gotoAppRoute(bobPage, "/channels/@me", { readyTestId: "server-rail" });
      await expect(
        bobPage.getByTestId(`dm-conversation-${conversationId}-unread-badge`),
      ).toBeVisible();
    } finally {
      await aliceContext.close();
      await bobContext.close();
    }
  });
});
