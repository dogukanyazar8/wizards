import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { HandlerContext } from "../context";
import { registerChannelHandlers } from "./channel";

describe("socket channel handlers", () => {
  it("keeps the channel viewer Redis set in sync on join and leave", async () => {
    const handlers = new Map<string, (payload: unknown) => Promise<void>>();
    const redisCalls: Array<{ command: string; key: string; userId: string }> = [];
    const joined: string[] = [];
    const left: string[] = [];
    const socket = {
      data: { userId: "user-1" },
      emit() {},
      join(room: string) {
        joined.push(room);
      },
      leave(room: string) {
        left.push(room);
      },
      on(event: string, handler: (payload: unknown) => Promise<void>) {
        handlers.set(event, handler);
        return socket;
      },
    };
    const ctx = {
      redis: {
        async sadd(key: string, userId: string) {
          redisCalls.push({ command: "sadd", key, userId });
        },
        async srem(key: string, userId: string) {
          redisCalls.push({ command: "srem", key, userId });
        },
      },
      socket,
      userId: "user-1",
    } as unknown as HandlerContext;

    registerChannelHandlers(ctx, {
      requireChannelPermission: async () => ({ channel: { serverId: "server-1" } }) as never,
    });

    await handlers.get("channel:join")!("channel-1");
    await handlers.get("channel:leave")!("channel-1");

    assert.deepEqual(joined, ["channel-1", "server:server-1"]);
    assert.deepEqual(left, ["channel-1"]);
    assert.deepEqual(redisCalls, [
      { command: "sadd", key: "channel:channel-1:viewers", userId: "user-1" },
      { command: "srem", key: "channel:channel-1:viewers", userId: "user-1" },
    ]);
  });

  it("does not join a channel room when current authorization denies VIEW_CHANNEL", async () => {
    const handlers = new Map<string, (payload: unknown) => Promise<void>>();
    const joined: string[] = [];
    const emitted: string[] = [];
    const socket = {
      data: { userId: "user-1" },
      emit(event: string) {
        emitted.push(event);
      },
      join(room: string) {
        joined.push(room);
      },
      on(event: string, handler: (payload: unknown) => Promise<void>) {
        handlers.set(event, handler);
        return socket;
      },
    };
    const ctx = {
      redis: {},
      socket,
      userId: "user-1",
    } as unknown as HandlerContext;

    registerChannelHandlers(ctx, {
      requireChannelPermission: async () => {
        throw new Error("VIEW_CHANNEL revoked");
      },
    });

    await handlers.get("channel:join")!("private-channel");

    assert.deepEqual(joined, []);
    assert.deepEqual(emitted, ["error"]);
  });
});
