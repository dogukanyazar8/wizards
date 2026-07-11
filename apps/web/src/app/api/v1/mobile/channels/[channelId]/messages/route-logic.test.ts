import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { ChatMessage, MessageReaction } from "@wizards/types";
import { ApiError } from "@/lib/api";
import {
  mobileChannelMessageDeleteRoute,
  mobileChannelMessageEditRoute,
  mobileChannelMessageReactionRoute,
  mobileChannelMessageThreadRoute,
  type MobileChannelMessageRouteDependencies,
} from "./route-logic";

const message: ChatMessage = {
  attachments: [],
  author: {
    avatarUrl: null,
    displayName: "Ada Lovelace",
    id: "user-1",
    username: "ada",
  },
  channelId: "channel-1",
  content: "Hello",
  createdAt: "2026-07-11T12:00:00.000Z",
  deletedAt: null,
  editedAt: null,
  id: "message-1",
  reactions: [],
  type: "DEFAULT",
};

const reactions: MessageReaction[] = [
  {
    count: 1,
    emoji: "👍",
    userIds: ["user-1"],
  },
];

function createDependencies(
  overrides: Partial<MobileChannelMessageRouteDependencies> = {},
): MobileChannelMessageRouteDependencies {
  return {
    authenticate: async () => "user-1",
    deleteMessage: async () => ({
      placeholderExpiresAt: "2026-07-11T12:15:00.000Z",
      status: "deleted",
    }),
    emitMessageDeleted: async () => undefined,
    emitMessageUpdated: async () => undefined,
    emitReactionUpdated: async () => undefined,
    enforceActionRateLimit: async () => undefined,
    enforceRateLimit: async () => undefined,
    getThread: async () => ({
      hasMore: false,
      messages: [],
      nextCursor: null,
      parent: message,
    }),
    parseEditRequest: async () => ({ content: "Updated" }),
    parseReactionRequest: async () => ({ emoji: "👍" }),
    updateMessage: async () => ({ ...message, content: "Updated" }),
    updateReaction: async () => reactions,
    ...overrides,
  };
}

const context = {
  params: Promise.resolve({ channelId: "channel-1", messageId: "message-1" }),
};

describe("mobile channel message action routes", () => {
  it("limits and validates an edit before calling the service and emitting the update", async () => {
    const calls: string[] = [];
    const response = await mobileChannelMessageEditRoute(
      new Request("http://localhost/api/v1/mobile/channels/channel-1/messages/message-1", {
        body: JSON.stringify({ content: "Updated" }),
        headers: { "content-type": "application/json" },
        method: "PATCH",
      }),
      context,
      createDependencies({
        authenticate: async () => {
          calls.push("authenticate");
          return "user-1";
        },
        emitMessageUpdated: async () => {
          calls.push("emit");
        },
        enforceActionRateLimit: async () => {
          calls.push("action-limit");
        },
        enforceRateLimit: async () => {
          calls.push("rate-limit");
        },
        parseEditRequest: async () => {
          calls.push("parse");
          return { content: "Updated" };
        },
        updateMessage: async () => {
          calls.push("update");
          return { ...message, content: "Updated" };
        },
      }),
    );

    assert.deepEqual(calls, [
      "authenticate",
      "rate-limit",
      "action-limit",
      "parse",
      "update",
      "emit",
    ]);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { message: { ...message, content: "Updated" } });
  });

  it("sets and clears reactions through the same validated action path", async () => {
    const updates: boolean[] = [];
    const dependencies = createDependencies({
      updateReaction: async ({ shouldReact }) => {
        updates.push(shouldReact);
        return reactions;
      },
    });

    const putResponse = await mobileChannelMessageReactionRoute(
      new Request(
        "http://localhost/api/v1/mobile/channels/channel-1/messages/message-1/reactions",
        {
          body: JSON.stringify({ emoji: "👍" }),
          headers: { "content-type": "application/json" },
          method: "PUT",
        },
      ),
      context,
      true,
      dependencies,
    );
    const deleteResponse = await mobileChannelMessageReactionRoute(
      new Request(
        "http://localhost/api/v1/mobile/channels/channel-1/messages/message-1/reactions",
        {
          body: JSON.stringify({ emoji: "👍" }),
          headers: { "content-type": "application/json" },
          method: "DELETE",
        },
      ),
      context,
      false,
      dependencies,
    );

    assert.deepEqual(updates, [true, false]);
    assert.deepEqual(await putResponse.json(), { reactions });
    assert.deepEqual(await deleteResponse.json(), { reactions });
  });

  it("bounds thread pagination and does not apply a mutation rate limit", async () => {
    let threadInput: Parameters<MobileChannelMessageRouteDependencies["getThread"]>[0] | null =
      null;
    let actionRateLimited = false;
    const response = await mobileChannelMessageThreadRoute(
      new Request(
        "http://localhost/api/v1/mobile/channels/channel-1/messages/message-1/thread?cursor=cursor-1&limit=500",
      ),
      context,
      createDependencies({
        enforceActionRateLimit: async () => {
          actionRateLimited = true;
        },
        getThread: async (input) => {
          threadInput = input;
          return { hasMore: false, messages: [], nextCursor: null, parent: message };
        },
      }),
    );

    assert.equal(actionRateLimited, false);
    assert.deepEqual(threadInput, {
      channelId: "channel-1",
      cursor: "cursor-1",
      limit: 30,
      messageId: "message-1",
      userId: "user-1",
    });
    assert.equal(response.status, 200);
  });

  it("rejects an unbounded thread cursor before calling the service", async () => {
    let called = false;
    const response = await mobileChannelMessageThreadRoute(
      new Request(
        `http://localhost/api/v1/mobile/channels/channel-1/messages/message-1/thread?cursor=${"x".repeat(129)}`,
      ),
      context,
      createDependencies({
        getThread: async () => {
          called = true;
          return { hasMore: false, messages: [], nextCursor: null, parent: message };
        },
      }),
    );

    assert.equal(called, false);
    assert.equal(response.status, 400);
  });

  it("returns safe API errors without reflecting edited content", async () => {
    const response = await mobileChannelMessageEditRoute(
      new Request("http://localhost/api/v1/mobile/channels/channel-1/messages/message-1", {
        body: JSON.stringify({ content: "very private message content" }),
        headers: { "content-type": "application/json" },
        method: "PATCH",
      }),
      context,
      createDependencies({
        updateMessage: async () => {
          throw new ApiError("Cannot edit this message", 403, "FORBIDDEN");
        },
      }),
    );

    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), {
      code: "FORBIDDEN",
      error: "Cannot edit this message",
    });
  });

  it("emits deletion only after the server-authorized delete succeeds", async () => {
    const calls: string[] = [];
    const response = await mobileChannelMessageDeleteRoute(
      new Request("http://localhost/api/v1/mobile/channels/channel-1/messages/message-1", {
        method: "DELETE",
      }),
      context,
      createDependencies({
        deleteMessage: async () => {
          calls.push("delete");
          return { status: "removed" };
        },
        emitMessageDeleted: async () => {
          calls.push("emit");
        },
      }),
    );

    assert.deepEqual(calls, ["delete", "emit"]);
    assert.deepEqual(await response.json(), { status: "removed" });
  });
});
