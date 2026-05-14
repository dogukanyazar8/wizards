import { randomUUID } from "node:crypto";
import type Redis from "ioredis";

import { ChannelType, prisma } from "@wizards/db";

import { ApiError } from "@/lib/api";
import { isActiveAuthUser } from "@/lib/auth/access";
import { readPresenceMap, type VisiblePresenceStatus } from "@/lib/presence";
import { checkRateLimit } from "@/lib/rate-limit";
import { filterUserIdsByChannelPermission, requireChannelPermissionForUser } from "@/lib/workspace/permission-service";
import { PermissionBits } from "@/lib/workspace/permissions";

const VOICE_INVITE_RATE_LIMIT = 12;
const VOICE_INVITE_RATE_WINDOW_SECONDS = 60;
export const VOICE_INVITE_TTL_MS = 60_000;
const VOICE_INVITE_KEY_PREFIX = "voice:invite:";

export type StoredVoiceInvite = {
  channelId: string;
  expiresAt: string;
  fromUserId: string;
  serverId: string;
  targetUserId: string;
};

export type VoiceInviteInput = {
  channelId: string;
  serverId: string;
  targetUserId: string;
};

export type VoiceInvitePayload = {
  channelId: string;
  channelName: string;
  createdAt: string;
  expiresAt: string;
  fromUser: {
    avatarUrl: string | null;
    displayName: string;
    id: string;
    username: string;
  };
  id: string;
  serverId: string;
  serverName: string;
};

export type VoiceInviteSendResult = {
  expiresAt: string;
  invite: VoiceInvitePayload;
  inviteId: string;
  targetUserId: string;
};

export function getVoiceInviteKey(inviteId: string) {
  return `${VOICE_INVITE_KEY_PREFIX}${inviteId}`;
}

export function parseStoredVoiceInvite(value: string | null): StoredVoiceInvite | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as Partial<StoredVoiceInvite>;
    if (
      typeof parsed.channelId === "string" &&
      typeof parsed.expiresAt === "string" &&
      typeof parsed.fromUserId === "string" &&
      typeof parsed.serverId === "string" &&
      typeof parsed.targetUserId === "string"
    ) {
      return {
        channelId: parsed.channelId,
        expiresAt: parsed.expiresAt,
        fromUserId: parsed.fromUserId,
        serverId: parsed.serverId,
        targetUserId: parsed.targetUserId,
      };
    }
  } catch {
    return null;
  }

  return null;
}

export function toVisiblePresenceStatus(status: string): VisiblePresenceStatus {
  if (status === "ONLINE" || status === "IDLE" || status === "DND" || status === "OFFLINE") {
    return status;
  }
  return "OFFLINE";
}

