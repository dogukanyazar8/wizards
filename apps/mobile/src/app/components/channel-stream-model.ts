import type { MobileMessageStreamItem } from "../mobile-display-model";
import { getMobileMessageGroupModel, type MobileGroupableMessage } from "./message-grouping";

/**
 * Everything the channel transcript needs from its messages, built once.
 *
 * The screen used to walk the same array six times before a row was drawn: a map
 * to the groupable shape, the grouping model itself, a map to stream items, three
 * `reduce` passes for the telemetry classes, and — unmemoized, so on *every*
 * render — a seventh map to feed the unread anchor. A device measured 1186ms
 * between `list-mounted` and `content` on the channel against the DM's 560ms, and
 * this is the part of that gap the screen owns rather than the renderer.
 *
 * Structural on purpose: the model is pure so it can be tested without React
 * Native, and the caller keeps its own message type.
 */
export type MobileChannelStreamMessage = {
  readonly attachments: readonly unknown[];
  readonly author: { readonly id: string };
  readonly createdAt: string;
  // `| undefined` spelled out: the project runs `exactOptionalPropertyTypes`, and
  // without it a payload whose field is genuinely absent is not assignable here.
  readonly forwardedAt?: string | null | undefined;
  readonly id: string;
  readonly reactions: readonly unknown[];
  readonly replyTo?: unknown;
  readonly type?: string | undefined;
};

/**
 * Fixed-cardinality recycling hint, matching the DM transcript's contract.
 *
 * Without it FlashList recycled a system event, an attachment card and a plain
 * bubble through the same slot: every reuse tore one subtree down and built
 * another, which is the most expensive way a list can reuse a row.
 */
export type MobileChannelStreamItemType = "attachment" | "date" | "rich" | "system" | "text";

/** §2 "1e".10 draws these as a line rather than a message, so they never group. */
export function isMobileChannelSystemEventType(type: string | undefined): boolean {
  return type === "SYSTEM_JOIN" || type === "SYSTEM_LEAVE";
}

export function getMobileChannelMessageItemType(
  item: MobileMessageStreamItem<MobileChannelStreamMessage>,
): MobileChannelStreamItemType {
  if (item.showDateSeparator) return "date";
  if (isMobileChannelSystemEventType(item.message.type)) return "system";
  if (item.message.attachments.length > 0) return "attachment";
  if (
    item.message.replyTo != null ||
    item.message.forwardedAt != null ||
    item.message.reactions.length > 0
  ) {
    return "rich";
  }
  return "text";
}

export type MobileChannelStreamModel<TMessage extends MobileChannelStreamMessage> = {
  readonly attachmentCount: number;
  /** The same shape the unread anchor takes, so nothing maps the list again. */
  readonly groupable: readonly MobileGroupableMessage[];
  readonly items: readonly MobileMessageStreamItem<TMessage>[];
  readonly reactionCount: number;
  readonly richContentCount: number;
};

export function buildMobileChannelStreamModel<TMessage extends MobileChannelStreamMessage>(
  messages: readonly TMessage[],
): MobileChannelStreamModel<TMessage> {
  const groupable: MobileGroupableMessage[] = [];
  let attachmentCount = 0;
  let reactionCount = 0;
  let richContentCount = 0;

  for (const message of messages) {
    groupable.push({
      authorId: message.author.id,
      createdAt: message.createdAt,
      id: message.id,
      isSystemEvent: isMobileChannelSystemEventType(message.type),
    });

    attachmentCount += message.attachments.length;
    reactionCount += message.reactions.length;
    if (
      message.attachments.length > 0 ||
      message.reactions.length > 0 ||
      message.replyTo != null ||
      message.forwardedAt != null
    ) {
      richContentCount += 1;
    }
  }

  const groups = getMobileMessageGroupModel(groupable);
  const items = messages.map((message, index) => {
    const group = groups[index];
    const next = groups[index + 1];

    return {
      id: message.id,
      isGroupedWithNext: next !== undefined && !next.isGroupStart,
      isGroupedWithPrevious: group !== undefined && !group.isGroupStart,
      message,
      showDateSeparator: group?.showDateSeparator === true,
    };
  });

  return { attachmentCount, groupable, items, reactionCount, richContentCount };
}
