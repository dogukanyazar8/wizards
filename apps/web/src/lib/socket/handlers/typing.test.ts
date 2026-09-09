import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { prisma } from "@wizards/db";

import { parseDMTypingEntry, registerTypingHandlers } from "./typing";

import type { HandlerContext } from "../context";

function createTypingHandlerContext() {
  const handlers = new Map<string, (payload: unknown) => Promise<void>>();
  const redisCalls: Array<{ args: unknown[]; command: string }> = [];
  const roomEmits: Array<{ event: string; payload: unknown; room: string }> = [];
  const socketEmits: Array<{ event: string; payload: unknown }> = [];

  const socket = {
    data: {
      displayName: "Ada",
      typingChannels: new Set<string>(),
      userId: "user-1",
      username: "ada",
    },
    emit(event: string, payload: unknown) {
      socketEmits.push({ event, payload });
    },
    on(event: string, handler: (payload: unknown) => Promise<void>) {
      handlers.set(event, handler);
      return socket;
    },
  };

  const ctx = {
    io: {
      to(room: string) {
        return {
          emit(event: string, payload: unknown) {
            roomEmits.push({ event, payload, room });
          },
        };
      },
    },
    rateRedis: {},
    redis: {
      async expire(...args: unknown[]) {
        redisCalls.push({ args, command: "expire" });
      },
      async hdel(...args: unknown[]) {
        redisCalls.push({ args, command: "hdel" });
      },
      async hgetall(...args: unknown[]) {
        redisCalls.push({ args, command: "hgetall" });
        return {};
      },
      async hset(...args: unknown[]) {
        redisCalls.push({ args, command: "hset" });
      },
    },
    socket,
    userId: "user-1",
  } as unknown as HandlerContext;

  return { ctx, handlers, redisCalls, roomEmits, socketEmits };
}

