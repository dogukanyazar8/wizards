import { prisma } from "@wizards/db";

import { ApiError } from "@/lib/api";
import { assertUnblockedDMParticipants } from "@/lib/dm/blocking";
import { isDMParticipant } from "@/lib/dm/participant-service";
import { sendDirectMessage } from "@/lib/dm/message-send-service";
import { deleteDMMessage, editDMMessage, getDMDisplayName, setDMReaction } from "@/lib/dm/service";
import { logError } from "@/lib/logger";
import type { HandlerContext } from "@/lib/socket/context";
import { createDMErrorEmitter, createSafeDMErrorEmitter } from "@/lib/socket/errors";
import { checkDMMessageRateLimits, shouldLogRateLimitUnavailable } from "@/lib/socket/rate-limits";
import {
  parseSocketPayload,
  SocketConversationPayloadSchema,
  SocketDMMessageSendPayloadSchema,
  SocketDMScreenShareTargetPayloadSchema,
  SocketIdSchema,
  SocketMessageDeletePayloadSchema,
  SocketMessageEditPayloadSchema,
  SocketMessageReactionPayloadSchema,
} from "@/lib/socket/schemas";

import type { SocketHandlerRegistration } from ".";

export function registerDMHandlers(
  ctx: HandlerContext,
  options: {
    stopDMTyping?: (conversationId: string) => Promise<void>;
  } = {},
): SocketHandlerRegistration {
  const { io, rateRedis, socket, userId } = ctx;
  const emitDMError = createDMErrorEmitter(socket);
  const emitSafeDMError = createSafeDMErrorEmitter(socket);

  async function getAuthorizedDMParticipants(conversationId: string) {
    const participants = await prisma.dMParticipant.findMany({
      where: { conversationId },
      select: {
        userId: true,
        user: {
          select: {
            displayName: true,
            username: true,
          },
        },
      },
    });

    if (!participants.some((participant) => participant.userId === userId)) {
      return null;
    }

    return participants;
  }

  async function requireUnblockedDMParticipants(conversationId: string) {
    const participants = await getAuthorizedDMParticipants(conversationId);
    if (!participants) {
      return null;
    }

    await assertUnblockedDMParticipants({ currentUserId: userId, participants });

    return participants;
  }

  socket.on("dm:join", async (rawConversationId: string) => {
    try {
      const conversationId = parseSocketPayload(SocketIdSchema, rawConversationId);
      if (!(await isDMParticipant(userId, conversationId))) {
        emitDMError("FORBIDDEN", "You are not allowed to join this DM");
        return;
      }

      socket.join(`dm:${conversationId}`);
    } catch (error) {
      emitSafeDMError("FORBIDDEN", "Unable to join this DM.", error);
    }
  });

  socket.on("dm:leave", async (rawConversationId: string) => {
    try {
      const conversationId = parseSocketPayload(SocketIdSchema, rawConversationId);
      if (!(await isDMParticipant(userId, conversationId))) {
        emitDMError("FORBIDDEN", "You are not allowed to leave this DM");
        return;
      }

      socket.leave(`dm:${conversationId}`);
    } catch (error) {
      emitSafeDMError("FORBIDDEN", "Unable to leave this DM.", error);
    }
  });

  socket.on("dm:screenshare:start", async (rawData) => {
    try {
      const data = parseSocketPayload(SocketConversationPayloadSchema, rawData);
      const participants = await requireUnblockedDMParticipants(data.conversationId);
      if (!participants) {
        emitDMError("FORBIDDEN", "You are not a participant in this DM");
        return;
      }

      const sender = participants.find((participant) => participant.userId === userId);
      if (!sender) {
        emitDMError("FORBIDDEN", "You are not a participant in this DM");
        return;
      }

      for (const participant of participants) {
        if (participant.userId === userId) {
          continue;
        }

        io.to(`user:${participant.userId}`).emit("dm:screenshare:started", {
          conversationId: data.conversationId,
          userId,
          username: sender.user.username,
          displayName: sender.user.displayName,
        });
      }
    } catch (error) {
      emitSafeDMError("FORBIDDEN", "Unable to start DM screen sharing.", error);
    }
  });

  socket.on("dm:screenshare:accept", async (rawData) => {
    try {
      const data = parseSocketPayload(SocketDMScreenShareTargetPayloadSchema, rawData);
      const participants = await requireUnblockedDMParticipants(data.conversationId);
      if (!participants) {
        emitDMError("FORBIDDEN", "You are not a participant in this DM");
        return;
      }

      const targetParticipant = participants.find(
        (participant) => participant.userId === data.fromUserId,
      );
      if (!targetParticipant || targetParticipant.userId === userId) {
        emitDMError("NOT_FOUND", "Screen share sender was not found.");
        return;
      }

      io.to(`user:${targetParticipant.userId}`).emit("dm:screenshare:accepted", {
        conversationId: data.conversationId,
        userId,
      });
    } catch (error) {
      emitSafeDMError("FORBIDDEN", "Unable to accept DM screen sharing.", error);
    }
  });

  socket.on("dm:screenshare:decline", async (rawData) => {
    try {
      const data = parseSocketPayload(SocketDMScreenShareTargetPayloadSchema, rawData);
      const participants = await requireUnblockedDMParticipants(data.conversationId);
      if (!participants) {
        emitDMError("FORBIDDEN", "You are not a participant in this DM");
        return;
      }

      const targetParticipant = participants.find(
        (participant) => participant.userId === data.fromUserId,
      );
      if (!targetParticipant || targetParticipant.userId === userId) {
        emitDMError("NOT_FOUND", "Screen share sender was not found.");
        return;
      }

      io.to(`user:${targetParticipant.userId}`).emit("dm:screenshare:declined", {
        conversationId: data.conversationId,
        userId,
      });
    } catch (error) {
      emitSafeDMError("FORBIDDEN", "Unable to decline DM screen sharing.", error);
    }
  });

  socket.on("dm:screenshare:stop", async (rawData) => {
    try {
      const data = parseSocketPayload(SocketConversationPayloadSchema, rawData);
      const participants = await requireUnblockedDMParticipants(data.conversationId);
      if (!participants) {
        emitDMError("FORBIDDEN", "You are not a participant in this DM");
        return;
      }

      for (const participant of participants) {
        if (participant.userId === userId) {
          continue;
        }

        io.to(`user:${participant.userId}`).emit("dm:screenshare:stopped", {
          conversationId: data.conversationId,
          userId,
        });
      }
    } catch (error) {
      emitSafeDMError("FORBIDDEN", "Unable to stop DM screen sharing.", error);
    }
  });

  socket.on("dm:message:send", async (rawData) => {
    try {
      const data = parseSocketPayload(SocketDMMessageSendPayloadSchema, rawData);
      const rateLimitResult = await checkDMMessageRateLimits({
        conversationId: data.conversationId,
        redis: rateRedis,
        userId,
      });

      if (rateLimitResult.status === "global") {
        emitDMError("RATE_LIMITED", "Too many DM messages. Please slow down.");
        return;
      }

      if (rateLimitResult.status === "conversation") {
        emitDMError("RATE_LIMITED", "Too many DM messages. Maximum 30 per minute.");
        return;
      }

      if (rateLimitResult.status === "unavailable") {
        if (shouldLogRateLimitUnavailable("dm-message")) {
          logError(
            rateLimitResult.allowDuringGrace
              ? "[socket] DM message rate limit unavailable; allowing message send during grace window"
              : "[socket] DM message rate limit unavailable; blocking message send",
            rateLimitResult.error,
          );
        }

        if (!rateLimitResult.allowDuringGrace) {
          emitDMError(
            "RATE_LIMIT_UNAVAILABLE",
            "DM message controls are temporarily unavailable. Please try again shortly.",
          );
          return;
        }
      }

      try {
        await sendDirectMessage({
          attachments: data.attachments,
          content: data.content,
          conversationId: data.conversationId,
          io,
          replyToId: data.replyToId ?? null,
          senderName: getDMDisplayName({
            username: socket.data.username,
            displayName: socket.data.displayName,
          }),
          threadParentId: data.threadParentId ?? null,
          userId,
        });
      } catch (validationError) {
        emitDMError(
          validationError instanceof ApiError &&
            (validationError.code === "FORBIDDEN" ||
              validationError.code === "BLOCKED" ||
              validationError.code === "NOT_FOUND")
            ? validationError.code
            : "VALIDATION_ERROR",
          validationError instanceof Error ? validationError.message : "Invalid message payload.",
        );
        return;
      }

      await options.stopDMTyping?.(data.conversationId);
    } catch (error) {
      emitSafeDMError("NOT_FOUND", "Unable to send DM message.", error);
    }
  });

  socket.on("dm:message:edit", async (rawData) => {
    try {
      const data = parseSocketPayload(SocketMessageEditPayloadSchema, rawData);
      const result = await editDMMessage(data.messageId, userId, data.content);

      for (const realtimeView of result.realtimeViews) {
        io.to(`user:${realtimeView.userId}`).emit("dm:message:updated", realtimeView.message);
      }
    } catch (error) {
      if (error instanceof ApiError) {
        emitDMError(
          error.status === 403
            ? "FORBIDDEN"
            : error.status === 404
              ? "NOT_FOUND"
              : "VALIDATION_ERROR",
          error.message,
        );
        return;
      }

      emitSafeDMError("NOT_FOUND", "Unable to edit DM message.", error);
    }
  });

  socket.on("dm:message:delete", async (rawData) => {
    try {
      const data = parseSocketPayload(SocketMessageDeletePayloadSchema, rawData);
      const result = await deleteDMMessage(data.messageId, userId);

      if (result.status === "removed") {
        io.to(`dm:${result.conversationId}`).emit("dm:message:removed", {
          conversationId: result.conversationId,
          messageId: data.messageId,
        });
        return;
      }

      io.to(`dm:${result.conversationId}`).emit("dm:message:deleted", {
        conversationId: result.conversationId,
        deletedById: userId,
        messageId: data.messageId,
      });
    } catch (error) {
      if (error instanceof ApiError) {
        emitDMError(
          error.status === 403
            ? "FORBIDDEN"
            : error.status === 404
              ? "NOT_FOUND"
              : "VALIDATION_ERROR",
          error.message,
        );
        return;
      }

      emitSafeDMError("NOT_FOUND", "Unable to delete DM message.", error);
    }
  });

  const handleDMReaction = async (rawData: unknown, shouldReact: boolean) => {
    try {
      const data = parseSocketPayload(SocketMessageReactionPayloadSchema, rawData);
      const message = await prisma.dMMessage.findUnique({
        where: { id: data.messageId },
        select: {
          conversationId: true,
          deletedAt: true,
          placeholderRemovedAt: true,
        },
      });

      if (!message || message.deletedAt || message.placeholderRemovedAt) {
        emitDMError("NOT_FOUND", "Message not found.");
        return;
      }

      if (!(await isDMParticipant(userId, message.conversationId))) {
        emitDMError("FORBIDDEN", "You are not a participant in this DM");
        return;
      }

      const reactions = await setDMReaction(data.messageId, userId, data.emoji, shouldReact);
      io.to(`dm:${message.conversationId}`).emit("dm:message:reaction_updated", {
        messageId: data.messageId,
        reactions,
      });
    } catch (error) {
      if (error instanceof ApiError) {
        emitDMError(
          error.status === 403
            ? "FORBIDDEN"
            : error.status === 404
              ? "NOT_FOUND"
              : "VALIDATION_ERROR",
          error.message,
        );
        return;
      }

      emitSafeDMError("NOT_FOUND", "Unable to update DM reactions.", error);
    }
  };

  socket.on("dm:message:react", (rawData) => {
    void handleDMReaction(rawData, true);
  });
  socket.on("dm:message:unreact", (rawData) => {
    void handleDMReaction(rawData, false);
  });

  return {};
}
