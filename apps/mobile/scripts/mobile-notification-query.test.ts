import assert from "node:assert/strict";
import test from "node:test";
import { QueryClient } from "@tanstack/react-query";
import type { MobileNotificationItem } from "@wizards/types";

import type { MobileApiClient } from "../src/api/mobile-api-client";
import {
  createMobileNotificationClearMutationOptions,
  createMobileNotificationMarkAllReadMutationOptions,
  createMobileNotificationMarkReadMutationOptions,
  getMobileNotificationsQueryOptions,
} from "../src/notifications/mobile-notification-query";
import { mobileQueryKeys } from "../src/query/mobile-query-keys";

test("notification feed query uses the bounded notifications key and opaque cursor pagination", () => {
  const client: MobileApiClient = {
    requestJson: async () => {
      throw new Error("query function should not run while inspecting options");
    },
  };

  const options = getMobileNotificationsQueryOptions(client);

  assert.deepEqual(options.queryKey, mobileQueryKeys.notifications());
  assert.equal(options.initialPageParam, null);
  assert.equal(
    options.getNextPageParam?.(
      { nextCursor: "next", notifications: [], unreadCount: 0 },
      [],
      null,
      [],
    ),
    "next",
  );
  assert.equal(
    options.getNextPageParam?.(
      { nextCursor: null, notifications: [], unreadCount: 0 },
      [],
      null,
      [],
    ),
    undefined,
  );
});

test("notification mutations reconcile badges without awaiting refetches", async () => {
  const queryClient = new QueryClient();
  const notificationKey = mobileQueryKeys.notifications();
  const bootstrapKey = mobileQueryKeys.bootstrap();
  const workspaceKey = mobileQueryKeys.workspace("server-1");
  const unrelatedWorkspaceKey = mobileQueryKeys.workspace("server-2");
  const dmConversationsKey = mobileQueryKeys.dmConversations();
  const touchedKeys = [notificationKey, bootstrapKey, workspaceKey, dmConversationsKey];
  const resetInvalidation = () => {
    for (const key of [...touchedKeys, unrelatedWorkspaceKey]) {
      queryClient.getQueryCache().find({ queryKey: key, exact: true })?.setState({
        isInvalidated: false,
      });
    }
  };
  const assertAllInvalidated = (label: string) => {
    for (const key of touchedKeys) {
      assert.equal(
        queryClient.getQueryState(key)?.isInvalidated,
        true,
        `${label}: ${key.join("/")}`,
      );
    }
  };

  queryClient.setQueryData(notificationKey, { pages: [] });
  queryClient.setQueryData(bootstrapKey, { ready: true });
  queryClient.setQueryData(workspaceKey, { ready: true });
  queryClient.setQueryData(unrelatedWorkspaceKey, { ready: true });
  queryClient.setQueryData(dmConversationsKey, { pages: [] });
  const client: MobileApiClient = {
    async requestJson<TResponse>() {
      return { success: true } as TResponse;
    },
  };
  const notification: MobileNotificationItem = {
    actionUrl: null,
    actor: null,
    badgeId: null,
    body: "Mentioned you",
    channel: { id: "channel-1", name: "general" },
    createdAt: "2026-08-12T12:00:00.000Z",
    eventKind: null,
    friendRequestId: null,
    id: "00000000-0000-4000-8000-000000000001",
    messageQuote: null,
    read: false,
    readAt: null,
    server: { id: "server-1", name: "Whispr" },
    serverInviteCode: null,
    type: "MENTION",
  };

  const one = createMobileNotificationMarkReadMutationOptions({ client, queryClient });
  const all = createMobileNotificationMarkAllReadMutationOptions({ client, queryClient });
  const clear = createMobileNotificationClearMutationOptions({ client, queryClient });
  await one.mutationFn(notification as never);
  const markReadSettlement = (one.onSuccess as (...args: unknown[]) => unknown)(
    undefined,
    notification,
  );
  // A single row carries its server, so unrelated workspace details stay warm.
  assertAllInvalidated("mark read");
  assert.equal(markReadSettlement, undefined);
  assert.equal(queryClient.getQueryState(unrelatedWorkspaceKey)?.isInvalidated, false);

  resetInvalidation();
  (one.onSuccess as (...args: unknown[]) => unknown)(undefined, {
    ...notification,
    id: "00000000-0000-4000-8000-000000000002",
    server: null,
  });
  assert.equal(queryClient.getQueryState(workspaceKey)?.isInvalidated, false);
  assert.equal(queryClient.getQueryState(unrelatedWorkspaceKey)?.isInvalidated, false);

  resetInvalidation();
  await all.mutationFn();
  assert.equal(all.onSuccess!(), undefined);
  assertAllInvalidated("mark all read");
  assert.equal(queryClient.getQueryState(unrelatedWorkspaceKey)?.isInvalidated, true);

  resetInvalidation();
  await clear.mutationFn();
  assert.equal(clear.onSuccess!(), undefined);
  assertAllInvalidated("clear all");
  assert.equal(queryClient.getQueryState(unrelatedWorkspaceKey)?.isInvalidated, true);
});
