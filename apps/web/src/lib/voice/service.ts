import { ChannelType, prisma } from "@wizards/db";
import { ApiError } from "@/lib/api";
import { getLiveKitRoomServiceClient } from "@/lib/livekit/server";
import { getSocketServer } from "@/lib/socket/runtime";
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

export async function cleanupStaleVoiceStates() {
  await prisma.voiceState.deleteMany({
    where: {
      lastHeartbeat: {
        lt: getStaleVoiceHeartbeatCutoff(),
      },
    },
  });
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

  const membership = await prisma.serverMember.findUnique({
    where: {
      userId_serverId: {
        userId,
        serverId: input.serverId,
      },
    },
    select: { id: true },
  });

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

  return states.map((state) => ({
    userId: state.user.id,
    username: state.user.username,
    displayName: state.user.displayName,
    avatarUrl: state.user.avatarUrl,
  }));
}

function mapSocketParticipants(participants: VoiceStateParticipantDTO[]) {
  return participants.map((participant) => ({
    userId: participant.userId,
    username: participant.username,
    avatarUrl: participant.avatarUrl,
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
  await cleanupStaleVoiceStates();

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

  const grouped = new Map<string, VoiceStateParticipantDTO[]>();
  for (const state of states) {
    const participants = grouped.get(state.channelId) ?? [];
    participants.push({
      userId: state.user.id,
      username: state.user.username,
      displayName: state.user.displayName,
      avatarUrl: state.user.avatarUrl,
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
  await cleanupStaleVoiceStates();
  const channel = await requireVoiceMembership(userId, input);
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

  const participants = await buildVoiceStateParticipantsForChannel(channel.id);
  return {
    channelId: channel.id,
    participants,
    serverId: channel.serverId!,
    sessionId: input.sessionId,
  };
}

export async function clearVoiceState(userId: string) {
  await cleanupStaleVoiceStates();

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

  return existingState;
}

export async function heartbeatVoiceState(userId: string, sessionId: string) {
  await cleanupStaleVoiceStates();

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
