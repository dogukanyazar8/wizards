import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assertVoiceChannelCapacity, type VoiceCapacityDelegate } from "./capacity";
import {
  acquireVoiceCleanupLock,
  acquireVoiceJoinLocks,
  buildVoiceStateDeleteWhere,
  canClearVoiceStateForSession,
  getVoiceJoinLockSpecs,
  resetVoiceCleanupLocalDebounceForTests,
  releaseVoiceJoinLocks,
  releaseVoiceCleanupLock,
  runBoundedVoiceStateCleanup,
  runVoiceStateClearMutation,
  runVoiceStateUpsertMutation,
  shouldAttemptVoiceCleanup,
  VOICE_CLEANUP_LOCK_KEY,
} from "./service";
import { MAX_VOICE_PARTICIPANTS } from "./types";

type UpsertMutationInput = Parameters<typeof runVoiceStateUpsertMutation>[0];
type VoiceStateUpsertCall = Parameters<UpsertMutationInput["tx"]["voiceState"]["upsert"]>[0];
type ExistingVoiceState = Awaited<
  ReturnType<UpsertMutationInput["tx"]["voiceState"]["findUnique"]>
>;

type ClearMutationInput = Parameters<typeof runVoiceStateClearMutation>[0];
type VoiceStateClearRecord = Awaited<ReturnType<ClearMutationInput["voiceState"]["findUnique"]>>;
type VoiceStateDeleteManyCall = Parameters<ClearMutationInput["voiceState"]["deleteMany"]>[0];
type VoiceCapacityCountCall = Parameters<VoiceCapacityDelegate["count"]>[0];

class MemoryVoiceJoinRedis {
  readonly evalCalls: Array<{
    key: string;
    keyCount: number;
    token: string;
  }> = [];
  readonly getCalls: string[] = [];
  readonly values = new Map<string, string>();

  constructor(entries: Array<[string, string]> = []) {
    for (const [key, value] of entries) {
      this.values.set(key, value);
    }
  }

  async del(key: string) {
    return this.values.delete(key) ? 1 : 0;
  }

  async eval(_script: string, keyCount: number, key: string, token: string) {
    this.evalCalls.push({ key, keyCount, token });
    if (this.values.get(key) !== token) {
      return 0;
    }

    return this.del(key);
  }

  async get(key: string) {
    this.getCalls.push(key);
    return this.values.get(key) ?? null;
  }

  async set(key: string, value: string) {
    if (this.values.has(key)) {
      return null;
    }
    this.values.set(key, value);
    return "OK";
  }
}

function createVoiceStateUpsertTx(existingState: ExistingVoiceState) {
  const upsertCalls: VoiceStateUpsertCall[] = [];
  const tx: UpsertMutationInput["tx"] = {
    voiceState: {
      async findUnique() {
        return existingState;
      },
      async upsert(args) {
        upsertCalls.push(args);
      },
    },
  };

  return { tx, upsertCalls };
}

