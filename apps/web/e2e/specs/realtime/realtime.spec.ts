import type { Browser, BrowserContext, Page, TestInfo } from "@playwright/test";
import { test, expect } from "../../fixtures/test";
import { loginAs } from "../../helpers/auth";
import {
  attachE2EPageDiagnostics,
  type E2EPageDiagnosticsHandle,
} from "../../helpers/diagnostics";
import {
  createIsolatedServerForMembershipTest,
  getE2EDMConversationId,
  getE2EServerRoute,
  getServerMemberId,
  resetFriendshipBetween,
} from "../../helpers/db";
import { sendComposerMessage } from "../../helpers/messages";
import {
  gotoAppRoute,
  gotoDmConversationRoute,
  gotoTextChannelRoute,
  visibleTestId,
} from "../../helpers/navigation";
import { e2eUsers, type E2EUserKey } from "../../helpers/test-data";

type LoggedInPage = {
  context: BrowserContext;
  diagnostics: E2EPageDiagnosticsHandle;
  page: Page;
};

async function openLoggedInPage(
  browser: Browser,
  userKey: E2EUserKey,
  testInfo: TestInfo,
): Promise<LoggedInPage> {
  const context = await browser.newContext();
  const page = await context.newPage();
  const diagnostics = attachE2EPageDiagnostics(page, testInfo, userKey);

  await loginAs(page, userKey);

  return { context, diagnostics, page };
}

async function sendMessage(page: Page, content: string): Promise<void> {
  await sendComposerMessage(page, content);
}

async function closeLoggedInPages(pages: LoggedInPage[]): Promise<void> {
  await Promise.allSettled(pages.map(({ diagnostics }) => diagnostics.attachIfFailed()));
  await Promise.allSettled(pages.map(({ context }) => context.close()));
  for (const { diagnostics } of pages) {
    diagnostics.dispose();
  }
}

test.describe("realtime multi-user flows", () => {
  test("server messages appear for another member without reload", async ({ browser }, testInfo) => {
    const { serverId, textChannelId } = await getE2EServerRoute();
    const alice = await openLoggedInPage(browser, "alice", testInfo);
    const bob = await openLoggedInPage(browser, "bob", testInfo);
    const message = `Realtime server message ${Date.now()}`;

    try {
      await gotoTextChannelRoute(alice.page, serverId, textChannelId);
      await gotoTextChannelRoute(bob.page, serverId, textChannelId);

      await sendMessage(alice.page, message);

      await expect(
        bob.page.getByTestId("message-item").filter({ hasText: message }),
      ).toBeVisible({ timeout: 10_000 });
    } finally {
      await closeLoggedInPages([alice, bob]);
    }
  });

  test("DM messages appear for another participant without reload", async ({ browser }, testInfo) => {
    const conversationId = await getE2EDMConversationId();
    const alice = await openLoggedInPage(browser, "alice", testInfo);
    const bob = await openLoggedInPage(browser, "bob", testInfo);
    const message = `Realtime DM message ${Date.now()}`;

    try {
      await gotoDmConversationRoute(alice.page, conversationId);
      await gotoDmConversationRoute(bob.page, conversationId);

      await sendMessage(alice.page, message);

      await expect(
        bob.page.getByTestId("message-item").filter({ hasText: message }),
      ).toBeVisible({ timeout: 10_000 });
    } finally {
      await closeLoggedInPages([alice, bob]);
    }
  });

  test("friend request and acceptance update both users without reload", async ({ browser }, testInfo) => {
    await resetFriendshipBetween("alice", "bob");

    const alice = await openLoggedInPage(browser, "alice", testInfo);
    const bob = await openLoggedInPage(browser, "bob", testInfo);

    try {
      await gotoAppRoute(alice.page, "/channels/@me", { readyTestId: "server-rail" });
      await gotoAppRoute(bob.page, "/channels/@me", { readyTestId: "server-rail" });

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

  test("server member add and removal update the target user's rail without reload", async (
    { browser },
    testInfo,
  ) => {
    const { serverId, textChannelId } = await createIsolatedServerForMembershipTest("alice");
    const alice = await openLoggedInPage(browser, "alice", testInfo);
    const bob = await openLoggedInPage(browser, "bob", testInfo);

    try {
      await gotoTextChannelRoute(alice.page, serverId, textChannelId);
      await gotoAppRoute(bob.page, "/channels/@me", { readyTestId: "server-rail" });
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

  test("mentions notify the target user and render as highlighted text", async (
    { browser },
    testInfo,
  ) => {
    const { serverId, textChannelId } = await getE2EServerRoute();
    const alice = await openLoggedInPage(browser, "alice", testInfo);
    const bob = await openLoggedInPage(browser, "bob", testInfo);
    const suffix = Date.now();

    try {
      await gotoTextChannelRoute(alice.page, serverId, textChannelId);
      await gotoTextChannelRoute(bob.page, serverId, textChannelId);

      await visibleTestId(alice.page, "message-input").fill(
        `Realtime mention ${suffix} @${e2eUsers.bob.username}`,
      );
      await alice.page.getByTestId(`mention-suggestion-${e2eUsers.bob.username}`).click();
      await expect(visibleTestId(alice.page, "message-send-button")).toBeEnabled();
      await visibleTestId(alice.page, "message-send-button").click();

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
