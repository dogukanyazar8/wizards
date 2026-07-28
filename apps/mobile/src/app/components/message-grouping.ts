import { getMobileDisplayMessageDayKey } from "../mobile-display-model";

/**
 * The one grouping model for every message surface (handoff PROMPT.md §1.2/§5).
 * DM, channel and thread all consume this: a second implementation is how the
 * tail corner and the avatar drift apart between screens.
 */

/** §5: same author, inside five minutes, with nothing in between. */
export const MOBILE_MESSAGE_GROUP_WINDOW_MS = 5 * 60_000;

export interface MobileGroupableMessage {
  readonly authorId: string;
  readonly createdAt: string;
  readonly id: string;
  /** A join/leave/pin event breaks the run it lands in. */
  readonly isSystemEvent?: boolean;
}

export interface MobileMessageGroupEntry {
  readonly id: string;
  readonly isGroupEnd: boolean;
  readonly isGroupStart: boolean;
  /** Channel/thread: the author + time row only prints once per group. */
  readonly showAuthorRow: boolean;
  /** DM: the avatar hangs off the bottom of the group, once. */
  readonly showAvatar: boolean;
  readonly showDateSeparator: boolean;
  /** §0.5: only the group's last bubble corners its tail. */
  readonly tailCorner: boolean;
}

function canGroup(previous: MobileGroupableMessage, current: MobileGroupableMessage): boolean {
  if (previous.isSystemEvent === true || current.isSystemEvent === true) {
    return false;
  }
  if (previous.authorId !== current.authorId) {
    return false;
  }

  const previousDayKey = getMobileDisplayMessageDayKey(previous.createdAt);
  const currentDayKey = getMobileDisplayMessageDayKey(current.createdAt);
  if (previousDayKey.length === 0 || previousDayKey !== currentDayKey) {
    return false;
  }

  const elapsed = Date.parse(current.createdAt) - Date.parse(previous.createdAt);
  return Number.isFinite(elapsed) && elapsed >= 0 && elapsed <= MOBILE_MESSAGE_GROUP_WINDOW_MS;
}

export function getMobileMessageGroupModel(
  messages: readonly MobileGroupableMessage[],
): MobileMessageGroupEntry[] {
  return messages.map((message, index) => {
    const previous = messages[index - 1];
    const next = messages[index + 1];
    const groupedWithPrevious = previous ? canGroup(previous, message) : false;
    const groupedWithNext = next ? canGroup(message, next) : false;
    const dayKey = getMobileDisplayMessageDayKey(message.createdAt);
    const previousDayKey = previous ? getMobileDisplayMessageDayKey(previous.createdAt) : "";

    return {
      id: message.id,
      isGroupEnd: !groupedWithNext,
      isGroupStart: !groupedWithPrevious,
      showAuthorRow: !groupedWithPrevious,
      // The avatar aligns to the bottom of the group, so it belongs to the last
      // row of the run rather than the first.
      showAvatar: !groupedWithNext,
      showDateSeparator: dayKey.length > 0 && dayKey !== previousDayKey,
      tailCorner: !groupedWithNext,
    };
  });
}

/**
 * §5: the unread divider is placed from `lastReadMessageId` and then pinned —
 * reading the messages under it while the screen is open must not make it jump.
 * Callers keep the returned id and pass it back as `pinnedMessageId`.
 */
export function resolveMobileMessageUnreadAnchor({
  lastReadMessageId,
  messages,
  pinnedMessageId = null,
}: {
  readonly lastReadMessageId: string | null;
  readonly messages: readonly MobileGroupableMessage[];
  readonly pinnedMessageId?: string | null;
}): string | null {
  if (pinnedMessageId !== null && messages.some((message) => message.id === pinnedMessageId)) {
    return pinnedMessageId;
  }
  if (lastReadMessageId === null) {
    return null;
  }

  const lastReadIndex = messages.findIndex((message) => message.id === lastReadMessageId);
  if (lastReadIndex < 0) {
    return null;
  }

  return messages[lastReadIndex + 1]?.id ?? null;
}
