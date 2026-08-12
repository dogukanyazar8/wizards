import { prisma } from "@wizards/db";

import { ApiError } from "@/lib/api";
import { UNKNOWN_ATTRIBUTION } from "@/lib/analytics/client-attribution";
import { assertUnblockedDMParticipants } from "@/lib/dm/blocking";
import { recordDirectMessageDelivery } from "@/lib/dm/delivery-receipts";
import {
  joinGroupCall,
  leaveGroupCall,
  planGroupCallSignals,
  readGroupCallState,
  toGroupCallStateDTO,
  type StoredGroupCallState,
} from "@/lib/dm/group-call-state";
import { isDMParticipant } from "@/lib/dm/participant-service";
import { assertGroupPermission, loadGroupAuthContext } from "@/lib/dm/group-permissions";
import { sendDirectMessage } from "@/lib/dm/message-send-service";
import { deleteDMMessage, editDMMessage, getDMDisplayName, setDMReaction } from "@/lib/dm/service";
import { normalizeAppLocale, translate } from "@/lib/locale";
import { logError } from "@/lib/logger";
import {
  MOBILE_PUSH_ANDROID_CHANNELS,
  MOBILE_PUSH_CATEGORY_INCOMING_CALL,
  sendMobilePushToUsers,
  type MobilePushSenderDeps,
} from "@/lib/mobile/push-sender";
import type { HandlerContext } from "@/lib/socket/context";
import { createDMErrorEmitter, createSafeDMErrorEmitter } from "@/lib/socket/errors";
import { checkDMMessageRateLimits, shouldLogRateLimitUnavailable } from "@/lib/socket/rate-limits";
import {
  parseSocketPayload,
  SocketConversationPayloadSchema,
  SocketDMCallAcceptPayloadSchema,
  SocketDMCallJoinPayloadSchema,
  SocketDMCallStartPayloadSchema,
  SocketDMCallTargetPayloadSchema,
  SocketDMMessageSendPayloadSchema,
  SocketIdSchema,
  SocketMessageDeletePayloadSchema,
  SocketMessageEditPayloadSchema,
  SocketMessageReactionPayloadSchema,
} from "@/lib/socket/schemas";

import type { SocketHandlerRegistration } from ".";

/** How long an unanswered DM call keeps ringing before both sides give up. */
const DM_CALL_RING_TTL_MS = 45_000;

/**
 * Floor between two delivery acknowledgements for the same conversation on one
 * connection. The client already debounces bursts; this is the server-side
 * guard, and a dropped ack costs nothing because the next message (or the next
 * conversation-list read) marks the same thing.
 */
const DM_DELIVERY_ACK_MIN_INTERVAL_MS = 1_000;

/**
 * Rings every callee's mobile devices alongside the socket signal. Exported for
 * tests; callers fire-and-forget because ring latency beats delivery guarantees.
 */
