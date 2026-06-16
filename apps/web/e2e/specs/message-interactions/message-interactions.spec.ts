import type { Browser, BrowserContext, Locator, Page } from "@playwright/test";
import { test, expect } from "../../fixtures/test";
import { loginAs } from "../../helpers/auth";
import { getE2EDMConversationId, getE2EServerRoute } from "../../helpers/db";
import { sendComposerMessage } from "../../helpers/messages";
import { e2eUsers, type E2EUserKey } from "../../helpers/test-data";

type LoggedInPage = {
  context: BrowserContext;
  page: Page;
};

const reactionEmoji = {
  heart: "\u2764\uFE0F",
  party: "\u{1F389}",
  thumbsUp: "\u{1F44D}",
} as const;

async function openLoggedInPage(browser: Browser, userKey: E2EUserKey): Promise<LoggedInPage> {
  const context = await browser.newContext();
  const page = await context.newPage();

  await loginAs(page, userKey);

  return { context, page };
}

async function closeLoggedInPages(pages: LoggedInPage[]): Promise<void> {
  await Promise.all(pages.map(({ context }) => context.close()));
}

async function sendMessage(page: Page, content: string): Promise<void> {
  await sendComposerMessage(page, content);
}

function messageByText(page: Page, content: string): Locator {
  return page.getByTestId("message-item").filter({ hasText: content }).last();
}

function messageByExactText(page: Page, content: string): Locator {
  return page
    .getByText(content, { exact: true })
    .last()
    .locator("xpath=ancestor::*[@data-testid='message-item'][1]");
}

async function waitForActionableMessage(page: Page, content: string): Promise<Locator> {
  const message = messageByText(page, content);

  await expect(message).toBeVisible({ timeout: 10_000 });
  await message.hover();
  await expect(message.getByTestId("message-toolbar").first()).toBeVisible({
    timeout: 10_000,
  });

  return message;
}

async function openReactionPicker(page: Page, message: Locator): Promise<void> {
  await message.hover();
  await message.getByTestId("message-action-react").first().click();
  await expect(page.getByTestId("reaction-picker")).toBeVisible({
    timeout: 5_000,
  });
}

async function addQuickReaction(page: Page, message: Locator, emoji: string): Promise<void> {
  await openReactionPicker(page, message);
  await expect(page.getByTestId("reaction-picker")).toBeVisible();
  await page.getByTestId("reaction-option").filter({ hasText: emoji }).click();
}

