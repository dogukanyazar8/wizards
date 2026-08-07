import {
  MobileDMConversationsQuerySchema,
  MobileDMConversationsResponseSchema,
  MobileDMCreateRequestSchema,
  MobileDMCreateResponseSchema,
  type DMConversationDTO,
} from "@wizards/types";
import { enforceApiRateLimit, type ApiRateLimitAction } from "@/lib/api-rate-limit";
import { jsonError, parseJsonBody } from "@/lib/api";
import { requireMobileApiUserId } from "@/lib/auth/api";
import { recordDirectMessageDelivery } from "@/lib/dm/delivery-receipts";
import {
  createOrOpenDirectMessage,
  getDirectMessageUnreadCount,
  listDirectMessages,
} from "@/lib/dm/service";
import { logError } from "@/lib/logger";
import {
  getEmptyMobileDMConversationContext,
  loadMobileDMConversationContext,
  resolveMobileDMPreviewDurationSec,
  resolveMobileDMPreviewKind,
  type MobileDMConversationContext,
} from "@/lib/mobile/dm-list-enrichment";

export type MobileDMCreateDependencies = {
  authenticate(request: Request): Promise<string>;
  createDM(userId: string, targetUserId: string): ReturnType<typeof createOrOpenDirectMessage>;
  enforceRateLimit(userId: string, action: ApiRateLimitAction): Promise<void>;
  parseBody: typeof parseJsonBody;
};
const defaults: MobileDMCreateDependencies = {
  authenticate: (request) => requireMobileApiUserId(request),
  createDM: createOrOpenDirectMessage,
  enforceRateLimit: enforceApiRateLimit,
  parseBody: (request, schema) => parseJsonBody(request, schema),
};

