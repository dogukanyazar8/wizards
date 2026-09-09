import type {
  MessageAttachment,
  MobileDMAttachmentItem,
  MobileDMAttachmentsTab,
  SharedFileDTO,
  SharedLinkDTO,
  SharedMediaItemDTO,
  SharedMediaKind,
  SharedMediaPage,
} from "@wizards/types";
import { prisma, type Prisma } from "@wizards/db";
import { ApiError } from "@/lib/api";
import {
  MESSAGE_FILE_CONTENT_TYPES,
  MESSAGE_IMAGE_CONTENT_TYPES,
  MESSAGE_VIDEO_CONTENT_TYPES,
  isMessageFileContentType,
  isMessageImageContentType,
  isMessageVideoContentType,
} from "@/lib/messages/attachment-rules";
import {
  mapAttachmentsForViewer,
  type AttachmentVisibilityInput,
} from "@/lib/messages/attachment-visibility";
import {
  dmAttachmentSelect,
  requireDMParticipant,
  toHistoryWindowFilter,
  toUnexpiredFilter,
} from "@/lib/dm/service";
import { extractSharedLinks } from "@/lib/dm/shared-links";

/**
 * The single authority behind §15.5's Medya tab — karar K11.
 *
 * Three surfaces read it: the web profile panel's endpoint, the mobile
 * attachments endpoint, and (through `getDmSharedAttachmentSummary` in
 * `./details.ts`) the fixed 30-item preview the DM details response carries.
 * They deliberately classify attachments with the same predicates, so an item
 * never lands in one surface and not the other.
 *
 * Voice notes (`audio/*`) belong to no tab, which is the behaviour the details
 * summary already has: a recorded voice message is played in the thread, not
 * browsed as a file.
 */

/**
 * A single message can technically carry an unbounded number of URLs. The page
 * size is a message count, so without a per-message cap one pathological
 * message could blow past the response schema's item bound.
 */
export const DM_SHARED_MEDIA_LINKS_PER_MESSAGE = 10;

/**
 * How many message bodies the link total is allowed to read.
 *
 * `media` and `file` totals are an index-served `COUNT` over `Attachment`. A
 * link has no row of its own — it lives inside a `Text` column — so an exact
 * total means reading bodies. The scan is bounded rather than unbounded because
 * the number feeds a `+N` overlay, and a conversation with more than this many
 * link-carrying messages is one where the exact figure stopped mattering long
 * before the query cost did.
 */
export const SHARED_LINK_TOTAL_SCAN_MAX = 500;

export type DmSharedMediaMessage = {
  attachments: readonly MessageAttachment[];
  content: string;
  createdAt: string;
  id: string;
};

export function isDmSharedMediaAttachment(attachment: MessageAttachment): boolean {
  return (
    isMessageImageContentType(attachment.contentType) ||
    isMessageVideoContentType(attachment.contentType)
  );
}

export function isDmSharedFileAttachment(attachment: MessageAttachment): boolean {
  return isMessageFileContentType(attachment.contentType);
}

/**
 * Content types the `media` and `files` tabs page over. Used as the database
 * filter so a page of messages never comes back empty after mapping.
 */
export function getDmSharedMediaContentTypes(tab: "files" | "media"): string[] {
  return tab === "media"
    ? [...MESSAGE_IMAGE_CONTENT_TYPES, ...MESSAGE_VIDEO_CONTENT_TYPES]
    : [...MESSAGE_FILE_CONTENT_TYPES];
}

/**
 * The mobile tab names predate `SharedMediaKind`; the two vocabularies are
 * bridged here rather than by renaming a shipped query parameter.
 */
export function toSharedMediaKind(tab: MobileDMAttachmentsTab): SharedMediaKind {
  if (tab === "files") {
    return "file";
  }

  return tab === "links" ? "link" : "media";
}

/**
 * Every https URL in a message body, in the order it was written, deduplicated
 * within the message and capped. Code blocks and inline code are skipped — see
 * `./shared-links.ts`.
 */
export function extractDmMessageLinks(
  content: string,
  limit: number = DM_SHARED_MEDIA_LINKS_PER_MESSAGE,
): string[] {
  return extractSharedLinks(content, limit).map((link) => link.url);
}

/**
 * Flattens a page of messages into gallery items, newest first. Messages arrive
 * newest-first from the keyset query and their attachments keep their authored
 * order, which is what the grid reads top-left to bottom-right.
 */
