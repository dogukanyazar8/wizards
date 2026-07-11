import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { DMMessagePayload, MessageReaction } from "@wizards/types";
import {
  mobileDMMessageReactionRoute,
  mobileDMMessageThreadRoute,
  type MobileDMMessageRouteDependencies,
} from "./route-logic";

const message: DMMessagePayload = {
  attachments: [],
  author: {
    avatarUrl: null,
    customStatus: null,
    displayName: "Ada Lovelace",
    id: "user-1",
    status: "ONLINE",
    username: "ada",
  },
  content: "Hello",
  conversationId: "conversation-1",
  createdAt: "2026-07-11T12:00:00.000Z",
  deletedAt: null,
  deletedById: null,
  editedAt: null,
  id: "message-1",
  reactions: [],
  replyTo: null,
  replyToId: null,
  threadParentId: null,
  userId: "user-1",
};

const reactions: MessageReaction[] = [{ count: 1, emoji: "👍", userIds: ["user-1"] }];

function createDependencies(
  overrides: Partial<MobileDMMessageRouteDependencies> = {},
): MobileDMMessageRouteDependencies {
  return {
    authenticate: async () => "user-1",
    emitReactionUpdated: async () => undefined,
    enforceActionRateLimit: async () => undefined,
    enforceRateLimit: async () => undefined,
    getThread: async () => ({ messages: [], nextCursor: null, parent: message }),
    parseReactionRequest: async () => ({ emoji: "👍" }),
    updateReaction: async () => reactions,
    ...overrides,
  };
}

const context = {
  params: Promise.resolve({ conversationId: "conversation-1", messageId: "message-1" }),
};

describe("mobile DM message action routes", () => {
  it("authenticates, rate limits, validates, and emits a reaction update", async () => {
    const calls: string[] = [];
    const response = await mobileDMMessageReactionRoute(
      new Request("http://localhost/api/v1/mobile/dm/conversation-1/messages/message-1/reactions", {
        body: JSON.stringify({ emoji: "👍" }),
        headers: { "content-type": "application/json" },
        method: "PUT",
      }),
      context,
      true,
      createDependencies({
        authenticate: async () => {
          calls.push("authenticate");
          return "user-1";
        },
        emitReactionUpdated: async () => {
          calls.push("emit");
        },
        enforceActionRateLimit: async () => {
          calls.push("action-limit");
        },
        enforceRateLimit: async () => {
          calls.push("rate-limit");
        },
        parseReactionRequest: async () => {
          calls.push("parse");
          return { emoji: "👍" };
        },
        updateReaction: async () => {
          calls.push("update");
          return reactions;
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
    assert.deepEqual(await response.json(), { reactions });
  });

  it("removes a reaction through the same validated route", async () => {
    let shouldReact: boolean | null = null;
    await mobileDMMessageReactionRoute(
      new Request("http://localhost/api/v1/mobile/dm/conversation-1/messages/message-1/reactions", {
        body: JSON.stringify({ emoji: "👍" }),
        headers: { "content-type": "application/json" },
        method: "DELETE",
      }),
      context,
      false,
      createDependencies({
        updateReaction: async (input) => {
          shouldReact = input.shouldReact;
          return [];
        },
      }),
    );

    assert.equal(shouldReact, false);
  });

  it("bounds thread pagination without consuming the mutation budget", async () => {
    let actionRateLimited = false;
    let threadInput: Parameters<MobileDMMessageRouteDependencies["getThread"]>[0] | null = null;
    const response = await mobileDMMessageThreadRoute(
      new Request(
        "http://localhost/api/v1/mobile/dm/conversation-1/messages/message-1/thread?cursor=cursor-1&limit=500",
      ),
      context,
      createDependencies({
        enforceActionRateLimit: async () => {
          actionRateLimited = true;
        },
        getThread: async (input) => {
          threadInput = input;
          return { messages: [], nextCursor: null, parent: message };
        },
      }),
    );

    assert.equal(actionRateLimited, false);
    assert.deepEqual(threadInput, {
      conversationId: "conversation-1",
      cursor: "cursor-1",
      limit: 30,
      messageId: "message-1",
      userId: "user-1",
    });
    assert.equal(response.status, 200);
  });
});
