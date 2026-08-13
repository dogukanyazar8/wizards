import { ChannelType } from "@wizards/db";

import { ApiError } from "@/lib/api";
import { logAnalyticsError, setVoiceScreenShareUsage } from "@/lib/analytics/service";
import { UNKNOWN_ATTRIBUTION } from "@/lib/analytics/client-attribution";
import type { HandlerContext } from "@/lib/socket/context";
import { createSocketErrorEmitter, createVoiceInviteErrorEmitter } from "@/lib/socket/errors";
import {
  getVoiceParticipantRoomName,
  joinVoiceStateViewerRoomsForServer,
  leaveVoiceStateViewerRoomsForServer,
} from "@/lib/socket/rooms";
import {
  parseSocketPayload,
  SocketVoiceAudioLevelPayloadSchema,
  SocketVoiceChannelPayloadSchema,
  SocketVoiceInviteAcceptPayloadSchema,
  SocketVoiceInviteDeclinePayloadSchema,
  SocketVoiceInvitePayloadSchema,
  SocketVoiceScreenSharePayloadSchema,
  SocketVoiceStatesWatchPayloadSchema,
} from "@/lib/socket/schemas";
import {
  createVoiceInvite,
  getVoiceInviteKey,
  parseStoredVoiceInvite,
} from "@/lib/voice/invite-service";
import { emitVoiceScreenShareUpdate } from "@/lib/voice/service";
import {
  getVoiceScreenShareStateKey,
  VOICE_SCREEN_SHARE_STATE_TTL_SECONDS,
} from "@/lib/voice/screen-share-state";
import {
  listChannelIdsForUserWithPermission,
  requireChannelPermissionForUser,
} from "@/lib/workspace/permission-service";
import { PermissionBits } from "@/lib/workspace/permissions";
import { checkRateLimit } from "@/lib/rate-limit";

import type { SocketHandlerRegistration } from ".";

const VOICE_AUDIO_LEVEL_MIN_INTERVAL_MS = 40;
const VOICE_STATE_WATCH_RATE_LIMIT = 20;
const VOICE_SCREEN_SHARE_RATE_LIMIT = 10;
const VOICE_SOCKET_RATE_WINDOW_SECONDS = 10;

export async function runVoiceStatesWatch(input: {
  checkRateLimit(): Promise<boolean>;
  joinRooms(channelIds: string[]): Promise<void>;
  listChannelIds(): Promise<string[]>;
}) {
  if (!(await input.checkRateLimit())) return;
  await input.joinRooms(await input.listChannelIds());
}

export async function runVoiceScreenShareUpdate(input: {
  authorize(): Promise<void>;
  checkRateLimit(): Promise<boolean>;
  emit(): Promise<void>;
  readCurrentValue(): Promise<boolean>;
  recordUsage(): Promise<void>;
  value: boolean;
  writeValue(): Promise<void>;
}) {
  if (!(await input.checkRateLimit())) return;
  await input.authorize();
  if ((await input.readCurrentValue()) === input.value) return;
  await input.writeValue();
  await input.recordUsage();
  await input.emit();
}

