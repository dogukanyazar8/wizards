import { ChannelType, prisma } from "@wizards/db";
import { AccessToken, RoomServiceClient, TrackSource } from "livekit-server-sdk";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ApiError } from "@/lib/api";
import { assertUnblockedDMParticipants } from "@/lib/dm/blocking";
import { assertVoiceChannelCapacity } from "@/lib/voice/capacity";
import { resolveVoiceParticipantLimit } from "@/lib/voice/capacity";
import { requireChannelPermissionForUser } from "@/lib/workspace/permission-service";
import { hasPermission, PermissionBits } from "@/lib/workspace/permissions";
import type { CreateLiveKitTokenBody, LiveKitTokenResponse } from "./types";
import { resolveLiveKitRtcUrl, parseLiveKitRtcRegionEndpoints } from "./rtc-regions";

export { resolveLiveKitRtcUrl } from "./rtc-regions";

const LIVEKIT_TOKEN_TTL = "1h";
const ALLOWED_PUBLISH_SOURCES = [
  TrackSource.MICROPHONE,
  TrackSource.CAMERA,
  TrackSource.SCREEN_SHARE,
  TrackSource.SCREEN_SHARE_AUDIO,
] as const;
const WORKSPACE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../..");

let liveKitEnvLoaded = false;
let liveKitRoomServiceClientCache: {
  apiKey: string;
  apiSecret: string;
  client: RoomServiceClient;
  serviceUrl: string;
} | null = null;

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
      (rawValue.startsWith('"') && rawValue.endsWith('"')) ||
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
  const url = process.env.NEXT_PUBLIC_LIVEKIT_URL?.trim() || process.env.LIVEKIT_URL?.trim();

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
  const serviceUrl = getLiveKitServiceUrl();

  if (
    liveKitRoomServiceClientCache?.apiKey === apiKey &&
    liveKitRoomServiceClientCache.apiSecret === apiSecret &&
    liveKitRoomServiceClientCache.serviceUrl === serviceUrl
  ) {
    return liveKitRoomServiceClientCache.client;
  }

  const client = new RoomServiceClient(serviceUrl, apiKey, apiSecret);
  liveKitRoomServiceClientCache = {
    apiKey,
    apiSecret,
    client,
    serviceUrl,
  };

  return client;
}

async function resolveVoiceRoomName(userId: string, channelId: string) {
  const { channel, permissions } = await requireChannelPermissionForUser(
    userId,
    channelId,
    PermissionBits.CONNECT_VOICE,
    {
      forbiddenMessage: "You do not have access to this voice channel",
      lockedCode: "VOICE_CHANNEL_LOCKED",
      lockedMessage: "You do not have access to this locked voice channel",
      requiredType: ChannelType.VOICE,
      respectLocked: true,
    },
  );

  const roomName = `voice:${channel.id}`;
  await assertVoiceChannelCapacity({
    channelId: channel.id,
    userId,
    userLimit: channel.userLimit,
  });

  return {
    mediaPolicy: {
      audioBitrate: channel.bitrate,
      videoQualityMode: channel.videoQualityMode,
    },
    roomName,
    canStream: hasPermission(permissions, PermissionBits.STREAM),
    rtcRegion: channel.rtcRegion,
    userLimit: channel.userLimit,
  };
}

async function resolveDMRoomName(userId: string, conversationId: string) {
  const participants = await prisma.dMParticipant.findMany({
    where: { conversationId },
    select: { userId: true },
  });

  // A conversation with no participant rows is indistinguishable from a
  // missing conversation to this authorization boundary; the roster query is
  // therefore both the existence check and the access check.
  if (participants.length === 0) {
    throw new ApiError("Conversation not found", 404, "NOT_FOUND");
  }

  if (!participants.some((participant) => participant.userId === userId)) {
    throw new ApiError("You do not have access to this conversation", 403, "FORBIDDEN");
  }

  await assertUnblockedDMParticipants({
    blockedMessage: "You cannot join this DM call while a block is active",
    currentUserId: userId,
    participants,
  });

  return {
    mediaPolicy: { audioBitrate: 64_000, videoQualityMode: "AUTO" as const },
    roomName: `dm:${conversationId}`,
    canStream: true,
    rtcRegion: null,
    userLimit: 0,
  };
}