export function mapDmSharedMediaItems(
  messages: readonly DmSharedMediaMessage[],
  tab: MobileDMAttachmentsTab,
): MobileDMAttachmentItem[] {
  const items: MobileDMAttachmentItem[] = [];

  for (const message of messages) {
    if (tab === "links") {
      extractDmMessageLinks(message.content).forEach((url, index) => {
        items.push({
          id: `${message.id}:${index}`,
          kind: "link",
          messageCreatedAt: message.createdAt,
          messageId: message.id,
          url,
        });
      });
      continue;
    }

    const matches = tab === "media" ? isDmSharedMediaAttachment : isDmSharedFileAttachment;
    for (const attachment of message.attachments) {
      if (!matches(attachment)) {
        continue;
      }

      items.push({
        attachment,
        kind: tab === "media" ? "media" : "file",
        messageCreatedAt: message.createdAt,
        messageId: message.id,
      });
    }
  }

  return items;
}

// ---------------------------------------------------------------------------
// §15.5 DTO mapping
// ---------------------------------------------------------------------------

/**
 * An attachment whose URL the viewer may not have (an unscanned upload from
 * someone else, or an infected one) is **dropped** rather than shipped with an
 * empty href: `SharedMediaItemDTOSchema.url` is a string, the grid tile has
 * nothing to draw, and `total` counts by exactly the same predicate so the
 * `+N` overlay stays consistent with what the grid shows.
 */
export function mapSharedMediaItems(
  messages: readonly DmSharedMediaMessage[],
): SharedMediaItemDTO[] {
  const items: SharedMediaItemDTO[] = [];

  for (const message of messages) {
    for (const attachment of message.attachments) {
      if (!isDmSharedMediaAttachment(attachment) || !attachment.url) {
        continue;
      }

      items.push({
        attachmentId: attachment.id,
        createdAt: message.createdAt,
        height: attachment.height ?? null,
        kind: isMessageImageContentType(attachment.contentType) ? "image" : "video",
        messageId: message.id,
        thumbnailUrl: attachment.thumbnailUrl ?? null,
        url: attachment.url,
        width: attachment.width ?? null,
      });
    }
  }

  return items;
}

export function mapSharedFileItems(messages: readonly DmSharedMediaMessage[]): SharedFileDTO[] {
  const items: SharedFileDTO[] = [];

  for (const message of messages) {
    for (const attachment of message.attachments) {
      if (!isDmSharedFileAttachment(attachment) || !attachment.url) {
        continue;
      }

      items.push({
        attachmentId: attachment.id,
        createdAt: message.createdAt,
        extension: toSharedFileExtension(attachment.filename),
        messageId: message.id,
        name: attachment.filename,
        // Raw bytes. "1,2 MB" is a locale decision and belongs to the client.
        sizeBytes: attachment.size,
        url: attachment.url,
      });
    }
  }

  return items;
}

export function mapSharedLinkItems(messages: readonly DmSharedMediaMessage[]): SharedLinkDTO[] {
  return messages.flatMap((message) =>
    extractSharedLinks(message.content, DM_SHARED_MEDIA_LINKS_PER_MESSAGE).map((link) => ({
      createdAt: message.createdAt,
      host: link.host,
      messageId: message.id,
      title: link.title,
      url: link.url,
    })),
  );
}

/**
 * §15.5's 32×32 tile label (`PDF`, `FIG`). Derived from the name — no column was
 * opened for a value the name already carries.
 *
 * Anything that is not a short alphanumeric suffix yields an empty label rather
 * than a guess: a dotted name with no extension (`surum.2.4`) would otherwise
 * print `4` on the tile.
 */
export function toSharedFileExtension(name: string): string {
  const dot = name.lastIndexOf(".");

  if (dot < 0 || dot === name.length - 1) {
    return "";
  }

  const suffix = name.slice(dot + 1);
  // At least one letter: `7z` is an extension, the `4` of `surum.2.4` is a
  // version number that happens to sit after the last dot.
  const isExtension = /^[a-z0-9]{1,8}$/i.test(suffix) && /[a-z]/i.test(suffix);

  return isExtension ? suffix.toUpperCase() : "";
}

// ---------------------------------------------------------------------------
// The shared read path
// ---------------------------------------------------------------------------

export type ConversationSharedItemsInput = {
  conversationId: string;
  cursor?: string | undefined;
  kind: SharedMediaKind;
  limit: number;
  viewerId: string;
};

export type SharedMediaMessageRow = {
  attachments: AttachmentVisibilityInput[];
  content: string;
  createdAt: Date;
  id: string;
};

