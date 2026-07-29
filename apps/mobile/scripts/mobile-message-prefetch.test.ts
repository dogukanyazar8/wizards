import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { QueryClient } from "@tanstack/react-query";
import type { MobileChannelMessagesResponse, MobileDMMessagesResponse } from "@wizards/types";
import type { MobileApiClient } from "../src/api/mobile-api-client";
import { mobileQueryKeys } from "../src/query/mobile-query-keys";
import {
  prefetchMobileChannelMessagesPage,
  prefetchMobileDMMessagesPage,
} from "../src/query/mobile-message-prefetch";

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
    id: "conversation-1",
    lastMessage: null,
    lastMessageAt: "2026-07-28T09:00:00.000Z",
    name: null,
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
});
