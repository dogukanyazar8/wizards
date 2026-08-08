import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { QueryClient } from "@tanstack/react-query";

import { mobileQueryKeys } from "../src/query/mobile-query-keys";
import { createMobileRealtimeEventEnvelope } from "../src/realtime/mobile-realtime-contract";
import {
  createMobileRealtimeQueryBridge,
  type MobileRealtimeQueryBridgeScheduler,
} from "../src/realtime/realtime-query-bridge";

/** Runs nothing: these events are handled inline, never on the debounce timer. */
const inertScheduler: MobileRealtimeQueryBridgeScheduler = {
  clearTimeout() {},
  setTimeout() {
    return null;
  },
};

function createHarness(activeConversationId: string | null) {
  const queryClient = new QueryClient();
  const invalidated: unknown[][] = [];
  const closed: string[] = [];
  const originalInvalidate = queryClient.invalidateQueries.bind(queryClient);
  queryClient.invalidateQueries = ((filters?: { queryKey?: unknown[] }) => {
    if (filters?.queryKey) {
      invalidated.push(filters.queryKey);
    }
    return originalInvalidate(filters as never);
  }) as typeof queryClient.invalidateQueries;

  const bridge = createMobileRealtimeQueryBridge({
    closeConversation: (conversationId) => closed.push(conversationId),
    getActiveTargets: () => ({
      channelId: null,
      conversationId: activeConversationId,
      serverId: null,
      voiceChannelId: null,
    }),
    getCurrentUserId: () => "viewer-1",
    queryClient,
    scheduler: inertScheduler,
  });

  return { bridge, closed, invalidated, queryClient };
}

function hasKey(invalidated: readonly unknown[][], key: readonly unknown[]): boolean {
  return invalidated.some((entry) => JSON.stringify(entry) === JSON.stringify(key));
}

describe("Faz 5 §17.2 group lifecycle realtime bridge", () => {
  it("refreshes the inbox and the bootstrap inventory when a group is created", () => {
    const harness = createHarness(null);

    harness.bridge.handleEvent(
      createMobileRealtimeEventEnvelope("dm:conversation:created", {
        conversation: { id: "dm-group-1" },
      }),
    );

    assert.equal(hasKey(harness.invalidated, mobileQueryKeys.dmConversations()), true);
    assert.equal(hasKey(harness.invalidated, mobileQueryKeys.bootstrap()), true);
  });

  it("refreshes that conversation's details when its membership changes", () => {
    const harness = createHarness(null);

    harness.bridge.handleEvent(
      createMobileRealtimeEventEnvelope("dm:conversation:members_changed", {
        conversationId: "dm-group-1",
      }),
    );

    assert.equal(hasKey(harness.invalidated, mobileQueryKeys.dmConversations()), true);
    assert.equal(hasKey(harness.invalidated, mobileQueryKeys.dmDetails("dm-group-1")), true);
  });

  it("closes the open conversation when the viewer is removed from it", () => {
    const harness = createHarness("dm-group-1");

    harness.bridge.handleEvent(
      createMobileRealtimeEventEnvelope("dm:conversation:removed", {
        conversationId: "dm-group-1",
      }),
    );

    assert.deepEqual(harness.closed, ["dm-group-1"]);
  });

  it("leaves a conversation the viewer is not looking at alone", () => {
    const harness = createHarness("dm-other");

    harness.bridge.handleEvent(
      createMobileRealtimeEventEnvelope("dm:conversation:removed", {
        conversationId: "dm-group-1",
      }),
    );

    assert.deepEqual(harness.closed, []);
    assert.equal(hasKey(harness.invalidated, mobileQueryKeys.dmConversations()), true);
  });
});
