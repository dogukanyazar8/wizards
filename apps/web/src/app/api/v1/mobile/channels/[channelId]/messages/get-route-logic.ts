import {
  MobileChannelMessagesResponseSchema,
  type ChatMessage,
  type MobileWorkspaceChannelSummary,
} from "@wizards/types";
import { ChannelType, prisma } from "@wizards/db";

import { ApiError, jsonError } from "@/lib/api";
import { authorizeMobileApiRequest, readMobileApiClaimedUserId } from "@/lib/auth/api";
import { createServerTimingForRequest } from "@/lib/server-timing";
import { getChannelMessages, getChannelMessagesAround } from "@/lib/workspace/message-service";
import { requireChannelPermissionForUser } from "@/lib/workspace/permission-service";
import { PermissionBits } from "@/lib/workspace/permissions";

const MOBILE_CHANNEL_MESSAGES_LIMIT = 30;

export type MobileChannelMessagesGetRouteContext = {
  params: Promise<{ channelId: string }>;
};

type MobileChannelMessagePage = {
  hasMore: boolean;
  /** Only an `around` window can have newer messages beyond its own end. */
  hasNewer?: boolean;
  messages: ChatMessage[];
  nextCursor?: string;
};

export type MobileChannelMessagesGetRouteDependencies = {
  authenticate(request: Request): Promise<string>;
  authorizeChannel(userId: string, channelId: string): Promise<void>;
  listMessages(input: {
    channelId: string;
    cursor?: string;
    limit: number;
    viewerId: string;
  }): Promise<MobileChannelMessagePage>;
  /** The window a search hit opens into: history on both sides of one message. */
  listMessagesAround(input: {
    channelId: string;
    limit: number;
    messageId: string;
    viewerId: string;
  }): Promise<MobileChannelMessagePage>;
  loadChannelSummary(channelId: string): Promise<MobileWorkspaceChannelSummary>;
  /** Local token read, no network. See `readMobileApiClaimedUserId`. */
  readUserId(request: Request): string;
};

const defaultDependencies: MobileChannelMessagesGetRouteDependencies = {
  authenticate: (request) => authorizeMobileApiRequest(request, "mobile:channel:messages:list"),
  authorizeChannel: async (userId, channelId) => {
    await requireChannelPermissionForUser(userId, channelId, PermissionBits.VIEW_CHANNEL, {
      requiredType: ChannelType.TEXT,
    });
  },
  listMessages: ({ channelId, cursor, limit, viewerId }) =>
    getChannelMessages(channelId, cursor, limit, viewerId),
  listMessagesAround: ({ channelId, limit, messageId, viewerId }) =>
    getChannelMessagesAround(channelId, messageId, limit, viewerId),
  loadChannelSummary: loadMobileChannelSummary,
  readUserId: readMobileApiClaimedUserId,
};

function readLimit(url: URL): number {
  const requestedLimit = Number.parseInt(
    url.searchParams.get("limit") ?? String(MOBILE_CHANNEL_MESSAGES_LIMIT),
    10,
  );

  return Number.isFinite(requestedLimit)
    ? Math.min(Math.max(requestedLimit, 1), MOBILE_CHANNEL_MESSAGES_LIMIT)
    : MOBILE_CHANNEL_MESSAGES_LIMIT;
}

/**
 * The channel stream read, split out so the two checks in front of it can run
 * together.
 *
 * Both the session/user/rate-limit check and the channel permission check only
 * need the id inside the locally verified token, so the permission read used to
 * spend a whole round trip waiting for an answer it did not depend on. It is now
 * started alongside, and unwrapped in the original precedence: an unauthorized
 * request still reads as 401, never as 403, and nothing is read for a viewer who
 * fails either check.
 */
export async function mobileChannelMessagesGetRoute(
  request: Request,
  context: MobileChannelMessagesGetRouteContext,
  dependencies: MobileChannelMessagesGetRouteDependencies = defaultDependencies,
) {
  const timing = createServerTimingForRequest(request);

  try {
    const claimedUserId = dependencies.readUserId(request);
    const { channelId } = await context.params;
    const url = new URL(request.url);
    const cursor = url.searchParams.get("before") || url.searchParams.get("cursor") || undefined;
    // `around` wins over a cursor: they are two different reads, and honouring
    // both at once would silently drop one of them.
    const around = url.searchParams.get("around") || undefined;
    const limit = readLimit(url);

    const stopAuthTiming = timing.start("auth");
    const [authorization, permission] = await Promise.allSettled([
      dependencies.authenticate(request),
      dependencies.authorizeChannel(claimedUserId, channelId),
    ]);
    stopAuthTiming();

    if (authorization.status === "rejected") {
      throw authorization.reason;
    }
    if (permission.status === "rejected") {
      throw permission.reason;
    }

    const viewerId = authorization.value;
    const [channel, result] = await timing.measure("db", () =>
      Promise.all([
        dependencies.loadChannelSummary(channelId),
        around === undefined
          ? dependencies.listMessages({
              channelId,
              ...(cursor === undefined ? {} : { cursor }),
              limit,
              viewerId,
            })
          : dependencies.listMessagesAround({
              channelId,
              limit,
              messageId: around,
              viewerId,
            }),
      ]),
    );

    return Response.json(
      MobileChannelMessagesResponseSchema.parse({
        channel,
        hasMore: result.hasMore,
        hasNewer: result.hasNewer ?? false,
        messages: result.messages,
        nextCursor: result.nextCursor ?? null,
      }),
      {
        headers: timing.headers({ "Cache-Control": "no-store, no-cache, must-revalidate" }),
      },
    );
  } catch (error) {
    return jsonError(error, timing.requestId);
  }
}

async function loadMobileChannelSummary(channelId: string): Promise<MobileWorkspaceChannelSummary> {
  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    select: {
      category: {
        select: {
          name: true,
        },
      },
      categoryId: true,
      id: true,
      locked: true,
      messages: {
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: {
          author: { select: { displayName: true, id: true, username: true } },
          content: true,
          createdAt: true,
          id: true,
        },
        take: 1,
        where: { deletedAt: null, threadId: null, threadParentId: null },
      },
      name: true,
      position: true,
      topic: true,
      type: true,
    },
  });

  if (!channel || channel.type !== ChannelType.TEXT) {
    throw new ApiError("Channel not found", 404, "CHANNEL_NOT_FOUND");
  }

  const lastMessage = channel.messages[0];
  const text = lastMessage?.content.trim().replace(/\s+/g, " ").slice(0, 240) ?? "";

  return {
    categoryId: channel.categoryId,
    categoryName: channel.category?.name ?? null,
    id: channel.id,
    lastMessage:
      lastMessage && text.length > 0
        ? {
            author: lastMessage.author,
            createdAt: lastMessage.createdAt.toISOString(),
            id: lastMessage.id,
            text,
          }
        : null,
    locked: channel.locked,
    mentionCount: 0,
    name: channel.name,
    position: channel.position,
    readOnly: false,
    topic: channel.topic,
    type: channel.type,
    unreadCount: 0,
  };
}
