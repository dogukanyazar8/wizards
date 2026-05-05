import type { Browser, BrowserContext, Page } from "@playwright/test";
import { test, expect } from "../../fixtures/test";
import { loginAs } from "../../helpers/auth";
import {
  createIsolatedServerForMembershipTest,
  getE2EDMConversationId,
  getE2EServerRoute,
  getServerMemberId,
  resetFriendshipBetween,
} from "../../helpers/db";
import { e2eUsers, type E2EUserKey } from "../../helpers/test-data";

type LoggedInPage = {
  context: BrowserContext;
  page: Page;
};

async function openLoggedInPage(browser: Browser, userKey: E2EUserKey): Promise<LoggedInPage> {
  const context = await browser.newContext();
  const page = await context.newPage();

  await loginAs(page, userKey);

  return { context, page };
}

async function sendMessage(page: Page, content: string): Promise<void> {
  await page.getByTestId("message-input").fill(content);
  await page.getByTestId("message-send-button").click();
}

async function closeLoggedInPages(pages: LoggedInPage[]): Promise<void> {
  await Promise.all(pages.map(({ context }) => context.close()));
}

test.describe("realtime multi-user flows", () => {
  test("server messages appear for another member without reload", async ({ browser }) => {
    const { serverId, textChannelId } = await getE2EServerRoute();
    const alice = await openLoggedInPage(browser, "alice");
    const bob = await openLoggedInPage(browser, "bob");
    const message = `Realtime server message ${Date.now()}`;

    try {
      await Promise.all([
        alice.page.goto(`/channels/${serverId}/${textChannelId}`),
        bob.page.goto(`/channels/${serverId}/${textChannelId}`),
      ]);

      await sendMessage(alice.page, message);

      await expect(
        bob.page.getByTestId("message-item").filter({ hasText: message }),
      ).toBeVisible({ timeout: 10_000 });
    } finally {
      await closeLoggedInPages([alice, bob]);
    }
  });

  test("DM messages appear for another participant without reload", async ({ browser }) => {
    const conversationId = await getE2EDMConversationId();
    const alice = await openLoggedInPage(browser, "alice");
    const bob = await openLoggedInPage(browser, "bob");
    const message = `Realtime DM message ${Date.now()}`;

    try {
      await Promise.all([
        alice.page.goto(`/channels/@me/${conversationId}`),
        bob.page.goto(`/channels/@me/${conversationId}`),
      ]);

      await sendMessage(alice.page, message);

      await expect(
        bob.page.getByTestId("message-item").filter({ hasText: message }),
      ).toBeVisible({ timeout: 10_000 });
    } finally {
      await closeLoggedInPages([alice, bob]);
    }
  });

  test("friend request and acceptance update both users without reload", async ({ browser }) => {
    await resetFriendshipBetween("alice", "bob");

    const alice = await openLoggedInPage(browser, "alice");
    const bob = await openLoggedInPage(browser, "bob");

    try {
      await Promise.all([alice.page.goto("/channels/@me"), bob.page.goto("/channels/@me")]);

      await bob.page.getByTestId("friends-tab-pending").click();
      await alice.page.getByTestId("friends-tab-add").click();
      await alice.page.getByTestId("friend-username-input").fill(e2eUsers.bob.username);
      await expect(alice.page.getByTestId("send-friend-request-button")).toBeEnabled({
        timeout: 3_000,
      });
      await alice.page.getByTestId("send-friend-request-button").click();

      await expect(
        bob.page.getByTestId(`friend-request-incoming-${e2eUsers.alice.username}`),
      ).toBeVisible({ timeout: 10_000 });

      await bob.page.getByTestId(`friend-request-accept-${e2eUsers.alice.username}`).click();
      await alice.page.getByTestId("friends-tab-online").click();

      await expect(alice.page.getByTestId(`friend-card-${e2eUsers.bob.username}`)).toBeVisible({
        timeout: 10_000,
      });
    } finally {
      await closeLoggedInPages([alice, bob]);
    }
  });

  test("server member add and removal update the target user's rail without reload", async ({
    browser,
  }) => {
    const { serverId, textChannelId } = await createIsolatedServerForMembershipTest("alice");
    const alice = await openLoggedInPage(browser, "alice");
    const bob = await openLoggedInPage(browser, "bob");

    try {
      await alice.page.goto(`/channels/${serverId}/${textChannelId}`);
      await bob.page.goto("/channels/@me");
      await expect(bob.page.getByTestId(`server-rail-server-${serverId}`)).toBeHidden();

      const addResponse = await alice.page.request.post(`/api/v1/servers/${serverId}/members`, {
        data: { username: e2eUsers.bob.username },
      });

      expect(addResponse.ok()).toBeTruthy();
      await expect(bob.page.getByTestId("notification-bell-badge")).toBeVisible({
        timeout: 10_000,
      });
      await expect(bob.page.getByTestId(`server-rail-server-${serverId}`)).toBeVisible({
        timeout: 10_000,
      });

      const bobMemberId = await getServerMemberId(serverId, "bob");
      const kickResponse = await alice.page.request.delete(
        `/api/v1/servers/${serverId}/members/${bobMemberId}`,
      );

      expect(kickResponse.ok()).toBeTruthy();
      await expect(bob.page.getByTestId(`server-rail-server-${serverId}`)).toBeHidden({
        timeout: 10_000,
      });
    } finally {
      await closeLoggedInPages([alice, bob]);
    }
  });

  test("mentions notify the target user and render as highlighted text", async ({ browser }) => {
    const { serverId, textChannelId } = await getE2EServerRoute();
    const alice = await openLoggedInPage(browser, "alice");
    const bob = await openLoggedInPage(browser, "bob");
    const suffix = Date.now();

    try {
      await Promise.all([
        alice.page.goto(`/channels/${serverId}/${textChannelId}`),
        bob.page.goto(`/channels/${serverId}/${textChannelId}`),
      ]);

      await alice.page
        .getByTestId("message-input")
        .fill(`Realtime mention ${suffix} @${e2eUsers.bob.username}`);
      await alice.page.getByTestId(`mention-suggestion-${e2eUsers.bob.username}`).click();
      await alice.page.getByTestId("message-send-button").click();

      const bobMessage = bob.page
        .getByTestId("message-item")
        .filter({ hasText: `Realtime mention ${suffix}` });

      await expect(bobMessage).toBeVisible({ timeout: 10_000 });
      await expect(
        bobMessage
          .getByTestId("message-mention")
          .filter({ hasText: `@${e2eUsers.bob.username}` }),
      ).toBeVisible();
      await expect(bob.page.getByTestId("notification-bell-badge")).toBeVisible({
        timeout: 10_000,
      });
    } finally {
      await closeLoggedInPages([alice, bob]);
    }
  });
});
