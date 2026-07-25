import assert from "node:assert/strict";
import test from "node:test";
import { QueryClient } from "@tanstack/react-query";

import type { MobileApiClient } from "../src/api/mobile-api-client";
import {
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

test("notification read mutations retire the mention badge caches too", async () => {
  const queryClient = new QueryClient();
  const notificationKey = mobileQueryKeys.notifications();
  const bootstrapKey = mobileQueryKeys.bootstrap();
  const workspaceKey = mobileQueryKeys.workspace("server-1");
  queryClient.setQueryData(notificationKey, { pages: [] });
  queryClient.setQueryData(bootstrapKey, { ready: true });
  queryClient.setQueryData(workspaceKey, { ready: true });
  const client: MobileApiClient = {
    async requestJson<TResponse>() {
      return { success: true } as TResponse;
    },
  };

  const one = createMobileNotificationMarkReadMutationOptions({ client, queryClient });
  const all = createMobileNotificationMarkAllReadMutationOptions({ client, queryClient });
  await one.mutationFn("00000000-0000-4000-8000-000000000001");
  await one.onSuccess!();
  // Reading a mention clears `ChannelReadState.mentionCount` server-side, so the
  // servers screen (bootstrap) and every cached server detail must refetch.
  assert.equal(queryClient.getQueryState(notificationKey)?.isInvalidated, true);
  assert.equal(queryClient.getQueryState(bootstrapKey)?.isInvalidated, true);
  assert.equal(queryClient.getQueryState(workspaceKey)?.isInvalidated, true);

  for (const key of [notificationKey, bootstrapKey, workspaceKey]) {
    queryClient.getQueryCache().find({ queryKey: key, exact: true })?.setState({
      isInvalidated: false,
    });
  }
  await all.mutationFn();
  await all.onSuccess!();
  assert.equal(queryClient.getQueryState(notificationKey)?.isInvalidated, true);
  assert.equal(queryClient.getQueryState(bootstrapKey)?.isInvalidated, true);
  assert.equal(queryClient.getQueryState(workspaceKey)?.isInvalidated, true);
});
