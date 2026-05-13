import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { HandlerContext } from "../context";
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
});
