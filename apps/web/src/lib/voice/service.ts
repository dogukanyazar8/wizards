import { randomUUID } from "node:crypto";
import { ScreenShareStreamInfoSchema, type ScreenShareStreamInfo } from "@wizards/types";
import { sanitizeGoLiveStream } from "@/lib/voice/go-live";
import { ChannelType, Prisma, prisma } from "@wizards/db";
import { ApiError } from "@/lib/api";
import {
  endAllMediaUsageSessionsForVoiceSession,
  endMediaUsageSession,
  logAnalyticsError,
  startMediaUsageSession,
} from "@/lib/analytics/service";
import type { ClientAttribution } from "@/lib/analytics/client-attribution";
import { broadcastVoiceRoomUpdateToFriends } from "@/lib/friends/service";
import {
  lockEventLiveChannel,
  publishEventLiveTransitions,
  syncAndPublishEventLiveStateForChannel,
  syncEventLiveStateForChannel,
  type EventLiveLifecycleTransaction,
} from "@/lib/events/live-lifecycle";
import { defaultEventRealtimePublisher } from "@/lib/events/realtime";
import { isExplicitE2ETestMode } from "@/lib/e2e/mode";
import {
  updateLiveKitScreenSharePermission,
  getLiveKitRoomServiceClient,
} from "@/lib/livekit/server";
import { logError } from "@/lib/logger";
import { getRedis } from "@/lib/redis";
import { getVoiceParticipantRoomName, getVoiceStateViewerRoomName } from "@/lib/socket/rooms";
import { getSocketServer } from "@/lib/socket/runtime";
import {
  filterUserIdsByChannelPermission,
  listChannelIdsForUserWithPermission,
  requireChannelPermissionForUser,
} from "@/lib/workspace/permission-service";
import { PermissionBits } from "@/lib/workspace/permissions";
import { assertVoiceChannelCapacity } from "@/lib/voice/capacity";
import {
  getVoiceScreenShareStateKey,
  getScreenShareWatchersKey,
  VOICE_SCREEN_SHARE_STATE_TTL_SECONDS,
} from "@/lib/voice/screen-share-state";
import {
  getStaleVoiceHeartbeatCutoff,
  type HeartbeatVoiceStateBody,
  type UpsertVoiceStateBody,
  type VoiceChannelStateDTO,
  type VoiceStateMutationResponse,
  type VoiceStateParticipantDTO,
} from "./types";

/** Re-exported so the callers that already read it here keep working (§6.6). */
export { getStaleVoiceHeartbeatCutoff };

export async function readVoiceScreenShareStreams(
  entries: readonly { channelId: string; userId: string }[],
): Promise<Array<ScreenShareStreamInfo | null>> {
  if (!entries.length) return [];
  try {
    const values = await getRedis().mget(
      ...entries.map(({ channelId, userId }) => `voice:screenshare:stream:${channelId}:${userId}`),
    );
    const streams = values.map((value) => {
      try {
        return ScreenShareStreamInfoSchema.safeParse(JSON.parse(value ?? "null")).data ?? null;
      } catch {
        return null;
      }
    });
    const userIds = [
      ...new Set(entries.flatMap((entry, index) => (streams[index]?.gameId ? [entry.userId] : []))),
    ];
    const settings = userIds.length
      ? await prisma.userSettings.findMany({
          where: { userId: { in: userIds } },
          select: { userId: true, showCurrentGame: true },
        })
      : [];
    const enabled = new Set(
      settings.filter((item) => item.showCurrentGame).map((item) => item.userId),
    );
    return entries.map((entry, index) =>
      sanitizeGoLiveStream(streams[index], enabled.has(entry.userId)),
    );
  } catch (error) {
    // Metadata failure must hide private game information without dropping the voice roster.
    logError("[voice] Screen-share metadata read failed", error);
    return entries.map(() => null);
  }
}

function getVoiceRoomName(channelId: string) {
  return `voice:${channelId}`;
}

async function reconcileEventLiveStateForChannel(channelId: string): Promise<void> {
  try {
    await syncAndPublishEventLiveStateForChannel(
      prisma,
      { channelId, now: new Date() },
      defaultEventRealtimePublisher,
    );
  } catch (error) {
    // Voice membership is already committed. Event projection failure must not
    // turn a successful join/leave into a misleading client error.
    logError("[voice] Event live-state reconciliation failed", error);
  }
}

