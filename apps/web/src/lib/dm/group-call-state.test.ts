import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  GROUP_CALL_STATE_TTL_MS,
  applyGroupCallJoin,
  applyGroupCallLeave,
  groupCallStateKey,
  joinGroupCall,
  parseGroupCallState,
  planGroupCallSignals,
  serializeGroupCallState,
  shouldRingParticipant,
  toGroupCallStateDTO,
  type StoredGroupCallState,
  type GroupCallStore,
} from "./group-call-state";

const STARTED_AT = new Date("2026-08-11T12:00:00.000Z");
const JOINED_AT = new Date("2026-08-11T12:00:30.000Z");

function stored(overrides: Partial<StoredGroupCallState> = {}): StoredGroupCallState {
  return {
    participants: [{ joinedAt: STARTED_AT.toISOString(), userId: "user-1" }],
    startedAt: STARTED_AT.toISOString(),
    video: false,
    ...overrides,
  };
}

describe("groupCallStateKey", () => {
  it("scopes the record to one conversation", () => {
    assert.equal(groupCallStateKey("conversation-1"), "dm:call:conversation-1");
  });
});

describe("applyGroupCallJoin", () => {
  it("creates the call when there is none", () => {
    const next = applyGroupCallJoin(null, { joinedAt: STARTED_AT, userId: "user-1", video: true });

    assert.deepEqual(next, {
      participants: [{ joinedAt: STARTED_AT.toISOString(), userId: "user-1" }],
      startedAt: STARTED_AT.toISOString(),
      video: true,
    });
  });

  it("adds a second participant to the call already running", () => {
    const next = applyGroupCallJoin(stored(), { joinedAt: JOINED_AT, userId: "user-2" });

    assert.deepEqual(next.participants, [
      { joinedAt: STARTED_AT.toISOString(), userId: "user-1" },
      { joinedAt: JOINED_AT.toISOString(), userId: "user-2" },
    ]);
    // D2's race rule: the second caller joins, they do not start a second room.
    assert.equal(next.startedAt, STARTED_AT.toISOString());
  });

  it("keeps a rejoining participant's original entry time", () => {
    // A reconnect is not a new arrival; resetting the clock would make the
    // roster reorder itself under a flaky connection.
    const next = applyGroupCallJoin(stored(), { joinedAt: JOINED_AT, userId: "user-1" });

    assert.deepEqual(next.participants, [{ joinedAt: STARTED_AT.toISOString(), userId: "user-1" }]);
  });

  it("upgrades a voice call to video but never downgrades it", () => {
    const upgraded = applyGroupCallJoin(stored(), {
      joinedAt: JOINED_AT,
      userId: "user-2",
      video: true,
    });
    assert.equal(upgraded.video, true);

    const stillVideo = applyGroupCallJoin(stored({ video: true }), {
      joinedAt: JOINED_AT,
      userId: "user-2",
      video: false,
    });
    // One person joining camera-off does not turn everybody else's call into a
    // voice call.
    assert.equal(stillVideo.video, true);
  });

  it("does not mutate the state it was handed", () => {
    const before = stored();
    applyGroupCallJoin(before, { joinedAt: JOINED_AT, userId: "user-2" });

    assert.equal(before.participants.length, 1);
  });
});

describe("group call store mutation", () => {
  it("keeps both participants when two joins race on the same initial snapshot", async () => {
    let state: StoredGroupCallState | null = null;
    let readCount = 0;
    let releaseReads: (() => void) | null = null;
    const bothReadsStarted = new Promise<void>((resolve) => {
      releaseReads = resolve;
    });
    const store = {
      async mutate(
        _conversationId: string,
        mutation:
          | { input: { joinedAt: Date; userId: string; video?: boolean }; type: "join" }
          | { type: "leave"; userId: string },
      ) {
        state =
          mutation.type === "join"
            ? applyGroupCallJoin(state, mutation.input)
            : applyGroupCallLeave(state, mutation.userId);
        return state;
      },
      async read() {
        const snapshot = state;
        readCount += 1;
        if (readCount === 2) {
          releaseReads?.();
        }
        await bothReadsStarted;
        return snapshot;
      },
      async remove() {
        state = null;
      },
      async write(_conversationId: string, next: StoredGroupCallState) {
        state = next;
      },
    } as GroupCallStore & {
      mutate(
        conversationId: string,
        mutation:
          | { input: { joinedAt: Date; userId: string; video?: boolean }; type: "join" }
          | { type: "leave"; userId: string },
      ): Promise<StoredGroupCallState | null>;
    };

    await Promise.all([
      joinGroupCall("conversation-1", { joinedAt: STARTED_AT, userId: "user-1" }, store),
      joinGroupCall("conversation-1", { joinedAt: JOINED_AT, userId: "user-2" }, store),
    ]);

    const finalState = state as StoredGroupCallState | null;
    assert.deepEqual(finalState?.participants, [
      { joinedAt: STARTED_AT.toISOString(), userId: "user-1" },
      { joinedAt: JOINED_AT.toISOString(), userId: "user-2" },
    ]);
  });
});

