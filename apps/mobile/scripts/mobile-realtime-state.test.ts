import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MOBILE_REALTIME_RECONNECT_POLICY,
  createMobileRealtimeEventEnvelope,
  type MobileRealtimeConnectionSnapshot,
} from "../src/realtime/mobile-realtime-contract";
import {
  createInitialMobileRealtimeSnapshot,
  getMobileRealtimeBannerState,
  getMobileRealtimeForegroundBackfillSources,
  getMobileRealtimeVisibilityFromAppState,
  mobileRealtimeReducer,
  shouldConnectMobileRealtime,
  shouldForceMobileRealtimeReconnect,
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
      "dm:message:new",
      {
        conversationId: "conversation-1",
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
    assert.equal(withEvent.lastEvent?.conversationId, "conversation-1");
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
      // The notification feed is always backfilled: the socket is down in the
      // background, so anything that landed while away arrived only as a push.
      ["bootstrap", "notification", "workspace", "channel"],
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

describe("mobile realtime banner state", () => {
  const signedIn = {
    authStatus: "signed-in",
    networkStatus: "online",
  } as const;

  function connectedSnapshot(): MobileRealtimeConnectionSnapshot {
    return mobileRealtimeReducer(
      mobileRealtimeReducer(createInitialMobileRealtimeSnapshot(), {
        now: 1_000,
        type: "connect-started",
      }),
      { now: 1_200, type: "connected" },
    );
  }

  it("stays hidden while the session is not signed in", () => {
    assert.equal(
      getMobileRealtimeBannerState({
        ...signedIn,
        authStatus: "checking",
        realtime: mobileRealtimeReducer(connectedSnapshot(), { now: 2_000, type: "disconnected" }),
      }),
      "hidden",
    );
  });

  it("stays hidden while connected", () => {
    assert.equal(
      getMobileRealtimeBannerState({ ...signedIn, realtime: connectedSnapshot() }),
      "hidden",
    );
  });

  it("stays hidden during the first connect attempt", () => {
    assert.equal(
      getMobileRealtimeBannerState({
        ...signedIn,
        realtime: mobileRealtimeReducer(createInitialMobileRealtimeSnapshot(), {
          now: 1_000,
          type: "connect-started",
        }),
      }),
      "hidden",
    );
  });

  it("stays hidden in the background, where the socket is torn down on purpose", () => {
    assert.equal(
      getMobileRealtimeBannerState({
        ...signedIn,
        realtime: mobileRealtimeReducer(connectedSnapshot(), {
          now: 2_000,
          type: "visibility-changed",
          visibility: "background",
        }),
      }),
      "hidden",
    );
  });

  it("stays hidden while offline, because the offline banner already explains it", () => {
    assert.equal(
      getMobileRealtimeBannerState({
        ...signedIn,
        networkStatus: "offline",
        realtime: mobileRealtimeReducer(connectedSnapshot(), { now: 2_000, type: "disconnected" }),
      }),
      "hidden",
    );
  });

  it("reports reconnecting when a live connection drops", () => {
    assert.equal(
      getMobileRealtimeBannerState({
        ...signedIn,
        realtime: mobileRealtimeReducer(connectedSnapshot(), { now: 2_000, type: "disconnected" }),
      }),
      "reconnecting",
    );
  });

  it("reports reconnecting while a retry is in flight", () => {
    const retrying = mobileRealtimeReducer(
      mobileRealtimeReducer(connectedSnapshot(), { now: 2_000, type: "disconnected" }),
      { now: 2_100, type: "connect-started" },
    );

    assert.equal(getMobileRealtimeBannerState({ ...signedIn, realtime: retrying }), "reconnecting");
  });

  it("reports reconnecting on a transport error inside the retry budget", () => {
    assert.equal(
      getMobileRealtimeBannerState({
        ...signedIn,
        realtime: mobileRealtimeReducer(connectedSnapshot(), {
          code: "transport error",
          now: 2_000,
          type: "connection-error",
        }),
      }),
      "reconnecting",
    );
  });

  it("reports failed once the socket.io retry budget is exhausted", () => {
    let snapshot = mobileRealtimeReducer(connectedSnapshot(), {
      code: "transport error",
      now: 2_000,
      type: "connection-error",
    });
    for (let attempt = 0; attempt < MOBILE_REALTIME_RECONNECT_POLICY.maxAttempts; attempt += 1) {
      snapshot = mobileRealtimeReducer(snapshot, {
        now: 3_000 + attempt,
        type: "reconnect-attempt",
      });
    }

    assert.equal(getMobileRealtimeBannerState({ ...signedIn, realtime: snapshot }), "failed");
  });

  it("forces a fresh connect when the network returns under a dead socket", () => {
    assert.equal(
      shouldForceMobileRealtimeReconnect({
        networkStatus: "online",
        realtime: mobileRealtimeReducer(connectedSnapshot(), { now: 2_000, type: "disconnected" }),
      }),
      true,
    );
  });

  it("forces a fresh connect after the retry budget gave up", () => {
    assert.equal(
      shouldForceMobileRealtimeReconnect({
        networkStatus: "online",
        realtime: mobileRealtimeReducer(connectedSnapshot(), {
          code: "transport error",
          now: 2_000,
          type: "connection-error",
        }),
      }),
      true,
    );
  });

  it("leaves a healthy or in-flight socket alone", () => {
    assert.equal(
      shouldForceMobileRealtimeReconnect({
        networkStatus: "online",
        realtime: connectedSnapshot(),
      }),
      false,
    );
    assert.equal(
      shouldForceMobileRealtimeReconnect({
        networkStatus: "online",
        realtime: mobileRealtimeReducer(createInitialMobileRealtimeSnapshot(), {
          now: 1_000,
          type: "connect-started",
        }),
      }),
      false,
    );
  });

  it("waits for the network before spending a connect attempt", () => {
    const down = mobileRealtimeReducer(connectedSnapshot(), { now: 2_000, type: "disconnected" });

    assert.equal(
      shouldForceMobileRealtimeReconnect({ networkStatus: "offline", realtime: down }),
      false,
    );
    assert.equal(
      shouldForceMobileRealtimeReconnect({ networkStatus: "unknown", realtime: down }),
      false,
    );
  });

  it("reports failed for an unauthorized socket even before any retry", () => {
    assert.equal(
      getMobileRealtimeBannerState({
        ...signedIn,
        realtime: mobileRealtimeReducer(connectedSnapshot(), {
          code: "Unauthorized",
          now: 2_000,
          type: "connection-error",
        }),
      }),
      "failed",
    );
  });
});