const VOICE_CLEANUP_DEBOUNCE_KEY = "voice:cleanup:last";
export const VOICE_CLEANUP_LOCK_KEY = "voice:cleanup:lock";
const VOICE_CLEANUP_BATCH_SIZE = 100;
const VOICE_CLEANUP_MAX_BATCHES_PER_RUN = 5;
const VOICE_CLEANUP_DEBOUNCE_SECONDS = 60;
const VOICE_CLEANUP_LOCAL_ATTEMPT_INTERVAL_MS = 5_000;
const VOICE_CLEANUP_LOCK_TTL_MS = 30_000;
const VOICE_JOIN_LOCK_TTL_MS = 2000;
const RELEASE_REDIS_LOCK_SCRIPT = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("DEL", KEYS[1])
end
return 0
`;

type VoiceJoinLockSpec = {
  key: string;
  message: string;
};

type RedisLockReleaseClient = {
  eval(script: string, keyCount: number, key: string, token: string): Promise<unknown>;
};

function isE2ETestMode() {
  return isExplicitE2ETestMode({
    allowProductionBuild: process.env.E2E_ALLOW_PRODUCTION_BUILD,
    nodeEnv: process.env.NODE_ENV,
    testMode: process.env.E2E_TEST_MODE,
  });
}

export function getVoiceJoinLockSpecs(args: {
  channelId: string;
  userId: string;
}): VoiceJoinLockSpec[] {
  return [
    {
      key: `voice:join:lock:user:${args.userId}`,
      message: "Voice session is busy. Please try again.",
    },
    {
      key: `voice:join:lock:${args.channelId}`,
      message: "Voice channel is busy. Please try again.",
    },
  ];
}

export function canClearVoiceStateForSession(args: {
  expectedSessionId?: string;
  sessionId: string;
}) {
  return !args.expectedSessionId || args.sessionId === args.expectedSessionId;
}

export function buildVoiceStateDeleteWhere(args: { expectedSessionId?: string; id: string }) {
  return {
    id: args.id,
    ...(args.expectedSessionId ? { sessionId: args.expectedSessionId } : {}),
  };
}

export type VoiceJoinRedisClient = RedisLockReleaseClient & {
  set(key: string, value: string, ttlMode: "PX", ttlMs: number, condition: "NX"): Promise<unknown>;
};

export type VoiceCleanupRedisClient = RedisLockReleaseClient & {
  set(
    key: string,
    value: string,
    ttlMode: "EX",
    ttlSeconds: number,
    condition: "NX",
  ): Promise<unknown>;
  set(key: string, value: string, ttlMode: "PX", ttlMs: number, condition: "NX"): Promise<unknown>;
  status?: string;
};

type StaleVoiceStateRecord = {
  channelId: string;
  serverId: string;
  sessionId: string;
  userId: string;
};

export type VoiceCleanupResult = {
  batches: number;
  deletedStates: number;
  hasMore: boolean;
};

type VoiceStateUpsertRecord = {
  channelId: string;
  serverId: string;
  sessionId: string;
};

type VoiceStateUpsertTx = {
  voiceState: {
    findUnique(args: {
      select: { channelId: true; serverId: true; sessionId: true };
      where: { userId: string };
    }): Promise<VoiceStateUpsertRecord | null>;
    upsert(args: {
      create: {
        channelId: string;
        lastHeartbeat: Date;
        serverId: string;
        sessionId: string;
        userId: string;
      };
      update: {
        channelId: string;
        deaf: boolean;
        joinedAt?: Date;
        lastHeartbeat: Date;
        mute: boolean;
        requestToSpeakAt: null;
        selfDeaf: boolean;
        selfMute: boolean;
        selfStream: boolean;
        selfVideo: boolean;
        serverId: string;
        sessionId: string;
        suppress: boolean;
      };
      where: { userId: string };
    }): Promise<unknown>;
  };
};

type VoiceStateClearRecord = {
  channelId: string;
  id: string;
  serverId: string;
  sessionId: string;
  userId: string;
};

type VoiceStateClearDelegate = {
  deleteMany(args: { where: ReturnType<typeof buildVoiceStateDeleteWhere> }): Promise<{
    count: number;
  }>;
  findUnique(args: {
    select: {
      channelId: true;
      id: true;
      serverId: true;
      sessionId: true;
      userId: true;
    };
    where: { userId: string };
  }): Promise<VoiceStateClearRecord | null>;
};

export async function runVoiceStateUpsertMutation(args: {
  channel: {
    id: string;
    serverId: string;
  };
  input: UpsertVoiceStateBody;
  now: Date;
  tx: VoiceStateUpsertTx;
  userId: string;
}) {
  const existingState = await args.tx.voiceState.findUnique({
    where: { userId: args.userId },
    select: {
      channelId: true,
      serverId: true,
      sessionId: true,
    },
  });
  const replacesExistingSession =
    existingState !== null &&
    (existingState.channelId !== args.channel.id ||
      existingState.serverId !== args.channel.serverId ||
      existingState.sessionId !== args.input.sessionId);
  const updateData = {
    channelId: args.channel.id,
    deaf: false,
    ...(replacesExistingSession ? { joinedAt: args.now } : {}),
    lastHeartbeat: args.now,
    mute: false,
    requestToSpeakAt: null,
    selfDeaf: false,
    selfMute: false,
    selfStream: false,
    selfVideo: false,
    serverId: args.channel.serverId,
    sessionId: args.input.sessionId,
    suppress: false,
  };

  await args.tx.voiceState.upsert({
    create: {
      channelId: args.channel.id,
      lastHeartbeat: args.now,
      serverId: args.channel.serverId,
      sessionId: args.input.sessionId,
      userId: args.userId,
    },
    update: updateData,
    where: { userId: args.userId },
  });

  return {
    replacedState: replacesExistingSession ? existingState : null,
    shouldStartVoiceUsageSession: existingState === null || replacesExistingSession,
  };
}

export async function runLockedVoiceStateUpsertMutation(
  args: Parameters<typeof runVoiceStateUpsertMutation>[0] & {
    tx: VoiceStateUpsertTx & Pick<EventLiveLifecycleTransaction, "$queryRaw">;
  },
) {
  await lockEventLiveChannel(args.tx, args.channel.id);
  return runVoiceStateUpsertMutation(args);
}

export async function runVoiceStateClearMutation(args: {
  expectedSessionId?: string;
  userId: string;
  voiceState: VoiceStateClearDelegate;
}) {
  const existingState = await args.voiceState.findUnique({
    where: { userId: args.userId },
    select: {
      channelId: true,
      id: true,
      serverId: true,
      sessionId: true,
      userId: true,
    },
  });

  if (!existingState) {
    return null;
  }

  if (
    !canClearVoiceStateForSession({
      ...(args.expectedSessionId ? { expectedSessionId: args.expectedSessionId } : {}),
      sessionId: existingState.sessionId,
    })
  ) {
    return null;
  }

  const deleted = await args.voiceState.deleteMany({
    where: buildVoiceStateDeleteWhere({
      ...(args.expectedSessionId ? { expectedSessionId: args.expectedSessionId } : {}),
      id: existingState.id,
    }),
  });

  if (deleted.count === 0) {
    return null;
  }

  return existingState;
}

function normalizeVoiceCleanupLimit(value: number | undefined, fallback: number) {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : fallback;
}

export async function runBoundedVoiceStateCleanup(args: {
  batchSize?: number;
  deleteBatch: () => Promise<StaleVoiceStateRecord[]>;
  handleDeletedBatch: (states: StaleVoiceStateRecord[]) => Promise<void>;
  maxBatches?: number;
}): Promise<VoiceCleanupResult> {
  const batchSize = normalizeVoiceCleanupLimit(args.batchSize, VOICE_CLEANUP_BATCH_SIZE);
  const maxBatches = normalizeVoiceCleanupLimit(args.maxBatches, VOICE_CLEANUP_MAX_BATCHES_PER_RUN);
  let batches = 0;
  let deletedStates = 0;

  for (let batchIndex = 0; batchIndex < maxBatches; batchIndex += 1) {
    const staleStates = await args.deleteBatch();
    if (staleStates.length === 0) {
      return {
        batches,
        deletedStates,
        hasMore: false,
      };
    }

    batches += 1;
    deletedStates += staleStates.length;
    await args.handleDeletedBatch(staleStates);

    if (staleStates.length < batchSize) {
      return {
        batches,
        deletedStates,
        hasMore: false,
      };
    }
  }

  return {
    batches,
    deletedStates,
    hasMore: true,
  };
}

async function deleteStaleVoiceStateBatch(cutoff: Date, batchSize: number) {
  return prisma.$queryRaw<StaleVoiceStateRecord[]>(Prisma.sql`
    WITH stale_voice_states AS (
      SELECT "id"
      FROM "VoiceState"
      WHERE "lastHeartbeat" < ${cutoff}
      ORDER BY "lastHeartbeat" ASC
      LIMIT ${batchSize}
      FOR UPDATE SKIP LOCKED
    )
    DELETE FROM "VoiceState" vs
    USING stale_voice_states stale
    WHERE vs."id" = stale."id"
    RETURNING
      vs."channelId" AS "channelId",
      vs."serverId" AS "serverId",
      vs."sessionId" AS "sessionId",
      vs."userId" AS "userId"
  `);
}

async function handleDeletedStaleVoiceStates(staleStates: StaleVoiceStateRecord[]) {
  await Promise.all(
    staleStates.map((state) =>
      endAllMediaUsageSessionsForVoiceSession(state.userId, state.sessionId).catch((error) => {
        logAnalyticsError("voice stale cleanup", error);
      }),
    ),
  );

  const redis = getRedis();
  if (redis.status === "ready") {
    await Promise.all(
      staleStates.map((state) =>
        redis
          .del(
            getVoiceScreenShareStateKey(state.channelId, state.userId),
            `voice:screenshare:stream:${state.channelId}:${state.userId}`,
          )
          .catch(() => undefined),
      ),
    );
  }

  const channelsToRefresh = new Map<string, StaleVoiceStateRecord>();

  for (const state of staleStates) {
    const key = `${state.serverId}:${state.channelId}`;
    if (!channelsToRefresh.has(key)) {
      channelsToRefresh.set(key, state);
    }
  }

  await Promise.all(
    [...channelsToRefresh.values()].map((state) =>
      reconcileEventLiveStateForChannel(state.channelId).then(() =>
        emitVoiceStateUpdate({
          action: "leave",
          channelId: state.channelId,
          serverId: state.serverId,
          userId: state.userId,
        }).catch((error) => {
          logError("[voice] Stale voice cleanup emit failed", error);
        }),
      ),
    ),
  );
}

export async function cleanupStaleVoiceStates() {
  const cutoff = getStaleVoiceHeartbeatCutoff();

  return runBoundedVoiceStateCleanup({
    batchSize: VOICE_CLEANUP_BATCH_SIZE,
    deleteBatch: () => deleteStaleVoiceStateBatch(cutoff, VOICE_CLEANUP_BATCH_SIZE),
    handleDeletedBatch: handleDeletedStaleVoiceStates,
    maxBatches: VOICE_CLEANUP_MAX_BATCHES_PER_RUN,
  });
}

export async function acquireVoiceCleanupLock(redis: VoiceCleanupRedisClient, lockToken: string) {
  return Boolean(
    await redis.set(VOICE_CLEANUP_LOCK_KEY, lockToken, "PX", VOICE_CLEANUP_LOCK_TTL_MS, "NX"),
  );
}

export async function releaseVoiceCleanupLock(redis: RedisLockReleaseClient, lockToken: string) {
  try {
    await releaseRedisLock(redis, VOICE_CLEANUP_LOCK_KEY, lockToken);
  } catch {
    // Best-effort lock cleanup; the lock also has a short TTL.
  }
}

let nextVoiceCleanupAttemptAtMs = 0;

export function shouldAttemptVoiceCleanup(nowMs: number = Date.now()) {
  if (nowMs < nextVoiceCleanupAttemptAtMs) {
    return false;
  }

  nextVoiceCleanupAttemptAtMs = nowMs + VOICE_CLEANUP_LOCAL_ATTEMPT_INTERVAL_MS;
  return true;
}

export function resetVoiceCleanupLocalDebounceForTests() {
  nextVoiceCleanupAttemptAtMs = 0;
}

async function maybeCleanupStaleVoiceStates() {
  if (!shouldAttemptVoiceCleanup()) {
    return;
  }

  const redis = getRedis();
  if (redis.status !== "ready") {
    return;
  }

  const cleanupRedis = redis as VoiceCleanupRedisClient;
  const lockToken = randomUUID();
  let lockAcquired = false;

  try {
    lockAcquired = await acquireVoiceCleanupLock(cleanupRedis, lockToken);
    if (!lockAcquired) {
      return;
    }

    const shouldRun = await cleanupRedis.set(
      VOICE_CLEANUP_DEBOUNCE_KEY,
      "1",
      "EX",
      VOICE_CLEANUP_DEBOUNCE_SECONDS,
      "NX",
    );
    if (!shouldRun) {
      return;
    }

    const result = await cleanupStaleVoiceStates();
    if (result.hasMore) {
      logError("[voice] Stale voice cleanup reached per-run limit", result);
    }
  } catch (error) {
    logError("[voice] Stale voice cleanup failed", error);
  } finally {
    if (lockAcquired) {
      await releaseVoiceCleanupLock(cleanupRedis, lockToken);
    }
  }
}

async function requireVoiceMembership(
  userId: string,
  input: {
    channelId: string;
    serverId: string;
  },
) {
  const { channel } = await requireChannelPermissionForUser(
    userId,
    input.channelId,
    PermissionBits.CONNECT_VOICE,
    {
      forbiddenMessage: "You are not allowed to join this voice channel",
      lockedCode: "VOICE_CHANNEL_LOCKED",
      lockedMessage: "You are not allowed to join this locked voice channel",
      requiredServerId: input.serverId,
      requiredType: ChannelType.VOICE,
      respectLocked: true,
    },
  );

  return channel;
}

export async function buildVoiceStateParticipantsForChannel(
  channelId: string,
): Promise<VoiceStateParticipantDTO[]> {
  const states = await prisma.voiceState.findMany({
    where: { channelId },
    orderBy: {
      joinedAt: "asc",
    },
    select: {
      selfDeaf: true,
      user: {
        select: {
          avatarUrl: true,
          displayName: true,
          id: true,
          username: true,
        },
      },
    },
  });

  const redis = getRedis();
  const screenShareValues =
    states.length > 0
      ? await redis
          .mget(...states.map((state) => getVoiceScreenShareStateKey(channelId, state.user.id)))
          .catch(() => [])
      : [];

  const viewerCounts = await readScreenShareViewerCounts(
    states.map((state) => ({ channelId, userId: state.user.id })),
  );
  const streams = await readVoiceScreenShareStreams(
    states.map((state) => ({ channelId, userId: state.user.id })),
  );

  return states.map((state, index) => ({
    userId: state.user.id,
    username: state.user.username,
    displayName: state.user.displayName,
    avatarUrl: state.user.avatarUrl,
    isDeafened: state.selfDeaf,
    isScreenSharing: screenShareValues[index] === "1",
    stream: screenShareValues[index] === "1" ? (streams[index] ?? null) : null,
    screenShareViewerCount: screenShareValues[index] === "1" ? (viewerCounts[index] ?? 0) : 0,
  }));
}

function mapSocketParticipants(participants: VoiceStateParticipantDTO[]) {
  return participants.map((participant) => ({
    userId: participant.userId,
    username: participant.username,
    displayName: participant.displayName,
    avatarUrl: participant.avatarUrl,
    isDeafened: participant.isDeafened,
    isScreenSharing: participant.isScreenSharing === true,
    screenShareViewerCount: participant.screenShareViewerCount ?? 0,
    stream: participant.stream ?? null,
  }));
}

export function createVoiceStateUpdatePayload(args: {
  action: "join" | "leave" | "update";
  channelId: string;
  participants: VoiceStateParticipantDTO[];
  serverId: string;
  userId: string;
}) {
  return {
    action: args.action,
    channelId: args.channelId,
    participants: mapSocketParticipants(args.participants),
    serverId: args.serverId,
    userId: args.userId,
  };
}

export async function emitVoiceStateUpdate(args: {
  action: "join" | "leave" | "update";
  channelId: string;
  participants?: VoiceStateParticipantDTO[];
  serverId: string;
  userId: string;
}) {
  const io = getSocketServer();
  if (!io) {
    return;
  }

  const participants =
    args.participants ?? (await buildVoiceStateParticipantsForChannel(args.channelId));
  const payload = createVoiceStateUpdatePayload({ ...args, participants });

  io.to(getVoiceStateViewerRoomName(args.channelId))
    .to(getVoiceParticipantRoomName(args.channelId))
    .emit("voice:state:update", payload);

  // Metadata updates do not change which voice room friends should display.
  if (args.action === "update") {
    return;
  }

  // §2 "1a".5: the same fact, addressed to friends instead of channel watchers,
  // so the conversations strip can swap the presence dot for the wave tile.
  await broadcastVoiceRoomUpdateToFriends({
    action: args.action,
    channelId: args.channelId,
    serverId: args.serverId,
    userId: args.userId,
  }).catch((error: unknown) => {
    logError("[voice] friend voice-room broadcast failed", error);
  });
}

export async function emitVoiceScreenShareUpdate(args: {
  stream?: ScreenShareStreamInfo | null;
  channelId: string;
  isScreenSharing: boolean;
  serverId: string;
  userId: string;
}) {
  const io = getSocketServer();
  if (!io) {
    return;
  }

  const payload = {
    channelId: args.channelId,
    isScreenSharing: args.isScreenSharing,
    serverId: args.serverId,
    userId: args.userId,
    stream: args.isScreenSharing
      ? args.stream === undefined
        ? ((await readVoiceScreenShareStreams([args]))[0] ?? null)
        : sanitizeGoLiveStream(
            args.stream,
            (
              await prisma.userSettings.findUnique({
                where: { userId: args.userId },
                select: { showCurrentGame: true },
              })
            )?.showCurrentGame === true,
          )
      : null,
  };

  io.to(getVoiceStateViewerRoomName(args.channelId)).emit("voice:screenshare:update", payload);
}

export async function pruneUnauthorizedVoiceStateViewers(channelId: string) {
  const io = getSocketServer();
  if (!io) {
    return;
  }

  const room = getVoiceStateViewerRoomName(channelId);
  const sockets = await io.in(room).fetchSockets();
  const userIds = Array.from(
    new Set(
      sockets
        .map((socket) => socket.data.userId)
        .filter((userId): userId is string => typeof userId === "string"),
    ),
  );
  if (userIds.length === 0) {
    return;
  }

  const allowedUserIds = new Set(
    await filterUserIdsByChannelPermission(channelId, userIds, PermissionBits.VIEW_CHANNEL),
  );

  for (const socket of sockets) {
    const socketUserId = socket.data.userId;
    if (socketUserId && !allowedUserIds.has(socketUserId)) {
      await socket.leave(room);
    }
  }
}

export async function disconnectUnauthorizedVoiceParticipants(channelId: string) {
  await pruneUnauthorizedVoiceStateViewers(channelId);

  const states = await prisma.voiceState.findMany({
    where: { channelId },
    select: {
      channelId: true,
      serverId: true,
      sessionId: true,
      userId: true,
    },
  });

  if (states.length === 0) {
    return;
  }

  const allowedUserIds = new Set(
    await filterUserIdsByChannelPermission(
      channelId,
      states.map((state) => state.userId),
      PermissionBits.CONNECT_VOICE,
      { respectLocked: true },
    ),
  );
  const unauthorizedStates = states.filter((state) => !allowedUserIds.has(state.userId));
  const streamingUserIds = new Set(
    await filterUserIdsByChannelPermission(channelId, [...allowedUserIds], PermissionBits.STREAM),
  );
  await Promise.all(
    states
      .filter((state) => allowedUserIds.has(state.userId))
      .map(async (state) => {
        if (isE2ETestMode()) return;
        const canStream = streamingUserIds.has(state.userId);
        try {
          await updateLiveKitScreenSharePermission(channelId, state.userId, canStream);
        } catch (error) {
          // Fall back to participant removal; remote enforcement still requires a reachable SFU.
          logError("[voice] Media grant update failed; detaching participant", error);
          await detachUserFromVoiceSurface(state.userId, { expectedSessionId: state.sessionId });
          return;
        }
        if (!canStream) {
          await getRedis().del(
            getVoiceScreenShareStateKey(channelId, state.userId),
            `voice:screenshare:stream:${channelId}:${state.userId}`,
          );
          await clearScreenShareWatchers(channelId, state.userId);
          await emitVoiceScreenShareUpdate({
            channelId,
            serverId: state.serverId,
            userId: state.userId,
            isScreenSharing: false,
          });
        }
      }),
  );

  if (unauthorizedStates.length === 0) {
    return;
  }

  await Promise.all(
    unauthorizedStates.map((state) =>
      detachUserFromVoiceSurface(state.userId, {
        expectedSessionId: state.sessionId,
      }),
    ),
  );
}

export async function listVoiceStatesForServer(
  userId: string,
  serverId: string,
): Promise<VoiceChannelStateDTO[]> {
  await maybeCleanupStaleVoiceStates();
  const visibleVoiceChannelIds = await listChannelIdsForUserWithPermission(
    userId,
    serverId,
    PermissionBits.VIEW_CHANNEL,
    ChannelType.VOICE,
  );

  if (visibleVoiceChannelIds.length === 0) {
    return [];
  }

  const states = await prisma.voiceState.findMany({
    where: {
      channelId: { in: visibleVoiceChannelIds },
      serverId,
    },
    orderBy: [{ channelId: "asc" }, { joinedAt: "asc" }],
    select: {
      channelId: true,
      selfDeaf: true,
      user: {
        select: {
          avatarUrl: true,
          displayName: true,
          id: true,
          username: true,
        },
      },
    },
  });

  const redis = getRedis();
  const screenShareValues =
    states.length > 0
      ? await redis
          .mget(
            ...states.map((state) => getVoiceScreenShareStateKey(state.channelId, state.user.id)),
          )
          .catch(() => [])
      : [];

  const viewerCounts = await readScreenShareViewerCounts(
    states.map((state) => ({ channelId: state.channelId, userId: state.user.id })),
  );
  const streams = await readVoiceScreenShareStreams(
    states.map((state) => ({ channelId: state.channelId, userId: state.user.id })),
  );
  const grouped = new Map<string, VoiceStateParticipantDTO[]>();
  for (const [index, state] of states.entries()) {
    const participants = grouped.get(state.channelId) ?? [];
    participants.push({
      userId: state.user.id,
      username: state.user.username,
      displayName: state.user.displayName,
      avatarUrl: state.user.avatarUrl,
      isDeafened: state.selfDeaf,
      isScreenSharing: screenShareValues[index] === "1",
      stream: screenShareValues[index] === "1" ? (streams[index] ?? null) : null,
      screenShareViewerCount: screenShareValues[index] === "1" ? (viewerCounts[index] ?? 0) : 0,
    });
    grouped.set(state.channelId, participants);
  }

  return [...grouped.entries()].map(([channelId, participants]) => ({
    channelId,
    participants,
  }));
}

async function enforceVoiceRoomCapacity(channelId: string, userId: string, userLimit: number) {
  await assertVoiceChannelCapacity({ channelId, userId, userLimit });
}

export async function releaseVoiceJoinLocks(
  redis: VoiceJoinRedisClient,
  lockKeys: string[],
  lockToken: string,
) {
  for (const lockKey of [...lockKeys].reverse()) {
    try {
      await releaseRedisLock(redis, lockKey, lockToken);
    } catch {
      // Best-effort lock cleanup.
    }
  }
}

function releaseRedisLock(redis: RedisLockReleaseClient, lockKey: string, lockToken: string) {
  return redis.eval(RELEASE_REDIS_LOCK_SCRIPT, 1, lockKey, lockToken);
}

export async function acquireVoiceJoinLocks(
  redis: VoiceJoinRedisClient,
  lockSpecs: VoiceJoinLockSpec[],
  lockToken: string,
) {
  const acquiredLockKeys: string[] = [];

  try {
    for (const lockSpec of lockSpecs) {
      const lockAcquired = await redis.set(
        lockSpec.key,
        lockToken,
        "PX",
        VOICE_JOIN_LOCK_TTL_MS,
        "NX",
      );

      if (!lockAcquired) {
        throw new ApiError(lockSpec.message, 409, "CHANNEL_BUSY");
      }

      acquiredLockKeys.push(lockSpec.key);
    }
  } catch (error) {
    await releaseVoiceJoinLocks(redis, acquiredLockKeys, lockToken);
    throw error;
  }

  return acquiredLockKeys;
}

export async function upsertVoiceState(
  userId: string,
  input: UpsertVoiceStateBody,
  attribution: ClientAttribution,
): Promise<VoiceStateMutationResponse> {
  await maybeCleanupStaleVoiceStates();
  const channel = await requireVoiceMembership(userId, input);
  const now = new Date();
  const redis = getRedis();
  const lockSpecs = getVoiceJoinLockSpecs({ channelId: channel.id, userId });
  const lockToken = randomUUID();
  let acquiredLockKeys: string[] = [];
  type ReplacedVoiceState = {
    channelId: string;
    serverId: string;
    sessionId: string;
  };
  let replacedState: ReplacedVoiceState | null = null;
  let shouldStartVoiceUsageSession = true;
  let eventTransitions: Awaited<ReturnType<typeof syncEventLiveStateForChannel>> = [];

  try {
    acquiredLockKeys = await acquireVoiceJoinLocks(redis, lockSpecs, lockToken);

    if (!isE2ETestMode()) {
      await enforceVoiceRoomCapacity(channel.id, userId, channel.userLimit);
    }

    const mutation = await prisma.$transaction(async (tx) => {
      // Membership creation and every event reconciliation share this transaction lock.
      // A leave projection therefore cannot commit after this join without the join's
      // own reconciliation observing and repairing that final status.
      const mutation = await runLockedVoiceStateUpsertMutation({
        channel: {
          id: channel.id,
          serverId: channel.serverId!,
        },
        input,
        now,
        tx,
        userId,
      });
      const transitions = await syncEventLiveStateForChannel(tx, {
        channelId: channel.id,
        now,
      });
      return { ...mutation, transitions };
    });
    replacedState = mutation.replacedState;
    shouldStartVoiceUsageSession = mutation.shouldStartVoiceUsageSession;
    eventTransitions = mutation.transitions;
  } finally {
    await releaseVoiceJoinLocks(redis, acquiredLockKeys, lockToken);
  }

  if (replacedState && replacedState.channelId !== channel.id) {
    await reconcileEventLiveStateForChannel(replacedState.channelId);
  }
  publishEventLiveTransitions(eventTransitions, defaultEventRealtimePublisher);

  if (replacedState) {
    await endAllMediaUsageSessionsForVoiceSession(userId, replacedState.sessionId).catch(
      (error) => {
        logAnalyticsError("voice session replace", error);
      },
    );
    await redis
      .del(
        getVoiceScreenShareStateKey(replacedState.channelId, userId),
        `voice:screenshare:stream:${replacedState.channelId}:${userId}`,
      )
      .catch(() => undefined);
    if (replacedState.channelId !== channel.id) {
      await removeLiveKitVoiceParticipant(replacedState.channelId, userId);
      await emitVoiceStateUpdate({
        action: "leave",
        channelId: replacedState.channelId,
        serverId: replacedState.serverId,
        userId,
      });
    }
  }

  if (shouldStartVoiceUsageSession) {
    void startMediaUsageSession({
      attribution,
      channelId: channel.id,
      kind: "VOICE",
      serverId: channel.serverId!,
      sessionId: input.sessionId,
      userId,
    }).catch((error) => {
      logAnalyticsError("voice session start", error);
    });
  }

  const participants = await buildVoiceStateParticipantsForChannel(channel.id);
  return {
    channelId: channel.id,
    participants,
    serverId: channel.serverId!,
    sessionId: input.sessionId,
  };
}

export async function removeLiveKitVoiceParticipant(channelId: string, userId: string) {
  if (isE2ETestMode()) {
    return;
  }

  await getLiveKitRoomServiceClient()
    .removeParticipant(getVoiceRoomName(channelId), userId)
    .catch(() => undefined);
}

export async function clearVoiceState(
  userId: string,
  options: { expectedSessionId?: string; removeLiveKitParticipant?: boolean } = {},
) {
  await maybeCleanupStaleVoiceStates();

  const existingState = await runVoiceStateClearMutation({
    ...(options.expectedSessionId ? { expectedSessionId: options.expectedSessionId } : {}),
    userId,
    voiceState: prisma.voiceState,
  });

  if (!existingState) {
    return null;
  }

  await reconcileEventLiveStateForChannel(existingState.channelId);

  await endAllMediaUsageSessionsForVoiceSession(userId, existingState.sessionId).catch((error) => {
    logAnalyticsError("voice session end", error);
  });

  await getRedis()
    .del(
      getVoiceScreenShareStateKey(existingState.channelId, userId),
      `voice:screenshare:stream:${existingState.channelId}:${userId}`,
    )
    .catch(() => undefined);

  await clearScreenShareWatchers(existingState.channelId, userId);
  await removeScreenShareWatcher(existingState.channelId, userId);

  if (options.removeLiveKitParticipant !== false) {
    void removeLiveKitVoiceParticipant(existingState.channelId, userId).catch((error) => {
      logError("[voice] LiveKit participant cleanup failed after leave", error);
    });
  }

  return existingState;
}

type VoiceSurfaceSocket = {
  data: { voiceRooms?: Set<string> };
  leave(room: string): Promise<void> | void;
};

export type VoiceSurfaceDetachDependencies = {
  clearState(
    userId: string,
    options: { expectedSessionId?: string; removeLiveKitParticipant: false },
  ): Promise<VoiceStateClearRecord | null>;
  emitStateUpdate(args: {
    action: "leave";
    channelId: string;
    serverId: string;
    userId: string;
  }): Promise<void>;
  getIo(): {
    in(room: string): { fetchSockets(): Promise<VoiceSurfaceSocket[]> };
  } | null;
  removeLiveKitParticipant(channelId: string, userId: string): Promise<void>;
};

const voiceSurfaceDetachDefaults: VoiceSurfaceDetachDependencies = {
  clearState: (userId, options) => clearVoiceState(userId, options),
  emitStateUpdate: emitVoiceStateUpdate,
  getIo: getSocketServer,
  removeLiveKitParticipant: removeLiveKitVoiceParticipant,
};

/**
 * Voice membership ends as one operation. Keeping Socket.IO, LiveKit, and the
 * database in separate callers previously left one surface active after revocation.
 */
export async function detachUserFromVoiceSurface(
  userId: string,
  options: {
    dependencies?: VoiceSurfaceDetachDependencies;
    expectedSessionId?: string;
  } = {},
) {
  const dependencies = options.dependencies ?? voiceSurfaceDetachDefaults;
  const state = await dependencies.clearState(userId, {
    ...(options.expectedSessionId ? { expectedSessionId: options.expectedSessionId } : {}),
    removeLiveKitParticipant: false,
  });
  if (!state) {
    return null;
  }

  const io = dependencies.getIo();
  if (io) {
    const sockets = await io.in(`user:${userId}`).fetchSockets();
    const room = getVoiceParticipantRoomName(state.channelId);
    for (const socket of sockets) {
      await socket.leave(room);
      socket.data.voiceRooms?.delete(state.channelId);
    }
  }

  await dependencies.removeLiveKitParticipant(state.channelId, userId);
  await dependencies.emitStateUpdate({
    action: "leave",
    channelId: state.channelId,
    serverId: state.serverId,
    userId,
  });

  return state;
}

type VoiceHeartbeatDependencies = {
  detachUser(userId: string, options: { expectedSessionId: string }): Promise<unknown>;
  emitStateUpdate: typeof emitVoiceStateUpdate;
  requireMembership(
    userId: string,
    input: { channelId: string; serverId: string },
  ): Promise<unknown>;
};

const voiceHeartbeatDefaults: VoiceHeartbeatDependencies = {
  detachUser: (userId, options) => detachUserFromVoiceSurface(userId, options),
  emitStateUpdate: emitVoiceStateUpdate,
  requireMembership: requireVoiceMembership,
};

export async function heartbeatVoiceState(
  userId: string,
  input: HeartbeatVoiceStateBody | string,
  attribution: ClientAttribution,
  dependencies: VoiceHeartbeatDependencies = voiceHeartbeatDefaults,
) {
  await maybeCleanupStaleVoiceStates();
  const sessionId = typeof input === "string" ? input : input.sessionId;

  const existingState = await prisma.voiceState.findUnique({
    where: { userId },
    select: {
      channelId: true,
      serverId: true,
      sessionId: true,
    },
  });

  if (!existingState || existingState.sessionId !== sessionId) {
    throw new ApiError("Voice session not found", 404, "NOT_FOUND");
  }

  try {
    // Reuse the permission service's cache-aware gate. A matching session id
    // must not keep a revoked voice membership alive.
    await dependencies.requireMembership(userId, {
      channelId: existingState.channelId,
      serverId: existingState.serverId,
    });
  } catch (error) {
    await dependencies.detachUser(userId, { expectedSessionId: sessionId });
    throw error;
  }

  const where = { userId, sessionId };
  const lastHeartbeat = new Date();
  const selfDeaf = typeof input === "string" ? undefined : input.selfDeaf;
  // Detect the transition in the write itself: overlapping heartbeats must not
  // silently overwrite a change based on the earlier membership lookup.
  const changed =
    selfDeaf === undefined
      ? null
      : await prisma.voiceState.updateMany({
          where: { ...where, selfDeaf: { not: selfDeaf } },
          data: { lastHeartbeat, selfDeaf },
        });

  if (!changed?.count) {
    const refreshed = await prisma.voiceState.updateMany({
      where,
      data: { lastHeartbeat },
    });
    if (!refreshed.count) {
      throw new ApiError("Voice session not found", 404, "NOT_FOUND");
    }
  }

  if (changed?.count) {
    await dependencies.emitStateUpdate({
      action: "update",
      channelId: existingState.channelId,
      serverId: existingState.serverId,
      userId,
    });
  }

  if (typeof input !== "string" && input.selfVideo !== undefined) {
    // Opening a media session records the client; closing one reads it back off
    // the row, so only the start side carries attribution.
    const toggleCamera = input.selfVideo
      ? startMediaUsageSession({
          attribution,
          channelId: existingState.channelId,
          kind: "CAMERA",
          serverId: existingState.serverId,
          sessionId,
          userId,
        })
      : endMediaUsageSession({
          kind: "CAMERA",
          sessionId,
          userId,
        });

    await toggleCamera.catch((error) => {
      logAnalyticsError("voice camera heartbeat", error);
    });
  }

  const selfScreenShare =
    typeof input !== "string" ? (input.selfScreenShare ?? input.selfStream) : undefined;

  if (selfScreenShare !== undefined) {
    const redis = getRedis();
    const screenShareKey = getVoiceScreenShareStateKey(existingState.channelId, userId);
    const streamKey = `voice:screenshare:stream:${existingState.channelId}:${userId}`;

    if (selfScreenShare) {
      await redis
        .set(screenShareKey, "1", "EX", VOICE_SCREEN_SHARE_STATE_TTL_SECONDS)
        .catch(() => undefined);
      await redis.expire(streamKey, VOICE_SCREEN_SHARE_STATE_TTL_SECONDS).catch(() => undefined);
    } else {
      await redis.del(screenShareKey, streamKey).catch(() => undefined);
    }

    const toggleScreenShare = selfScreenShare
      ? startMediaUsageSession({
          attribution,
          channelId: existingState.channelId,
          kind: "SCREEN_SHARE",
          serverId: existingState.serverId,
          sessionId,
          userId,
        })
      : endMediaUsageSession({
          kind: "SCREEN_SHARE",
          sessionId,
          userId,
        });

    await toggleScreenShare.catch((error) => {
      logAnalyticsError("voice screen-share heartbeat", error);
    });

    await emitVoiceScreenShareUpdate({
      channelId: existingState.channelId,
      isScreenSharing: selfScreenShare,
      serverId: existingState.serverId,
      userId,
    }).catch((error) => {
      logError("[voice] Screen-share heartbeat emit failed", error);
    });
  }

  return existingState;
}

export async function emitScreenShareWatchers(channelId: string, sharerUserId: string) {
  const redis = getRedis();
  const key = getScreenShareWatchersKey(channelId, sharerUserId);
  const [count, sample] = await Promise.all([redis.scard(key), redis.srandmember(key, 5)]);
  getSocketServer()
    ?.to(getVoiceParticipantRoomName(channelId))
    .to(getVoiceStateViewerRoomName(channelId))
    .emit("voice:screenshare:watchers:update", { channelId, sharerUserId, count, sample });
}

export async function clearScreenShareWatchers(channelId: string, sharerUserId: string) {
  await getRedis().del(getScreenShareWatchersKey(channelId, sharerUserId));
  await emitScreenShareWatchers(channelId, sharerUserId);
}

export async function removeScreenShareWatcher(channelId: string, userId: string) {
  const participants = await prisma.voiceState.findMany({
    where: { channelId },
    select: { userId: true },
  });
  await Promise.all(
    participants.map(async (participant) => {
      const changed = await getRedis().srem(
        getScreenShareWatchersKey(channelId, participant.userId),
        userId,
      );
      if (changed) await emitScreenShareWatchers(channelId, participant.userId);
    }),
  );
}

async function readScreenShareViewerCounts(participants: { channelId: string; userId: string }[]) {
  if (!participants.length) return [];
  const pipeline = getRedis().pipeline();
  for (const participant of participants)
    pipeline.scard(getScreenShareWatchersKey(participant.channelId, participant.userId));
  const results = await pipeline.exec();
  return participants.map((_, index) => {
    const result = results?.[index];
    return result && !result[0] && typeof result[1] === "number" ? result[1] : 0;
  });
}