export async function mobileDMCreateRoute(
  request: Request,
  dependencies: MobileDMCreateDependencies = defaults,
) {
  try {
    const userId = await dependencies.authenticate(request);
    await dependencies.enforceRateLimit(userId, "mobile:dm:create");
    const { userId: targetUserId } = await dependencies.parseBody(
      request,
      MobileDMCreateRequestSchema,
    );
    const conversation = await dependencies.createDM(userId, targetUserId);
    return Response.json(MobileDMCreateResponseSchema.parse({ conversation }), { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

type MobileDMListDependencies = {
  authenticate(request: Request): Promise<string>;
  enforceRateLimit(userId: string, action: ApiRateLimitAction): Promise<void>;
  getUnreadCount(userId: string): Promise<number>;
  listDMs(
    userId: string,
    input: { cursor?: string; limit: number },
  ): Promise<{ conversations: DMConversationDTO[]; nextCursor: string | null }>;
  loadConversationContext: typeof loadMobileDMConversationContext;
  /**
   * Pulling the list is proof the viewer's device holds these messages, which is
   * the cold-start half of the "iletildi" tick — a push can wake the app before
   * its socket is up, so the socket ack alone would miss it.
   */
  recordDelivery(userId: string, conversationIds: readonly string[]): Promise<unknown>;
};

const listDefaults: MobileDMListDependencies = {
  authenticate: (request) => requireMobileApiUserId(request),
  enforceRateLimit: enforceApiRateLimit,
  getUnreadCount: getDirectMessageUnreadCount,
  listDMs: listDirectMessages,
  loadConversationContext: loadMobileDMConversationContext,
  recordDelivery: recordDirectMessageDelivery,
};

function normalizePreviewText(message: NonNullable<DMConversationDTO["lastMessage"]>): string {
  const content = message.content.trim().replace(/\s+/g, " ");
  if (content) {
    return content.slice(0, 240);
  }

  const attachmentName = message.attachments[0]?.filename?.trim().replace(/\s+/g, " ");
  return (attachmentName || "Attachment").slice(0, 240);
}

/**
 * Tick state of the viewer's own last message. Null for an incoming preview —
 * that row draws no tick at all.
 *
 * Read wins over delivered: a client that marked the conversation read has
 * necessarily received the message, and a delivery mark can lag behind a read
 * one when the reader opened the chat straight from a push.
 */
export function resolvePreviewDeliveryStatus(
  authorIsCurrentUser: boolean,
  createdAt: string,
  othersLastReadAt: Date | null,
  othersLastDeliveredAt: Date | null,
): "sent" | "delivered" | "read" | null {
  if (!authorIsCurrentUser) {
    return null;
  }

  const sentAt = new Date(createdAt).getTime();
  if (othersLastReadAt && othersLastReadAt.getTime() >= sentAt) {
    return "read";
  }

  if (othersLastDeliveredAt && othersLastDeliveredAt.getTime() >= sentAt) {
    return "delivered";
  }

  return "sent";
}

function toMobileDMConversationListItem(
  conversation: DMConversationDTO,
  currentUserId: string,
  context: MobileDMConversationContext,
) {
  const self = conversation.participants.find(
    (participant) => participant.userId === currentUserId,
  );
  const lastMessage = conversation.lastMessage;
  const previewAttachment = lastMessage?.attachments[0];

  return {
    iconUrl: conversation.iconUrl,
    id: conversation.id,
    lastMessage: lastMessage
      ? {
          author: {
            displayName: lastMessage.author.displayName,
            id: lastMessage.author.id,
            username: lastMessage.author.username,
          },
          authorIsCurrentUser: lastMessage.userId === currentUserId,
          createdAt: lastMessage.createdAt,
          deliveryStatus: resolvePreviewDeliveryStatus(
            lastMessage.userId === currentUserId,
            lastMessage.createdAt,
            context.othersLastReadAt,
            context.othersLastDeliveredAt,
          ),
          durationSec: resolveMobileDMPreviewDurationSec(previewAttachment?.duration),
          id: lastMessage.id,
          kind: previewAttachment
            ? resolveMobileDMPreviewKind(previewAttachment.contentType)
            : ("text" as const),
          text: normalizePreviewText(lastMessage),
        }
      : null,
    lastMessageAt: conversation.lastMessageAt,
    mentionCount: context.mentionCount,
    muted: self?.muted ?? false,
    name: conversation.name,
    participantCount: conversation.participants.length,
    participants: conversation.participants.slice(0, 4).map((participant) => ({
      avatarUrl: participant.avatarUrl,
      displayName: participant.displayName,
      id: participant.userId,
      isBot: context.botUserIds.has(participant.userId),
      status: participant.status,
      username: participant.username,
    })),
    type: conversation.type,
    unreadCount: self?.unreadCount ?? 0,
  };
}

export async function mobileDMListRoute(
  request: Request,
  dependencies: MobileDMListDependencies = listDefaults,
) {
  try {
    const userId = await dependencies.authenticate(request);
    await dependencies.enforceRateLimit(userId, "mobile:dm:conversations:list");
    const url = new URL(request.url);
    const query = MobileDMConversationsQuerySchema.parse({
      cursor: url.searchParams.get("cursor") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
    });
    const [page, totalUnreadCount] = await Promise.all([
      dependencies.listDMs(userId, {
        ...(query.cursor ? { cursor: query.cursor } : {}),
        limit: query.limit,
      }),
      dependencies.getUnreadCount(userId),
    ]);
    const contextByConversationId = await dependencies.loadConversationContext(
      userId,
      page.conversations.map((conversation) => conversation.id),
    );

    const body = MobileDMConversationsResponseSchema.parse({
      conversations: page.conversations.map((conversation) =>
        toMobileDMConversationListItem(
          conversation,
          userId,
          contextByConversationId.get(conversation.id) ?? getEmptyMobileDMConversationContext(),
        ),
      ),
      nextCursor: page.nextCursor,
      totalUnreadCount,
    });

    // The tick other people see is not worth failing this read over.
    await dependencies
      .recordDelivery(
        userId,
        page.conversations.map((conversation) => conversation.id),
      )
      .catch((error: unknown) => {
        logError("[mobile] DM delivery mark failed", error);
      });

    return Response.json(body);
  } catch (error) {
    return jsonError(error);
  }
}