export async function createVoiceInvite({
  input,
  now = new Date(),
  rateRedis,
  redis,
  userId,
}: {
  input: VoiceInviteInput;
  now?: Date;
  rateRedis?: Redis;
  redis: Redis;
  userId: string;
}): Promise<VoiceInviteSendResult> {
  if (input.targetUserId === userId) {
    throw new ApiError("You cannot invite yourself to voice.", 400, "VOICE_INVITE_SELF");
  }

  const isAllowed = await checkRateLimit(
    rateRedis ?? redis,
    `rate:voice:invite:${userId}`,
    VOICE_INVITE_RATE_LIMIT,
    VOICE_INVITE_RATE_WINDOW_SECONDS,
  );
  if (!isAllowed) {
    throw new ApiError(
      "Too many voice invites. Please wait a moment before inviting again.",
      429,
      "VOICE_INVITE_RATE_LIMITED",
    );
  }

  await requireChannelPermissionForUser(userId, input.channelId, PermissionBits.CONNECT_VOICE, {
    forbiddenCode: "VOICE_INVITE_FORBIDDEN",
    forbiddenMessage: "You are not allowed to invite members to this voice channel.",
    lockedCode: "VOICE_INVITE_FORBIDDEN",
    lockedMessage: "You are not allowed to invite members to this locked voice channel.",
    requiredServerId: input.serverId,
    requiredType: ChannelType.VOICE,
    respectLocked: true,
  });

  const senderVoiceState = await prisma.voiceState.findUnique({
    select: { channelId: true, serverId: true },
    where: { userId },
  });
  if (!senderVoiceState || senderVoiceState.channelId !== input.channelId || senderVoiceState.serverId !== input.serverId) {
    throw new ApiError(
      "Join this voice channel before inviting members.",
      403,
      "VOICE_INVITE_SENDER_NOT_IN_CHANNEL",
    );
  }

  const [channel, sender, targetMember, targetVoiceState] = await Promise.all([
    prisma.channel.findFirst({
      select: {
        id: true,
        name: true,
        server: {
          select: { name: true },
        },
        serverId: true,
      },
      where: {
        id: input.channelId,
        serverId: input.serverId,
        type: ChannelType.VOICE,
      },
    }),
    prisma.user.findUnique({
      select: { avatarUrl: true, displayName: true, username: true },
      where: { id: userId },
    }),
    prisma.serverMember.findUnique({
      select: {
        user: {
          select: {
            customStatus: true,
            emailVerified: true,
            id: true,
            isBanned: true,
            status: true,
          },
        },
        userId: true,
      },
      where: {
        userId_serverId: {
          serverId: input.serverId,
          userId: input.targetUserId,
        },
      },
    }),
    prisma.voiceState.findUnique({
      select: { channelId: true },
      where: { userId: input.targetUserId },
    }),
  ]);

  if (!channel?.serverId || !channel.server) {
    throw new ApiError("Voice channel not found.", 404, "VOICE_CHANNEL_NOT_FOUND");
  }
  if (!sender) {
    throw new ApiError("Unable to load sender profile.", 404, "VOICE_INVITE_SENDER_NOT_FOUND");
  }
  if (!targetMember || !isActiveAuthUser(targetMember.user)) {
    throw new ApiError("This member cannot receive voice invites.", 404, "VOICE_INVITE_TARGET_NOT_FOUND");
  }
  if (targetVoiceState?.channelId === input.channelId) {
    throw new ApiError("This member is already in the voice channel.", 409, "VOICE_INVITE_TARGET_ALREADY_JOINED");
  }

  const permittedTargets = await filterUserIdsByChannelPermission(
    input.channelId,
    [input.targetUserId],
    PermissionBits.CONNECT_VOICE,
    { respectLocked: true },
  );
  if (permittedTargets.length === 0) {
    throw new ApiError(
      "This member does not have access to this voice channel.",
      403,
      "VOICE_INVITE_TARGET_FORBIDDEN",
    );
  }

  const targetPresence = await readPresenceMap(redis, [
    {
      customStatus: targetMember.user.customStatus,
      status: toVisiblePresenceStatus(targetMember.user.status),
      userId: input.targetUserId,
    },
  ]);
  if (targetPresence.get(input.targetUserId)?.status === "OFFLINE") {
    throw new ApiError("This member is currently offline.", 409, "VOICE_INVITE_TARGET_OFFLINE");
  }

  const expiresAt = new Date(now.getTime() + VOICE_INVITE_TTL_MS).toISOString();
  const inviteId = randomUUID();
  const invite: VoiceInvitePayload = {
    channelId: channel.id,
    channelName: channel.name,
    createdAt: now.toISOString(),
    expiresAt,
    fromUser: {
      avatarUrl: sender.avatarUrl,
      displayName: sender.displayName ?? sender.username,
      id: userId,
      username: sender.username,
    },
    id: inviteId,
    serverId: channel.serverId,
    serverName: channel.server.name,
  };

  const storedInvite: StoredVoiceInvite = {
    channelId: channel.id,
    expiresAt,
    fromUserId: userId,
    serverId: channel.serverId,
    targetUserId: input.targetUserId,
  };

  await redis.set(getVoiceInviteKey(inviteId), JSON.stringify(storedInvite), "PX", VOICE_INVITE_TTL_MS);

  return {
    expiresAt,
    invite,
    inviteId,
    targetUserId: input.targetUserId,
  };
}
