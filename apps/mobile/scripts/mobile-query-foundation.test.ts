import assert from "node:assert/strict";
import test from "node:test";
import type { MobileApiClient } from "../src/api/mobile-api-client";
import {
  MOBILE_QUERY_CACHE_MAX_AGE_MS,
  getMobileQueryCacheKey,
  shouldPersistMobileQuery,
  stripMobilePersistedMessagePreviews,
} from "../src/query/mobile-query-cache-policy";
import { createMobileQueryClient } from "../src/query/mobile-query-client";
import { getMobileBootstrapQueryOptions } from "../src/query/mobile-bootstrap-query";
import { createMobileQueryKeys, MobileSearchKeyRegistry } from "../src/query/mobile-query-keys";
import {
  flattenMobileInfinitePages,
  loadMoreMobileInfinitePages,
} from "../src/query/mobile-query-pages";

test("mobile query keys exclude raw search text and PII", () => {
  const registry = new MobileSearchKeyRegistry();
  const keys = createMobileQueryKeys(registry);
  const key = keys.messageSearch({
    conversationId: "conversation-1",
    query: "person@example.com secret phrase",
    scope: "dm",
  });
  const serialized = JSON.stringify(key);

  assert.doesNotMatch(serialized, /person@example\.com|secret phrase/);
  assert.match(serialized, /search-1/);
  assert.deepEqual(
    keys.messageSearch({
      conversationId: "conversation-1",
      query: " person@example.com   secret phrase ",
      scope: "dm",
    }),
    key,
  );
});

test("thread query keys isolate the parent message from channel and DM history", () => {
  const keys = createMobileQueryKeys(new MobileSearchKeyRegistry());

  assert.deepEqual(keys.channelThread("channel-1", "message-1"), [
    "mobile",
    "channel-thread",
    "channel-1",
    "message-1",
  ]);
  assert.deepEqual(keys.dmThread("conversation-1", "message-1"), [
    "mobile",
    "dm-thread",
    "conversation-1",
    "message-1",
  ]);
});

test("mobile query client keeps cached data for the persisted max age", () => {
  const client = createMobileQueryClient();
  const defaults = client.getDefaultOptions().queries;

  assert.equal(defaults?.retry, 1);
  assert.equal(defaults?.staleTime, 15_000);
  assert.equal(defaults?.gcTime, MOBILE_QUERY_CACHE_MAX_AGE_MS);
  assert.equal(defaults?.refetchOnReconnect, true);
  const retryDelay = defaults?.retryDelay;
  assert.equal(typeof retryDelay, "function");
  if (typeof retryDelay === "function") {
    assert.equal(retryDelay(0, new Error("x")), 1_000);
    assert.equal(retryDelay(5, new Error("x")), 2_000);
  }
});

test("bootstrap avoids mount refetch churn while explicit invalidation stays available", () => {
  const client: MobileApiClient = {
    requestJson: async () => {
      throw new Error("query function must not run while inspecting options");
    },
  };
  const options = getMobileBootstrapQueryOptions(client);

  assert.equal(options.staleTime, 60_000);
  assert.equal(options.refetchOnMount, false);
});

test("infinite pages flatten chronologically and keep newest duplicate values", () => {
  const messages = flattenMobileInfinitePages([
    {
      messages: [
        { content: "new two", id: "2" },
        { content: "three", id: "3" },
      ],
    },
    {
      messages: [
        { content: "one", id: "1" },
        { content: "old two", id: "2" },
      ],
    },
  ]);

  assert.deepEqual(
    messages.map(({ content, id }) => ({ content, id })),
    [
      { content: "one", id: "1" },
      { content: "new two", id: "2" },
      { content: "three", id: "3" },
    ],
  );
});

test("only allowlisted successful query roots reach unencrypted device storage", () => {
  const persisted = (queryKey: readonly unknown[], status = "success") =>
    shouldPersistMobileQuery({ queryKey, state: { status } });

  assert.equal(persisted(["mobile", "bootstrap"]), true);
  assert.equal(persisted(["mobile", "workspace", "server-1"]), true);
  assert.equal(persisted(["mobile", "dm-conversations"]), true);

  assert.equal(persisted(["mobile", "channel-messages", "channel-1"]), false);
  assert.equal(persisted(["mobile", "dm-messages", "conversation-1"]), false);
  assert.equal(persisted(["mobile", "channel-thread", "channel-1", "message-1"]), false);
  assert.equal(persisted(["mobile", "message-search", "dm", "conversation-1", "search-1"]), false);
  assert.equal(persisted(["mobile", "notifications", "all"]), false);
  assert.equal(persisted(["mobile", "account-settings"]), false);

  assert.equal(persisted(["mobile", "bootstrap"], "error"), false);
  assert.equal(persisted(["mobile", "bootstrap"], "pending"), false);
});

