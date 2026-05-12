import { randomUUID } from "node:crypto";
import { ChannelType, prisma } from "@wizards/db";
import { ApiError } from "@/lib/api";
import {
  endAllMediaUsageSessionsForVoiceSession,
  endMediaUsageSession,
  logAnalyticsError,
  startMediaUsageSession,
} from "@/lib/analytics/service";
import { getLiveKitRoomServiceClient } from "@/lib/livekit/server";
import { getRedis } from "@/lib/redis";
import { getSocketServer } from "@/lib/socket/runtime";
import {
  filterUserIdsByChannelPermission,
  listChannelIdsForUserWithPermission,
  listUserIdsWithChannelPermission,
  requireChannelPermissionForUser,
} from "@/lib/workspace/permission-service";
import { PermissionBits } from "@/lib/workspace/permissions";
import { getVoiceScreenShareStateKey } from "@/lib/voice/screen-share-state";
import {
  MAX_VOICE_PARTICIPANTS,
  VOICE_HEARTBEAT_TIMEOUT_MS,
  type HeartbeatVoiceStateBody,
  type UpsertVoiceStateBody,
  type VoiceChannelStateDTO,
  type VoiceStateMutationResponse,
  type VoiceStateParticipantDTO,
} from "./types";

function getStaleVoiceHeartbeatCutoff() {
  return new Date(Date.now() - VOICE_HEARTBEAT_TIMEOUT_MS);
}

function getVoiceRoomName(channelId: string) {
  return `voice:${channelId}`;
}

const VOICE_CLEANUP_DEBOUNCE_KEY = "voice:cleanup:last";
const VOICE_CLEANUP_BATCH_SIZE = 100;
const VOICE_JOIN_LOCK_TTL_MS = 2000;

type VoiceJoinLockSpec = {
  key: string;
  message: string;
};

function isE2ETestMode() {
  return process.env.E2E_TEST_MODE === "true" && process.env.NODE_ENV !== "production";
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

export function buildVoiceStateDeleteWhere(args: {
  expectedSessionId?: string;
  id: string;
}) {
  return {
    id: args.id,
    ...(args.expectedSessionId ? { sessionId: args.expectedSessionId } : {}),
  };
}

export type VoiceJoinRedisClient = {
  del(key: string): Promise<unknown>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlMode: "PX", ttlMs: number, condition: "NX"): Promise<unknown>;
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

export async function cleanupStaleVoiceStates() {
  const cutoff = getStaleVoiceHeartbeatCutoff();

  while (true) {
    const staleStates = await prisma.voiceState.findMany({
      orderBy: {
        lastHeartbeat: "asc",
      },
      select: {
        channelId: true,
        serverId: true,
        sessionId: true,
        userId: true,
      },
      take: VOICE_CLEANUP_BATCH_SIZE,
      where: {
        lastHeartbeat: {
          lt: cutoff,
        },
      },
    });

    if (staleStates.length === 0) {
      return;
    }

    await prisma.voiceState.deleteMany({
      where: {
        userId: {
          in: staleStates.map((state) => state.userId),
        },
      },
    });

    await Promise.all(
      staleStates.map((state) =>
        endAllMediaUsageSessionsForVoiceSession(state.userId, state.sessionId).catch((error) => {
          logAnalyticsError("voice stale cleanup", error);
        }),
      ),
    );

    const redis = getRedis();
    await Promise.all(
      staleStates.map((state) =>
        redis
          .del(getVoiceScreenShareStateKey(state.channelId, state.userId))
          .catch(() => undefined),
      ),
    );

    const channelsToRefresh = new Map<string, (typeof staleStates)[number]>();

    for (const state of staleStates) {
      const key = `${state.serverId}:${state.channelId}`;
      if (!channelsToRefresh.has(key)) {
        channelsToRefresh.set(key, state);
      }
    }

    await Promise.all(
      [...channelsToRefresh.values()].map((state) =>
        emitVoiceStateUpdate({
          action: "leave",
          channelId: state.channelId,
          serverId: state.serverId,
          userId: state.userId,
        }),
      ),
    );
  }
}

async function maybeCleanupStaleVoiceStates() {
  const redis = getRedis();

  try {
    const shouldRun = await redis.set(VOICE_CLEANUP_DEBOUNCE_KEY, "1", "EX", 60, "NX");
    if (!shouldRun) {
      return;
    }
  } catch {
    // Fall back to attempting cleanup if Redis is temporarily unavailable.
  }

  await cleanupStaleVoiceStates();
}

async function requireVoiceMembership(userId: string, input: {
  channelId: string;
  serverId: string;
}) {
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
            ...states.map((state) =>
              getVoiceScreenShareStateKey(channelId, state.user.id),
            ),
          )
          .catch(() => [])
      : [];

  return states.map((state, index) => ({
    userId: state.user.id,
    username: state.user.username,
    displayName: state.user.displayName,
    avatarUrl: state.user.avatarUrl,
    isScreenSharing: screenShareValues[index] === "1",
  }));
}

