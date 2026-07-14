import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ChatMessage, MobileChannelMessagesResponse } from "@wizards/types";
import type { MobileChannelMessagesViewState } from "../src/app/mobile-screen-state";
import {
  applyMobileRealtimeChannelMessageEvent,
  getMobileRealtimeChannelMessage,
} from "../src/workspace/mobile-channel-message-state";
import { MOBILE_CHANNEL_MESSAGES_LIMIT } from "../src/workspace/mobile-workspace-client";

function makeMessage(input: Partial<ChatMessage> & { id: string }): ChatMessage {
  const { id, ...overrides } = input;

  return {
    attachments: [],
    author: {
      avatarUrl: null,
      displayName: "Dogukan",
      id: "user-1",
      status: "ONLINE",
      username: "dogukan",
    },
    channelId: "channel-1",
    content: "Merhaba",
    createdAt: "2026-07-06T10:00:00.000Z",
    deletedAt: null,
    editedAt: null,
    id,
    mentionEveryone: false,
    reactions: [],
    type: "DEFAULT",
    ...overrides,
  };
}

function makeChannelPayload(
  messages: ChatMessage[],
): MobileChannelMessagesResponse {
  return {
    channel: {
      id: "channel-1",
      lastMessage: null,
      categoryId: null,
      categoryName: null,
      locked: false,
      mentionCount: 0,
      name: "development",
      position: 0,
      readOnly: false,
      topic: null,
      type: "TEXT",
      unreadCount: 0,
    },
    hasMore: false,
    messages,
    nextCursor: null,
  };
}

function makeReadyState(messages: ChatMessage[]): MobileChannelMessagesViewState {
  return {
    channelId: "channel-1",
    error: null,
    payload: makeChannelPayload(messages),
    status: "ready",
  };
}

describe("mobile channel realtime message state", () => {
  it("appends a validated active channel message without requiring a refresh", () => {
    const state = makeReadyState([makeMessage({ id: "message-1" })]);
    const incoming = makeMessage({ content: "Anlik mesaj", id: "message-2" });

    const result = applyMobileRealtimeChannelMessageEvent({
      eventName: "message:new",
      payload: incoming,
      state,
    });

    assert.equal(result.handled, true);
    assert.equal(result.state.status, "ready");
    assert.deepEqual(result.state.payload?.messages.map((message) => message.id), [
      "message-1",
      "message-2",
    ]);
    assert.equal(result.state.payload?.messages.at(-1)?.content, "Anlik mesaj");
  });

  it("keeps the active channel window bounded when realtime messages arrive", () => {
    const messages = Array.from({ length: MOBILE_CHANNEL_MESSAGES_LIMIT }, (_, index) =>
      makeMessage({ id: `message-${index + 1}` }),
    );
    const incoming = makeMessage({ id: "message-next" });

    const result = applyMobileRealtimeChannelMessageEvent({
      eventName: "message:new",
      payload: incoming,
      state: makeReadyState(messages),
    });

    assert.equal(result.handled, true);
    assert.equal(result.state.payload?.messages.length, MOBILE_CHANNEL_MESSAGES_LIMIT);
    assert.equal(result.state.payload?.messages[0]?.id, "message-2");
    assert.equal(result.state.payload?.messages.at(-1)?.id, "message-next");
  });

  it("replaces updated messages and reactions in place", () => {
    const existing = makeMessage({ id: "message-1", reactions: [] });
    const updated = makeMessage({
      content: "Duzenlendi",
      editedAt: "2026-07-06T10:01:00.000Z",
      id: "message-1",
    });
    const updatedMessage = applyMobileRealtimeChannelMessageEvent({
      eventName: "message:updated",
      payload: updated,
      state: makeReadyState([existing]),
    });

    assert.equal(updatedMessage.handled, true);
    assert.equal(updatedMessage.state.payload?.messages[0]?.content, "Duzenlendi");

    const updatedReaction = applyMobileRealtimeChannelMessageEvent({
      eventName: "message:reaction_updated",
      payload: {
        channelId: "channel-1",
        messageId: "message-1",
        reactions: [
          {
            count: 1,
            emoji: "thumbs-up",
            userIds: ["user-2"],
          },
        ],
      },
      state: updatedMessage.state,
    });

    assert.equal(updatedReaction.handled, true);
    assert.equal(updatedReaction.state.payload?.messages[0]?.reactions[0]?.emoji, "thumbs-up");
  });

  it("removes deleted messages and clears channel history locally", () => {
    const state = makeReadyState([
      makeMessage({ id: "message-1" }),
      makeMessage({ id: "message-2" }),
    ]);

    const removed = applyMobileRealtimeChannelMessageEvent({
      eventName: "message:deleted",
      payload: {
        channelId: "channel-1",
        messageId: "message-1",
      },
      state,
    });

    assert.equal(removed.handled, true);
    assert.deepEqual(removed.state.payload?.messages.map((message) => message.id), [
      "message-2",
    ]);

    const cleared = applyMobileRealtimeChannelMessageEvent({
      eventName: "message:history_cleared",
      payload: {
        channelId: "channel-1",
      },
      state: removed.state,
    });

    assert.equal(cleared.handled, true);
    assert.deepEqual(cleared.state.payload?.messages, []);
  });

  it("ignores malformed or non-active channel message payloads so callers can fall back to refresh", () => {
    const state = makeReadyState([makeMessage({ id: "message-1" })]);

    assert.equal(
      applyMobileRealtimeChannelMessageEvent({
        eventName: "message:new",
        payload: makeMessage({ channelId: "other-channel", id: "message-2" }),
        state,
      }).handled,
      false,
    );
    assert.equal(
      applyMobileRealtimeChannelMessageEvent({
        eventName: "message:new",
        payload: { channelId: "channel-1", id: "broken" },
        state,
      }).handled,
      false,
    );
    assert.equal(getMobileRealtimeChannelMessage({ id: "broken" }), null);
  });
});
