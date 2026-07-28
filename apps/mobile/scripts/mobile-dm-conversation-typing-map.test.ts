import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getMobileDMConversationTypingMap } from "../src/query/mobile-message-queries";
import {
  applyMobileChannelTypingUpdate,
  createInitialMobileChannelTypingState,
  MOBILE_TYPING_TTL_MS,
} from "../src/realtime/mobile-typing-state";

/**
 * 1a's "yazıyor" row. The realtime provider fills the same state for every
 * conversation, open or not, so this projection is all the list needs.
 */
describe("mobile DM conversation typing map", () => {
  it("keys typists by conversation, including chats that are not open", () => {
    const now = 1_000;
    let state = createInitialMobileChannelTypingState();
    state = applyMobileChannelTypingUpdate(state, {
      channelId: "dm-1",
      isTyping: true,
      now,
      userId: "user-2",
      username: "ogi_uat",
    });
    state = applyMobileChannelTypingUpdate(state, {
      channelId: "dm-2",
      isTyping: true,
      now,
      userId: "user-3",
      username: "selin_qa",
    });

    assert.deepEqual(getMobileDMConversationTypingMap(state, now), {
      "dm-1": ["ogi_uat"],
      "dm-2": ["selin_qa"],
    });
  });

  it("drops a conversation once its typing TTL lapses", () => {
    const now = 1_000;
    const state = applyMobileChannelTypingUpdate(createInitialMobileChannelTypingState(), {
      channelId: "dm-1",
      isTyping: true,
      now,
      userId: "user-2",
      username: "ogi_uat",
    });

    assert.deepEqual(getMobileDMConversationTypingMap(state, now + 1), { "dm-1": ["ogi_uat"] });
    // A row must never be left stuck mid-sentence when the stop event is lost.
    assert.deepEqual(getMobileDMConversationTypingMap(state, now + MOBILE_TYPING_TTL_MS + 1), {});
  });

  it("omits a conversation with nobody typing rather than listing it empty", () => {
    const now = 1_000;
    let state = applyMobileChannelTypingUpdate(createInitialMobileChannelTypingState(), {
      channelId: "dm-1",
      isTyping: true,
      now,
      userId: "user-2",
      username: "ogi_uat",
    });
    state = applyMobileChannelTypingUpdate(state, {
      channelId: "dm-1",
      isTyping: false,
      now,
      userId: "user-2",
      username: "ogi_uat",
    });

    assert.deepEqual(getMobileDMConversationTypingMap(state, now), {});
  });

  it("lists every typist in a group conversation", () => {
    const now = 1_000;
    let state = createInitialMobileChannelTypingState();
    for (const [userId, username] of [
      ["user-2", "ogi_uat"],
      ["user-3", "merve.kaya"],
    ]) {
      state = applyMobileChannelTypingUpdate(state, {
        channelId: "dm-group",
        isTyping: true,
        now,
        userId: userId!,
        username: username!,
      });
    }

    assert.deepEqual(getMobileDMConversationTypingMap(state, now), {
      "dm-group": ["merve.kaya", "ogi_uat"],
    });
  });
});
