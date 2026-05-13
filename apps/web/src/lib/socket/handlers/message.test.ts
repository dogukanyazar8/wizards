import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { HandlerContext } from "../context";
import { deriveMessageSendFanoutTargets, registerMessageHandlers } from "./message";

function createHandlerContextRecorder() {
  const events: string[] = [];
  const socket = {
    data: {
      displayName: "Ada",
      userId: "user-1",
      username: "ada",
    },
    on(event: string) {
      events.push(event);
      return socket;
    },
  };

  const ctx = {
    io: {},
    redis: {},
    socket,
    userId: "user-1",
  } as unknown as HandlerContext;

  return { ctx, events };
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
});
