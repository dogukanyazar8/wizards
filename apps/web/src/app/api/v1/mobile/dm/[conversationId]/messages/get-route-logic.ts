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
      select: { lastReadAt: true, userId: true },
    }),
};

export async function mobileDMMessagesGetRoute(
  request: Request,
  context: MobileDMMessagesRouteContext,
  dependencies: MobileDMMessagesGetRouteDependencies = defaultDependencies,
) {
  try {
    const userId = await dependencies.authenticate(request);
    await dependencies.enforceRateLimit(userId, "dm:messages:list");

    const { conversationId } = DMConversationParamsSchema.parse(await context.params);
    const url = new URL(request.url);
    const query = DMMessagesQuerySchema.parse({
      cursor: url.searchParams.get("cursor") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
    });
    const limit = Math.min(query.limit, MOBILE_DM_MESSAGE_LIMIT);

    const conversation = await dependencies.authorizeConversation(conversationId, userId);
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
