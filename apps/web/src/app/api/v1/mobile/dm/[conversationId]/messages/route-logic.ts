import {
  MobileDMMessagesThreadResponseSchema,
  MobileMessageDeleteResponseSchema,
  MobileMessageEditRequestSchema,
  MobileMessageReactionRequestSchema,
  MobileMessageReactionResponseSchema,
  type DMMessagePayload,
  type MessageReaction,
} from "@wizards/types";
import { z } from "zod";

import { enforceApiRateLimit, type ApiRateLimitAction } from "@/lib/api-rate-limit";
import { ApiError, jsonError, parseJsonBody } from "@/lib/api";
import { requireMobileApiUserId } from "@/lib/auth/api";
import {
  deleteDMMessage,
  editDMMessage,
  listDMThreadMessages,
  setDMReaction,
  type DMDeleteMessageResult,
  type DMMessageEditResult,
} from "@/lib/dm/service";
import { logError } from "@/lib/logger";
import { getRedisRate } from "@/lib/redis";
import { checkDMMessageRateLimits, shouldLogRateLimitUnavailable } from "@/lib/socket/rate-limits";
import { getSocketServer } from "@/lib/socket/runtime";

const MobileDMMessageParamsSchema = z.object({
  conversationId: z.string().min(1).max(128),
  messageId: z.string().min(1).max(128),
});
const MOBILE_THREAD_MESSAGE_LIMIT = 30;
const MobileDMThreadQuerySchema = z.object({
  cursor: z.string().min(1).max(128).optional(),
  limit: z.number().int().min(1).max(MOBILE_THREAD_MESSAGE_LIMIT),
});

export type MobileDMMessageRouteContext = {
  params: Promise<{ conversationId: string; messageId: string }>;
};

type DMMessageInput = { conversationId: string; messageId: string; userId: string };

export type MobileDMMessageRouteDependencies = {
  authenticate: (request: Request) => Promise<string>;
  deleteMessage: (input: DMMessageInput) => Promise<DMDeleteMessageResult>;
  emitMessageDeleted: (input: DMMessageInput & { result: DMDeleteMessageResult }) => Promise<void>;
  emitMessageUpdated: (input: DMMessageInput & { result: DMMessageEditResult }) => Promise<void>;
  emitReactionUpdated: (input: DMMessageInput & { reactions: MessageReaction[] }) => Promise<void>;
  enforceActionRateLimit: (input: { conversationId: string; userId: string }) => Promise<void>;
  enforceRateLimit: (userId: string, scope: ApiRateLimitAction) => Promise<void>;
  getThread: (input: DMMessageInput & { cursor?: string; limit: number }) => Promise<{
    messages: DMMessagePayload[];
    nextCursor: string | null;
    parent: DMMessagePayload;
  }>;
  parseEditRequest: (request: Request) => Promise<{ content: string }>;
  parseReactionRequest: (request: Request) => Promise<{ emoji: string }>;
  updateMessage: (input: DMMessageInput & { content: string }) => Promise<DMMessageEditResult>;
  updateReaction: (
    input: DMMessageInput & { emoji: string; shouldReact: boolean },
  ) => Promise<MessageReaction[]>;
};

async function enforceMobileDMMessageActionRateLimit({
  conversationId,
  userId,
}: {
  conversationId: string;
  userId: string;
}) {
  const result = await checkDMMessageRateLimits({ conversationId, redis: getRedisRate(), userId });
  if (result.status === "global" || result.status === "conversation") {
    throw new ApiError(
      "Too many DM message actions. Please try again shortly.",
      429,
      "RATE_LIMITED",
    );
  }
  if (result.status === "unavailable") {
    if (shouldLogRateLimitUnavailable("dm-message")) {
      logError("[mobile-api] DM message action rate limit unavailable", result.error);
    }
    if (!result.allowDuringGrace) {
      throw new ApiError(
        "DM controls are temporarily unavailable. Please try again shortly.",
        503,
        "RATE_LIMIT_UNAVAILABLE",
      );
    }
  }
}

async function emitDMReactionUpdated({
  conversationId,
  messageId,
  reactions,
}: DMMessageInput & { reactions: MessageReaction[] }) {
  getSocketServer()
    ?.to(`dm:${conversationId}`)
    .emit("dm:message:reaction_updated", { messageId, reactions });
}

async function emitDMMessageUpdated({ result }: DMMessageInput & { result: DMMessageEditResult }) {
  const io = getSocketServer();
  if (!io) {
    return;
  }

  for (const realtimeView of result.realtimeViews) {
    io.to(`user:${realtimeView.userId}`).emit("dm:message:updated", realtimeView.message);
  }
}

async function emitDMMessageDeleted({
  conversationId,
  messageId,
  result,
  userId,
}: DMMessageInput & { result: DMDeleteMessageResult }) {
  const io = getSocketServer();
  if (!io) {
    return;
  }

  if (result.status === "removed") {
    io.to(`dm:${conversationId}`).emit("dm:message:removed", { conversationId, messageId });
    return;
  }

  io.to(`dm:${conversationId}`).emit("dm:message:deleted", {
    conversationId,
    deletedById: userId,
    messageId,
  });
}

