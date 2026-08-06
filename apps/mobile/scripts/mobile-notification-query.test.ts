import assert from "node:assert/strict";
import test from "node:test";
import { QueryClient } from "@tanstack/react-query";

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

test("notification read mutations retire the mention and DM badge caches too", async () => {
  const queryClient = new QueryClient();
  const notificationKey = mobileQueryKeys.notifications();
  const bootstrapKey = mobileQueryKeys.bootstrap();
  const workspaceKey = mobileQueryKeys.workspace("server-1");
  const dmConversationsKey = mobileQueryKeys.dmConversations();
  const touchedKeys = [notificationKey, bootstrapKey, workspaceKey, dmConversationsKey];
  const resetInvalidation = () => {
    for (const key of touchedKeys) {
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
  queryClient.setQueryData(dmConversationsKey, { pages: [] });
  const client: MobileApiClient = {
    async requestJson<TResponse>() {
      return { success: true } as TResponse;
    },
  };

  const one = createMobileNotificationMarkReadMutationOptions({ client, queryClient });
  const all = createMobileNotificationMarkAllReadMutationOptions({ client, queryClient });
  const clear = createMobileNotificationClearMutationOptions({ client, queryClient });
  await one.mutationFn("00000000-0000-4000-8000-000000000001");
  await one.onSuccess!();
  // Reading a mention clears `ChannelReadState.mentionCount` server-side and
  // reading a DM row clears `DMParticipant.unreadCount`, so the servers screen
  // (bootstrap), every cached server detail and the DM inbox behind the messages
  // tab badge must all refetch.
  assertAllInvalidated("mark read");

  resetInvalidation();
  await all.mutationFn();
  await all.onSuccess!();
  assertAllInvalidated("mark all read");

  resetInvalidation();
  await clear.mutationFn();
  await clear.onSuccess!();
  assertAllInvalidated("clear all");
});