export type ConversationSharedItemsDependencies = {
  countAttachments(where: Prisma.AttachmentWhereInput): Promise<number>;
  findCursorMessage(
    conversationId: string,
    cursor: string,
  ): Promise<{ createdAt: Date; id: string } | null>;
  findLinkBodies(where: Prisma.DMMessageWhereInput, take: number): Promise<{ content: string }[]>;
  findMessages(
    where: Prisma.DMMessageWhereInput,
    take: number,
  ): Promise<readonly SharedMediaMessageRow[]>;
  now(): Date;
  requireParticipant(
    userId: string,
    conversationId: string,
  ): Promise<{ historyFromAt: Date | null }>;
};

const defaultDependencies: ConversationSharedItemsDependencies = {
  countAttachments: (where) => prisma.attachment.count({ where }),
  findCursorMessage: (conversationId, cursor) =>
    prisma.dMMessage.findFirst({
      where: { conversationId, id: cursor },
      select: { createdAt: true, id: true },
    }),
  findLinkBodies: (where, take) =>
    prisma.dMMessage.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take,
      select: { content: true },
    }),
  findMessages: (where, take) =>
    prisma.dMMessage.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take,
      select: {
        attachments: { select: dmAttachmentSelect },
        content: true,
        createdAt: true,
        id: true,
      },
    }),
  now: () => new Date(),
  requireParticipant: requireDMParticipant,
};

/**
 * The whole predicate a shared-items read runs under, for every kind.
 *
 * The **visibility rule** lives here and nowhere else: a viewer whose
 * `DMParticipant.historyFromAt` is set (a group's history window, or Ş2's
 * "geçmişi temizle") never sees an attachment or a link from before that
 * instant. It is a read path into the same rows the message list serves, so it
 * obeys the same floor — otherwise a cleared history would leak straight out of
 * the media tab.
 *
 * `toUnexpiredFilter` is the C4 half: the purge worker runs on a 60-second
 * tick, and an expired attachment must not outlive its message here either.
 */
export function buildSharedItemsMessageWhere(input: {
  conversationId: string;
  cursor: { createdAt: Date; id: string } | null;
  historyFromAt: Date | null;
  kind: SharedMediaKind;
  now: Date;
}): Prisma.DMMessageWhereInput {
  return {
    conversationId: input.conversationId,
    deletedAt: null,
    placeholderRemovedAt: null,
    ...buildKindFilter(input.kind),
    ...toHistoryWindowFilter(input.historyFromAt, input.cursor),
    ...toUnexpiredFilter(input.now),
  };
}

/**
 * A page of the messages behind one kind, mapped for the viewer.
 *
 * `limit` is a message count and the cursor is a message id — the same keyset
 * `listDMMessages` pages by, reusing `@@index([conversationId, createdAt])`.
 * Paging over the `Attachment` table instead would give exact page sizes, but
 * only by ordering on a joined `DMMessage.createdAt`, which that index cannot
 * serve. A message-sized page instead yields a variable item count, which an
 * infinite grid handles fine and the response schema bounds.
 */
export async function loadConversationSharedMessages(
  input: ConversationSharedItemsInput,
  dependencies: ConversationSharedItemsDependencies = defaultDependencies,
): Promise<{ messages: DmSharedMediaMessage[]; nextCursor: string | null }> {
  const { messages, nextCursor } = await loadPage(input, dependencies);

  return { messages, nextCursor };
}

/**
 * §15.5's Medya tab, one endpoint, three kinds — karar K16's `{ items,
 * nextCursor }` plus the real `total` the `+N` overlay needs.
 */
export async function getConversationSharedItems(
  input: ConversationSharedItemsInput,
  dependencies: ConversationSharedItemsDependencies = defaultDependencies,
): Promise<SharedMediaPage> {
  const page = await loadPage(input, dependencies);
  const total = await countSharedItems(input, page.historyFromAt, dependencies);

  return {
    items: mapSharedItems(page.messages, input.kind),
    kind: input.kind,
    nextCursor: page.nextCursor,
    total,
  };
}

function mapSharedItems(
  messages: readonly DmSharedMediaMessage[],
  kind: SharedMediaKind,
): SharedMediaPage["items"] {
  if (kind === "media") {
    return mapSharedMediaItems(messages);
  }

  return kind === "file" ? mapSharedFileItems(messages) : mapSharedLinkItems(messages);
}

