import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { QueryClient } from "@tanstack/react-query";
import type { MobileChannelMessagesResponse, MobileDMMessagesResponse } from "@wizards/types";
import type { MobileApiClient } from "../src/api/mobile-api-client";
import { mobileQueryKeys } from "../src/query/mobile-query-keys";
import {
  getMobileRecentDMPrefetchStats,
  prefetchMobileChannelMessagesPage,
  prefetchMobileDMMessagesPage,
  prefetchMeasuredMobileDMMessagesPage,
  recordMobileRecentDMPrefetch,
  recordMobileRecentDMPrefetchSettled,
  resetMobileRecentDMPrefetchStats,
} from "../src/query/mobile-message-prefetch";
import {
  markMobileMessageStreamRestored,
  resetMobileMessageStreamSourcesForTests,
  resolveMobileMessageStreamOpenSource,
} from "../src/query/mobile-message-stream-source";

const channelPage: MobileChannelMessagesResponse = {
  channel: {
    categoryId: null,
    categoryName: null,
    id: "channel-1",
    lastMessage: null,
    locked: false,
    mentionCount: 0,
    name: "genel",
    position: 0,
    readOnly: false,
    topic: null,
    type: "TEXT",
    unreadCount: 0,
  },
  hasMore: false,
  messages: [],
  nextCursor: null,
};

const dmPage: MobileDMMessagesResponse = {
  conversation: {
    iconUrl: null,
    id: "conversation-1",
    lastMessage: null,
    lastMessageAt: "2026-07-28T09:00:00.000Z",
    name: null,
    ownerId: null,
    participants: [],
    type: "DM",
  },
  messages: [],
  nextCursor: null,
  participantReadStates: [],
};

function createRecordingClient(payload: unknown) {
  const paths: string[] = [];
  const client: MobileApiClient = {
    async requestJson<TResponse>(path: string) {
      paths.push(path);
      return payload as TResponse;
    },
  };

  return { client, paths };
}

function createQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

describe("prefetchMobileChannelMessagesPage", () => {
  it("warms the first page under the channel stream key", async () => {
    const queryClient = createQueryClient();
    const { client, paths } = createRecordingClient(channelPage);

    await prefetchMobileChannelMessagesPage(queryClient, client, "channel-1");

    const cached = queryClient.getQueryData(mobileQueryKeys.channelMessages("channel-1")) as
      { pages: MobileChannelMessagesResponse[] } | undefined;
    assert.equal(cached?.pages.length, 1);
    assert.equal(cached?.pages[0]?.channel.name, "genel");
    assert.deepEqual(paths, ["/api/v1/mobile/channels/channel-1/messages?limit=30"]);
    queryClient.clear();
  });

  it("does nothing without a channel id", async () => {
    const queryClient = createQueryClient();
    const { client, paths } = createRecordingClient(channelPage);

    await prefetchMobileChannelMessagesPage(queryClient, client, "");

    assert.deepEqual(paths, []);
    assert.equal(queryClient.getQueryData(mobileQueryKeys.channelMessages("")), undefined);
    queryClient.clear();
  });

  it("skips the request while the cached page is still fresh", async () => {
    const queryClient = createQueryClient();
    const { client, paths } = createRecordingClient(channelPage);

    await prefetchMobileChannelMessagesPage(queryClient, client, "channel-1");
    await prefetchMobileChannelMessagesPage(queryClient, client, "channel-1");

    assert.equal(paths.length, 1);
    queryClient.clear();
  });
});

describe("prefetchMobileDMMessagesPage", () => {
  it("warms the first page under the conversation stream key", async () => {
    const queryClient = createQueryClient();
    const { client, paths } = createRecordingClient(dmPage);

    await prefetchMobileDMMessagesPage(queryClient, client, "conversation-1");

    const cached = queryClient.getQueryData(mobileQueryKeys.dmMessages("conversation-1")) as
      { pages: MobileDMMessagesResponse[] } | undefined;
    assert.equal(cached?.pages.length, 1);
    assert.deepEqual(paths, ["/api/v1/mobile/dm/conversation-1/messages?limit=30"]);
    queryClient.clear();
  });

  it("does nothing without a conversation id", async () => {
    const queryClient = createQueryClient();
    const { client, paths } = createRecordingClient(dmPage);

    await prefetchMobileDMMessagesPage(queryClient, client, "");

    assert.deepEqual(paths, []);
    queryClient.clear();
  });

  it("records a measured warm as a settled prefetch source", async () => {
    resetMobileRecentDMPrefetchStats();
    resetMobileMessageStreamSourcesForTests();
    const queryClient = createQueryClient();
    const { client } = createRecordingClient(dmPage);

    await prefetchMeasuredMobileDMMessagesPage(queryClient, client, "conversation-1");

    assert.deepEqual(getMobileRecentDMPrefetchStats(), {
      attempted: 1,
      hitRate: 0,
      openedAfterSettled: 0,
      settled: 1,
    });
    assert.equal(
      resolveMobileMessageStreamOpenSource({
        dataUpdatedAtMs:
          queryClient.getQueryState(mobileQueryKeys.dmMessages("conversation-1"))?.dataUpdatedAt ??
          null,
        scope: "dm",
        targetId: "conversation-1",
      }).source,
      "prefetch",
    );
    queryClient.clear();
    resetMobileRecentDMPrefetchStats();
    resetMobileMessageStreamSourcesForTests();
  });

  it("does not relabel a fresh SQLCipher page when prefetch is a no-op", async () => {
    resetMobileRecentDMPrefetchStats();
    resetMobileMessageStreamSourcesForTests();
    const queryClient = createQueryClient();
    const { client, paths } = createRecordingClient(dmPage);
    const restoredAt = Date.now();
    queryClient.setQueryData(
      mobileQueryKeys.dmMessages("conversation-1"),
      { pageParams: [null], pages: [dmPage] },
      { updatedAt: restoredAt },
    );
    markMobileMessageStreamRestored("dm", "conversation-1", restoredAt);

    await prefetchMeasuredMobileDMMessagesPage(queryClient, client, "conversation-1");

    assert.deepEqual(paths, []);
    assert.equal(getMobileRecentDMPrefetchStats().settled, 0);
    assert.equal(
      resolveMobileMessageStreamOpenSource({
        dataUpdatedAtMs: restoredAt,
        scope: "dm",
        targetId: "conversation-1",
      }).source,
      "sqlcipher",
    );
    queryClient.clear();
    resetMobileRecentDMPrefetchStats();
    resetMobileMessageStreamSourcesForTests();
  });

  it("bounds session-scoped prefetch identifiers", () => {
    resetMobileRecentDMPrefetchStats();
    const ids = Array.from({ length: 33 }, (_, index) => `conversation-${index + 1}`);

    recordMobileRecentDMPrefetch(ids);
    recordMobileRecentDMPrefetchSettled(ids[0]!);
    recordMobileRecentDMPrefetchSettled(ids.at(-1)!);

    assert.deepEqual(getMobileRecentDMPrefetchStats(), {
      attempted: 32,
      hitRate: 0,
      openedAfterSettled: 0,
      settled: 1,
    });
    resetMobileRecentDMPrefetchStats();
  });
});
