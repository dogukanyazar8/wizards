import {
  MobileChannelThreadMessagesResponseSchema,
  MobileMessageDeleteResponseSchema,
  MobileMessageEditRequestSchema,
  MobileMessageReactionRequestSchema,
  MobileMessageReactionResponseSchema,
  type ChatMessage,
  type MessageReaction,
} from "@wizards/types";
import { z } from "zod";

import { enforceApiRateLimit, type ApiRateLimitAction } from "@/lib/api-rate-limit";
import { ApiError, jsonError, parseJsonBody } from "@/lib/api";
import { requireMobileApiUserId } from "@/lib/auth/api";
import { redactMessageAttachmentUrlsForViewer } from "@/lib/messages/attachment-visibility";
import { logError } from "@/lib/logger";
import { getRedisRate } from "@/lib/redis";
import {
  emitToChannelViewers,
  emitToUserRooms,
  getPermittedChannelViewerUserIds,
} from "@/lib/socket/emitters";
import {
  checkChannelMessageEditRateLimit,
  shouldLogRateLimitUnavailable,
} from "@/lib/socket/rate-limits";
import { getSocketServer } from "@/lib/socket/runtime";
import {
  deleteMessage,
  editMessage,
  getChannelThreadMessages,
  setReaction,
  type DeleteMessageResult,
} from "@/lib/workspace/message-service";

const MobileChannelMessageParamsSchema = z.object({
  channelId: z.string().min(1).max(128),
  messageId: z.string().min(1).max(128),
});
const MOBILE_THREAD_MESSAGE_LIMIT = 30;
const MobileChannelThreadQuerySchema = z.object({
  cursor: z.string().min(1).max(128).optional(),
  limit: z.number().int().min(1).max(MOBILE_THREAD_MESSAGE_LIMIT),
});

export type MobileChannelMessageRouteContext = {
  params: Promise<{
    channelId: string;
    messageId: string;
  }>;
};

type ChannelMessageInput = {
  channelId: string;
  messageId: string;
  userId: string;
};

export type MobileChannelMessageRouteDependencies = {
  authenticate: (request: Request) => Promise<string>;
  deleteMessage: (input: ChannelMessageInput) => Promise<DeleteMessageResult>;
  emitMessageDeleted: (
    input: ChannelMessageInput & { result: DeleteMessageResult },
  ) => Promise<void>;
  emitMessageUpdated: (input: { message: ChatMessage; userId: string }) => Promise<void>;
  emitReactionUpdated: (
    input: ChannelMessageInput & { reactions: MessageReaction[] },
  ) => Promise<void>;
  enforceActionRateLimit: (userId: string) => Promise<void>;
  enforceRateLimit: (userId: string, scope: ApiRateLimitAction) => Promise<void>;
  getThread: (input: ChannelMessageInput & { cursor?: string; limit: number }) => Promise<{
    hasMore: boolean;
    messages: ChatMessage[];
    nextCursor: string | null;
    parent: ChatMessage;
  }>;
  parseEditRequest: (request: Request) => Promise<{ content: string }>;
  parseReactionRequest: (request: Request) => Promise<{ emoji: string }>;
  updateMessage: (input: ChannelMessageInput & { content: string }) => Promise<ChatMessage>;
  updateReaction: (
    input: ChannelMessageInput & { emoji: string; shouldReact: boolean },
  ) => Promise<MessageReaction[]>;
};

async function enforceMobileChannelMessageActionRateLimit(userId: string) {
  const rateLimitResult = await checkChannelMessageEditRateLimit({
    redis: getRedisRate(),
    userId,
  });

  if (rateLimitResult.status === "limited") {
    throw new ApiError("Too many message actions. Please try again shortly.", 429, "RATE_LIMITED");
  }

  if (rateLimitResult.status === "unavailable") {
    if (shouldLogRateLimitUnavailable("channel-message-edit")) {
      logError(
        rateLimitResult.allowDuringGrace
          ? "[mobile-api] Channel message action rate limit unavailable; allowing action during grace window"
          : "[mobile-api] Channel message action rate limit unavailable; blocking action",
        rateLimitResult.error,
      );
    }

    if (!rateLimitResult.allowDuringGrace) {
      throw new ApiError(
        "Message controls are temporarily unavailable. Please try again shortly.",
        503,
        "RATE_LIMIT_UNAVAILABLE",
      );
    }
  }
}

async function emitChannelMessageUpdated({
  message,
  userId,
}: {
  message: ChatMessage;
  userId: string;
}) {
  const io = getSocketServer();
  if (!io) {
    return;
  }

  const viewerUserIds = await getPermittedChannelViewerUserIds(message.channelId);
  const actorViewerIds = viewerUserIds.filter((viewerUserId) => viewerUserId === userId);
  const otherViewerIds = viewerUserIds.filter((viewerUserId) => viewerUserId !== userId);
  emitToUserRooms(io, actorViewerIds, "message:updated", message);
  emitToUserRooms(
    io,
    otherViewerIds,
    "message:updated",
    redactMessageAttachmentUrlsForViewer(message, null),
  );
}

async function emitChannelMessageDeleted({
  channelId,
  messageId,
  result,
  userId,
}: ChannelMessageInput & { result: DeleteMessageResult }) {
  const io = getSocketServer();
  if (!io) {
    return;
  }

  if (result.status === "removed") {
    await emitToChannelViewers(io, channelId, "message:removed", { channelId, messageId });
    return;
  }

  await emitToChannelViewers(io, channelId, "message:deleted", {
    channelId,
    deletedById: userId,
    messageId,
    placeholderExpiresAt: result.placeholderExpiresAt,
  });
}

