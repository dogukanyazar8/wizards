import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createMobileRealtimeEventEnvelope,
  getMobileRealtimeRefreshSources,
  MOBILE_REALTIME_RECONNECT_POLICY,
  MOBILE_REALTIME_SERVER_EVENTS,
  validateMobileRealtimeContract,
} from "../src/realtime/mobile-realtime-contract";

describe("mobile realtime contract", () => {
  it("keeps the mobile socket event subset unique and mapped to refresh sources", () => {
    assert.deepEqual(validateMobileRealtimeContract(), []);
    assert.equal(new Set(MOBILE_REALTIME_SERVER_EVENTS).size, MOBILE_REALTIME_SERVER_EVENTS.length);
    assert.ok(MOBILE_REALTIME_SERVER_EVENTS.includes("message:new"));
    assert.ok(MOBILE_REALTIME_SERVER_EVENTS.includes("dm:message:new"));
    assert.ok(MOBILE_REALTIME_SERVER_EVENTS.includes("presence:update"));
  });

  it("maps active conversation events to the narrowest refresh target", () => {
    assert.deepEqual(getMobileRealtimeRefreshSources("message:new"), ["channel"]);
    assert.deepEqual(getMobileRealtimeRefreshSources("dm:message:new"), ["dm"]);
    assert.deepEqual(getMobileRealtimeRefreshSources("dm:conversation:updated"), ["bootstrap"]);
    assert.deepEqual(getMobileRealtimeRefreshSources("presence:update"), [
      "bootstrap",
      "presence",
    ]);
  });

  it("redacts payload body while preserving safe routing metadata", () => {
    const event = createMobileRealtimeEventEnvelope(
      "dm:message:new",
      {
        content: "must not be copied into realtime state",
        conversationId: "conversation-1",
        id: "message-1",
      },
      1_000,
    );

    assert.deepEqual(event, {
      channelId: null,
      conversationId: "conversation-1",
      eventName: "dm:message:new",
      receivedAt: 1_000,
      refreshSources: ["dm"],
      serverId: null,
    });
    assert.equal(JSON.stringify(event).includes("must not be copied"), false);
  });

  it("keeps reconnect behavior bounded for mobile battery safety", () => {
    assert.equal(MOBILE_REALTIME_RECONNECT_POLICY.maxAttempts <= 8, true);
    assert.equal(MOBILE_REALTIME_RECONNECT_POLICY.timeoutMs >= 10_000, true);
    assert.equal(
      MOBILE_REALTIME_RECONNECT_POLICY.initialDelayMs < MOBILE_REALTIME_RECONNECT_POLICY.maxDelayMs,
      true,
    );
  });
});
