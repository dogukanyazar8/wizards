import { MobileDMMessagesResponseSchema, type MobileDMMessagesResponse } from "@wizards/types";
import { prisma } from "@wizards/db";

import { jsonError } from "@/lib/api";
import { enforceApiRateLimit, type ApiRateLimitAction } from "@/lib/api-rate-limit";
import { requireMobileApiUserId } from "@/lib/auth/api";
import { getDirectMessageConversationForUser, listDMMessages } from "@/lib/dm/service";
import { DMConversationParamsSchema, DMMessagesQuerySchema } from "@/lib/dm/types";

const MOBILE_DM_MESSAGE_LIMIT = 30;

export type MobileDMMessagesRouteContext = {
  params: Promise<{ conversationId: string }>;
};

type MobileDMMessagePage = Pick<MobileDMMessagesResponse, "messages" | "nextCursor">;
type MobileDMParticipantReadStateRecord = {
  lastDeliveredAt?: Date | null;
  lastReadAt: Date | null;
  userId: string;
};

export type MobileDMMessagesGetRouteDependencies = {
  authenticate(request: Request): Promise<string>;
  authorizeConversation(
    conversationId: string,
    userId: string,
  ): Promise<MobileDMMessagesResponse["conversation"]>;
  enforceRateLimit(userId: string, action: ApiRateLimitAction): Promise<void>;
  listMessages(input: {
    conversationId: string;
    cursor?: string;
    limit: number;
    userId: string;
  }): Promise<MobileDMMessagePage>;
  listParticipantReadStates(conversationId: string): Promise<MobileDMParticipantReadStateRecord[]>;
};

const defaultDependencies: MobileDMMessagesGetRouteDependencies = {
  authenticate: requireMobileApiUserId,
  authorizeConversation: getDirectMessageConversationForUser,
  enforceRateLimit: enforceApiRateLimit,
  listMessages: ({ conversationId, cursor, limit, userId }) =>
    listDMMessages(userId, conversationId, cursor, limit),
  listParticipantReadStates: (conversationId) =>
    prisma.dMParticipant.findMany({
      where: { conversationId },
      select: { lastDeliveredAt: true, lastReadAt: true, userId: true },
    }),
};

export async function mobileDMMessagesGetRoute(
  request: Request,
  context: MobileDMMessagesRouteContext,
  dependencies: MobileDMMessagesGetRouteDependencies = defaultDependencies,
) {
  try {
    const userId = await dependencies.authenticate(request);

    const { conversationId } = DMConversationParamsSchema.parse(await context.params);
    const url = new URL(request.url);
    const query = DMMessagesQuerySchema.parse({
      cursor: url.searchParams.get("cursor") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
    });
    const limit = Math.min(query.limit, MOBILE_DM_MESSAGE_LIMIT);

    // Opening a conversation used to stack three round trips in front of the
    // read: session, then rate limit, then membership. The last two share only
    // the id the first resolved, so they go out together — and are unwrapped in
    // the original precedence, so a throttled request still reads as 429.
    const [rateLimit, membership] = await Promise.allSettled([
      dependencies.enforceRateLimit(userId, "dm:messages:list"),
      dependencies.authorizeConversation(conversationId, userId),
    ]);
    if (rateLimit.status === "rejected") {
      throw rateLimit.reason;
    }
    if (membership.status === "rejected") {
      throw membership.reason;
    }
    const conversation = membership.value;
    const [messagePage, readStates] = await Promise.all([
      dependencies.listMessages({
        conversationId,
        ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
        limit,
        userId,
      }),
      dependencies.listParticipantReadStates(conversationId),
    ]);

    return Response.json(
      MobileDMMessagesResponseSchema.parse({
        conversation,
        messages: messagePage.messages,
        nextCursor: messagePage.nextCursor,
        participantReadStates: readStates.map((state) => ({
          lastDeliveredAt: state.lastDeliveredAt?.toISOString() ?? null,
          lastReadAt: state.lastReadAt?.toISOString() ?? null,
          userId: state.userId,
        })),
      }),
      {
        headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
      },
    );
  } catch (error) {
    return jsonError(error);
  }
}
