import type {
  MessageAttachment,
  MobileDMAttachmentItem,
  MobileDMAttachmentsTab,
} from "@wizards/types";

/**
 * 11f shared-media gallery view model. The screen renders a FlashList of
 * fixed-shape rows rather than a `numColumns` grid, because a media page mixes
 * month headers with three-up tiles: pre-chunking here keeps every cell a
 * stable, memoizable component and keeps the row heights predictable.
 */

export const MOBILE_SHARED_MEDIA_COLUMNS = 3;

export type MobileSharedMediaTab = MobileDMAttachmentsTab;
export type MobileSharedMediaMediaItem = Extract<MobileDMAttachmentItem, { kind: "media" }>;
export type MobileSharedMediaFileItem = Extract<MobileDMAttachmentItem, { kind: "file" }>;
export type MobileSharedMediaLinkItem = Extract<MobileDMAttachmentItem, { kind: "link" }>;

export type MobileSharedMediaCell = {
  /** Only set when the attachment actually carries duration metadata. */
  readonly durationLabel: string | null;
  readonly id: string;
  readonly index: number;
  readonly isVideo: boolean;
  readonly item: MobileSharedMediaMediaItem;
  /** Thumbnail source; null renders the placeholder tile instead of an image. */
  readonly uri: string | null;
};

export type MobileSharedMediaRow =
  | { readonly id: string; readonly kind: "month"; readonly label: string }
  | { readonly cells: readonly MobileSharedMediaCell[]; readonly id: string; readonly kind: "grid" }
  | { readonly id: string; readonly item: MobileSharedMediaFileItem; readonly kind: "file" }
  | { readonly id: string; readonly item: MobileSharedMediaLinkItem; readonly kind: "link" };

const IMAGE_CONTENT_TYPE = /^image\//;
const VIDEO_CONTENT_TYPE = /^video\//;

export function isMobileSharedMediaVideo(attachment: MessageAttachment): boolean {
  return VIDEO_CONTENT_TYPE.test(attachment.contentType);
}

/**
 * A poster frame if the upload produced one, the image itself for photos, and
 * null for a video without a thumbnail — the tile then draws the play glyph
 * instead of inventing a frame. A blocked scan already nulls `url` upstream.
 */
export function resolveMobileSharedMediaThumbnail(attachment: MessageAttachment): string | null {
  if (attachment.thumbnailUrl) {
    return attachment.thumbnailUrl;
  }

  return IMAGE_CONTENT_TYPE.test(attachment.contentType) ? (attachment.url ?? null) : null;
}

