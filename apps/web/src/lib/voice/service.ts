import { randomUUID } from "node:crypto";
import { ChannelType, prisma } from "@wizards/db";
import { ApiError } from "@/lib/api";
import { getLiveKitRoomServiceClient } from "@/lib/livekit/server";
import { getRedis } from "@/lib/redis";
import { getSocketServer } from "@/lib/socket/runtime";
import { getVoiceScreenShareStateKey } from "@/lib/voice/screen-share-state";
import {
  MAX_VOICE_PARTICIPANTS,
  VOICE_HEARTBEAT_TIMEOUT_MS,
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

async function ensureNotServerBanned(userId: string, serverId: string) {
  const ban = await prisma.serverBan.findUnique({
    where: {
      serverId_userId: {
        serverId,
        userId,
      },
    },
    select: { id: true },
  });

  if (ban) {
    throw new ApiError("You are banned from this server", 403, "SERVER_BANNED");
  }
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
  const channel = await prisma.channel.findUnique({
    where: { id: input.channelId },
    select: {
      id: true,
      serverId: true,
      type: true,
    },
  });

  if (!channel?.serverId) {
    throw new ApiError("Voice channel not found", 404, "NOT_FOUND");
  }

  if (channel.serverId !== input.serverId) {
    throw new ApiError("Voice channel does not belong to this server", 400, "INVALID_SERVER");
  }

  if (channel.type !== ChannelType.VOICE) {
    throw new ApiError("Channel is not a voice channel", 400, "INVALID_CHANNEL_TYPE");
  }

  const [membership, serverBan] = await Promise.all([
    prisma.serverMember.findUnique({
      where: {
        userId_serverId: {
          userId,
          serverId: input.serverId,
        },
      },
      select: { id: true },
    }),
    prisma.serverBan.findUnique({
      where: {
        serverId_userId: {
          serverId: input.serverId,
          userId,
        },
      },
      select: { id: true },
    }),
  ]);

  if (serverBan) {
    throw new ApiError("You are banned from this server", 403, "SERVER_BANNED");
  }

  if (!membership) {
    throw new ApiError("You are not a member of this server", 403, "FORBIDDEN");
  }

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
  io.to(`server:${args.serverId}`).emit("voice:state:update", {
    action: args.action,
    channelId: args.channelId,
    participants: mapSocketParticipants(participants),
    userId: args.userId,
  });
}

export async function listVoiceStatesForServer(
  userId: string,
  serverId: string,
): Promise<VoiceChannelStateDTO[]> {
  await maybeCleanupStaleVoiceStates();

  const membership = await prisma.serverMember.findUnique({
    where: {
      userId_serverId: {
        userId,
        serverId,
      },
    },
    select: { id: true },
  });

  if (!membership) {
    throw new ApiError("You are not a member of this server", 403, "FORBIDDEN");
  }

  await ensureNotServerBanned(userId, serverId);

  const states = await prisma.voiceState.findMany({
    where: { serverId },
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

export async function upsertVoiceState(
  userId: string,
  input: UpsertVoiceStateBody,
): Promise<VoiceStateMutationResponse> {
  await maybeCleanupStaleVoiceStates();
  const channel = await requireVoiceMembership(userId, input);
  const redis = getRedis();
  const lockKey = `voice:join:lock:${channel.id}`;
  const lockToken = randomUUID();
  const lockAcquired = await redis.set(lockKey, lockToken, "PX", 2000, "NX");

  if (!lockAcquired) {
    throw new ApiError("Voice channel is busy. Please try again.", 409, "CHANNEL_BUSY");
  }

  try {
    await enforceVoiceRoomCapacity(channel.id, userId);

    await prisma.$transaction(async (tx) => {
      await tx.voiceState.create({
        data: {
          channelId: channel.id,
          lastHeartbeat: new Date(),
          serverId: channel.serverId!,
          sessionId: input.sessionId,
          userId,
        },
      });
    });
  } finally {
    try {
      const currentToken = await redis.get(lockKey);
      if (currentToken === lockToken) {
        await redis.del(lockKey);
      }
    } catch {
      // Best-effort lock cleanup.
    }
  }

  const participants = await buildVoiceStateParticipantsForChannel(channel.id);
  return {
    channelId: channel.id,
    participants,
    serverId: channel.serverId!,
    sessionId: input.sessionId,
  };
}

export async function clearVoiceState(userId: string) {
  await maybeCleanupStaleVoiceStates();

  const existingState = await prisma.voiceState.findUnique({
    where: { userId },
    select: {
      channelId: true,
      serverId: true,
      sessionId: true,
      userId: true,
    },
  });

  if (!existingState) {
    return null;
  }

  await prisma.voiceState.delete({
    where: { userId },
  });

  await getRedis()
    .del(getVoiceScreenShareStateKey(existingState.channelId, userId))
    .catch(() => undefined);

  return existingState;
}

export async function heartbeatVoiceState(userId: string, sessionId: string) {
  await maybeCleanupStaleVoiceStates();

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

  return existingState;
}