function mapSocketParticipants(participants: VoiceStateParticipantDTO[]) {
  return participants.map((participant) => ({
    userId: participant.userId,
    username: participant.username,
    displayName: participant.displayName,
    avatarUrl: participant.avatarUrl,
    isScreenSharing: participant.isScreenSharing === true,
  }));
}

export async function emitVoiceStateUpdate(args: {
  action: "join" | "leave";
  channelId: string;
  serverId: string;
  userId: string;
}) {
  const io = getSocketServer();
  if (!io) {
    return;
  }

  const participants = await buildVoiceStateParticipantsForChannel(args.channelId);
  const viewerUserIds = await listUserIdsWithChannelPermission(
    args.channelId,
    PermissionBits.VIEW_CHANNEL,
  );
  const payload = {
    action: args.action,
    channelId: args.channelId,
    participants: mapSocketParticipants(participants),
    userId: args.userId,
  };

  for (const viewerUserId of viewerUserIds) {
    io.to(`user:${viewerUserId}`).emit("voice:state:update", payload);
  }
}

export async function emitVoiceScreenShareUpdate(args: {
  channelId: string;
  isScreenSharing: boolean;
  userId: string;
}) {
  const io = getSocketServer();
  if (!io) {
    return;
  }

  const viewerUserIds = await listUserIdsWithChannelPermission(
    args.channelId,
    PermissionBits.VIEW_CHANNEL,
  );
  const payload = {
    channelId: args.channelId,
    isScreenSharing: args.isScreenSharing,
    userId: args.userId,
  };

  for (const viewerUserId of viewerUserIds) {
    io.to(`user:${viewerUserId}`).emit("voice:screenshare:update", payload);
  }
}