function createVoiceStateClearDelegate(existingState: VoiceStateClearRecord, deleteCount: number) {
  const deleteManyCalls: VoiceStateDeleteManyCall[] = [];
  const voiceState: ClearMutationInput["voiceState"] = {
    async deleteMany(args) {
      deleteManyCalls.push(args);
      return { count: deleteCount };
    },
    async findUnique() {
      return existingState;
    },
  };

  return { deleteManyCalls, voiceState };
}

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

  it("checks voice capacity from voice state while excluding the current user", async () => {
    const countCalls: VoiceCapacityCountCall[] = [];
    const voiceState: VoiceCapacityDelegate = {
      async count(args) {
        countCalls.push(args);
        return MAX_VOICE_PARTICIPANTS - 1;
      },
    };

    await assertVoiceChannelCapacity({
      channelId: "channel-1",
      userId: "user-1",
      voiceState,
    });

    assert.deepEqual(countCalls, [
      {
        where: {
          channelId: "channel-1",
          NOT: { userId: "user-1" },
        },
      },
    ]);
  });

  it("rejects a voice join when the channel already has the maximum other participants", async () => {
    await assert.rejects(
      () =>
        assertVoiceChannelCapacity({
          channelId: "channel-1",
          userId: "user-1",
          voiceState: {
            async count() {
              return MAX_VOICE_PARTICIPANTS;
            },
          },
        }),
      (error) => {
        assert.ok(error instanceof Error);
        assert.equal(error.message, "Voice channel is full");
        assert.equal("code" in error ? error.code : undefined, "ROOM_FULL");
        return true;
      },
    );
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

  it("releases the per-user lock when channel capacity lock acquisition fails", async () => {
    const redis = new MemoryVoiceJoinRedis([["voice:join:lock:channel-1", "other-token"]]);
    const locks = getVoiceJoinLockSpecs({
      channelId: "channel-1",
      userId: "user-1",
    });

    await assert.rejects(
      () => acquireVoiceJoinLocks(redis, locks, "request-token"),
      (error) => {
        assert.ok(error instanceof Error);
        assert.equal(error.message, "Voice channel is busy. Please try again.");
        return true;
      },
    );

    assert.equal(await redis.get("voice:join:lock:user:user-1"), null);
    assert.deepEqual(redis.evalCalls, [
      {
        key: "voice:join:lock:user:user-1",
        keyCount: 1,
        token: "request-token",
      },
    ]);
  });

  it("rejects rapid double-join before taking the channel lock", async () => {
    const redis = new MemoryVoiceJoinRedis([["voice:join:lock:user:user-1", "other-token"]]);
    const locks = getVoiceJoinLockSpecs({
      channelId: "channel-1",
      userId: "user-1",
    });

    await assert.rejects(
      () => acquireVoiceJoinLocks(redis, locks, "request-token"),
      (error) => {
        assert.ok(error instanceof Error);
        assert.equal(error.message, "Voice session is busy. Please try again.");
        return true;
      },
    );

    assert.equal(await redis.get("voice:join:lock:channel-1"), null);
    assert.deepEqual(redis.evalCalls, []);
  });

  it("releases join locks with atomic compare-and-delete", async () => {
    const redis = new MemoryVoiceJoinRedis([
      ["voice:join:lock:user:user-1", "request-token"],
      ["voice:join:lock:channel-1", "new-owner-token"],
    ]);

    await releaseVoiceJoinLocks(
      redis,
      ["voice:join:lock:user:user-1", "voice:join:lock:channel-1"],
      "request-token",
    );

    assert.equal(await redis.get("voice:join:lock:user:user-1"), null);
    assert.equal(await redis.get("voice:join:lock:channel-1"), "new-owner-token");
    assert.deepEqual(redis.evalCalls, [
      {
        key: "voice:join:lock:channel-1",
        keyCount: 1,
        token: "request-token",
      },
      {
        key: "voice:join:lock:user:user-1",
        keyCount: 1,
        token: "request-token",
      },
    ]);
  });

  it("upserts over an existing voice state and resets re-join session fields", async () => {
    const now = new Date("2026-05-12T10:00:00.000Z");
    const existingState = {
      channelId: "old-channel",
      serverId: "server-1",
      sessionId: "old-session",
    };
    const { tx, upsertCalls } = createVoiceStateUpsertTx(existingState);

    const result = await runVoiceStateUpsertMutation({
      channel: {
        id: "new-channel",
        serverId: "server-1",
      },
      input: {
        channelId: "new-channel",
        serverId: "server-1",
        sessionId: "11111111-1111-4111-8111-111111111111",
      },
      now,
      tx,
      userId: "user-1",
    });

    assert.deepEqual(result.replacedState, existingState);
    assert.equal(result.shouldStartVoiceUsageSession, true);
    assert.equal(upsertCalls.length, 1);
    assert.equal(upsertCalls[0]?.where.userId, "user-1");
    assert.equal(upsertCalls[0]?.create.userId, "user-1");
    assert.equal(upsertCalls[0]?.update.channelId, "new-channel");
    assert.equal(upsertCalls[0]?.update.joinedAt, now);
    assert.equal(upsertCalls[0]?.update.sessionId, "11111111-1111-4111-8111-111111111111");
  });

  it("does not restart analytics for an idempotent same-session rejoin", async () => {
    const now = new Date("2026-05-12T10:00:00.000Z");
    const { tx, upsertCalls } = createVoiceStateUpsertTx({
      channelId: "channel-1",
      serverId: "server-1",
      sessionId: "11111111-1111-4111-8111-111111111111",
    });

    const result = await runVoiceStateUpsertMutation({
      channel: {
        id: "channel-1",
        serverId: "server-1",
      },
      input: {
        channelId: "channel-1",
        serverId: "server-1",
        sessionId: "11111111-1111-4111-8111-111111111111",
      },
      now,
      tx,
      userId: "user-1",
    });

    assert.equal(result.replacedState, null);
    assert.equal(result.shouldStartVoiceUsageSession, false);
    assert.equal(upsertCalls.length, 1);
    assert.equal("joinedAt" in upsertCalls[0]!.update, false);
  });

  it("ignores stale clear requests without deleting the active session", async () => {
    const { deleteManyCalls, voiceState } = createVoiceStateClearDelegate(
      {
        channelId: "channel-1",
        id: "voice-state-1",
        serverId: "server-1",
        sessionId: "new-session",
        userId: "user-1",
      },
      1,
    );

    const result = await runVoiceStateClearMutation({
      expectedSessionId: "old-session",
      userId: "user-1",
      voiceState,
    });

    assert.equal(result, null);
    assert.deepEqual(deleteManyCalls, []);
  });

  it("treats a concurrent delete race as a no-op", async () => {
    const { deleteManyCalls, voiceState } = createVoiceStateClearDelegate(
      {
        channelId: "channel-1",
        id: "voice-state-1",
        serverId: "server-1",
        sessionId: "session-1",
        userId: "user-1",
      },
      0,
    );

    const result = await runVoiceStateClearMutation({
      expectedSessionId: "session-1",
      userId: "user-1",
      voiceState,
    });

    assert.equal(result, null);
    assert.deepEqual(deleteManyCalls, [
      {
        where: {
          id: "voice-state-1",
          sessionId: "session-1",
        },
      },
    ]);
  });

  it("bounds stale cleanup work per run and reports remaining work", async () => {
    const staleBatches = [
      [
        {
          channelId: "channel-1",
          serverId: "server-1",
          sessionId: "session-1",
          userId: "user-1",
        },
        {
          channelId: "channel-1",
          serverId: "server-1",
          sessionId: "session-2",
          userId: "user-2",
        },
      ],
      [
        {
          channelId: "channel-2",
          serverId: "server-1",
          sessionId: "session-3",
          userId: "user-3",
        },
        {
          channelId: "channel-2",
          serverId: "server-1",
          sessionId: "session-4",
          userId: "user-4",
        },
      ],
      [
        {
          channelId: "channel-3",
          serverId: "server-1",
          sessionId: "session-5",
          userId: "user-5",
        },
      ],
    ];
    const handledUserIds: string[] = [];

    const result = await runBoundedVoiceStateCleanup({
      batchSize: 2,
      deleteBatch: async () => staleBatches.shift() ?? [],
      handleDeletedBatch: async (states) => {
        handledUserIds.push(...states.map((state) => state.userId));
      },
      maxBatches: 2,
    });

    assert.deepEqual(result, {
      batches: 2,
      deletedStates: 4,
      hasMore: true,
    });
    assert.deepEqual(handledUserIds, ["user-1", "user-2", "user-3", "user-4"]);
    assert.equal(staleBatches.length, 1);
  });

  it("releases only the matching stale cleanup lock token", async () => {
    const redis = new MemoryVoiceJoinRedis();

    assert.equal(await acquireVoiceCleanupLock(redis, "token-1"), true);
    assert.equal(await acquireVoiceCleanupLock(redis, "token-2"), false);
    assert.equal(await redis.get(VOICE_CLEANUP_LOCK_KEY), "token-1");

    await releaseVoiceCleanupLock(redis, "token-2");
    assert.equal(await redis.get(VOICE_CLEANUP_LOCK_KEY), "token-1");

    await releaseVoiceCleanupLock(redis, "token-1");
    assert.equal(await redis.get(VOICE_CLEANUP_LOCK_KEY), null);
    assert.deepEqual(redis.evalCalls.slice(-2), [
      {
        key: VOICE_CLEANUP_LOCK_KEY,
        keyCount: 1,
        token: "token-2",
      },
      {
        key: VOICE_CLEANUP_LOCK_KEY,
        keyCount: 1,
        token: "token-1",
      },
    ]);
  });

  it("locally debounces stale cleanup attempts before touching Redis", () => {
    resetVoiceCleanupLocalDebounceForTests();

    assert.equal(shouldAttemptVoiceCleanup(10_000), true);
    assert.equal(shouldAttemptVoiceCleanup(10_001), false);
    assert.equal(shouldAttemptVoiceCleanup(14_999), false);
    assert.equal(shouldAttemptVoiceCleanup(15_000), true);

    resetVoiceCleanupLocalDebounceForTests();
  });
});
