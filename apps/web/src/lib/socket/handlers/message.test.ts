import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PermissionBits } from "@/lib/workspace/permissions";

import type { HandlerContext } from "../context";
import * as messageHandlers from "./message";
import { deriveMessageSendFanoutTargets, registerMessageHandlers } from "./message";

function createHandlerContextRecorder() {
  const events: string[] = [];
  const emittedEvents: Array<{ event: string; payload: unknown }> = [];
  const handlers = new Map<string, (payload: unknown) => Promise<void>>();
  const socket = {
    data: {
      displayName: "Ada",
      userId: "user-1",
      username: "ada",
    },
    emit(event: string, payload: unknown) {
      emittedEvents.push({ event, payload });
    },
    on(event: string, handler?: (payload: unknown) => Promise<void>) {
      events.push(event);
      if (handler) {
        handlers.set(event, handler);
      }
      return socket;
    },
  };

  const ctx = {
    io: {},
    rateRedis: {},
    redis: {},
    socket,
    userId: "user-1",
  } as unknown as HandlerContext;

  return { ctx, emittedEvents, events, handlers };
}

describe("socket message handlers", () => {
  it("registers all channel message socket events", () => {
    const { ctx, events } = createHandlerContextRecorder();

    registerMessageHandlers(ctx);

    assert.deepEqual(events, [
      "message:send",
      "message:edit",
      "message:delete",
      "message:react",
      "message:unreact",
    ]);
  });

  it("derives read and unread fanout targets from one permission batch", () => {
    assert.deepEqual(
      deriveMessageSendFanoutTargets({
        activeChannelViewerCandidateUserIds: ["sender", "viewer-1", "blocked-viewer"],
        activeServerMemberUserIds: ["sender", "viewer-1", "member-1", "blocked-member"],
        permittedActiveUserIds: ["sender", "viewer-1", "member-1"],
        senderId: "sender",
      }),
      {
        activeChannelViewerUserIds: ["sender", "viewer-1"],
        permittedUnreadUserIds: ["sender", "viewer-1", "member-1"],
        readUserIds: ["sender", "viewer-1"],
        unreadUpdateUserIds: ["member-1"],
      },
    );
  });

  it("rate limits message edits before DB work and socket fanout", async () => {
    const { ctx, emittedEvents, handlers } = createHandlerContextRecorder();
    const checkedUserIds: string[] = [];

    registerMessageHandlers(ctx, {
      checkChannelMessageEditRateLimit: async ({ userId }) => {
        checkedUserIds.push(userId);
        return { status: "limited" };
      },
    });

    const handler = handlers.get("message:edit");
    assert.ok(handler);
    await handler({ content: "Updated", messageId: "message-1" });

    assert.deepEqual(checkedUserIds, ["user-1"]);
    assert.deepEqual(emittedEvents, [
      {
        event: "error",
        payload: {
          code: "RATE_LIMIT",
          message: "Too many message edits. Maximum 30 per minute.",
        },
      },
    ]);
  });

  it("fails closed when message send rate limiting is unavailable beyond grace", async () => {
    const { ctx, emittedEvents, handlers } = createHandlerContextRecorder();
    const checkedUserIds: string[] = [];

    registerMessageHandlers(ctx, {
      checkChannelMessageRateLimit: async ({ userId }) => {
        checkedUserIds.push(userId);
        return {
          allowDuringGrace: false,
          error: new Error("redis unavailable"),
          status: "unavailable",
        };
      },
    });

    const handler = handlers.get("message:send");
    assert.ok(handler);
    await handler({ channelId: "channel-1", content: "Hello" });

    assert.deepEqual(checkedUserIds, ["user-1"]);
    assert.deepEqual(emittedEvents, [
      {
        event: "error",
        payload: {
          code: "RATE_LIMIT_UNAVAILABLE",
          message: "Message controls are temporarily unavailable. Please try again shortly.",
        },
      },
    ]);
  });

  it("enforces channel slow mode after global limiting and returns retryAfterSeconds", async () => {
    const { ctx, emittedEvents, handlers } = createHandlerContextRecorder();
    const checks: string[] = [];

    registerMessageHandlers(ctx, {
      checkChannelMessageRateLimit: async () => {
        checks.push("global");
        return { status: "allowed" };
      },
      checkChannelSlowMode: async ({ channelId, delaySeconds, userId }) => {
        checks.push(`slow:${channelId}:${userId}:${delaySeconds}`);
        return { retryAfterSeconds: 12, status: "limited" };
      },
      requireChannelPermissionForUser: async () => ({
        channel: {
          id: "channel-1",
          bitrate: 64_000,
          locked: false,
          name: "general",
          rtcRegion: null,
          server: { features: [], messageCharacterLimit: 2_000 },
          serverId: "server-1",
          slowModeDelay: 30,
          type: "TEXT",
          userLimit: 0,
          videoQualityMode: "AUTO",
        },
        context: {} as never,
        permissions: PermissionBits.SEND_MESSAGES,
      }),
    });

    const handler = handlers.get("message:send");
    assert.ok(handler);
    await handler({ channelId: "channel-1", content: "Hello" });

    assert.deepEqual(checks, ["global", "slow:channel-1:user-1:30"]);
    assert.deepEqual(emittedEvents, [
      {
        event: "error",
        payload: {
          code: "SLOW_MODE",
          message: "Slow mode is active. Please wait before sending another message.",
          retryAfterSeconds: 12,
        },
      },
    ]);
  });

  it("lets message moderators bypass slow mode without bypassing the global limiter", async () => {
    const slowModeCalls: unknown[] = [];
    const result = await messageHandlers.checkChannelSlowModeForSend({
      channelId: "channel-1",
      check: async (args) => {
        slowModeCalls.push(args);
        return { retryAfterSeconds: 30, status: "limited" };
      },
      delaySeconds: 30,
      permissions: PermissionBits.MANAGE_MESSAGES,
      redis: {} as never,
      userId: "moderator-1",
    });

    assert.deepEqual(result, { status: "allowed" });
    assert.deepEqual(slowModeCalls, []);
  });

  it("requires unlocked SEND_MESSAGES access before channel reactions", async () => {
    const checks: unknown[][] = [];
    await messageHandlers.requireChannelReactionPermission(
      "user-1",
      "channel-1",
      async (...args) => {
        checks.push(args);
        return {} as never;
      },
    );

    assert.deepEqual(checks, [
      ["user-1", "channel-1", PermissionBits.SEND_MESSAGES, { respectLocked: true }],
    ]);
  });
});
