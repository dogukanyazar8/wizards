import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyMobileChannelTypingUpdate,
  createInitialMobileChannelTypingState,
  formatMobileChannelTypingLabel,
  getVisibleMobileChannelTypingUsers,
  replaceMobileChannelTypingUsers,
} from "../src/realtime/mobile-typing-state";

describe("mobile typing state", () => {
  it("keeps channel typing users scoped, bounded, and hidden from the current user", () => {
    const initial = createInitialMobileChannelTypingState();
    const withCurrentUser = applyMobileChannelTypingUpdate(initial, {
      channelId: "channel-1",
      currentUserId: "user-1",
      isTyping: true,
      now: 1_000,
      userId: "user-1",
      username: "dogukan",
    });
    assert.deepEqual(getVisibleMobileChannelTypingUsers(withCurrentUser, "channel-1", 1_000), []);

    const withOtherUser = applyMobileChannelTypingUpdate(withCurrentUser, {
      channelId: "channel-1",
      currentUserId: "user-1",
      isTyping: true,
      now: 1_000,
      userId: "user-2",
      username: "ogi_uat",
    });
    assert.deepEqual(getVisibleMobileChannelTypingUsers(withOtherUser, "channel-1", 1_000), [
      { expiresAt: 4_500, name: "ogi_uat", userId: "user-2" },
    ]);
    assert.deepEqual(getVisibleMobileChannelTypingUsers(withOtherUser, "channel-2", 1_000), []);
  });

  it("expires stale typing users and formats a compact label", () => {
    const state = ["Mehmet", "Ece", "Selin"].reduce((current, username, index) => {
      return applyMobileChannelTypingUpdate(current, {
        channelId: "channel-1",
        currentUserId: "user-self",
        isTyping: true,
        now: 1_000,
        userId: `user-${index + 1}`,
        username,
      });
    }, createInitialMobileChannelTypingState());

    const visibleUsers = getVisibleMobileChannelTypingUsers(state, "channel-1", 3_000);
    assert.equal(formatMobileChannelTypingLabel(visibleUsers), "Ece, Mehmet ve 1 kişi yazıyor…");
    assert.deepEqual(getVisibleMobileChannelTypingUsers(state, "channel-1", 5_000), []);
  });

  it("replaces the channel typing list from the socket payload", () => {
    const state = replaceMobileChannelTypingUsers(createInitialMobileChannelTypingState(), {
      channelId: "channel-1",
      currentUserNames: ["dogukanyazar", "Dogukan"],
      now: 1_000,
      usernames: ["dogukanyazar", "Mehmet", "Mehmet", "Ece"],
    });

    assert.deepEqual(getVisibleMobileChannelTypingUsers(state, "channel-1", 1_000), [
      { expiresAt: 4_500, name: "Ece", userId: "typing:Ece" },
      { expiresAt: 4_500, name: "Mehmet", userId: "typing:Mehmet" },
    ]);

    const cleared = replaceMobileChannelTypingUsers(state, {
      channelId: "channel-1",
      now: 1_100,
      usernames: [],
    });
    assert.deepEqual(getVisibleMobileChannelTypingUsers(cleared, "channel-1", 1_100), []);
  });
});