describe("socket typing handlers", () => {
  it("parses valid DM typing entries from Redis", () => {
    assert.deepEqual(
      parseDMTypingEntry(JSON.stringify({ expiresAt: 1_779_000_000_000, username: "Ada" })),
      {
        expiresAt: 1_779_000_000_000,
        username: "Ada",
      },
    );
  });

  it("rejects malformed DM typing entries", () => {
    assert.equal(parseDMTypingEntry("not json"), null);
    assert.equal(parseDMTypingEntry(JSON.stringify({ expiresAt: "soon", username: "Ada" })), null);
    assert.equal(parseDMTypingEntry(JSON.stringify({ expiresAt: 1, username: "" })), null);
  });

  it("rate limits DM typing start before writing Redis typing state", async () => {
    const { ctx, handlers, redisCalls, roomEmits } = createTypingHandlerContext();
    const checkedScopes: string[] = [];

    registerTypingHandlers(ctx, {
      checkTypingEventAllowed: async (scope) => {
        checkedScopes.push(scope);
        return false;
      },
      isDMParticipant: async () => true,
      readMessagePrivacy: async () => ({ readReceipts: true, typingIndicator: true }),
    });

    const handler = handlers.get("dm:typing:start");
    assert.ok(handler);
    await handler({ conversationId: "conversation-1" });

    assert.deepEqual(checkedScopes, ["dm:conversation-1"]);
    assert.deepEqual(redisCalls, []);
    assert.deepEqual(roomEmits, []);
  });

  it("rate limits DM typing stop before deleting Redis typing state", async () => {
    const { ctx, handlers, redisCalls, roomEmits } = createTypingHandlerContext();
    const checkedScopes: string[] = [];

    registerTypingHandlers(ctx, {
      checkTypingEventAllowed: async (scope) => {
        checkedScopes.push(scope);
        return false;
      },
      isDMParticipant: async () => true,
      readMessagePrivacy: async () => ({ readReceipts: true, typingIndicator: true }),
    });

    const handler = handlers.get("dm:typing:stop");
    assert.ok(handler);
    await handler({ conversationId: "conversation-1" });

    assert.deepEqual(checkedScopes, ["dm:conversation-1"]);
    assert.deepEqual(redisCalls, []);
    assert.deepEqual(roomEmits, []);
  });

  it("resolves channel typing names from Redis and emits directly to the channel room", async () => {
    const { ctx, handlers, roomEmits } = createTypingHandlerContext();
    ctx.redis.hgetall = async () => ({
      "user-1": JSON.stringify({ expiresAt: Date.now() + 3_000, username: "Ada" }),
      "user-2": JSON.stringify({ expiresAt: Date.now() + 3_000, username: "Grace" }),
    });

    registerTypingHandlers(ctx, {
      checkTypingEventAllowed: async () => true,
      readMessagePrivacy: async () => ({ readReceipts: true, typingIndicator: true }),
      requireChannelPermission: async () => ({}) as never,
    });

    await handlers.get("typing:start")!("channel-1");

    assert.deepEqual(roomEmits, [
      {
        event: "typing:update",
        payload: { channelId: "channel-1", users: ["Ada", "Grace"] },
        room: "channel-1",
      },
    ]);
  });

  // Mesajlar §15.5 madde 2 / karar K9. The switch is enforced where the event is
  // published: nothing is written to Redis and nothing is emitted, so no reader
  // is ever asked to filter a dot that should not have travelled.
  it("publishes no DM typing state when the sender turned the indicator off", async () => {
    const { ctx, handlers, redisCalls, roomEmits } = createTypingHandlerContext();
    const checkedScopes: string[] = [];

    registerTypingHandlers(ctx, {
      checkTypingEventAllowed: async (scope) => {
        checkedScopes.push(scope);
        return true;
      },
      isDMParticipant: async () => true,
      readMessagePrivacy: async () => ({ readReceipts: true, typingIndicator: false }),
    });

    await handlers.get("dm:typing:start")!({ conversationId: "conversation-1" });

    assert.deepEqual(redisCalls, []);
    assert.deepEqual(roomEmits, []);
    // The rate limiter is never even consulted: the event does not exist.
    assert.deepEqual(checkedScopes, []);
  });

  it("publishes no channel typing state when the sender turned the indicator off", async () => {
    const { ctx, handlers, redisCalls, roomEmits } = createTypingHandlerContext();

    registerTypingHandlers(ctx, {
      checkTypingEventAllowed: async () => true,
      readMessagePrivacy: async () => ({ readReceipts: true, typingIndicator: false }),
      requireChannelPermission: async () => ({}) as never,
    });

    await handlers.get("typing:start")!("channel-1");

    assert.deepEqual(redisCalls, []);
    assert.deepEqual(roomEmits, []);
  });

  // Turning the switch off mid-sentence must still be able to clear the dot the
  // reader is already looking at, so `stop` stays ungated.
  it("still clears leftover DM typing state after the indicator is turned off", async () => {
    const { ctx, handlers, redisCalls, roomEmits } = createTypingHandlerContext();
    const participantFindMany = prisma.dMParticipant.findMany;
    (prisma.dMParticipant as { findMany: unknown }).findMany = async () => [];

    try {
      registerTypingHandlers(ctx, {
        checkTypingEventAllowed: async () => true,
        isDMParticipant: async () => true,
        readMessagePrivacy: async () => ({ readReceipts: true, typingIndicator: false }),
      });

      await handlers.get("dm:typing:stop")!({ conversationId: "conversation-1" });
    } finally {
      (prisma.dMParticipant as { findMany: unknown }).findMany = participantFindMany;
    }

    assert.deepEqual(
      redisCalls.map((call) => call.command),
      ["hdel", "hgetall"],
    );
    assert.deepEqual(roomEmits, [
      {
        event: "dm:typing:update",
        payload: { conversationId: "conversation-1", typingUsers: [] },
        room: "dm:conversation-1",
      },
    ]);
  });
});
