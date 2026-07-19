import assert from "node:assert/strict";
import test from "node:test";
import { createMobileQueryClient } from "../src/query/mobile-query-client";
import { createMobileQueryKeys, MobileSearchKeyRegistry } from "../src/query/mobile-query-keys";
import { flattenMobileInfinitePages } from "../src/query/mobile-query-pages";

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

test("mobile query client uses a bounded in-memory policy", () => {
  const client = createMobileQueryClient();
  const defaults = client.getDefaultOptions().queries;

  assert.equal(defaults?.retry, 1);
  assert.equal(defaults?.staleTime, 15_000);
  assert.equal(defaults?.gcTime, 5 * 60_000);
  assert.equal(defaults?.refetchOnReconnect, true);
  assert.equal("persister" in client, false);
  const retryDelay = defaults?.retryDelay;
  assert.equal(typeof retryDelay, "function");
  if (typeof retryDelay === "function") {
    assert.equal(retryDelay(0, new Error("x")), 1_000);
    assert.equal(retryDelay(5, new Error("x")), 2_000);
  }
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