export async function sendDMCallPush(args: {
  callerName: string;
  callerUserId: string;
  conversationId: string;
  deps?: MobilePushSenderDeps;
  recipients: Array<{ locale: string | null; userId: string }>;
  /** Lets the Android CallStyle notification expire itself when the ring times out. */
  ringTtlMs: number;
  video: boolean;
}) {
  await Promise.all(
    args.recipients.map((recipient) =>
      sendMobilePushToUsers(
        {
          androidChannelId: MOBILE_PUSH_ANDROID_CHANNELS.calls,
          body: translate(
            normalizeAppLocale(recipient.locale),
            args.video ? "dm.call.push.videoBody" : "dm.call.push.voiceBody",
          ),
          categoryId: MOBILE_PUSH_CATEGORY_INCOMING_CALL,
          data: {
            callType: args.video ? "video" : "voice",
            conversationId: args.conversationId,
            fromUserId: args.callerUserId,
            kind: "dm-call",
            ringTtlMs: String(args.ringTtlMs),
          },
          priority: "high",
          title: args.callerName,
          userIds: [recipient.userId],
        },
        args.deps ?? {},
      ),
    ),
  );
}

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
        // E5. Rides the roster read the ring already does, so deciding who is
        // allowed to be rung costs nothing extra.
        notifyLevel: true,
        userId: true,
        user: {
          select: {
            avatarUrl: true,
            displayName: true,
            locale: true,
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

  /** Last delivery acknowledgement per conversation on this connection. */
  const deliveryAckAtByConversation = new Map<string, number>();

  async function requireUnblockedDMParticipants(conversationId: string) {
    const participants = await getAuthorizedDMParticipants(conversationId);
    if (!participants) {
      return null;
    }

    await assertUnblockedDMParticipants({ currentUserId: userId, participants });

    return participants;
  }

  /** Resolves the other side of a ring signal, or reports the failure to the sender. */
  async function requireDMCallPeer(conversationId: string, peerUserId: string) {
    const participants = await requireUnblockedDMParticipants(conversationId);
    if (!participants) {
      emitDMError("FORBIDDEN", "You are not a participant in this DM");
      return null;
    }

    const peer = participants.find((participant) => participant.userId === peerUserId);
    if (!peer || peer.userId === userId) {
      emitDMError("NOT_FOUND", "The caller was not found.");
      return null;
    }

    return peer;
  }

  /**
   * D3. Broadcasts the current roster of a group call to every member of the
   * conversation — the people inside it and the people who only need to see that
   * it is happening.
   */
  function broadcastGroupCallState(
    conversationId: string,
    participantUserIds: readonly string[],
    state: StoredGroupCallState | null,
  ) {
    const payload = toGroupCallStateDTO(conversationId, state);

    for (const participantUserId of participantUserIds) {
      io.to(`user:${participantUserId}`).emit("dm:call:state", payload);
    }
  }

  /**
   * D3. Which calls this socket is inside. A tab that crashes, a phone that
   * loses signal or an app the OS kills never sends `dm:call:leave`, and the
   * stored roster has a six-hour TTL — so without this the group would show
   * "3 kişi görüşüyor" long after the room emptied, and `shouldRingParticipant`
   * would refuse to ring the ghost on the next call.
   */
  const joinedCallConversationIds = new Set<string>();

  /** Relays a call lifecycle signal to every other participant of the conversation. */
  async function broadcastDMCallSignal(
    rawData: unknown,
    eventName: "dm:call:cancelled" | "dm:call:ended",
  ) {
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

      io.to(`user:${participant.userId}`).emit(eventName, {
        conversationId: data.conversationId,
        userId,
      });
    }

    // D3. The sender is leaving the call either way, so the stored roster has to
    // agree — otherwise the group keeps showing a call nobody is in.
    joinedCallConversationIds.delete(data.conversationId);
    const state = await leaveGroupCall(data.conversationId, userId);
    broadcastGroupCallState(
      data.conversationId,
      participants.map((participant) => participant.userId),
      state,
    );
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

  /**
   * §2 "1a".6.4: the receiving client says "I have it", which is what turns the
   * sender's single tick into two grey ones. `markDirectMessagesDelivered`
   * scopes itself to rows this user actually participates in and no-ops when the
   * mark is already current, so a chatty client costs one read.
   *
   * The per-connection floor is there because the ack is client-driven: a loop
   * emitting it cannot turn one socket into a stream of database reads.
   */
  socket.on("dm:message:delivered", async (rawData) => {
    try {
      const data = parseSocketPayload(SocketConversationPayloadSchema, rawData);
      const now = Date.now();
      const lastAckAt = deliveryAckAtByConversation.get(data.conversationId) ?? 0;
      if (now - lastAckAt < DM_DELIVERY_ACK_MIN_INTERVAL_MS) {
        return;
      }
      deliveryAckAtByConversation.set(data.conversationId, now);

      await recordDirectMessageDelivery(userId, [data.conversationId]);
    } catch (error) {
      emitSafeDMError("FORBIDDEN", "Unable to record DM delivery.", error);
    }
  });

  socket.on("dm:call:start", async (rawData) => {
    try {
      const data = parseSocketPayload(SocketDMCallStartPayloadSchema, rawData);
      const participants = await requireUnblockedDMParticipants(data.conversationId);
      if (!participants) {
        emitDMError("FORBIDDEN", "You are not a participant in this DM");
        return;
      }

      const caller = participants.find((participant) => participant.userId === userId);
      if (!caller) {
        emitDMError("FORBIDDEN", "You are not a participant in this DM");
        return;
      }

      // D2's race rule. "Start" is "join if one is already running", so two
      // people pressing call at the same instant end up in one room rather than
      // two — the second caller's write finds the first one's record.
      const existingState = await readGroupCallState(data.conversationId);
      const { ringUserIds, stateUserIds } = planGroupCallSignals(
        userId,
        participants,
        existingState,
      );
      const state = await joinGroupCall(data.conversationId, {
        joinedAt: new Date(),
        userId,
        video: data.video,
      });
      joinedCallConversationIds.add(data.conversationId);

      const ringing = new Set(ringUserIds);
      const expiresAt = new Date(Date.now() + DM_CALL_RING_TTL_MS).toISOString();
      for (const participant of participants) {
        if (!ringing.has(participant.userId)) {
          continue;
        }

        io.to(`user:${participant.userId}`).emit("dm:call:incoming", {
          conversationId: data.conversationId,
          expiresAt,
          fromUser: {
            avatarUrl: caller.user.avatarUrl,
            displayName: caller.user.displayName,
            id: userId,
            username: caller.user.username,
          },
          video: data.video,
        });
      }

      // Everybody, including the silenced members and the ones already inside:
      // the badge and the "Katıl" button are drawn from this, not from the ring.
      broadcastGroupCallState(data.conversationId, stateUserIds, state);

      const callees = participants.filter((participant) => ringing.has(participant.userId));
      void sendDMCallPush({
        callerName: caller.user.displayName ?? caller.user.username,
        callerUserId: userId,
        conversationId: data.conversationId,
        recipients: callees.map((participant) => ({
          locale: participant.user.locale ?? null,
          userId: participant.userId,
        })),
        ringTtlMs: DM_CALL_RING_TTL_MS,
        video: data.video,
      }).catch(() => undefined);
    } catch (error) {
      emitSafeDMError("FORBIDDEN", "Unable to start this call.", error);
    }
  });

  /**
   * D3. Joining a call that is already running. No ring: the people inside are
   * already talking, and 2e's "Katıl" is pressed by somebody who can see that.
   */
  socket.on("dm:call:join", async (rawData) => {
    try {
      const data = parseSocketPayload(SocketDMCallJoinPayloadSchema, rawData);
      const participants = await requireUnblockedDMParticipants(data.conversationId);
      if (!participants) {
        emitDMError("FORBIDDEN", "You are not a participant in this DM");
        return;
      }

      const state = await joinGroupCall(data.conversationId, {
        joinedAt: new Date(),
        userId,
        ...(data.video === undefined ? {} : { video: data.video }),
      });
      joinedCallConversationIds.add(data.conversationId);

      broadcastGroupCallState(
        data.conversationId,
        participants.map((participant) => participant.userId),
        state,
      );
    } catch (error) {
      emitSafeDMError("FORBIDDEN", "Unable to join this call.", error);
    }
  });

  /**
   * D3. Leaving without ending it for everybody else. The last person out is
   * what ends the call, and that is the `dm:call:ended` the others still expect.
   */
  socket.on("dm:call:leave", async (rawData) => {
    try {
      const data = parseSocketPayload(SocketConversationPayloadSchema, rawData);
      const participants = await requireUnblockedDMParticipants(data.conversationId);
      if (!participants) {
        emitDMError("FORBIDDEN", "You are not a participant in this DM");
        return;
      }

      joinedCallConversationIds.delete(data.conversationId);
      const state = await leaveGroupCall(data.conversationId, userId);
      const participantUserIds = participants.map((participant) => participant.userId);

      broadcastGroupCallState(data.conversationId, participantUserIds, state);

      if (!state) {
        for (const participantUserId of participantUserIds) {
          if (participantUserId === userId) {
            continue;
          }

          io.to(`user:${participantUserId}`).emit("dm:call:ended", {
            conversationId: data.conversationId,
            userId,
          });
        }
      }
    } catch (error) {
      emitSafeDMError("FORBIDDEN", "Unable to leave this call.", error);
    }
  });

  socket.on("dm:call:accept", async (rawData) => {
    try {
      const data = parseSocketPayload(SocketDMCallAcceptPayloadSchema, rawData);
      const caller = await requireDMCallPeer(data.conversationId, data.fromUserId);
      if (!caller) {
        return;
      }

      io.to(`user:${caller.userId}`).emit("dm:call:accepted", {
        conversationId: data.conversationId,
        userId,
        video: data.video,
      });

      // D3. Answering *is* entering the call, so the stored roster gains this
      // user here rather than waiting for the client to also send `dm:call:join`
      // — a client that forgot to would leave the group showing a one-person
      // call for as long as the conversation lasted.
      const state = await joinGroupCall(data.conversationId, {
        joinedAt: new Date(),
        userId,
        video: data.video,
      });
      const participants = await getAuthorizedDMParticipants(data.conversationId);
      broadcastGroupCallState(
        data.conversationId,
        (participants ?? []).map((participant) => participant.userId),
        state,
      );
    } catch (error) {
      emitSafeDMError("FORBIDDEN", "Unable to accept this call.", error);
    }
  });

  socket.on("dm:call:decline", async (rawData) => {
    try {
      const data = parseSocketPayload(SocketDMCallTargetPayloadSchema, rawData);
      const caller = await requireDMCallPeer(data.conversationId, data.fromUserId);
      if (!caller) {
        return;
      }

      io.to(`user:${caller.userId}`).emit("dm:call:declined", {
        conversationId: data.conversationId,
        userId,
      });
    } catch (error) {
      emitSafeDMError("FORBIDDEN", "Unable to decline this call.", error);
    }
  });

  socket.on("dm:call:cancel", async (rawData) => {
    try {
      await broadcastDMCallSignal(rawData, "dm:call:cancelled");
    } catch (error) {
      emitSafeDMError("FORBIDDEN", "Unable to cancel this call.", error);
    }
  });

  socket.on("dm:call:end", async (rawData) => {
    try {
      await broadcastDMCallSignal(rawData, "dm:call:ended");
    } catch (error) {
      emitSafeDMError("FORBIDDEN", "Unable to end this call.", error);
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
          attribution: socket.data.clientAttribution ?? UNKNOWN_ATTRIBUTION,
          clientNonce: data.clientNonce ?? null,
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

      // 2f §3. A reaction is a contribution to the conversation, so it answers
      // to the same permission sending does: in a group where only admins may
      // write, a member must not be able to write an emoji either. The gate also
      // covers membership, which is why the old participant check is gone.
      assertGroupPermission(
        await loadGroupAuthContext(message.conversationId, userId),
        "sendMessage",
      );

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

  return {
    /**
     * D3. The graceful paths above already clear their own entry, so by the time
     * this runs the set holds exactly the calls this socket dropped out of. Each
     * one is left and re-announced; a failure on one conversation must not stop
     * the others, because a half-cleaned roster is the bug this exists to
     * prevent.
     */
    async cleanup() {
      const conversationIds = Array.from(joinedCallConversationIds);
      joinedCallConversationIds.clear();

      for (const conversationId of conversationIds) {
        try {
          const state = await leaveGroupCall(conversationId, userId);
          const participants = await prisma.dMParticipant.findMany({
            where: { conversationId },
            select: { userId: true },
          });
          const participantUserIds = participants.map((participant) => participant.userId);

          broadcastGroupCallState(conversationId, participantUserIds, state);

          // Nobody left inside: the others need the same ending they would have
          // received had this socket pressed hang up.
          if (!state) {
            for (const participantUserId of participantUserIds) {
              if (participantUserId === userId) {
                continue;
              }

              io.to(`user:${participantUserId}`).emit("dm:call:ended", {
                conversationId,
                userId,
              });
            }
          }
        } catch (error) {
          logError("[dm] Group call disconnect cleanup failed", error);
        }
      }
    },
  };
}
