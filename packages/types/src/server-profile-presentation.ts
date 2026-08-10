import type { ServerPublicProfileFriend } from "./workspace";

/**
 * The server profile card (2g) is the first surface both web and mobile
 * render from `ServerPublicProfileSchema`. These display decisions are
 * derived once here so neither client re-implements them as an inline `if`
 * chain and the two silently drift.
 */

export type ServerProfileLocale = "tr" | "en";

const COMPACT_COUNT_THRESHOLD = 1000;

const COMPACT_COUNT_SUFFIX: Record<ServerProfileLocale, string> = {
  en: "K",
  tr: "B",
};

const COMPACT_COUNT_DECIMAL_SEPARATOR: Record<ServerProfileLocale, string> = {
  en: ".",
  tr: ",",
};

/**
 * Matches the 2g design's online/member counters exactly: 12400 -> "12,4B",
 * 1200 -> "1,2B" (design_handoff_whispr_hakkinda/Whispr Hakkında
 * Ekranı.dc.html:552,556). Below the threshold the design never abbreviates,
 * so the value is shown in full. A whole-number scale (e.g. 5000 -> "5B")
 * drops the zero decimal rather than printing "5,0B".
 */
export function formatServerProfileCount(value: number, locale: ServerProfileLocale): string {
  if (value < COMPACT_COUNT_THRESHOLD) {
    return String(value);
  }

  const scaled = (Math.round(value / 100) / 10).toFixed(1);
  const [wholePart, fractionPart] = scaled.split(".");
  const suffix = COMPACT_COUNT_SUFFIX[locale];

  if (fractionPart === "0") {
    return `${wholePart}${suffix}`;
  }

  return `${wholePart}${COMPACT_COUNT_DECIMAL_SEPARATOR[locale]}${fractionPart}${suffix}`;
}

export type ServerProfileChannelBadge =
  | { readonly count: number; readonly kind: "live-count"; readonly label: string }
  | { readonly kind: "live"; readonly label: string }
  | { readonly kind: "read-only"; readonly label: string }
  | null;

/**
 * The 2g KANALLAR list (design_handoff_whispr_hakkinda/Whispr Hakkında
 * Ekranı.dc.html:567-596) shows exactly three badge states across its four
 * rows: "duyurular" is read-only, "yol-haritası" carries the violet CANLI
 * pill, "topluluk-sesli" is a voice row with a live headcount, and
 * "beta-geri-bildirim" — an ordinary writable text row — has no badge at
 * all. That fourth, badge-less row is why this returns `null` rather than
 * inventing a fallback label.
 *
 * `readOnly` is checked first regardless of channel type: the design never
 * shows a read-only voice row, but `readOnly` already means "cannot use
 * this channel" for either type, so it outranks the live indicators rather
 * than being silently skipped for voice.
 */
export function resolveServerProfileChannelBadge(channel: {
  readonly liveCount: number | null;
  readonly readOnly: boolean;
  readonly type: "text" | "voice";
}): ServerProfileChannelBadge {
  if (channel.readOnly) {
    return { kind: "read-only", label: "salt okunur" };
  }

  if (channel.type === "voice" && channel.liveCount !== null && channel.liveCount > 0) {
    return { count: channel.liveCount, kind: "live-count", label: `${channel.liveCount} kişi` };
  }

  if (channel.type === "text" && channel.liveCount === 0) {
    return { kind: "live", label: "CANLI" };
  }

  return null;
}

export type ServerProfileFriendStack = {
  readonly caption: string;
  readonly overflowCount: number;
  readonly visible: readonly ServerPublicProfileFriend[];
};

const MAX_VISIBLE_FRIEND_AVATARS = 4;

/**
 * Caps the avatar row at 4 regardless of how many mutual-friend records were
 * fetched — the service itself already caps that list at 8 (see
 * `server-public-profile-service.ts`). The overflow badge and the caption
 * both read `mutualFriendCount`, the true total, not the fetched array's
 * length: the design's 3 visible avatars + "+9" overflow badge add up to
 * the caption's "12 kişi" (design_handoff_whispr_hakkinda/Whispr Hakkında
 * Ekranı.dc.html:598-604), not to the (smaller, server-capped) fetch size.
 *
 * Returns `null` when there are no mutual friends at all, so the caller can
 * skip rendering the card without re-deriving that check itself.
 */
export function resolveServerProfileFriendStack(
  mutualFriends: readonly ServerPublicProfileFriend[],
  mutualFriendCount: number,
): ServerProfileFriendStack | null {
  if (mutualFriendCount <= 0) {
    return null;
  }

  const visible = mutualFriends.slice(0, MAX_VISIBLE_FRIEND_AVATARS);
  const overflowCount = Math.max(0, mutualFriendCount - visible.length);

  return {
    caption: `Arkadaşlarından ${mutualFriendCount} kişi bu sunucuda`,
    overflowCount,
    visible,
  };
}

export type ServerProfileJoinAction = {
  readonly kind: "go" | "join";
  readonly label: string;
};

/**
 * S2 keeps the card read-only (binding decision 2): a member sees "Sunucuya
 * git" and is routed to the server itself; a non-member sees "Sunucuya
 * katıl" and is routed to the existing invite flow instead of a join
 * mutation, which ships in S3.
 */
export function resolveServerProfileJoinAction(joined: boolean): ServerProfileJoinAction {
  return joined ? { kind: "go", label: "Sunucuya git" } : { kind: "join", label: "Sunucuya katıl" };
}

export const SERVER_SCHEDULED_EVENT_JOIN_WINDOW_MS = 15 * 60 * 1000;

export type ServerScheduledEventAction = {
  readonly kind: "join" | "remind";
  readonly label: string;
};

/**
 * Faz 1 §C4: the 15-minute threshold is a pure function so web and mobile call
 * it instead of each computing its own. Inside the window (and at any point
 * after the start) the button connects to the event's channel; before it, the
 * button toggles interest.
 *
 * A cancelled or completed event never offers either action — the caller gets
 * `null` and hides the button rather than inventing a disabled state.
 */
export function resolveServerScheduledEventAction(
  event: { readonly scheduledStartAt: string; readonly status: string },
  nowMs: number,
): ServerScheduledEventAction | null {
  if (event.status === "CANCELLED" || event.status === "COMPLETED") {
    return null;
  }

  const startMs = Date.parse(event.scheduledStartAt);
  if (Number.isNaN(startMs)) {
    return null;
  }

  return startMs - nowMs <= SERVER_SCHEDULED_EVENT_JOIN_WINDOW_MS
    ? { kind: "join", label: "Katıl" }
    : { kind: "remind", label: "Hatırlat" };
}
