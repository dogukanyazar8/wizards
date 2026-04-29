import { ChannelType, prisma } from "@wizards/db";
import { AccessToken, RoomServiceClient } from "livekit-server-sdk";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ApiError } from "@/lib/api";
import type { CreateLiveKitTokenBody, LiveKitTokenResponse } from "./types";

const LIVEKIT_TOKEN_TTL = "1h";
const MAX_VOICE_PARTICIPANTS = 10;
const WORKSPACE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../..");

let liveKitEnvLoaded = false;

function loadEnvFallback(filePath: string) {
  const contents = readFileSync(filePath, "utf8");

  for (const rawLine of contents.split(/\r?\n/u)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex < 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    if (!key || process.env[key]) {
      continue;
    }

    const rawValue = line.slice(separatorIndex + 1).trim();
    const value =
      (rawValue.startsWith("\"") && rawValue.endsWith("\"")) ||
      (rawValue.startsWith("'") && rawValue.endsWith("'"))
        ? rawValue.slice(1, -1)
        : rawValue;

    process.env[key] = value;
  }
}

function ensureLiveKitEnv() {
  if (liveKitEnvLoaded) {
    return;
  }

  if (process.env.NODE_ENV !== "production") {
    try {
      process.loadEnvFile();
    } catch {
      // Ignore missing local env files and fall back to the workspace root.
    }

    if (
      !process.env.LIVEKIT_API_KEY ||
      !process.env.LIVEKIT_API_SECRET ||
      !process.env.LIVEKIT_URL ||
      !process.env.NEXT_PUBLIC_LIVEKIT_URL
    ) {
      try {
        process.loadEnvFile(resolve(WORKSPACE_ROOT, ".env"));
      } catch {
        // Shell-provided env vars are still valid if the workspace file is absent.
      }
    }

    if (
      !process.env.LIVEKIT_API_KEY ||
      !process.env.LIVEKIT_API_SECRET ||
      !process.env.LIVEKIT_URL ||
      !process.env.NEXT_PUBLIC_LIVEKIT_URL
    ) {
      try {
        loadEnvFallback(resolve(WORKSPACE_ROOT, ".env"));
      } catch {
        // Ignore missing workspace files; downstream validation will raise a typed API error.
      }
    }
  }

  liveKitEnvLoaded = true;
}

function getLiveKitUrl() {
  ensureLiveKitEnv();
  const url =
    process.env.NEXT_PUBLIC_LIVEKIT_URL?.trim() || process.env.LIVEKIT_URL?.trim();

  if (!url) {
    throw new ApiError("LiveKit URL is not configured", 500);
  }

  return url;
}

function getLiveKitCredentials() {
  ensureLiveKitEnv();
  const apiKey = process.env.LIVEKIT_API_KEY?.trim();
  const apiSecret = process.env.LIVEKIT_API_SECRET?.trim();

  if (!apiKey || !apiSecret) {
    throw new ApiError("LiveKit credentials are not configured", 500);
  }

  return { apiKey, apiSecret };
}

function getLiveKitServiceUrl() {
  ensureLiveKitEnv();
  const liveKitUrl = process.env.LIVEKIT_URL?.trim() || process.env.NEXT_PUBLIC_LIVEKIT_URL?.trim();

  if (!liveKitUrl) {
    throw new ApiError("LiveKit URL is not configured", 500);
  }

  if (liveKitUrl.startsWith("ws://")) {
    return `http://${liveKitUrl.slice("ws://".length)}`;
  }

  if (liveKitUrl.startsWith("wss://")) {
    return `https://${liveKitUrl.slice("wss://".length)}`;
  }

  return liveKitUrl;
}

export function getLiveKitRoomServiceClient() {
  const { apiKey, apiSecret } = getLiveKitCredentials();
  return new RoomServiceClient(getLiveKitServiceUrl(), apiKey, apiSecret);
}

async function resolveVoiceRoomName(userId: string, channelId: string) {
  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    select: {
      id: true,
      serverId: true,
      type: true,
    },
  });

  if (!channel?.serverId) {
    throw new ApiError("Channel not found", 404, "NOT_FOUND");
  }

  if (channel.type !== ChannelType.VOICE) {
    throw new ApiError("Channel is not a voice channel", 400, "INVALID_CHANNEL_TYPE");
  }

  const membership = await prisma.serverMember.findUnique({
    where: {
      userId_serverId: {
        userId,
        serverId: channel.serverId,
      },
    },
    select: { id: true },
  });

  if (!membership) {
    throw new ApiError("You do not have access to this channel", 403, "FORBIDDEN");
  }

  const roomName = `voice:${channel.id}`;
  const roomService = getLiveKitRoomServiceClient();
  const participants = await roomService.listParticipants(roomName).catch(() => []);
  const hasExistingParticipant = participants.some(
    (participant) => participant.identity === userId,
  );

  if (participants.length >= MAX_VOICE_PARTICIPANTS && !hasExistingParticipant) {
    throw new ApiError("Voice channel is full", 403, "ROOM_FULL");
  }

  return roomName;
}

async function resolveDMRoomName(userId: string, conversationId: string) {
  const conversation = await prisma.dMConversation.findUnique({
    where: { id: conversationId },
    select: { id: true },
  });

  if (!conversation) {
    throw new ApiError("Conversation not found", 404, "NOT_FOUND");
  }

  const participant = await prisma.dMParticipant.findUnique({
    where: {
      conversationId_userId: {
        conversationId,
        userId,
      },
    },
    select: { id: true },
  });

  if (!participant) {
    throw new ApiError("You do not have access to this conversation", 403, "FORBIDDEN");
  }

  return `dm:${conversation.id}`;
}

export async function resolveLiveKitRoomName(
  userId: string,
  input: CreateLiveKitTokenBody,
) {
  if (input.channelId) {
    return resolveVoiceRoomName(userId, input.channelId);
  }

  if (input.conversationId) {
    return resolveDMRoomName(userId, input.conversationId);
  }

  throw new ApiError("Provide exactly one of channelId or conversationId.", 400);
}

export async function createLiveKitToken(
  userId: string,
  input: CreateLiveKitTokenBody,
): Promise<LiveKitTokenResponse> {
  const roomName = await resolveLiveKitRoomName(userId, input);
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      avatarUrl: true,
      displayName: true,
      username: true,
    },
  });

  if (!user) {
    throw new ApiError("User not found", 404, "NOT_FOUND");
  }

  const { apiKey, apiSecret } = getLiveKitCredentials();
  const token = new AccessToken(apiKey, apiSecret, {
    identity: userId,
    metadata: JSON.stringify({
      avatarUrl: user.avatarUrl,
      displayName: user.displayName,
      username: user.username,
    }),
    name: user.displayName ?? user.username,
    ttl: LIVEKIT_TOKEN_TTL,
  });

  token.addGrant({
    room: roomName,
    roomJoin: true,
    canPublish: true,
    canPublishData: true,
    canSubscribe: true,
  });

  return {
    token: await token.toJwt(),
    url: getLiveKitUrl(),
  };
}
