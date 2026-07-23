import type { MessageAttachment, MobileDMAttachmentItem, MobileDMAttachmentsTab } from "@wizards/types";
import {
  MESSAGE_FILE_CONTENT_TYPES,
  MESSAGE_IMAGE_CONTENT_TYPES,
  MESSAGE_VIDEO_CONTENT_TYPES,
  isMessageFileContentType,
  isMessageImageContentType,
  isMessageVideoContentType,
} from "@/lib/messages/attachment-rules";

/**
 * 11f shared-media gallery mapping. `getDmSharedAttachmentSummary` in
 * `./details.ts` still owns the fixed 30-item preview the DM details response
 * carries; this module owns the paged full history behind it and deliberately
 * classifies attachments with the same predicates, so an item never lands in
 * one surface and not the other.
 *
 * Voice notes (`audio/*`) belong to neither tab, which is the behaviour the
 * details summary already has: a recorded voice message is played in the
 * thread, not browsed as a file.
 */

/**
 * The link scanner is a literal port of the mobile message renderer's
 * `LINK_PATTERN` (`apps/mobile/src/app/mobile-mention.ts`). Both sides must
 * agree on what counts as a link, otherwise the gallery lists a URL the chat
 * bubble never rendered as tappable — or misses one it did.
 */
const LINK_PATTERN = /https:\/\/[^\s]+/g;

/**
 * A single message can technically carry an unbounded number of URLs. The page
 * size is a message count, so without a per-message cap one pathological
 * message could blow past the response schema's item bound.
 */
export const DM_SHARED_MEDIA_LINKS_PER_MESSAGE = 10;

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
 * Every https URL in a message body, in the order it was written, deduplicated
 * within the message and capped. A token that the URL parser rejects (a bare
 * `https://`, an over-long paste) is dropped rather than shipped, because the
 * response schema would reject it anyway.
 */
export function extractDmMessageLinks(
  content: string,
  limit: number = DM_SHARED_MEDIA_LINKS_PER_MESSAGE,
): string[] {
  const pattern = new RegExp(LINK_PATTERN.source, "g");
  const links: string[] = [];
  const seen = new Set<string>();
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(content)) !== null && links.length < limit) {
    const candidate = match[0];
    if (seen.has(candidate) || candidate.length > 2048) {
      continue;
    }

    let parsed: URL;
    try {
      parsed = new URL(candidate);
    } catch {
      continue;
    }

    if (parsed.protocol !== "https:") {
      continue;
    }

    seen.add(candidate);
    links.push(candidate);
  }

  return links;
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
