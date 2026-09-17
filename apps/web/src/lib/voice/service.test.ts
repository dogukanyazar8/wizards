import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { prisma } from "@wizards/db";
import { ApiError } from "@/lib/api";
import { UNKNOWN_ATTRIBUTION } from "@/lib/analytics/client-attribution";
import { getSocketServer, setSocketServer } from "@/lib/socket/runtime";
import {
  assertVoiceChannelCapacity,
  resolveVoiceParticipantLimit,
  type VoiceCapacityDelegate,
} from "./capacity";
import * as voiceService from "./service";
import {
  acquireVoiceCleanupLock,
  acquireVoiceJoinLocks,
  buildVoiceStateDeleteWhere,
  canClearVoiceStateForSession,
  createVoiceStateUpdatePayload,
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

type Restore = () => void;

function patchMethod(target: object, key: string, value: unknown, restores: Restore[]) {
  const record = target as Record<string, unknown>;
  const original = record[key];
  record[key] = value;
  restores.push(() => {
    record[key] = original;
  });
}

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
  it("removes one user from Socket.IO, LiveKit, and persisted voice state", async () => {
    const detach = (
      voiceService as unknown as {
        detachUserFromVoiceSurface?: (
          userId: string,
          options: {
            dependencies: {
              clearState(userId: string): Promise<{
                channelId: string;
                serverId: string;
                sessionId: string;
                userId: string;
              } | null>;
              emitStateUpdate(input: unknown): Promise<void>;
              getIo(): {
                in(room: string): { fetchSockets(): Promise<unknown[]> };
              } | null;
              removeLiveKitParticipant(channelId: string, userId: string): Promise<void>;
            };
          },
        ) => Promise<unknown>;
      }
    ).detachUserFromVoiceSurface;

    assert.equal(typeof detach, "function");
    if (!detach) return;

    const calls: string[] = [];
    const voiceRooms = new Set(["channel-1", "channel-2"]);
    const socket = {
      data: { userId: "user-1", voiceRooms },
      async leave(room: string) {
        calls.push(`socket:${room}`);
      },
    };

    await detach("user-1", {
      dependencies: {
        async clearState(userId) {
          calls.push(`db:${userId}`);
          return {
            channelId: "channel-1",
            serverId: "server-1",
            sessionId: "session-1",
            userId,
          };
        },
        async emitStateUpdate() {
          calls.push("emit");
        },
        getIo() {
          return {
            in(room: string) {
              calls.push(`fetch:${room}`);
              return { fetchSockets: async () => [socket] };
            },
          };
        },
        async removeLiveKitParticipant(channelId, userId) {
          calls.push(`livekit:${channelId}:${userId}`);
        },
      },
    });

    assert.deepEqual(calls, [
      "db:user-1",
      "fetch:user:user-1",
      "socket:voice:channel-1",
      "livekit:channel-1:user-1",
      "emit",
    ]);
    assert.deepEqual([...voiceRooms], ["channel-2"]);
  });

  it("rejects an unauthorized heartbeat before refreshing persisted state", async () => {
    const restores: Restore[] = [];
    let updateCount = 0;
    let detachCount = 0;
    patchMethod(
      prisma.voiceState,
      "findUnique",
      async () => ({
        channelId: "channel-1",
        serverId: "server-1",
        sessionId: "session-1",
      }),
      restores,
    );
    patchMethod(
      prisma.voiceState,
      "updateMany",
      async () => {
        updateCount += 1;
        return { count: 1 };
      },
      restores,
    );

    resetVoiceCleanupLocalDebounceForTests();
    shouldAttemptVoiceCleanup(Date.now());

    try {
      const heartbeat = voiceService.heartbeatVoiceState as unknown as (
        userId: string,
        sessionId: string,
        attribution: typeof UNKNOWN_ATTRIBUTION,
        dependencies: {
          detachUser(userId: string, options: { expectedSessionId: string }): Promise<unknown>;
          requireMembership(
            userId: string,
            input: { channelId: string; serverId: string },
          ): Promise<unknown>;
        },
      ) => Promise<unknown>;

      await assert.rejects(
        () =>
          heartbeat("user-1", "session-1", UNKNOWN_ATTRIBUTION, {
            async detachUser() {
              detachCount += 1;
            },
            async requireMembership() {
              throw new ApiError("Voice permission revoked", 403, "FORBIDDEN");
            },
          }),
        (error) => {
          assert.ok(error instanceof ApiError);
          assert.equal(error.code, "FORBIDDEN");
          return true;
        },
      );

      assert.equal(updateCount, 0);
      assert.equal(detachCount, 1);
    } finally {
      for (const restore of restores.reverse()) restore();
      resetVoiceCleanupLocalDebounceForTests();
    }
  });

  for (const initialSelfDeaf of [false, true]) {
    it(`keeps repeated heartbeats silent and emits only deafen changes (initial ${initialSelfDeaf})`, async () => {
      const restores: Restore[] = [];
      const previousIo = getSocketServer();
      const events: Array<Parameters<typeof voiceService.emitVoiceStateUpdate>[0]> = [];
      let selfDeaf = initialSelfDeaf;
      let heartbeatWrites = 0;
      let membershipChecks = 0;
      patchMethod(
        prisma.voiceState,
        "findUnique",
        async () => ({
          channelId: "channel-1",
          serverId: "server-1",
          sessionId: "session-1",
          selfDeaf,
        }),
        restores,
      );
      patchMethod(
        prisma.voiceState,
        "updateMany",
        async ({
          where,
          data,
        }: {
          where: { userId: string; sessionId: string; selfDeaf?: { not: boolean } };
          data: { lastHeartbeat: Date; selfDeaf?: boolean };
        }) => {
          assert.equal(where.userId, "user-1");
          assert.equal(where.sessionId, "session-1");
          if (where.selfDeaf?.not === selfDeaf) return { count: 0 };
          assert.ok(data.lastHeartbeat instanceof Date);
          heartbeatWrites += 1;
          selfDeaf = data.selfDeaf ?? selfDeaf;
          return { count: 1 };
        },
        restores,
      );
      patchMethod(
        prisma.voiceState,
        "findMany",
        async () => {
          assert.fail("unchanged heartbeat must not rebuild and broadcast the participant roster");
        },
        restores,
      );
      setSocketServer({} as NonNullable<ReturnType<typeof getSocketServer>>);
      resetVoiceCleanupLocalDebounceForTests();
      shouldAttemptVoiceCleanup(Date.now());
      const dependencies = {
        async detachUser() {
          assert.fail("authorized session must remain connected");
        },
        async requireMembership() {
          membershipChecks += 1;
        },
        async emitStateUpdate(event: Parameters<typeof voiceService.emitVoiceStateUpdate>[0]) {
          events.push(event);
        },
      };

      try {
        for (let tick = 0; tick < 12; tick += 1) {
          await voiceService.heartbeatVoiceState(
            "user-1",
            {
              sessionId: "session-1",
              selfDeaf: initialSelfDeaf,
            },
            UNKNOWN_ATTRIBUTION,
            dependencies,
          );
        }
        assert.deepEqual(events, []);
        assert.equal(heartbeatWrites, 12);
        assert.equal(membershipChecks, 12);

        await voiceService.heartbeatVoiceState(
          "user-1",
          {
            sessionId: "session-1",
            selfDeaf: !initialSelfDeaf,
          },
          UNKNOWN_ATTRIBUTION,
          dependencies,
        );
        assert.deepEqual(events, [
          {
            action: "update",
            channelId: "channel-1",
            serverId: "server-1",
            userId: "user-1",
          },
        ]);
        assert.equal(selfDeaf, !initialSelfDeaf);

        await voiceService.heartbeatVoiceState(
          "user-1",
          {
            sessionId: "session-1",
            selfDeaf: !initialSelfDeaf,
          },
          UNKNOWN_ATTRIBUTION,
          dependencies,
        );
        await voiceService.heartbeatVoiceState(
          "user-1",
          "session-1",
          UNKNOWN_ATTRIBUTION,
          dependencies,
        );
        assert.equal(events.length, 1);
        assert.equal(heartbeatWrites, 15);
        assert.equal(membershipChecks, 15);

        await assert.rejects(
          voiceService.heartbeatVoiceState(
            "user-1",
            {
              sessionId: "stale-session",
              selfDeaf: initialSelfDeaf,
            },
            UNKNOWN_ATTRIBUTION,
            dependencies,
          ),
          (error: unknown) => error instanceof ApiError && error.code === "NOT_FOUND",
        );
        assert.equal(heartbeatWrites, 15);
        assert.equal(events.length, 1);
      } finally {
        setSocketServer(previousIo);
        for (const restore of restores.reverse()) restore();
        resetVoiceCleanupLocalDebounceForTests();
      }
    });
  }

  it("broadcasts both changes when opposing heartbeats read the same initial state", async () => {
    const restores: Restore[] = [];
    let selfDeaf = false;
    const broadcasts: boolean[] = [];
    const gates = [Promise.withResolvers<void>(), Promise.withResolvers<void>()];
    const reads = [Promise.withResolvers<void>(), Promise.withResolvers<void>()];
    let request = 0;
    patchMethod(
      prisma.voiceState,
      "findUnique",
      async () => ({
        channelId: "channel-1",
        serverId: "server-1",
        sessionId: "session-1",
        selfDeaf,
      }),
      restores,
    );
    patchMethod(
      prisma.voiceState,
      "update",
      async ({ data }: { data: { selfDeaf?: boolean } }) => {
        selfDeaf = data.selfDeaf ?? selfDeaf;
      },
      restores,
    );
    patchMethod(
      prisma.voiceState,
      "updateMany",
      async ({
        where,
        data,
      }: {
        where: { userId: string; sessionId: string; selfDeaf?: { not: boolean } };
        data: { selfDeaf?: boolean };
      }) => {
        assert.equal(where.userId, "user-1");
        assert.equal(where.sessionId, "session-1");
        if (where.selfDeaf?.not === selfDeaf) return { count: 0 };
        selfDeaf = data.selfDeaf ?? selfDeaf;
        return { count: 1 };
      },
      restores,
    );
    resetVoiceCleanupLocalDebounceForTests();
    shouldAttemptVoiceCleanup(Date.now());
    const dependencies = {
      async detachUser() {
        assert.fail("valid session");
      },
      async requireMembership() {
        const index = request++;
        reads[index]!.resolve();
        await gates[index]!.promise;
      },
      async emitStateUpdate() {
        broadcasts.push(selfDeaf);
      },
    };
    try {
      const first = voiceService.heartbeatVoiceState(
        "user-1",
        { sessionId: "session-1", selfDeaf: true },
        UNKNOWN_ATTRIBUTION,
        dependencies,
      );
      await reads[0]!.promise;
      const second = voiceService.heartbeatVoiceState(
        "user-1",
        { sessionId: "session-1", selfDeaf: false },
        UNKNOWN_ATTRIBUTION,
        dependencies,
      );
      await reads[1]!.promise;
      gates[0]!.resolve();
      await first;
      gates[1]!.resolve();
      await second;
      assert.equal(selfDeaf, false);
      assert.deepEqual(broadcasts, [true, false]);
    } finally {
      gates.forEach((gate) => gate.resolve());
      for (const restore of restores.reverse()) restore();
      resetVoiceCleanupLocalDebounceForTests();
    }
  });

  it("does not refresh or mutate a session replaced during heartbeat authorization", async () => {
    const restores: Restore[] = [];
    let activeSessionId = "session-1";
    let writes = 0;
    patchMethod(
      prisma.voiceState,
      "findUnique",
      async () => ({
        channelId: "channel-1",
        serverId: "server-1",
        sessionId: activeSessionId,
      }),
      restores,
    );
    patchMethod(
      prisma.voiceState,
      "updateMany",
      async ({ where }: { where: { sessionId?: string } }) => {
        if (where.sessionId && where.sessionId !== activeSessionId) return { count: 0 };
        writes += 1;
        return { count: 1 };
      },
      restores,
    );
    resetVoiceCleanupLocalDebounceForTests();
    shouldAttemptVoiceCleanup(Date.now());
    try {
      await assert.rejects(
        voiceService.heartbeatVoiceState(
          "user-1",
          {
            sessionId: "session-1",
            selfDeaf: true,
          },
          UNKNOWN_ATTRIBUTION,
          {
            async detachUser() {
              assert.fail("must not detach the replacement session");
            },
            async requireMembership() {
              activeSessionId = "replacement-session";
            },
            async emitStateUpdate() {
              assert.fail("stale heartbeat must not emit");
            },
          },
        ),
        (error: unknown) => error instanceof ApiError && error.code === "NOT_FOUND",
      );
      assert.equal(writes, 0);
    } finally {
      for (const restore of restores.reverse()) restore();
      resetVoiceCleanupLocalDebounceForTests();
    }
  });

  it("broadcasts metadata to the channel without reading or broadcasting friend presence", async () => {
    const restores: Restore[] = [];
    const previousIo = getSocketServer();
    const rooms: string[] = [];
    const events: Array<{ event: string; payload: unknown }> = [];
    let friendReads = 0;
    patchMethod(
      prisma.user,
      "findUnique",
      () => {
        friendReads += 1;
        throw new Error("metadata must not query the friend presence audience");
      },
      restores,
    );
    const io = {
      to(room: string) {
        rooms.push(room);
        return io;
      },
      emit(event: string, payload: unknown) {
        events.push({ event, payload });
      },
    };
    setSocketServer(io as unknown as NonNullable<ReturnType<typeof getSocketServer>>);
    const input = {
      action: "update" as const,
      channelId: "channel-1",
      serverId: "server-1",
      userId: "user-1",
      participants: [],
    };
    try {
      await voiceService.emitVoiceStateUpdate(input);
      assert.equal(friendReads, 0);
      assert.deepEqual(events, [{ event: "voice:state:update", payload: input }]);
      assert.deepEqual(rooms, ["voice-viewers:channel-1", "voice:channel-1"]);
    } finally {
      setSocketServer(previousIo);
      for (const restore of restores.reverse()) restore();
    }
  });

  it("keeps server scope on every voice-state realtime payload", () => {
    assert.deepEqual(
      createVoiceStateUpdatePayload({
        action: "join",
        channelId: "voice-1",
        participants: [
          {
            avatarUrl: null,
            displayName: "Ada",
            isDeafened: false,
            isScreenSharing: false,
            userId: "user-1",
            username: "ada",
          },
        ],
        serverId: "server-1",
        userId: "user-1",
      }),
      {
        action: "join",
        channelId: "voice-1",
        participants: [
          {
            avatarUrl: null,
            displayName: "Ada",
            isDeafened: false,
            isScreenSharing: false,
            screenShareViewerCount: 0,
            stream: null,
            userId: "user-1",
            username: "ada",
          },
        ],
        serverId: "server-1",
        userId: "user-1",
      },
    );
  });

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

  it("uses the channel participant limit without exceeding the system maximum", () => {
    assert.equal(resolveVoiceParticipantLimit(0), MAX_VOICE_PARTICIPANTS);
    assert.equal(resolveVoiceParticipantLimit(3), 3);
    assert.equal(resolveVoiceParticipantLimit(99), MAX_VOICE_PARTICIPANTS);
  });

  it("rejects only new joins after a channel limit is lowered", async () => {
    await assert.rejects(
      () =>
        assertVoiceChannelCapacity({
          channelId: "channel-1",
          userId: "new-user",
          userLimit: 3,
          voiceState: {
            async count() {
              return 3;
            },
          },
        }),
      (error) => error instanceof ApiError && error.code === "ROOM_FULL",
    );

    await assert.doesNotReject(() =>
      assertVoiceChannelCapacity({
        channelId: "channel-1",
        userId: "already-connected",
        userLimit: 3,
        voiceState: {
          async count() {
            return 2;
          },
        },
      }),
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