async function loadPage(
  input: ConversationSharedItemsInput,
  dependencies: ConversationSharedItemsDependencies,
): Promise<{
  historyFromAt: Date | null;
  messages: DmSharedMediaMessage[];
  nextCursor: string | null;
}> {
  const membership = await dependencies.requireParticipant(input.viewerId, input.conversationId);
  const cursor = await resolveCursor(input.conversationId, input.cursor, dependencies);
  const rows = await dependencies.findMessages(
    buildSharedItemsMessageWhere({
      conversationId: input.conversationId,
      cursor,
      historyFromAt: membership.historyFromAt,
      kind: input.kind,
      now: dependencies.now(),
    }),
    input.limit + 1,
  );

  const hasMore = rows.length > input.limit;
  const pageRows = hasMore ? rows.slice(0, input.limit) : rows;

  return {
    historyFromAt: membership.historyFromAt,
    messages: pageRows.map((row) => ({
      // Scan status still decides whether a URL is handed out, exactly as it
      // does in the message list: an unscanned upload renders as a placeholder.
      attachments: mapAttachmentsForViewer(row.attachments, input.viewerId),
      content: row.content,
      createdAt: row.createdAt.toISOString(),
      id: row.id,
    })),
    nextCursor: hasMore ? (pageRows[pageRows.length - 1]?.id ?? null) : null,
  };
}

/**
 * The real total, never the page length.
 *
 * §15.5 prints `PAYLAŞILAN MEDYA 18` and puts `+12` on the sixth tile; both
 * numbers come from here. Deriving them from the loaded page would make the
 * overlay say `+0` on a full conversation, which is the exact lie K11 removed
 * the React Query derivation for.
 *
 * The cursor is deliberately **not** part of the count filter: `total` counts
 * the whole visible list, not the tail after the cursor.
 */
async function countSharedItems(
  input: ConversationSharedItemsInput,
  historyFromAt: Date | null,
  dependencies: ConversationSharedItemsDependencies,
): Promise<number> {
  const scope = buildSharedItemsMessageWhere({
    conversationId: input.conversationId,
    cursor: null,
    historyFromAt,
    kind: input.kind,
    now: dependencies.now(),
  });

  if (input.kind === "link") {
    const bodies = await dependencies.findLinkBodies(scope, SHARED_LINK_TOTAL_SCAN_MAX);

    return bodies.reduce(
      (total, body) =>
        total + extractSharedLinks(body.content, DM_SHARED_MEDIA_LINKS_PER_MESSAGE).length,
      0,
    );
  }

  return dependencies.countAttachments({
    contentType: { in: getDmSharedMediaContentTypes(input.kind === "media" ? "media" : "files") },
    dmMessage: { is: scope },
    ...buildViewableAttachmentWhere(input.viewerId),
  });
}

/**
 * `canViewAttachmentUrl` as a database predicate. The mapper drops attachments
 * whose URL the viewer cannot have, so the count must drop the same rows or the
 * `+N` overlay would promise tiles the grid never draws.
 */
function buildViewableAttachmentWhere(viewerId: string): Prisma.AttachmentWhereInput {
  return {
    OR: [
      { scanStatus: "CLEAN" },
      { AND: [{ scanStatus: { not: "INFECTED" } }, { userId: viewerId }] },
    ],
  };
}

/**
 * `links` has no attachment rows to filter on, so the page is narrowed by the
 * cheapest predicate that cannot produce a false negative: the body must
 * contain the literal scheme every link the client renders starts with. The
 * scan stays inside one conversation's messages via the existing composite
 * index, so no dedicated index is added for it.
 *
 * The predicate is deliberately wider than the extractor: a body whose only URL
 * sits inside a code fence matches here and yields no item. A page can
 * therefore come back short with a cursor still set, which is what an infinite
 * list already handles.
 */
function buildKindFilter(kind: SharedMediaKind): Prisma.DMMessageWhereInput {
  if (kind === "link") {
    return { content: { contains: "https://" } };
  }

  return {
    attachments: {
      some: {
        contentType: { in: getDmSharedMediaContentTypes(kind === "media" ? "media" : "files") },
      },
    },
  };
}

async function resolveCursor(
  conversationId: string,
  cursor: string | undefined,
  dependencies: ConversationSharedItemsDependencies,
) {
  if (!cursor) {
    return null;
  }

  const cursorMessage = await dependencies.findCursorMessage(conversationId, cursor);

  if (!cursorMessage) {
    throw new ApiError("Message not found", 404, "NOT_FOUND");
  }

  return cursorMessage;
}