test.describe("message interactions", () => {
  test("message list exposes an accessible live history", async ({ page }) => {
    const { serverId, textChannelId } = await getE2EServerRoute();

    await loginAs(page, "alice");
    await page.goto(`/channels/${serverId}/${textChannelId}`);

    const messageList = page.getByTestId("message-list");
    await expect(messageList).toBeVisible({ timeout: 10_000 });
    await expect(messageList).toHaveAttribute("role", "log");
    await expect(messageList).toHaveAttribute("aria-live", "polite");
  });

  test("search panel behaves like a dismissible dialog", async ({ page }) => {
    const { serverId, textChannelId } = await getE2EServerRoute();

    await loginAs(page, "alice");
    await page.goto(`/channels/${serverId}/${textChannelId}`);
    await page.getByTestId("message-search-open").click();

    const searchPanel = page.getByTestId("message-search-panel");
    await expect(searchPanel).toBeVisible({ timeout: 10_000 });
    await expect(searchPanel).toHaveAttribute("role", "dialog");
    await expect(searchPanel).toHaveAttribute("aria-modal", "true");

    await page.keyboard.press("Escape");
    await expect(searchPanel).toBeHidden({ timeout: 10_000 });
  });

  test("thread panel opens as an accessible dialog and closes with Escape", async ({ page }) => {
    const { serverId, textChannelId } = await getE2EServerRoute();
    const content = `Thread accessibility target ${Date.now()}`;

    await loginAs(page, "alice");
    await page.goto(`/channels/${serverId}/${textChannelId}`);
    await sendMessage(page, content);

    const message = await waitForActionableMessage(page, content);
    await message.getByTestId("message-action-thread").first().click();

    const threadPanel = page.getByTestId("thread-panel");
    await expect(threadPanel).toBeVisible({ timeout: 10_000 });
    await expect(threadPanel).toHaveAttribute("role", "dialog");
    await expect(threadPanel).toHaveAttribute("aria-modal", "true");

    await page.keyboard.press("Escape");
    await expect(threadPanel).toBeHidden({ timeout: 10_000 });
  });

  test("user can react to a server message", async ({ page }) => {
    const { serverId, textChannelId } = await getE2EServerRoute();
    const content = `Server reaction target ${Date.now()}`;

    await loginAs(page, "alice");
    await page.goto(`/channels/${serverId}/${textChannelId}`);
    await sendMessage(page, content);

    const message = await waitForActionableMessage(page, content);
    await addQuickReaction(page, message, reactionEmoji.thumbsUp);

    await expect(
      message.getByTestId("message-reaction").filter({ hasText: `${reactionEmoji.thumbsUp} 1` }),
    ).toBeVisible({
      timeout: 10_000,
    });
  });

  test("user can react to a DM message", async ({ page }) => {
    const conversationId = await getE2EDMConversationId();
    const content = `DM reaction target ${Date.now()}`;

    await loginAs(page, "alice");
    await page.goto(`/channels/@me/${conversationId}`);
    await sendMessage(page, content);

    const message = await waitForActionableMessage(page, content);
    await addQuickReaction(page, message, reactionEmoji.heart);

    await expect(
      message.getByTestId("message-reaction").filter({ hasText: `${reactionEmoji.heart} 1` }),
    ).toBeVisible({
      timeout: 10_000,
    });
  });

  test("user can edit a message", async ({ page }) => {
    const { serverId, textChannelId } = await getE2EServerRoute();
    const original = `Edit target ${Date.now()}`;
    const edited = `${original} updated`;

    await loginAs(page, "alice");
    await page.goto(`/channels/${serverId}/${textChannelId}`);
    await sendMessage(page, original);

    const message = await waitForActionableMessage(page, original);
    await message.getByTestId("message-action-edit").first().click();
    await expect(page.getByTestId("message-editor")).toBeVisible();
    await page.getByTestId("message-editor-input").fill(edited);
    await page.getByTestId("message-editor-save").click();

    await expect(messageByText(page, edited)).toBeVisible({ timeout: 10_000 });
  });

  test("user deletes a message with the custom confirmation modal", async ({ page }) => {
    const { serverId, textChannelId } = await getE2EServerRoute();
    const content = `Delete target ${Date.now()}`;
    const browserDialogs: string[] = [];

    page.on("dialog", (dialog) => {
      browserDialogs.push(dialog.message());
      void dialog.dismiss();
    });

    await loginAs(page, "alice");
    await page.goto(`/channels/${serverId}/${textChannelId}`);
    await sendMessage(page, content);

    const message = await waitForActionableMessage(page, content);
    await message.getByTestId("message-action-delete").first().click();

    await expect(page.getByTestId("message-delete-dialog")).toBeVisible();
    expect(browserDialogs).toHaveLength(0);

    await page.getByTestId("message-delete-confirm").click();
    await expect(page.getByTestId("message-delete-dialog")).toBeHidden({ timeout: 10_000 });
    await expect(page.getByTestId("message-item").filter({ hasText: content })).toHaveCount(0, {
      timeout: 10_000,
    });
  });

  test("user can reply to a message", async ({ page }) => {
    const { serverId, textChannelId } = await getE2EServerRoute();
    const original = `Reply target ${Date.now()}`;
    const reply = `Reply response ${Date.now()}`;

    await loginAs(page, "alice");
    await page.goto(`/channels/${serverId}/${textChannelId}`);
    await sendMessage(page, original);

    const message = await waitForActionableMessage(page, original);
    await message.getByTestId("message-action-reply").first().click();
    await expect(page.getByTestId("reply-preview")).toBeVisible();
    await sendMessage(page, reply);

    const replyMessage = messageByText(page, reply);
    await expect(replyMessage).toBeVisible({ timeout: 10_000 });
    await expect(replyMessage).toContainText(original);
  });

  test("user profile popup opens and closes from a message avatar", async ({ browser }) => {
    const { serverId, textChannelId } = await getE2EServerRoute();
    const alice = await openLoggedInPage(browser, "alice");
    const bob = await openLoggedInPage(browser, "bob");
    const separator = `Profile separator ${Date.now()}`;
    const content = `Profile popup target ${Date.now()}`;

    try {
      await Promise.all([
        alice.page.goto(`/channels/${serverId}/${textChannelId}`),
        bob.page.goto(`/channels/${serverId}/${textChannelId}`),
      ]);

      await sendMessage(alice.page, separator);
      await sendMessage(bob.page, content);

      await expect(alice.page.getByText(content, { exact: true })).toBeVisible({
        timeout: 10_000,
      });
      const message = messageByExactText(alice.page, content);
      await expect(message).toBeVisible({ timeout: 10_000 });
      await message.getByTestId(`message-author-profile-${e2eUsers.bob.username}`).click();
      await expect(alice.page.getByTestId("user-profile-popover")).toBeVisible({
        timeout: 10_000,
      });
      await alice.page.keyboard.press("Escape");
      await expect(alice.page.getByTestId("user-profile-popover")).toBeHidden({
        timeout: 10_000,
      });
    } finally {
      await closeLoggedInPages([alice, bob]);
    }
  });

  test("emoji picker opens near the composer", async ({ page }) => {
    const { serverId, textChannelId } = await getE2EServerRoute();

    await loginAs(page, "alice");
    await page.goto(`/channels/${serverId}/${textChannelId}`);
    await page.getByTestId("emoji-picker-button").click();

    const picker = page.getByTestId("emoji-picker");
    const composer = page.getByTestId("message-composer");
    await expect(picker).toBeVisible({ timeout: 10_000 });

    const [pickerBox, composerBox] = await Promise.all([
      picker.boundingBox(),
      composer.boundingBox(),
    ]);

    expect(pickerBox).not.toBeNull();
    expect(composerBox).not.toBeNull();
    expect(pickerBox!.y).toBeLessThan(composerBox!.y);
    expect(pickerBox!.x).toBeGreaterThanOrEqual(composerBox!.x - 24);
    expect(pickerBox!.x).toBeLessThan(composerBox!.x + composerBox!.width);

    await page.getByTestId("emoji-picker-close").click();
    await expect(picker).toBeHidden();
  });

  test("reaction picker remains open long enough to click an option", async ({ page }) => {
    const { serverId, textChannelId } = await getE2EServerRoute();
    const content = `Stable reaction picker target ${Date.now()}`;

    await loginAs(page, "alice");
    await page.goto(`/channels/${serverId}/${textChannelId}`);
    await sendMessage(page, content);

    const message = await waitForActionableMessage(page, content);
    await openReactionPicker(page, message);
    await page.waitForTimeout(600);
    await expect(page.getByTestId("reaction-picker")).toBeVisible();
    await page.getByTestId("reaction-option").filter({ hasText: reactionEmoji.party }).click();

    await expect(
      message.getByTestId("message-reaction").filter({ hasText: `${reactionEmoji.party} 1` }),
    ).toBeVisible({
      timeout: 10_000,
    });
  });
});
