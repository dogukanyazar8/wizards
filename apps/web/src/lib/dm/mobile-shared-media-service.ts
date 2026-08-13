import type { MobileDMAttachmentsResponse, MobileDMAttachmentsTab } from "@wizards/types";
import { prisma, type Prisma } from "@wizards/db";
import { ApiError } from "@/lib/api";
import { mapAttachmentsForViewer } from "@/lib/messages/attachment-visibility";
import {
  dmAttachmentSelect,
  requireDMParticipant,
  toHistoryWindowFilter,
  toUnexpiredFilter,
} from "@/lib/dm/service";
import {
  getDmSharedMediaContentTypes,
  mapDmSharedMediaItems,
  type DmSharedMediaMessage,
} from "@/lib/dm/shared-media";

export type MobileDMAttachmentsInput = {
  conversationId: string;
  cursor?: string | undefined;
  limit: number;
  tab: MobileDMAttachmentsTab;
  userId: string;
};

/**
 * `limit` is a message count and the cursor is a message id — the same keyset
 * `listDMMessages` pages by, reusing `@@index([conversationId, createdAt])`.
 * Paging over the `Attachment` table instead would give exact page sizes, but
 * only by ordering on a joined `DMMessage.createdAt`, which that index cannot
 * serve. A message-sized page instead yields a variable item count (up to
 * `MESSAGE_ATTACHMENT_MAX_COUNT` per message), which an infinite grid handles
 * fine and the response schema bounds.
 */
export async function listMobileDMAttachments(
  input: MobileDMAttachmentsInput,
): Promise<MobileDMAttachmentsResponse> {
  const membership = await requireDMParticipant(input.userId, input.conversationId);

  const cursor = await resolveCursor(input.conversationId, input.cursor);
  const messages = await prisma.dMMessage.findMany({
    where: {
      conversationId: input.conversationId,
      deletedAt: null,
      placeholderRemovedAt: null,
      ...buildTabFilter(input.tab),
      // 2c §7. The media grid is a read path into the same rows the message list
      // serves, so it obeys the same floor — otherwise "Yeni üyeler geçmişi
      // görür: Hiç" would hide the messages and hand over their attachments.
      ...toHistoryWindowFilter(membership.historyFromAt, cursor),
      // C4. Same reason the reader filters: the sweep can be a minute behind, and
      // an expired attachment must not outlive its message here either.
      ...toUnexpiredFilter(new Date()),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: input.limit + 1,
    select: {
      attachments: { select: dmAttachmentSelect },
      content: true,
      createdAt: true,
      id: true,
    },
  });

  const hasMore = messages.length > input.limit;
  const pageMessages = hasMore ? messages.slice(0, input.limit) : messages;
  const mapped: DmSharedMediaMessage[] = pageMessages.map((message) => ({
    // Scan status still decides whether a URL is handed out, exactly as it does
    // in the message list: an unscanned upload renders as a placeholder tile.
    attachments: mapAttachmentsForViewer(message.attachments, input.userId),
    content: message.content,
    createdAt: message.createdAt.toISOString(),
    id: message.id,
  }));

  return {
    items: mapDmSharedMediaItems(mapped, input.tab),
    nextCursor: hasMore ? (pageMessages[pageMessages.length - 1]?.id ?? null) : null,
    tab: input.tab,
  };
}

/**
 * `links` has no attachment rows to filter on, so the page is narrowed by the
 * cheapest predicate that cannot produce a false negative: the body must
 * contain the literal scheme every link the client renders starts with. The
 * scan stays inside one conversation's messages via the existing composite
 * index, so no dedicated index is added for it.
 */
function buildTabFilter(tab: MobileDMAttachmentsTab): Prisma.DMMessageWhereInput {
  if (tab === "links") {
    return { content: { contains: "https://" } };
  }

  return {
    attachments: { some: { contentType: { in: getDmSharedMediaContentTypes(tab) } } },
  };
}

async function resolveCursor(conversationId: string, cursor: string | undefined) {
  if (!cursor) {
    return null;
  }

  const cursorMessage = await prisma.dMMessage.findFirst({
    where: { conversationId, id: cursor },
    select: { createdAt: true, id: true },
  });

  if (!cursorMessage) {
    throw new ApiError("Message not found", 404, "NOT_FOUND");
  }

  return cursorMessage;
}