type VoiceRoomPolicyClient = {
  createRoom(options: {
    maxParticipants: number;
    name: string;
    emptyTimeout: number;
    departureTimeout: number;
  }): Promise<unknown>;
  listRooms(names: string[]): Promise<Array<{ name?: string }>>;
};

export async function ensureVoiceRoomParticipantLimit(args: {
  client: VoiceRoomPolicyClient;
  roomName: string;
  userLimit: number;
}) {
  const rooms = await args.client.listRooms([args.roomName]);
  if (rooms.length > 0) {
    return;
  }

  await args.client.createRoom({
    emptyTimeout: 300,
    departureTimeout: 20,
    maxParticipants: resolveVoiceParticipantLimit(args.userLimit),
    name: args.roomName,
  });
}

async function resolveLiveKitRoomTarget(userId: string, input: CreateLiveKitTokenBody) {
  if (input.channelId) {
    const target = await resolveVoiceRoomName(userId, input.channelId);
    await ensureVoiceRoomParticipantLimit({
      client: getLiveKitRoomServiceClient(),
      roomName: target.roomName,
      userLimit: target.userLimit,
    });
    return {
      ...target,
      url: resolveLiveKitRtcUrl(
        target.rtcRegion,
        getLiveKitUrl(),
        parseLiveKitRtcRegionEndpoints(),
      ),
    };
  }

  if (input.conversationId) {
    return { ...(await resolveDMRoomName(userId, input.conversationId)), url: getLiveKitUrl() };
  }

  throw new ApiError("Provide exactly one of channelId or conversationId.", 400);
}

export async function resolveLiveKitRoomName(userId: string, input: CreateLiveKitTokenBody) {
  const target = await resolveLiveKitRoomTarget(userId, input);
  return target.roomName;
}

export async function createLiveKitToken(
  userId: string,
  input: CreateLiveKitTokenBody,
): Promise<LiveKitTokenResponse> {
  const target = await resolveLiveKitRoomTarget(userId, input);
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      avatarUrl: true,
      deletedAt: true,
      displayName: true,
      emailVerified: true,
      isBanned: true,
      id: true,
      username: true,
    },
  });

  if (!user) {
    throw new ApiError("User not found", 404, "NOT_FOUND");
  }

  if (user.isBanned || user.deletedAt) {
    throw new ApiError("Your account has been suspended", 403, "ACCOUNT_SUSPENDED");
  }

  if (!user.emailVerified) {
    throw new ApiError("Email verification is required", 403, "EMAIL_VERIFICATION_REQUIRED");
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

  token.addGrant(buildLiveKitParticipantGrant(target.roomName, target.canStream));

  return {
    mediaPolicy: target.mediaPolicy,
    token: await token.toJwt(),
    url: target.url,
  };
}

export function buildLiveKitParticipantGrant(roomName: string, canStream = false) {
  return {
    room: roomName,
    roomJoin: true,
    canPublishSources: ALLOWED_PUBLISH_SOURCES.filter(
      (source) =>
        canStream ||
        roomName.startsWith("dm:") ||
        (source !== TrackSource.SCREEN_SHARE && source !== TrackSource.SCREEN_SHARE_AUDIO),
    ),
    canPublishData: true,
    canSubscribe: true,
  };
}

export async function updateLiveKitScreenSharePermission(
  channelId: string,
  userId: string,
  canStream: boolean,
  client: Pick<RoomServiceClient, "updateParticipant"> = getLiveKitRoomServiceClient(),
) {
  const grant = buildLiveKitParticipantGrant(`voice:${channelId}`, canStream);
  await client.updateParticipant(grant.room, userId, {
    permission: {
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
      canPublishSources: grant.canPublishSources,
    },
  });
}
