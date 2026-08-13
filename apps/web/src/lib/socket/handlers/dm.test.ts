import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { HandlerContext } from "../context";
import { registerDMHandlers } from "./dm";

function createHandlerContextRecorder() {
  const events: string[] = [];
  const emitted: Array<{ args: unknown[]; event: string }> = [];
  const handlers = new Map<string, (payload: unknown) => Promise<void> | void>();
  const socket = {
    data: {
      displayName: "Ada",
      userId: "user-1",
      username: "ada",
    },
    emit(event: string, ...args: unknown[]) {
      emitted.push({ args, event });
      return socket;
    },
    on(event: string, handler: (payload: unknown) => Promise<void> | void) {
      events.push(event);
      handlers.set(event, handler);
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

  return { ctx, emitted, events, handlers };
}

type TestDMHandlerOptions = {
  checkDeliveryAckRateLimit(args: { userId: string }): Promise<{ status: "allowed" }>;
  isParticipant(userId: string, conversationId: string): Promise<boolean>;
  leaveCall(conversationId: string, userId: string): Promise<null>;
  loadParticipants(conversationId: string): Promise<unknown[]>;
  recordDelivery(userId: string, conversationIds: string[]): Promise<void>;
};

function registerWithTestOptions(ctx: HandlerContext, options: TestDMHandlerOptions) {
  return (
    registerDMHandlers as unknown as (
      context: HandlerContext,
      options: TestDMHandlerOptions,
    ) => ReturnType<typeof registerDMHandlers>
  )(ctx, options);
}

describe("socket DM handlers", () => {
  it("registers all DM socket events", () => {
    const { ctx, events } = createHandlerContextRecorder();

    registerDMHandlers(ctx);

    assert.deepEqual(events, [
      "dm:join",
      "dm:leave",
      "dm:message:delivered",
      "dm:call:start",
      // Faz 2 §D3. Joining an ongoing call and leaving one without ending it
      // for everybody else.
      "dm:call:join",
      "dm:call:leave",
      "dm:call:accept",
      "dm:call:decline",
      "dm:call:cancel",
      "dm:call:end",
      "dm:message:send",
      "dm:message:edit",
      "dm:message:delete",
      "dm:message:react",
      "dm:message:unreact",
    ]);
  });

  it("rejects a delivery acknowledgement from a non-participant before recording it", async () => {
    const { ctx, emitted, handlers } = createHandlerContextRecorder();
    const calls: string[] = [];

    registerWithTestOptions(ctx, {
      async checkDeliveryAckRateLimit({ userId }) {
        calls.push(`rate:${userId}`);
        return { status: "allowed" };
      },
      async isParticipant(userId, conversationId) {
        calls.push(`participant:${userId}:${conversationId}`);
        return false;
      },
      async leaveCall() {
        return null;
      },
      async loadParticipants() {
        return [];
      },
      async recordDelivery() {
        calls.push("record");
      },
    });

    await handlers.get("dm:message:delivered")?.({ conversationId: "conversation-1" });

    assert.deepEqual(calls, ["rate:user-1", "participant:user-1:conversation-1"]);
    assert.deepEqual(emitted.at(-1), {
      args: [{ code: "FORBIDDEN", message: "You are not a participant in this DM" }],
      event: "dm:error",
    });
  });

  it("leaves the call roster before checking whether a removed member is still authorized", async () => {
    const { ctx, handlers } = createHandlerContextRecorder();
    const calls: string[] = [];

    registerWithTestOptions(ctx, {
      async checkDeliveryAckRateLimit() {
        return { status: "allowed" };
      },
      async isParticipant() {
        return true;
      },
      async leaveCall(conversationId, userId) {
        calls.push(`leave:${conversationId}:${userId}`);
        return null;
      },
      async loadParticipants(conversationId) {
        calls.push(`participants:${conversationId}`);
        return [];
      },
      async recordDelivery() {},
    });

    await handlers.get("dm:call:leave")?.({ conversationId: "conversation-1" });

    assert.deepEqual(calls, ["leave:conversation-1:user-1", "participants:conversation-1"]);
  });
});
