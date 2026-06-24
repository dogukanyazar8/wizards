import { test, expect } from "../../fixtures/test";
import { loginAs } from "../../helpers/auth";
import { attachE2EPageDiagnostics } from "../../helpers/diagnostics";
import { getDMUnreadCount, getE2EDMConversationId } from "../../helpers/db";
import { sendComposerMessage } from "../../helpers/messages";
import { gotoAppRoute, gotoDmConversationRoute } from "../../helpers/navigation";

test.describe("DM smoke", () => {
  test("user can open a DM and send a message", async ({ page }) => {
    const conversationId = await getE2EDMConversationId();
    const message = `Smoke DM message ${Date.now()}`;

    await loginAs(page, "alice");
    await gotoDmConversationRoute(page, conversationId);
    await sendComposerMessage(page, message);

    await expect(page.getByTestId("message-item").filter({ hasText: message })).toBeVisible();
  });

  test("new chat opens the friend picker from the DM sidebar", async ({ page }) => {
    const conversationId = await getE2EDMConversationId();

    await loginAs(page, "alice");
    await gotoDmConversationRoute(page, conversationId);

    await page.getByTestId("dm-new-chat-button").click();

    await expect(page).toHaveURL(/\/channels\/@me(?:$|\?)/);
    await expect(page.getByTestId("friends-dashboard")).toBeVisible();
    await expect
      .poll(async () => {
        const [allSelected, addSelected] = await Promise.all([
          page.getByTestId("friends-tab-all").getAttribute("aria-selected"),
          page.getByTestId("friends-tab-add").getAttribute("aria-selected"),
        ]);

        return allSelected === "true" || addSelected === "true";
      })
      .toBe(true);
  });

  test("recipient unread badge updates after a DM", async ({ browser }, testInfo) => {
    const conversationId = await getE2EDMConversationId();
    const aliceContext = await browser.newContext();
    const bobContext = await browser.newContext();
    const alicePage = await aliceContext.newPage();
    const bobPage = await bobContext.newPage();
    const aliceDiagnostics = attachE2EPageDiagnostics(alicePage, testInfo, "alice");
    const bobDiagnostics = attachE2EPageDiagnostics(bobPage, testInfo, "bob");
    const message = `Unread DM smoke ${Date.now()}`;

    try {
      await loginAs(alicePage, "alice");
      await gotoDmConversationRoute(alicePage, conversationId);
      await sendComposerMessage(alicePage, message);

      await expect
        .poll(() => getDMUnreadCount("bob", conversationId), { timeout: 10_000 })
        .toBeGreaterThan(0);

      await loginAs(bobPage, "bob");
      await gotoAppRoute(bobPage, "/channels/@me", { readyTestId: "server-rail" });
      await expect(
        bobPage.getByTestId(`dm-conversation-${conversationId}-unread-badge`),
      ).toBeVisible();
    } finally {
      await Promise.allSettled([
        aliceDiagnostics.attachIfFailed(),
        bobDiagnostics.attachIfFailed(),
      ]);
      await Promise.allSettled([aliceContext.close(), bobContext.close()]);
      aliceDiagnostics.dispose();
      bobDiagnostics.dispose();
    }
  });
});