export async function disconnectUnauthorizedVoiceParticipants(channelId: string) {
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

  if (unauthorizedStates.length === 0) {
    return;
  }

  await prisma.voiceState.deleteMany({
    where: {
      channelId,
      userId: {
        in: unauthorizedStates.map((state) => state.userId),
      },
    },
  });

  await Promise.all(
    unauthorizedStates.map((state) =>
      endAllMediaUsageSessionsForVoiceSession(state.userId, state.sessionId).catch((error) => {
        logAnalyticsError("voice unauthorized cleanup", error);
      }),
    ),
  );

  const redis = getRedis();
  const roomService = getLiveKitRoomServiceClient();
  await Promise.all(
    unauthorizedStates.flatMap((state) => [
      redis
        .del(getVoiceScreenShareStateKey(state.channelId, state.userId))
        .catch(() => undefined),
      roomService.removeParticipant(getVoiceRoomName(state.channelId), state.userId)
        .catch(() => undefined),
    ]),
  );

  await Promise.all(
    unauthorizedStates.map((state) =>
      emitVoiceStateUpdate({
        action: "leave",
        channelId: state.channelId,
        serverId: state.serverId,
        userId: state.userId,
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
    orderBy: [
      { channelId: "asc" },
      { joinedAt: "asc" },
    ],
    select: {
      channelId: true,
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
            ...states.map((state) =>
              getVoiceScreenShareStateKey(state.channelId, state.user.id),
            ),
          )
          .catch(() => [])
      : [];

  const grouped = new Map<string, VoiceStateParticipantDTO[]>();
  for (const [index, state] of states.entries()) {
    const participants = grouped.get(state.channelId) ?? [];
    participants.push({
      userId: state.user.id,
      username: state.user.username,
      displayName: state.user.displayName,
      avatarUrl: state.user.avatarUrl,
      isScreenSharing: screenShareValues[index] === "1",
    });
    grouped.set(state.channelId, participants);
  }

  return [...grouped.entries()].map(([channelId, participants]) => ({
    channelId,
    participants,
  }));
}

async function enforceVoiceRoomCapacity(channelId: string, userId: string) {
  const roomService = getLiveKitRoomServiceClient();
  const participants = await roomService.listParticipants(getVoiceRoomName(channelId)).catch(() => []);
  const hasCurrentUser = participants.some((participant) => participant.identity === userId);

  if (participants.length > MAX_VOICE_PARTICIPANTS) {
    if (hasCurrentUser) {
      await roomService.removeParticipant(getVoiceRoomName(channelId), userId).catch(() => {
        // Ignore LiveKit cleanup failures; the route will still reject the join.
      });
    }
    throw new ApiError("Voice channel is full", 403, "ROOM_FULL");
  }

  if (participants.length === MAX_VOICE_PARTICIPANTS && !hasCurrentUser) {
    throw new ApiError("Voice channel is full", 403, "ROOM_FULL");
  }
}

export async function releaseVoiceJoinLocks(
  redis: VoiceJoinRedisClient,
  lockKeys: string[],
  lockToken: string,
) {
  for (const lockKey of [...lockKeys].reverse()) {
    try {
      const currentToken = await redis.get(lockKey);
      if (currentToken === lockToken) {
        await redis.del(lockKey);
      }
    } catch {
      // Best-effort lock cleanup.
    }
  }
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

  try {
    acquiredLockKeys = await acquireVoiceJoinLocks(redis, lockSpecs, lockToken);

    if (!isE2ETestMode()) {
      await enforceVoiceRoomCapacity(channel.id, userId);
    }

    const mutation = await prisma.$transaction((tx) =>
      runVoiceStateUpsertMutation({
        channel: {
          id: channel.id,
          serverId: channel.serverId!,
        },
        input,
        now,
        tx,
        userId,
      }),
    );
    replacedState = mutation.replacedState;
    shouldStartVoiceUsageSession = mutation.shouldStartVoiceUsageSession;
  } finally {
    await releaseVoiceJoinLocks(redis, acquiredLockKeys, lockToken);
  }

  if (replacedState) {
    await endAllMediaUsageSessionsForVoiceSession(userId, replacedState.sessionId).catch(
      (error) => {
        logAnalyticsError("voice session replace", error);
      },
    );
    await redis
      .del(getVoiceScreenShareStateKey(replacedState.channelId, userId))
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

  await endAllMediaUsageSessionsForVoiceSession(userId, existingState.sessionId).catch((error) => {
    logAnalyticsError("voice session end", error);
  });

  await getRedis()
    .del(getVoiceScreenShareStateKey(existingState.channelId, userId))
    .catch(() => undefined);

  if (options.removeLiveKitParticipant !== false) {
    await removeLiveKitVoiceParticipant(existingState.channelId, userId);
  }

  return existingState;
}

export async function heartbeatVoiceState(
  userId: string,
  input: HeartbeatVoiceStateBody | string,
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

  await prisma.voiceState.update({
    where: { userId },
    data: {
      lastHeartbeat: new Date(),
    },
  });

  if (typeof input !== "string" && input.selfVideo !== undefined) {
    const action = input.selfVideo ? startMediaUsageSession : endMediaUsageSession;
    await action({
      channelId: existingState.channelId,
      kind: "CAMERA",
      serverId: existingState.serverId,
      sessionId,
      userId,
    }).catch((error) => {
      logAnalyticsError("voice camera heartbeat", error);
    });
  }

  if (typeof input !== "string" && input.selfStream !== undefined) {
    const action = input.selfStream ? startMediaUsageSession : endMediaUsageSession;
    await action({
      channelId: existingState.channelId,
      kind: "SCREEN_SHARE",
      serverId: existingState.serverId,
      sessionId,
      userId,
    }).catch((error) => {
      logAnalyticsError("voice screen-share heartbeat", error);
    });
  }

  return existingState;
}