const defaultMobileDMMessageRouteDependencies: MobileDMMessageRouteDependencies = {
  authenticate: (request) => requireMobileApiUserId(request),
  deleteMessage: ({ conversationId, messageId, userId }) =>
    deleteDMMessage(messageId, userId, { conversationId }),
  emitMessageDeleted: emitDMMessageDeleted,
  emitMessageUpdated: emitDMMessageUpdated,
  emitReactionUpdated: emitDMReactionUpdated,
  enforceActionRateLimit: enforceMobileDMMessageActionRateLimit,
  enforceRateLimit: (userId, scope) => enforceApiRateLimit(userId, scope),
  getThread: ({ conversationId, cursor, limit, messageId, userId }) =>
    listDMThreadMessages(userId, conversationId, messageId, cursor, limit),
  parseEditRequest: (request) => parseJsonBody(request, MobileMessageEditRequestSchema),
  parseReactionRequest: (request) => parseJsonBody(request, MobileMessageReactionRequestSchema),
  updateMessage: ({ content, conversationId, messageId, userId }) =>
    editDMMessage(messageId, userId, content, { conversationId }),
  updateReaction: ({ conversationId, emoji, messageId, shouldReact, userId }) =>
    setDMReaction(messageId, userId, emoji, shouldReact, { conversationId }),
};

async function getDMMessageInput(context: MobileDMMessageRouteContext, userId: string) {
  return { ...MobileDMMessageParamsSchema.parse(await context.params), userId };
}

function getThreadQuery(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const cursor = searchParams.get("cursor") || undefined;
  const requestedLimit = Number.parseInt(
    searchParams.get("limit") ?? String(MOBILE_THREAD_MESSAGE_LIMIT),
    10,
  );
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(requestedLimit, 1), MOBILE_THREAD_MESSAGE_LIMIT)
    : MOBILE_THREAD_MESSAGE_LIMIT;
  return MobileDMThreadQuerySchema.parse({ ...(cursor ? { cursor } : {}), limit });
}

export async function mobileDMMessageEditRoute(
  request: Request,
  context: MobileDMMessageRouteContext,
  dependencies: MobileDMMessageRouteDependencies = defaultMobileDMMessageRouteDependencies,
) {
  try {
    const userId = await dependencies.authenticate(request);
    await dependencies.enforceRateLimit(userId, "mobile:dm:messages:edit");
    const input = await getDMMessageInput(context, userId);
    await dependencies.enforceActionRateLimit(input);
    const body = await dependencies.parseEditRequest(request);
    const result = await dependencies.updateMessage({ ...input, content: body.content });
    await dependencies.emitMessageUpdated({ ...input, result });

    return Response.json({ message: result.message });
  } catch (error) {
    return jsonError(error);
  }
}

export async function mobileDMMessageDeleteRoute(
  request: Request,
  context: MobileDMMessageRouteContext,
  dependencies: MobileDMMessageRouteDependencies = defaultMobileDMMessageRouteDependencies,
) {
  try {
    const userId = await dependencies.authenticate(request);
    await dependencies.enforceRateLimit(userId, "mobile:dm:messages:delete");
    const input = await getDMMessageInput(context, userId);
    await dependencies.enforceActionRateLimit(input);
    const result = await dependencies.deleteMessage(input);
    await dependencies.emitMessageDeleted({ ...input, result });

    return Response.json(MobileMessageDeleteResponseSchema.parse(result));
  } catch (error) {
    return jsonError(error);
  }
}

export async function mobileDMMessageReactionRoute(
  request: Request,
  context: MobileDMMessageRouteContext,
  shouldReact: boolean,
  dependencies: MobileDMMessageRouteDependencies = defaultMobileDMMessageRouteDependencies,
) {
  try {
    const userId = await dependencies.authenticate(request);
    await dependencies.enforceRateLimit(userId, "mobile:dm:messages:reactions");
    const input = await getDMMessageInput(context, userId);
    await dependencies.enforceActionRateLimit(input);
    const body = await dependencies.parseReactionRequest(request);
    const reactions = await dependencies.updateReaction({
      ...input,
      emoji: body.emoji,
      shouldReact,
    });
    await dependencies.emitReactionUpdated({ ...input, reactions });
    return Response.json(MobileMessageReactionResponseSchema.parse({ reactions }));
  } catch (error) {
    return jsonError(error);
  }
}

export async function mobileDMMessageThreadRoute(
  request: Request,
  context: MobileDMMessageRouteContext,
  dependencies: MobileDMMessageRouteDependencies = defaultMobileDMMessageRouteDependencies,
) {
  try {
    const userId = await dependencies.authenticate(request);
    await dependencies.enforceRateLimit(userId, "mobile:dm:messages:thread");
    const [input, query] = await Promise.all([
      getDMMessageInput(context, userId),
      Promise.resolve(getThreadQuery(request)),
    ]);
    const thread = await dependencies.getThread({
      ...input,
      ...(query.cursor ? { cursor: query.cursor } : {}),
      limit: query.limit,
    });
    return Response.json(MobileDMMessagesThreadResponseSchema.parse(thread), {
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
    });
  } catch (error) {
    return jsonError(error);
  }
}
