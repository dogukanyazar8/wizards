import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildVoiceStateDeleteWhere,
  canClearVoiceStateForSession,
  getVoiceJoinLockSpecs,
} from "./service";

describe("voice service concurrency helpers", () => {
  it("uses a per-user join lock before the channel capacity lock", () => {
    const locks = getVoiceJoinLockSpecs({
      channelId: "channel-1",
      userId: "user-1",
    });

    assert.deepEqual(
      locks.map((lock) => lock.key),
      ["voice:join:lock:user:user-1", "voice:join:lock:channel-1"],
    );
  });

  it("keeps the channel lock key stable for rolling deploy capacity checks", () => {
    const [, channelLock] = getVoiceJoinLockSpecs({
      channelId: "voice-channel",
      userId: "user-1",
    });

    assert.equal(channelLock?.key, "voice:join:lock:voice-channel");
  });

  it("rejects stale leave requests from older voice sessions", () => {
    assert.equal(
      canClearVoiceStateForSession({
        expectedSessionId: "old-session",
        sessionId: "new-session",
      }),
      false,
    );
    assert.equal(
      canClearVoiceStateForSession({
        expectedSessionId: "active-session",
        sessionId: "active-session",
      }),
      true,
    );
    assert.equal(
      canClearVoiceStateForSession({
        sessionId: "active-session",
      }),
      true,
    );
  });

  it("adds sessionId to the delete predicate when a session is expected", () => {
    assert.deepEqual(
      buildVoiceStateDeleteWhere({
        expectedSessionId: "session-1",
        id: "voice-state-1",
      }),
      {
        id: "voice-state-1",
        sessionId: "session-1",
      },
    );
    assert.deepEqual(
      buildVoiceStateDeleteWhere({
        id: "voice-state-1",
      }),
      {
        id: "voice-state-1",
      },
    );
  });
});
