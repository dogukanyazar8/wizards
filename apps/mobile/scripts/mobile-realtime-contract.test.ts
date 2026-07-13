import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createMobileRealtimeEventEnvelope,
  getMobileRealtimeRefreshSources,
  MOBILE_REALTIME_RECONNECT_POLICY,
  MOBILE_REALTIME_REFRESH_DEBOUNCE_MS,
  MOBILE_REALTIME_REFRESH_TIMER_SOURCES,
  MOBILE_REALTIME_SERVER_EVENTS,
  getMobileRealtimeRefreshTimerSource,
  validateMobileRealtimeContract,
} from "../src/realtime/mobile-realtime-contract";

describe("mobile realtime contract", () => {
  it("keeps the mobile socket event subset unique and mapped to refresh sources", () => {
    assert.deepEqual(validateMobileRealtimeContract(), []);
    assert.equal(new Set(MOBILE_REALTIME_SERVER_EVENTS).size, MOBILE_REALTIME_SERVER_EVENTS.length);
    assert.ok(MOBILE_REALTIME_SERVER_EVENTS.includes("message:new"));
    assert.ok(MOBILE_REALTIME_SERVER_EVENTS.includes("dm:message:new"));
    assert.ok(MOBILE_REALTIME_SERVER_EVENTS.includes("presence:update"));
    assert.ok(MOBILE_REALTIME_SERVER_EVENTS.includes("friends:updated"));
    assert.ok(MOBILE_REALTIME_SERVER_EVENTS.includes("user:profile:updated"));
    assert.ok(MOBILE_REALTIME_SERVER_EVENTS.includes("voice:state:update"));
    assert.ok(MOBILE_REALTIME_SERVER_EVENTS.includes("voice:invite:received"));
    assert.ok(MOBILE_REALTIME_SERVER_EVENTS.includes("voice:invite:sent"));
    assert.ok(MOBILE_REALTIME_SERVER_EVENTS.includes("voice:invite:status"));
    assert.ok(MOBILE_REALTIME_SERVER_EVENTS.includes("voice:invite:error"));
  });

  it("maps active conversation events to the narrowest refresh target", () => {
    assert.deepEqual(getMobileRealtimeRefreshSources("message:new"), ["channel"]);
    assert.deepEqual(getMobileRealtimeRefreshSources("dm:message:new"), ["dm"]);
    assert.deepEqual(getMobileRealtimeRefreshSources("dm:conversation:updated"), ["bootstrap"]);
    assert.deepEqual(getMobileRealtimeRefreshSources("voice:state:update"), ["workspace"]);
    assert.deepEqual(getMobileRealtimeRefreshSources("voice:audio-level:update"), []);
    assert.deepEqual(getMobileRealtimeRefreshSources("voice:invite:received"), []);
    assert.deepEqual(getMobileRealtimeRefreshSources("voice:invite:sent"), []);
    assert.deepEqual(getMobileRealtimeRefreshSources("voice:invite:status"), []);
    assert.deepEqual(getMobileRealtimeRefreshSources("voice:invite:error"), []);
    assert.deepEqual(getMobileRealtimeRefreshSources("typing:update"), []);
    assert.deepEqual(getMobileRealtimeRefreshSources("dm:typing:update"), []);
    assert.deepEqual(getMobileRealtimeRefreshSources("presence:update"), ["presence"]);
    assert.deepEqual(getMobileRealtimeRefreshSources("friends:updated"), ["presence"]);
    assert.deepEqual(getMobileRealtimeRefreshSources("user:profile:updated"), ["presence"]);
  });

  it("retains only schema-validated server management and social payloads", () => {
    const membership = createMobileRealtimeEventEnvelope(
      "server:membership:removed",
      { reason: "kicked", serverId: "server-1" },
      2_100,
    );
    assert.equal(membership.serverId, "server-1");
    assert.deepEqual(membership.payload, { reason: "kicked", serverId: "server-1" });

    const history = createMobileRealtimeEventEnvelope(
      "message:history_cleared",
      { channelId: "channel-1" },
      2_200,
    );
    assert.equal(history.channelId, "channel-1");
    assert.deepEqual(history.payload, { channelId: "channel-1" });

    const presence = createMobileRealtimeEventEnvelope(
      "presence:update",
      { customStatus: "Reviewing", status: "IDLE", userId: "user-2" },
      2_300,
    );
    assert.deepEqual(presence.payload, {
      customStatus: "Reviewing",
      status: "IDLE",
      userId: "user-2",
    });

    const profile = createMobileRealtimeEventEnvelope(
      "user:profile:updated",
      {
        avatarUrl: "https://cdn.example.com/avatar.png",
        customStatus: null,
        displayName: "Ada Lovelace",
        status: "ONLINE",
        userId: "user-2",
        username: "ada",
      },
      2_400,
    );
    assert.deepEqual(profile.payload, {
      avatarUrl: "https://cdn.example.com/avatar.png",
      customStatus: null,
      displayName: "Ada Lovelace",
      status: "ONLINE",
      userId: "user-2",
      username: "ada",
    });
  });

  it("drops malformed managed ids, presence values, avatars, and extra fields", () => {
    const malformed = [
      createMobileRealtimeEventEnvelope("server:settings:updated", { serverId: "" }),
      createMobileRealtimeEventEnvelope("server:membership:added", {
        serverId: "server-1",
        userId: "user-1",
      }),
      createMobileRealtimeEventEnvelope("message:history_cleared", {
        channelId: "channel-1",
        unexpected: true,
      }),
      createMobileRealtimeEventEnvelope("presence:update", {
        customStatus: null,
        status: "INVISIBLE",
        userId: "user-2",
      }),
      createMobileRealtimeEventEnvelope("user:profile:updated", {
        avatarUrl: "not-a-url",
        customStatus: null,
        displayName: "Ada Lovelace",
        status: "ONLINE",
        userId: "user-2",
        username: "ada",
      }),
    ];

    malformed.forEach((event) => {
      assert.equal(event.channelId, null);
      assert.equal(event.payload, null);
      assert.equal(event.serverId, null);
    });
  });

  it("preserves voice invite payloads without scheduling a data refresh", () => {
    const event = createMobileRealtimeEventEnvelope(
      "voice:invite:received",
      {
        channelId: "voice-1",
        channelName: "Live room",
        createdAt: "2026-07-06T10:00:00.000Z",
        expiresAt: "2026-07-06T10:01:00.000Z",
        fromUser: {
          avatarUrl: null,
          displayName: "Dogukan",
          id: "user-1",
          username: "dogukan",
        },
        id: "invite-1",
        serverId: "server-1",
        serverName: "UAT",
      },
      3_000,
    );

    assert.equal(event.channelId, "voice-1");
    assert.equal(event.serverId, "server-1");
    assert.deepEqual(event.refreshSources, []);
    assert.equal((event.payload as { id: string }).id, "invite-1");
  });

  it("preserves active DM payloads for a transient cache update", () => {
    const event = createMobileRealtimeEventEnvelope(
      "dm:message:new",
      {
        content: "must not be copied into realtime state",
        conversationId: "conversation-1",
        id: "message-1",
      },
      1_000,
    );

    assert.equal(event.conversationId, "conversation-1");
    assert.deepEqual(event.refreshSources, ["dm"]);
    assert.equal(
      (event.payload as { content: string }).content,
      "must not be copied into realtime state",
    );
  });

  it("preserves active channel message payloads for silent local UI updates", () => {
    const payload = {
      attachments: [],
      author: {
        avatarUrl: null,
        displayName: "Dogukan",
        id: "user-1",
        username: "dogukan",
      },
      channelId: "channel-1",
      content: "active channel content",
      createdAt: "2026-07-06T10:00:00.000Z",
      deletedAt: null,
      editedAt: null,
      id: "message-1",
      reactions: [],
      type: "DEFAULT",
    };
    const event = createMobileRealtimeEventEnvelope("message:new", payload, 1_500);

    assert.equal(event.channelId, "channel-1");
    assert.deepEqual(event.refreshSources, ["channel"]);
    assert.equal((event.payload as { content: string }).content, "active channel content");
  });

  it("preserves local-only typing payload without triggering data refresh", () => {
    const event = createMobileRealtimeEventEnvelope(
      "typing:update",
      {
        channelId: "channel-1",
        users: ["Mehmet"],
      },
      2_000,
    );

    assert.deepEqual(event.payload, {
      channelId: "channel-1",
      users: ["Mehmet"],
    });
    assert.deepEqual(event.refreshSources, []);
  });

  it("keeps reconnect behavior bounded for mobile battery safety", () => {
    assert.equal(MOBILE_REALTIME_RECONNECT_POLICY.maxAttempts <= 8, true);
    assert.equal(MOBILE_REALTIME_RECONNECT_POLICY.timeoutMs >= 10_000, true);
    assert.equal(
      MOBILE_REALTIME_RECONNECT_POLICY.initialDelayMs < MOBILE_REALTIME_RECONNECT_POLICY.maxDelayMs,
      true,
    );
  });

  it("keeps realtime refresh timers bounded to visible data groups", () => {
    assert.deepEqual(MOBILE_REALTIME_REFRESH_TIMER_SOURCES, [
      "bootstrap",
      "channel",
      "dm",
      "presence",
      "workspace",
    ]);
    assert.equal(MOBILE_REALTIME_REFRESH_DEBOUNCE_MS >= 250, true);
    assert.equal(MOBILE_REALTIME_REFRESH_DEBOUNCE_MS <= 1_000, true);
    assert.equal(getMobileRealtimeRefreshTimerSource("presence"), "presence");
    assert.equal(getMobileRealtimeRefreshTimerSource("notification"), "bootstrap");
    assert.equal(getMobileRealtimeRefreshTimerSource("channel"), "channel");
    assert.equal(getMobileRealtimeRefreshTimerSource("workspace"), "workspace");
  });
});
