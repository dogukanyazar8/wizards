import assert from "node:assert/strict";
import { describe, it } from "node:test";
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
    });

    const handler = handlers.get("dm:typing:stop");
    assert.ok(handler);
    await handler({ conversationId: "conversation-1" });

    assert.deepEqual(checkedScopes, ["dm:conversation-1"]);
    assert.deepEqual(redisCalls, []);
    assert.deepEqual(roomEmits, []);
  });
});