/** `0:42`, `1:15`, `1:02:03`. Returns null unless real metadata is present. */
export function formatMobileMediaDuration(duration: number | null | undefined): string | null {
  if (typeof duration !== "number" || !Number.isFinite(duration) || duration <= 0) {
    return null;
  }

  const total = Math.round(duration);
  const seconds = total % 60;
  const minutes = Math.floor(total / 60) % 60;
  const hours = Math.floor(total / 3600);
  const paddedSeconds = String(seconds).padStart(2, "0");

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${paddedSeconds}`;
  }

  return `${minutes}:${paddedSeconds}`;
}

/**
 * Local-calendar month bucket, matching the date separators in the message
 * list: a message sent at 01:30 local time belongs to the month the sender saw.
 */
export function getMobileSharedMediaMonthKey(value: string): string | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export type MobileSharedMediaRowOptions = {
  readonly columns?: number;
  /** Locale-aware, already uppercased by the caller ("TEMMUZ 2026"). */
  formatMonthLabel(value: string): string;
};

/**
 * Groups one flat, newest-first item list into rendered rows. Items whose
 * timestamp does not parse keep their position but never open a month section,
 * so a malformed row can never split the list into duplicate headers.
 */
export function buildMobileSharedMediaRows(
  items: readonly MobileDMAttachmentItem[],
  tab: MobileSharedMediaTab,
  options: MobileSharedMediaRowOptions,
): MobileSharedMediaRow[] {
  const columns = Math.max(1, options.columns ?? MOBILE_SHARED_MEDIA_COLUMNS);
  const rows: MobileSharedMediaRow[] = [];
  let currentMonthKey: string | null = null;
  let pending: MobileSharedMediaCell[] = [];

  const flushPendingGrid = () => {
    if (pending.length === 0) {
      return;
    }
    rows.push({ cells: pending, id: `grid-${pending[0]?.id ?? rows.length}`, kind: "grid" });
    pending = [];
  };

  items.forEach((item, index) => {
    const monthKey = getMobileSharedMediaMonthKey(item.messageCreatedAt);
    if (monthKey !== null && monthKey !== currentMonthKey) {
      flushPendingGrid();
      currentMonthKey = monthKey;
      rows.push({
        id: `month-${monthKey}`,
        kind: "month",
        label: options.formatMonthLabel(item.messageCreatedAt),
      });
    }

    if (item.kind === "media" && tab === "media") {
      pending.push({
        durationLabel: isMobileSharedMediaVideo(item.attachment)
          ? formatMobileMediaDuration(item.attachment.duration)
          : null,
        id: item.attachment.id,
        index,
        isVideo: isMobileSharedMediaVideo(item.attachment),
        item,
        uri: resolveMobileSharedMediaThumbnail(item.attachment),
      });
      if (pending.length === columns) {
        flushPendingGrid();
      }
      return;
    }

    if (item.kind === "file" && tab === "files") {
      rows.push({ id: `file-${item.attachment.id}`, item, kind: "file" });
      return;
    }

    if (item.kind === "link" && tab === "links") {
      rows.push({ id: `link-${item.id}`, item, kind: "link" });
    }
  });

  flushPendingGrid();
  return rows;
}

/**
 * Every media item in load order, which is what the lightbox steps through: the
 * viewer is opened with an index into this list, not into the row chunks.
 */
export function collectMobileSharedMediaViewerSources(
  items: readonly MobileDMAttachmentItem[],
): { readonly createdAt: string; readonly id: string; readonly uri: string }[] {
  return items.flatMap((item) => {
    if (item.kind !== "media") {
      return [];
    }

    const uri = item.attachment.url ?? resolveMobileSharedMediaThumbnail(item.attachment);
    return uri === null ? [] : [{ createdAt: item.messageCreatedAt, id: item.attachment.id, uri }];
  });
}

/** Human-readable size for a file row: `4 KB`, `1.2 MB`. */
export function formatMobileSharedMediaSize(size: number): string {
  if (size < 1024) {
    return `${size} B`;
  }

  const kilobytes = size / 1024;
  if (kilobytes < 1024) {
    return `${kilobytes.toFixed(kilobytes >= 10 ? 0 : 1)} KB`;
  }

  const megabytes = kilobytes / 1024;
  return `${megabytes.toFixed(megabytes >= 10 ? 0 : 1)} MB`;
}

export type MobileSharedMediaParticipantSource = {
  readonly id: string;
  readonly name: string | null;
  readonly participants: readonly {
    readonly displayName: string | null;
    readonly id: string;
    readonly username: string;
  }[];
};

/**
 * The gallery header names the person it is about. That name is already in the
 * DM conversation cache the caller came through, so it is read from there
 * rather than costing a second request; a cold cache degrades to a name-less
 * subtitle instead of blocking the list.
 *
 * The DM header opens this route without a `userId`, and every conversation
 * payload lists the viewer too (joinedAt asc, so usually first) — reading
 * `participants[0]` therefore subtitled the gallery with the viewer's own name.
 * `currentUserId` drops the viewer from the candidates, exactly like
 * `getMobileConversationCounterparts`; a conversation with nobody else left
 * keeps the viewer so a note-to-self still has a name.
 */
export function resolveMobileSharedMediaParticipantName(
  conversations: readonly MobileSharedMediaParticipantSource[],
  input: {
    readonly conversationId: string;
    readonly currentUserId?: string | undefined;
    readonly userId?: string | undefined;
  },
): string | null {
  const conversation = conversations.find((entry) => entry.id === input.conversationId);
  if (!conversation) {
    return null;
  }

  const participant = input.userId
    ? conversation.participants.find((entry) => entry.id === input.userId)
    : getMobileSharedMediaCounterparts(conversation, input.currentUserId)[0];

  if (participant) {
    return participant.displayName ?? participant.username;
  }

  return conversation.name;
}

function getMobileSharedMediaCounterparts(
  conversation: MobileSharedMediaParticipantSource,
  currentUserId?: string,
): MobileSharedMediaParticipantSource["participants"] {
  if (!currentUserId) {
    return conversation.participants;
  }

  const counterparts = conversation.participants.filter((entry) => entry.id !== currentUserId);
  return counterparts.length > 0 ? counterparts : conversation.participants;
}

/** `whispr.test` — the host is the only "title" a link row can show for free. */
export function getMobileSharedMediaLinkHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