test("persisted workspace detail drops channel last-message previews", () => {
  const channel = (id: string) => ({
    id,
    lastMessage: { author: { username: "ada" }, id: `${id}-m1`, text: "gizli mesaj" },
    name: id,
  });
  const client = stripMobilePersistedMessagePreviews({
    clientState: {
      queries: [
        {
          queryKey: ["mobile", "workspace", "server-1"],
          state: {
            data: {
              detail: {
                categories: [{ channels: [channel("general")], id: "cat-1" }],
                ungroupedChannels: [channel("lobby")],
              },
            },
          },
        },
        {
          queryKey: ["mobile", "bootstrap"],
          state: { data: { home: { servers: { recent: [{ id: "server-1" }] } } } },
        },
      ],
    },
  });

  const serialized = JSON.stringify(client);
  assert.doesNotMatch(serialized, /gizli mesaj/);

  const detail = (
    client.clientState.queries[0]?.state.data as {
      detail: {
        categories: { channels: { lastMessage: unknown; name: string }[] }[];
        ungroupedChannels: { lastMessage: unknown }[];
      };
    }
  ).detail;
  assert.equal(detail.categories[0]?.channels[0]?.lastMessage, null);
  assert.equal(detail.categories[0]?.channels[0]?.name, "general");
  assert.equal(detail.ungroupedChannels[0]?.lastMessage, null);
  assert.deepEqual(client.clientState.queries[1]?.state.data, {
    home: { servers: { recent: [{ id: "server-1" }] } },
  });
});

test("persisted DM inbox drops the last-message preview text", () => {
  const conversation = (id: string) => ({
    id,
    lastMessage: {
      author: { displayName: null, id: "user-ada", username: "ada" },
      authorIsCurrentUser: false,
      createdAt: "2026-07-28T09:00:00.000Z",
      deliveryStatus: "read",
      durationSec: null,
      id: `${id}-m1`,
      kind: "text",
      text: "gizli dm mesaji",
    },
    name: null,
    unreadCount: 2,
  });
  const client = stripMobilePersistedMessagePreviews({
    clientState: {
      queries: [
        {
          queryKey: ["mobile", "dm-conversations"],
          state: {
            data: {
              pageParams: [null],
              pages: [
                {
                  conversations: [conversation("conversation-1"), conversation("conversation-2")],
                  nextCursor: null,
                  totalUnreadCount: 4,
                },
              ],
            },
          },
        },
      ],
    },
  });

  const serialized = JSON.stringify(client);
  assert.doesNotMatch(serialized, /gizli dm mesaji/);
  assert.doesNotMatch(serialized, /user-ada/);

  const data = client.clientState.queries[0]?.state.data as {
    pages: {
      conversations: { lastMessage: unknown; unreadCount: number }[];
      totalUnreadCount: number;
    }[];
  };
  // The row's own facts survive; only the message content is dropped.
  assert.equal(data.pages[0]?.conversations[0]?.lastMessage, null);
  assert.equal(data.pages[0]?.conversations[1]?.lastMessage, null);
  assert.equal(data.pages[0]?.conversations[0]?.unreadCount, 2);
  assert.equal(data.pages[0]?.totalUnreadCount, 4);
});

test("query cache key isolates environments so a UAT restore never lands in production", () => {
  assert.notEqual(getMobileQueryCacheKey("uat"), getMobileQueryCacheKey("production"));
  assert.match(getMobileQueryCacheKey("uat"), /^whispr\.mobile\.query-cache\.uat\.v\d+$/);
});

test("search registry clears raw in-memory filters on sign-out", () => {
  const registry = new MobileSearchKeyRegistry();
  const input = {
    conversationId: "conversation-1",
    query: "private search",
    scope: "dm" as const,
  };

  assert.equal(registry.getFingerprint(input), "search-1");
  registry.clear();
  assert.equal(registry.getFingerprint(input), "search-1");
});

test("infinite load-more fetches once and ignores repeated scroll callbacks", () => {
  let fetchCount = 0;
  const fetchNextPage = () => {
    fetchCount += 1;
  };

  assert.equal(
    loadMoreMobileInfinitePages({ fetchNextPage, hasNextPage: true, isFetchingNextPage: false }),
    true,
  );
  assert.equal(fetchCount, 1);

  // onStartReached keeps firing while the reader sits at the top of the list.
  assert.equal(
    loadMoreMobileInfinitePages({ fetchNextPage, hasNextPage: true, isFetchingNextPage: true }),
    false,
  );
  assert.equal(
    loadMoreMobileInfinitePages({ fetchNextPage, hasNextPage: false, isFetchingNextPage: false }),
    false,
  );
  assert.equal(fetchCount, 1);
});
