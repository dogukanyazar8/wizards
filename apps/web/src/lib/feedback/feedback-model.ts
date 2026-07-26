import {
  FEEDBACK_PREVIEW_MAX_LENGTH,
  type FeedbackStatus,
  type MobileRoadmapItem,
} from "@wizards/types";

export { FEEDBACK_PREVIEW_MAX_LENGTH };

/**
 * Order for the roadmap: most-wanted first, then the curated position, then
 * newest. `featured` jumps a row to the top of its own status band because that
 * is what "öne çıkarma" is for in the console.
 */
export function compareRoadmapItems(
  left: { createdAt: string; featured: boolean; position: number; voteCount: number },
  right: { createdAt: string; featured: boolean; position: number; voteCount: number },
): number {
  if (left.featured !== right.featured) {
    return left.featured ? -1 : 1;
  }
  if (left.voteCount !== right.voteCount) {
    return right.voteCount - left.voteCount;
  }
  if (left.position !== right.position) {
    return left.position - right.position;
  }

  return right.createdAt.localeCompare(left.createdAt);
}

/**
 * The 4b card shows three rows. Ranking alone would usually bury the row the
 * viewer just created, and "senin önerin 👋" is the whole reason that card is
 * worth looking at — so if the viewer's own suggestion missed the cut it takes
 * the last slot.
 */
export function resolveMobileRoadmapPreview(
  items: readonly MobileRoadmapItem[],
  limit: number,
): MobileRoadmapItem[] {
  if (limit <= 0) {
    return [];
  }

  const preview = items.slice(0, limit);
  if (preview.some((item) => item.isOwnSuggestion)) {
    return preview;
  }

  const ownSuggestion = items.find((item) => item.isOwnSuggestion);
  if (!ownSuggestion) {
    return preview;
  }

  return preview.length < limit
    ? [...preview, ownSuggestion]
    : [...preview.slice(0, limit - 1), ownSuggestion];
}

/** Console row preview: one line, never a truncated word left dangling mid-escape. */
export function buildFeedbackPreview(
  message: string,
  maxLength = FEEDBACK_PREVIEW_MAX_LENGTH,
): string {
  const collapsed = message.replace(/\s+/g, " ").trim();
  if (collapsed.length <= maxLength) {
    return collapsed;
  }

  return `${collapsed.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

/**
 * A status write that does not move the status must not fire a notification —
 * re-saving the same value in the console is a no-op, not news for the author.
 */
export function shouldNotifyFeedbackStatusChange(
  current: FeedbackStatus,
  next: FeedbackStatus | undefined,
): next is FeedbackStatus {
  return next !== undefined && next !== current;
}