describe("applyGroupCallLeave", () => {
  it("removes the participant and keeps the call alive", () => {
    const next = applyGroupCallLeave(
      stored({
        participants: [
          { joinedAt: STARTED_AT.toISOString(), userId: "user-1" },
          { joinedAt: JOINED_AT.toISOString(), userId: "user-2" },
        ],
      }),
      "user-2",
    );

    assert.deepEqual(next?.participants, [
      { joinedAt: STARTED_AT.toISOString(), userId: "user-1" },
    ]);
  });

  it("ends the call when the last participant leaves", () => {
    assert.equal(applyGroupCallLeave(stored(), "user-1"), null);
  });

  it("is a no-op for somebody who was never in the call", () => {
    const before = stored();

    assert.deepEqual(applyGroupCallLeave(before, "user-9"), before);
  });

  it("handles a leave with no call at all", () => {
    assert.equal(applyGroupCallLeave(null, "user-1"), null);
  });
});

describe("toGroupCallStateDTO", () => {
  it("describes a running call", () => {
    assert.deepEqual(toGroupCallStateDTO("conversation-1", stored()), {
      active: true,
      conversationId: "conversation-1",
      participants: [{ joinedAt: STARTED_AT.toISOString(), userId: "user-1" }],
      startedAt: STARTED_AT.toISOString(),
      video: false,
    });
  });

  it("describes the end of a call as an empty, inactive state", () => {
    // The tombstone matters: a client that only ever sees `active: true` never
    // learns the call finished.
    assert.deepEqual(toGroupCallStateDTO("conversation-1", null), {
      active: false,
      conversationId: "conversation-1",
      participants: [],
      startedAt: null,
      video: false,
    });
  });
});

describe("serializeGroupCallState / parseGroupCallState", () => {
  it("round-trips", () => {
    assert.deepEqual(parseGroupCallState(serializeGroupCallState(stored())), stored());
  });

  it("treats a missing record as no call", () => {
    assert.equal(parseGroupCallState(null), null);
  });

  it("treats a corrupt record as no call rather than throwing", () => {
    // A parse error inside a socket handler would take the whole call signal
    // down; a forgotten call is recoverable by hanging up.
    assert.equal(parseGroupCallState("{not json"), null);
    assert.equal(parseGroupCallState('{"participants":"nope"}'), null);
  });
});

describe("shouldRingParticipant", () => {
  const inCall = stored({
    participants: [
      { joinedAt: STARTED_AT.toISOString(), userId: "user-1" },
      { joinedAt: JOINED_AT.toISOString(), userId: "user-2" },
    ],
  });

  it("rings a member who is notified and not already in the call", () => {
    assert.equal(shouldRingParticipant({ notifyLevel: "ALL", userId: "user-3" }, inCall), true);
  });

  it("rings a member on the mentions tier", () => {
    // Only NONE is silence; MENTIONS still means "reach me for real things".
    assert.equal(
      shouldRingParticipant({ notifyLevel: "MENTIONS", userId: "user-3" }, inCall),
      true,
    );
  });

  it("does not ring a member whose notifications are off", () => {
    // E5. They still receive `dm:call:state` and see the call in the list.
    assert.equal(shouldRingParticipant({ notifyLevel: "NONE", userId: "user-3" }, inCall), false);
  });

  it("does not ring somebody already in the call", () => {
    assert.equal(shouldRingParticipant({ notifyLevel: "ALL", userId: "user-2" }, inCall), false);
  });

  it("rings everybody eligible when no call exists yet", () => {
    assert.equal(shouldRingParticipant({ notifyLevel: "ALL", userId: "user-3" }, null), true);
  });
});

describe("planGroupCallSignals", () => {
  const roster = [
    { notifyLevel: "ALL" as const, userId: "user-1" },
    { notifyLevel: "ALL" as const, userId: "user-2" },
    { notifyLevel: "NONE" as const, userId: "user-3" },
    { notifyLevel: "MENTIONS" as const, userId: "user-4" },
  ];

  it("sends the state to every member, caller included", () => {
    // 2d's "çağrı sürüyor" badge is drawn by people who are not in the call, so
    // the state cannot be scoped to the participants.
    const plan = planGroupCallSignals("user-1", roster, null);

    assert.deepEqual(plan.stateUserIds, ["user-1", "user-2", "user-3", "user-4"]);
  });

  it("rings everybody except the caller and the silenced member", () => {
    const plan = planGroupCallSignals("user-1", roster, null);

    assert.deepEqual(plan.ringUserIds, ["user-2", "user-4"]);
  });

  it("does not ring the people already inside the call", () => {
    const plan = planGroupCallSignals(
      "user-1",
      roster,
      stored({
        participants: [
          { joinedAt: STARTED_AT.toISOString(), userId: "user-1" },
          { joinedAt: JOINED_AT.toISOString(), userId: "user-2" },
        ],
      }),
    );

    assert.deepEqual(plan.ringUserIds, ["user-4"]);
    // The state still reaches them: their own roster has to gain the new name.
    assert.deepEqual(plan.stateUserIds, ["user-1", "user-2", "user-3", "user-4"]);
  });

  it("still tells the silenced member the call is happening", () => {
    // E5 is about the ring, not about visibility.
    const plan = planGroupCallSignals("user-1", roster, null);

    assert.equal(plan.stateUserIds.includes("user-3"), true);
    assert.equal(plan.ringUserIds.includes("user-3"), false);
  });
});

describe("GROUP_CALL_STATE_TTL_MS", () => {
  it("outlives the ring window so an unanswered call is not forgotten mid-ring", () => {
    assert.ok(GROUP_CALL_STATE_TTL_MS > 45_000);
  });
});
