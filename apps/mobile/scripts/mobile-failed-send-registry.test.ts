import assert from "node:assert/strict";
import test from "node:test";
import {
  createMobileFailedSendRegistry,
  getMobileChannelFailedSendScope,
  getMobileDMFailedSendScope,
  mergeMobileFailedMessages,
  withMobileFailedSendOverlay,
  type MobileFailedSendEntry,
} from "../src/query/mobile-failed-send-registry";

function createEntry(clientId: string, createdAt: string): MobileFailedSendEntry {
  return {
    clientId,
    draft: { content: clientId },
    message: { createdAt, id: clientId },
  };
}

test("failed send entries stay isolated per scope and keep stable snapshots", () => {
  const registry = createMobileFailedSendRegistry();
  const channelScope = getMobileChannelFailedSendScope("channel-1");
  const dmScope = getMobileDMFailedSendScope("conversation-1");

  registry.add(channelScope, createEntry("client-1", "2026-07-21T10:00:00.000Z"));
  const snapshot = registry.getEntries(channelScope);

  assert.deepEqual(
    snapshot.map((entry) => entry.clientId),
    ["client-1"],
  );
  assert.equal(registry.getEntries(channelScope), snapshot);
  assert.deepEqual(registry.getEntries(dmScope), []);

  registry.add(dmScope, createEntry("client-2", "2026-07-21T10:01:00.000Z"));
  assert.equal(registry.getEntries(channelScope), snapshot);
  assert.deepEqual(
    registry.getEntries(dmScope).map((entry) => entry.clientId),
    ["client-2"],
  );
});

test("unknown scopes always resolve to the same empty snapshot", () => {
  const registry = createMobileFailedSendRegistry();
  const scope = getMobileChannelFailedSendScope("missing");

  assert.equal(registry.getEntries(scope), registry.getEntries(scope));
  assert.deepEqual(registry.getEntries(scope), []);
});

test("removing a failed send returns the entry and only notifies on real changes", () => {
  const registry = createMobileFailedSendRegistry();
  const scope = getMobileDMFailedSendScope("conversation-1");
  let notifications = 0;
  const unsubscribe = registry.subscribe(() => {
    notifications += 1;
  });

  registry.add(scope, createEntry("client-1", "2026-07-21T10:00:00.000Z"));
  assert.equal(notifications, 1);

  assert.equal(registry.remove(scope, "missing-client"), undefined);
  assert.equal(notifications, 1);

  const removed = registry.remove(scope, "client-1");
  assert.equal(removed?.clientId, "client-1");
  assert.equal(notifications, 2);
  assert.deepEqual(registry.getEntries(scope), []);

  unsubscribe();
  registry.add(scope, createEntry("client-2", "2026-07-21T10:02:00.000Z"));
  assert.equal(notifications, 2);
});

test("clearing the registry empties every scope and notifies subscribers", () => {
  const registry = createMobileFailedSendRegistry();
  const channelScope = getMobileChannelFailedSendScope("channel-1");
  const dmScope = getMobileDMFailedSendScope("conversation-1");
  let notifications = 0;
  registry.subscribe(() => {
    notifications += 1;
  });

  registry.add(channelScope, createEntry("client-1", "2026-07-21T10:00:00.000Z"));
  registry.add(dmScope, createEntry("client-2", "2026-07-21T10:01:00.000Z"));
  registry.clear();

  assert.equal(notifications, 3);
  assert.deepEqual(registry.getEntries(channelScope), []);
  assert.deepEqual(registry.getEntries(dmScope), []);
});

test("merging failed messages restores missing bubbles in chronological order", () => {
  const messages = [
    { createdAt: "2026-07-21T10:00:00.000Z", id: "server-1" },
    { createdAt: "2026-07-21T10:02:00.000Z", id: "server-2" },
  ];
  const merged = mergeMobileFailedMessages(messages, [
    createEntry("client-1", "2026-07-21T10:01:00.000Z"),
  ]);

  assert.deepEqual(
    merged.map((message) => message.id),
    ["server-1", "client-1", "server-2"],
  );
});

test("merging keeps the original message reference when nothing is missing", () => {
  const messages = [{ createdAt: "2026-07-21T10:00:00.000Z", id: "client-1" }];

  assert.equal(mergeMobileFailedMessages(messages, []), messages);
  assert.equal(
    mergeMobileFailedMessages(messages, [createEntry("client-1", "2026-07-21T10:00:00.000Z")]),
    messages,
  );
});

test("the overlay restores failed bubbles a refetch dropped from a view state", () => {
  const state = {
    conversationId: "conversation-1",
    error: null,
    payload: { messages: [{ createdAt: "2026-07-21T10:00:00.000Z", id: "server-1" }] },
    status: "ready",
  } as const;
  const failed = createEntry("client-1", "2026-07-21T10:03:00.000Z");

  const restored = withMobileFailedSendOverlay(state, [failed]);
  assert.deepEqual(
    restored.payload.messages.map((message) => message.id),
    ["server-1", "client-1"],
  );
  assert.equal(restored.status, "ready");
  assert.equal(restored.conversationId, "conversation-1");
});

test("the overlay is a no-op without failed sends or without a payload", () => {
  const readyState = {
    payload: { messages: [{ createdAt: "2026-07-21T10:00:00.000Z", id: "server-1" }] },
    status: "ready",
  } as const;
  const loadingState = { payload: null, status: "loading" } as const;

  assert.equal(withMobileFailedSendOverlay(readyState, []), readyState);
  assert.equal(
    withMobileFailedSendOverlay(loadingState, [
      createEntry("client-1", "2026-07-21T10:03:00.000Z"),
    ]),
    loadingState,
  );
  assert.equal(
    withMobileFailedSendOverlay(readyState, [createEntry("server-1", "2026-07-21T10:00:00.000Z")]),
    readyState,
  );
});
