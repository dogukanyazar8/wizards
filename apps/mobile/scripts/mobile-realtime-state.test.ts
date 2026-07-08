import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createMobileRealtimeEventEnvelope } from "../src/realtime/mobile-realtime-contract";
import {
  createInitialMobileRealtimeSnapshot,
  getMobileRealtimeForegroundBackfillSources,
  getMobileRealtimeVisibilityFromAppState,
  mobileRealtimeReducer,
  shouldConnectMobileRealtime,
  summarizeMobileRealtimeConnection,
} from "../src/realtime/mobile-realtime-state";

describe("mobile realtime state", () => {
  it("starts idle without payload or error details", () => {
    assert.deepEqual(createInitialMobileRealtimeSnapshot(), {
      connectedAt: null,
      disconnectedAt: null,
      eventCount: 0,
      lastErrorCode: null,
      lastEvent: null,
      lastSeenAt: null,
      reconnectAttempt: 0,
      status: "idle",
      visibility: "foreground",
    });
  });

  it("tracks connection lifecycle without storing sensitive payloads", () => {
    const connected = mobileRealtimeReducer(
      mobileRealtimeReducer(createInitialMobileRealtimeSnapshot(), {
        now: 1_000,
        type: "connect-started",
      }),
      { now: 1_500, type: "connected" },
    );
    const event = createMobileRealtimeEventEnvelope(
      "message:new",
      {
        channelId: "channel-1",
        content: "not retained",
      },
      2_000,
    );
    const withEvent = mobileRealtimeReducer(connected, {
      event,
      type: "event-received",
    });

    assert.equal(withEvent.status, "connected");
    assert.equal(withEvent.eventCount, 1);
    assert.equal(withEvent.lastEvent?.channelId, "channel-1");
    assert.equal(JSON.stringify(withEvent).includes("not retained"), false);
  });

  it("disconnects in background and reconnects only for signed-in foreground sessions", () => {
    const background = mobileRealtimeReducer(createInitialMobileRealtimeSnapshot(), {
      now: 3_000,
      type: "visibility-changed",
      visibility: "background",
    });

    assert.equal(background.visibility, "background");
    assert.equal(
      shouldConnectMobileRealtime({
        authStatus: "signed-in",
        hasSession: true,
        visibility: background.visibility,
      }),
      false,
    );
    assert.equal(
      shouldConnectMobileRealtime({
        authStatus: "signed-in",
        hasSession: true,
        visibility: "foreground",
      }),
      true,
    );
    assert.equal(
      shouldConnectMobileRealtime({
        authStatus: "signed-out",
        hasSession: false,
        visibility: "foreground",
      }),
      false,
    );
  });

  it("maps native AppState values into a narrow realtime visibility contract", () => {
    assert.equal(getMobileRealtimeVisibilityFromAppState("active"), "foreground");
    assert.equal(getMobileRealtimeVisibilityFromAppState("background"), "background");
    assert.equal(getMobileRealtimeVisibilityFromAppState("inactive"), "background");
    assert.equal(getMobileRealtimeVisibilityFromAppState("extension"), "background");
  });

  it("plans bounded visible-data backfill after a foreground resume gap", () => {
    const realtime = mobileRealtimeReducer(createInitialMobileRealtimeSnapshot(), {
      now: 1_000,
      type: "connected",
    });

    assert.deepEqual(
      getMobileRealtimeForegroundBackfillSources({
        authStatus: "signed-in",
        nextVisibility: "foreground",
        now: 20_000,
        previousVisibility: "background",
        realtime,
        targets: {
          channelId: "channel-1",
          conversationId: null,
          serverId: "server-1",
          voiceChannelId: null,
        },
      }),
      ["bootstrap", "workspace", "channel"],
    );
  });

  it("does not backfill for signed-out users or short foreground bounces", () => {
    const realtime = mobileRealtimeReducer(createInitialMobileRealtimeSnapshot(), {
      now: 10_000,
      type: "connected",
    });

    assert.deepEqual(
      getMobileRealtimeForegroundBackfillSources({
        authStatus: "signed-out",
        nextVisibility: "foreground",
        now: 30_000,
        previousVisibility: "background",
        realtime,
        targets: {
          channelId: "channel-1",
          conversationId: "dm-1",
          serverId: "server-1",
          voiceChannelId: "voice-1",
        },
      }),
      [],
    );
    assert.deepEqual(
      getMobileRealtimeForegroundBackfillSources({
        authStatus: "signed-in",
        nextVisibility: "foreground",
        now: 10_500,
        previousVisibility: "background",
        realtime,
        targets: {
          channelId: "channel-1",
          conversationId: null,
          serverId: "server-1",
          voiceChannelId: null,
        },
      }),
      [],
    );
  });

  it("summarizes connection health without token-like values", () => {
    const error = mobileRealtimeReducer(createInitialMobileRealtimeSnapshot(), {
      code: "Unauthorized",
      now: 5_000,
      type: "connection-error",
    });

    assert.deepEqual(summarizeMobileRealtimeConnection(error), {
      eventCount: 0,
      hasRecentEvent: false,
      lastErrorCode: "Unauthorized",
      reconnectAttempt: 0,
      status: "error",
      visibility: "foreground",
    });
  });
});