async function emitChannelReactionUpdated({
  channelId,
  messageId,
  reactions,
}: ChannelMessageInput & { reactions: MessageReaction[] }) {
  const io = getSocketServer();
  if (!io) {
    return;
  }

  await emitToChannelViewers(io, channelId, "message:reaction_updated", { messageId, reactions });
}

const defaultMobileChannelMessageRouteDependencies: MobileChannelMessageRouteDependencies = {
  authenticate: (request) => requireMobileApiUserId(request),
  deleteMessage: ({ channelId, messageId, userId }) =>
    deleteMessage(messageId, userId, { channelId }),
  emitMessageDeleted: emitChannelMessageDeleted,
  emitMessageUpdated: emitChannelMessageUpdated,
  emitReactionUpdated: emitChannelReactionUpdated,
  enforceActionRateLimit: enforceMobileChannelMessageActionRateLimit,
  enforceRateLimit: (userId, scope) => enforceApiRateLimit(userId, scope),
  getThread: async ({ channelId, cursor, limit, messageId, userId }) => {
    const result = await getChannelThreadMessages(channelId, messageId, userId, cursor, limit);
    return { ...result, nextCursor: result.nextCursor ?? null };
  },
  parseEditRequest: (request) => parseJsonBody(request, MobileMessageEditRequestSchema),
  parseReactionRequest: (request) => parseJsonBody(request, MobileMessageReactionRequestSchema),
  updateMessage: ({ channelId, content, messageId, userId }) =>
    editMessage(messageId, userId, content, undefined, { channelId }),
  updateReaction: ({ channelId, emoji, messageId, shouldReact, userId }) =>
    setReaction(messageId, userId, emoji, shouldReact, { channelId }),
};

async function getChannelMessageInput(context: MobileChannelMessageRouteContext, userId: string) {
  const params = MobileChannelMessageParamsSchema.parse(await context.params);
  return { ...params, userId };
}

function getThreadQuery(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const cursor = searchParams.get("before") || searchParams.get("cursor") || undefined;
  const requestedLimit = Number.parseInt(
    searchParams.get("limit") ?? String(MOBILE_THREAD_MESSAGE_LIMIT),
    10,
  );
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(requestedLimit, 1), MOBILE_THREAD_MESSAGE_LIMIT)
    : MOBILE_THREAD_MESSAGE_LIMIT;

  return MobileChannelThreadQuerySchema.parse({
    ...(cursor ? { cursor } : {}),
    limit,
  });
}

export async function mobileChannelMessageEditRoute(
  request: Request,
  context: MobileChannelMessageRouteContext,
  dependencies: MobileChannelMessageRouteDependencies = defaultMobileChannelMessageRouteDependencies,
) {
  try {
    const userId = await dependencies.authenticate(request);
    await dependencies.enforceRateLimit(userId, "mobile:channel:messages:edit");
    await dependencies.enforceActionRateLimit(userId);
    const [input, body] = await Promise.all([
      getChannelMessageInput(context, userId),
      dependencies.parseEditRequest(request),
    ]);
    const message = await dependencies.updateMessage({ ...input, content: body.content });
    await dependencies.emitMessageUpdated({ message, userId });

    return Response.json({ message });
  } catch (error) {
    return jsonError(error);
  }
}

export async function mobileChannelMessageDeleteRoute(
  request: Request,
  context: MobileChannelMessageRouteContext,
  dependencies: MobileChannelMessageRouteDependencies = defaultMobileChannelMessageRouteDependencies,
) {
  try {
    const userId = await dependencies.authenticate(request);
    await dependencies.enforceRateLimit(userId, "mobile:channel:messages:delete");
    await dependencies.enforceActionRateLimit(userId);
    const input = await getChannelMessageInput(context, userId);
    const result = await dependencies.deleteMessage(input);
    await dependencies.emitMessageDeleted({ ...input, result });

    return Response.json(MobileMessageDeleteResponseSchema.parse(result));
  } catch (error) {
    return jsonError(error);
  }
}

export async function mobileChannelMessageReactionRoute(
  request: Request,
  context: MobileChannelMessageRouteContext,
  shouldReact: boolean,
  dependencies: MobileChannelMessageRouteDependencies = defaultMobileChannelMessageRouteDependencies,
) {
  try {
    const userId = await dependencies.authenticate(request);
    await dependencies.enforceRateLimit(userId, "mobile:channel:messages:reactions");
    await dependencies.enforceActionRateLimit(userId);
    const [input, body] = await Promise.all([
      getChannelMessageInput(context, userId),
      dependencies.parseReactionRequest(request),
    ]);
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

export async function mobileChannelMessageThreadRoute(
  request: Request,
  context: MobileChannelMessageRouteContext,
  dependencies: MobileChannelMessageRouteDependencies = defaultMobileChannelMessageRouteDependencies,
) {
  try {
    const userId = await dependencies.authenticate(request);
    await dependencies.enforceRateLimit(userId, "mobile:channel:messages:thread");
    const [input, query] = await Promise.all([
      getChannelMessageInput(context, userId),
      Promise.resolve(getThreadQuery(request)),
    ]);
    const thread = await dependencies.getThread({
      ...input,
      ...(query.cursor ? { cursor: query.cursor } : {}),
      limit: query.limit,
    });

    return Response.json(MobileChannelThreadMessagesResponseSchema.parse(thread), {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