export function registerVoiceHandlers(ctx: HandlerContext): SocketHandlerRegistration {
  const { io, rateRedis, redis, socket, userId } = ctx;
  const emitSocketError = createSocketErrorEmitter(socket);
  const emitVoiceInviteError = createVoiceInviteErrorEmitter(socket);

  socket.on("voice:join", async (rawData) => {
    try {
      const data = parseSocketPayload(SocketVoiceChannelPayloadSchema, rawData);
      await requireChannelPermissionForUser(userId, data.channelId, PermissionBits.CONNECT_VOICE, {
        forbiddenCode: "FORBIDDEN",
        forbiddenMessage: "You are not allowed to join this voice channel.",
        lockedCode: "VOICE_CHANNEL_LOCKED",
        lockedMessage: "You are not allowed to use this locked voice channel.",
        requiredServerId: data.serverId,
        requiredType: ChannelType.VOICE,
        respectLocked: true,
      });

      socket.join(getVoiceParticipantRoomName(data.channelId));
      socket.data.voiceRooms.add(data.channelId);
    } catch (error) {
      emitSocketError("VOICE_JOIN_ERROR", "Unable to join voice room.", error);
    }
  });

  socket.on("voice:leave", (rawData) => {
    try {
      const data = parseSocketPayload(SocketVoiceChannelPayloadSchema, rawData);
      socket.leave(getVoiceParticipantRoomName(data.channelId));
      socket.data.voiceRooms.delete(data.channelId);
    } catch (error) {
      emitSocketError("VALIDATION_ERROR", "Invalid voice room payload.", error);
    }
  });

  socket.on("voice:states:watch", async (rawData) => {
    try {
      const data = parseSocketPayload(SocketVoiceStatesWatchPayloadSchema, rawData);
      await runVoiceStatesWatch({
        checkRateLimit: () =>
          checkRateLimit(
            rateRedis,
            `rate:voice:states:watch:${userId}`,
            VOICE_STATE_WATCH_RATE_LIMIT,
            VOICE_SOCKET_RATE_WINDOW_SECONDS,
          ),
        joinRooms: (channelIds) =>
          joinVoiceStateViewerRoomsForServer(socket, data.serverId, channelIds),
        listChannelIds: () =>
          listChannelIdsForUserWithPermission(
            userId,
            data.serverId,
            PermissionBits.VIEW_CHANNEL,
            ChannelType.VOICE,
          ),
      });
    } catch (error) {
      emitSocketError("VOICE_STATE_WATCH_ERROR", "Unable to watch voice state updates.", error);
    }
  });

  socket.on("voice:states:unwatch", async (rawData) => {
    try {
      const data = parseSocketPayload(SocketVoiceStatesWatchPayloadSchema, rawData);
      await leaveVoiceStateViewerRoomsForServer(socket, data.serverId);
    } catch (error) {
      emitSocketError("VALIDATION_ERROR", "Invalid voice state watch payload.", error);
    }
  });

  socket.on("voice:audio-level:update", (rawData) => {
    try {
      const data = parseSocketPayload(SocketVoiceAudioLevelPayloadSchema, rawData);
      if (!socket.data.voiceRooms.has(data.channelId)) {
        return;
      }

      const now = Date.now();
      if (
        socket.data.lastVoiceAudioLevelAt &&
        now - socket.data.lastVoiceAudioLevelAt < VOICE_AUDIO_LEVEL_MIN_INTERVAL_MS
      ) {
        return;
      }

      socket.data.lastVoiceAudioLevelAt = now;
      socket.to(getVoiceParticipantRoomName(data.channelId)).emit("voice:audio-level:update", {
        audioLevel: data.audioLevel,
        channelId: data.channelId,
        isMuted: data.isMuted,
        isSpeaking: data.isSpeaking,
        userId,
      });
    } catch (error) {
      emitSocketError("VALIDATION_ERROR", "Invalid voice audio level payload.", error);
    }
  });

  socket.on("voice:invite:accept", async (rawData) => {
    let data: ReturnType<typeof SocketVoiceInviteAcceptPayloadSchema.parse> | null = null;
    try {
      data = parseSocketPayload(SocketVoiceInviteAcceptPayloadSchema, rawData);
      const inviteKey = getVoiceInviteKey(data.inviteId);
      const storedInvite = parseStoredVoiceInvite(await redis.get(inviteKey));
      if (
        !storedInvite ||
        storedInvite.channelId !== data.channelId ||
        storedInvite.serverId !== data.serverId ||
        storedInvite.targetUserId !== userId ||
        Date.parse(storedInvite.expiresAt) <= Date.now()
      ) {
        await redis.del(inviteKey).catch(() => undefined);
        throw new ApiError("This voice invite expired.", 410, "VOICE_INVITE_EXPIRED");
      }

      await requireChannelPermissionForUser(userId, data.channelId, PermissionBits.CONNECT_VOICE, {
        forbiddenCode: "VOICE_INVITE_FORBIDDEN",
        forbiddenMessage: "You are not allowed to join this voice channel.",
        lockedCode: "VOICE_INVITE_FORBIDDEN",
        lockedMessage: "You are not allowed to join this locked voice channel.",
        requiredServerId: data.serverId,
        requiredType: ChannelType.VOICE,
        respectLocked: true,
      });

      await redis.del(inviteKey).catch(() => undefined);
      socket.emit("voice:invite:accepted", {
        channelId: data.channelId,
        inviteId: data.inviteId,
        serverId: data.serverId,
      });
      io.to(`user:${storedInvite.fromUserId}`).emit("voice:invite:status", {
        channelId: data.channelId,
        inviteId: data.inviteId,
        serverId: data.serverId,
        status: "accepted",
        targetUserId: userId,
      });
    } catch (error) {
      emitVoiceInviteError({
        channelId: data?.channelId,
        code: "VOICE_INVITE_ACCEPT_ERROR",
        error,
        fallbackMessage: "Unable to accept this voice invite.",
        inviteId: data?.inviteId,
      });
    }
  });

  socket.on("voice:invite:decline", async (rawData) => {
    let data: ReturnType<typeof SocketVoiceInviteDeclinePayloadSchema.parse> | null = null;
    try {
      data = parseSocketPayload(SocketVoiceInviteDeclinePayloadSchema, rawData);
      const inviteKey = getVoiceInviteKey(data.inviteId);
      const storedInvite = parseStoredVoiceInvite(await redis.get(inviteKey));
      if (
        !storedInvite ||
        storedInvite.channelId !== data.channelId ||
        storedInvite.serverId !== data.serverId ||
        storedInvite.targetUserId !== userId
      ) {
        return;
      }

      await redis.del(inviteKey).catch(() => undefined);
      io.to(`user:${storedInvite.fromUserId}`).emit("voice:invite:status", {
        channelId: data.channelId,
        inviteId: data.inviteId,
        serverId: data.serverId,
        status: "declined",
        targetUserId: userId,
      });
    } catch (error) {
      emitVoiceInviteError({
        channelId: data?.channelId,
        code: "VOICE_INVITE_DECLINE_ERROR",
        error,
        fallbackMessage: "Unable to decline this voice invite.",
        inviteId: data?.inviteId,
      });
    }
  });

  socket.on("voice:invite:send", async (rawData) => {
    let data: ReturnType<typeof SocketVoiceInvitePayloadSchema.parse> | null = null;
    try {
      data = parseSocketPayload(SocketVoiceInvitePayloadSchema, rawData);
      const result = await createVoiceInvite({
        input: data,
        rateRedis,
        redis,
        userId,
      });

      io.to(`user:${result.targetUserId}`).emit("voice:invite:received", result.invite);
      socket.emit("voice:invite:sent", {
        channelId: data.channelId,
        expiresAt: result.expiresAt,
        inviteId: result.inviteId,
        targetUserId: result.targetUserId,
      });
    } catch (error) {
      emitVoiceInviteError({
        channelId: data?.channelId,
        code: "VOICE_INVITE_SEND_ERROR",
        error,
        fallbackMessage: "Unable to send this voice invite.",
        targetUserId: data?.targetUserId,
      });
    }
  });

  socket.on("voice:screenshare:update", async (rawData) => {
    try {
      const data = parseSocketPayload(SocketVoiceScreenSharePayloadSchema, rawData);
      const screenShareStateKey = getVoiceScreenShareStateKey(data.channelId, userId);
      await runVoiceScreenShareUpdate({
        authorize: async () => {
          await requireChannelPermissionForUser(
            userId,
            data.channelId,
            PermissionBits.CONNECT_VOICE,
            {
              forbiddenCode: "FORBIDDEN",
              forbiddenMessage: "You are not allowed to join this voice channel.",
              lockedCode: "VOICE_CHANNEL_LOCKED",
              lockedMessage: "You are not allowed to use this locked voice channel.",
              requiredServerId: data.serverId,
              requiredType: ChannelType.VOICE,
              respectLocked: true,
            },
          );
          await requireChannelPermissionForUser(userId, data.channelId, PermissionBits.STREAM, {
            forbiddenCode: "FORBIDDEN",
            forbiddenMessage: "You are not allowed to stream in this voice channel.",
            requiredServerId: data.serverId,
            requiredType: ChannelType.VOICE,
          });
        },
        checkRateLimit: () =>
          checkRateLimit(
            rateRedis,
            `rate:voice:screenshare:${userId}`,
            VOICE_SCREEN_SHARE_RATE_LIMIT,
            VOICE_SOCKET_RATE_WINDOW_SECONDS,
          ),
        emit: () =>
          emitVoiceScreenShareUpdate({
            channelId: data.channelId,
            isScreenSharing: data.isScreenSharing,
            serverId: data.serverId,
            userId,
          }),
        readCurrentValue: async () => (await redis.get(screenShareStateKey)) === "1",
        recordUsage: async () => {
          void setVoiceScreenShareUsage({
            attribution: socket.data.clientAttribution ?? UNKNOWN_ATTRIBUTION,
            channelId: data.channelId,
            isScreenSharing: data.isScreenSharing,
            serverId: data.serverId,
            userId,
          }).catch((error) => {
            logAnalyticsError("voice screen-share socket update", error);
          });
        },
        value: data.isScreenSharing,
        writeValue: async () => {
          if (data.isScreenSharing) {
            await redis.set(screenShareStateKey, "1", "EX", VOICE_SCREEN_SHARE_STATE_TTL_SECONDS);
          } else {
            await redis.del(screenShareStateKey);
          }
        },
      });
    } catch (error) {
      emitSocketError(
        "VOICE_SCREENSHARE_UPDATE_ERROR",
        "Unable to update voice screen sharing state.",
        error,
      );
    }
  });

  return {};
}
