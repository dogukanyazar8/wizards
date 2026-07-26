import type {
  MobileServerInviteSheetFriend,
  MobileServerPendingInvite,
  MobileUserSearchResult,
} from "@wizards/types";

import { formatMobileRelativeTime } from "../locale/mobile-relative-time";

/** How long the "Kopyalandı ✓" confirmation replaces the copy button (handoff 2a). */
export const MOBILE_INVITE_COPY_FEEDBACK_MS = 2_000;
/** Keystroke settle window before 2b's search hits the network. */
export const MOBILE_INVITE_SEARCH_DEBOUNCE_MS = 300;

const META_SEPARATOR = " · ";

export interface MobileInviteMetaLabels {
  readonly durationDays: string;
  readonly durationHours: string;
  readonly durationMinutes: string;
  readonly expiresIn: string;
  readonly limitedUses: string;
  readonly neverExpires: string;
  readonly unlimitedUses: string;
}

function fillTemplate(template: string, values: Record<string, string>): string {
  return Object.entries(values).reduce(
    (text, [key, value]) => text.replaceAll(`{${key}}`, value),
    template,
  );
}

/**
 * "7 gün" / "5 sa" / "45 dk" — the remaining life of an invite, rounded down to
 * its largest whole unit. Anything under a minute still reads as "1 dk" so the
 * meta line never claims an invite expires in zero time while it is still live.
 */
export function formatMobileInviteRemaining(
  expiresAt: string,
  labels: MobileInviteMetaLabels,
  now: number,
): string | null {
  const expiry = Date.parse(expiresAt);
  if (!Number.isFinite(expiry) || expiry <= now) {
    return null;
  }

  const minutes = Math.floor((expiry - now) / 60_000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days >= 1) {
    return fillTemplate(labels.durationDays, { count: String(days) });
  }
  if (hours >= 1) {
    return fillTemplate(labels.durationHours, { count: String(hours) });
  }
  return fillTemplate(labels.durationMinutes, { count: String(Math.max(1, minutes)) });
}

/**
 * The 2a meta line: "7 gün sonra sona erer · sınırsız kullanım". Both halves are
 * derived from the stored invite, so a null expiry or a null cap reads as the
 * unlimited wording rather than a blank.
 */
export function formatMobileInviteMeta(
  invite: { readonly expiresAt: string | null; readonly maxUses: number | null },
  labels: MobileInviteMetaLabels,
  now: number,
): string {
  const remaining =
    invite.expiresAt === null ? null : formatMobileInviteRemaining(invite.expiresAt, labels, now);
  const expiryPart =
    remaining === null
      ? labels.neverExpires
      : fillTemplate(labels.expiresIn, { duration: remaining });
  const usesPart =
    invite.maxUses === null
      ? labels.unlimitedUses
      : fillTemplate(labels.limitedUses, { count: String(invite.maxUses) });

  return `${expiryPart}${META_SEPARATOR}${usesPart}`;
}

/**
 * Turkish case folding that keeps a 1:1 character mapping.
 *
 * `"İ".toLowerCase()` yields two code points ("i" + combining dot), which would
 * shift every index after it and highlight the wrong slice. Folding the dotted
 * and dotless pairs explicitly keeps `indexOf` results usable as offsets into
 * the original string.
 */
const TURKISH_CASE_FOLD: Readonly<Record<string, string>> = {
  I: "ı",
  İ: "i",
  ı: "ı",
  i: "i",
};

function foldForMatch(value: string): string {
  let folded = "";
  for (const character of value) {
    const mapped = TURKISH_CASE_FOLD[character];
    if (mapped !== undefined) {
      folded += mapped;
      continue;
    }

    const lowered = character.toLocaleLowerCase("tr");
    // A fold that changes the character count would break index alignment, so
    // such characters stay as they are and simply never match case-insensitively.
    folded += lowered.length === character.length ? lowered : character;
  }

  return folded;
}

export interface MobileUsernameMatchSlices {
  readonly match: string;
  readonly prefix: string;
  readonly suffix: string;
}

/**
 * Splits a username around the searched term so 2b can tint only the matching
 * run. Case-insensitive in the Turkish sense: "DOGU" matches "dogukanyazar",
 * and "ışık" matches "IŞIK".
 */
export function splitMobileUsernameMatch(
  username: string,
  term: string,
): MobileUsernameMatchSlices {
  const trimmed = term.trim();
  if (trimmed.length === 0) {
    return { match: "", prefix: username, suffix: "" };
  }

  const start = foldForMatch(username).indexOf(foldForMatch(trimmed));
  if (start < 0) {
    return { match: "", prefix: username, suffix: "" };
  }

  return {
    match: username.slice(start, start + trimmed.length),
    prefix: username.slice(0, start),
    suffix: username.slice(start + trimmed.length),
  };
}

export type MobileInviteRowAction = "invite" | "member" | "sent";

/**
 * Row button state. Membership wins over everything, and "sent" is derived from
 * the stored pending invite rather than local state, so closing and re-opening
 * the sheet still shows "Gönderildi". `optimisticSent` only covers the window
 * between the tap and the refetch.
 */
export function getMobileInviteRowAction(input: {
  readonly isMember: boolean;
  readonly optimisticSent?: boolean;
  readonly pendingInviteId: string | null;
}): MobileInviteRowAction {
  if (input.isMember) {
    return "member";
  }

  return input.pendingInviteId !== null || input.optimisticSent === true ? "sent" : "invite";
}

/** Members sink to the bottom, online friends rise; ties break alphabetically. */
function compareInviteFriends(
  left: MobileServerInviteSheetFriend,
  right: MobileServerInviteSheetFriend,
): number {
  const rank = (friend: MobileServerInviteSheetFriend) =>
    friend.isMember ? 2 : friend.status === "OFFLINE" ? 1 : 0;
  const rankDelta = rank(left) - rank(right);
  if (rankDelta !== 0) {
    return rankDelta;
  }

  return left.username.localeCompare(right.username, "tr");
}

export function sortMobileInviteFriends(
  friends: readonly MobileServerInviteSheetFriend[],
): MobileServerInviteSheetFriend[] {
  return [...friends].sort(compareInviteFriends);
}

export interface MobileInviteFriendSubtitleLabels {
  readonly alreadyMember: string;
  readonly lastSeen: string;
  readonly offline: string;
  readonly online: string;
}

/** "Çevrimiçi" / "2 sa önce görüldü" / "Zaten üye" — in that precedence. */
export function formatMobileInviteFriendSubtitle(
  friend: Pick<MobileServerInviteSheetFriend, "isMember" | "lastSeenAt" | "status">,
  labels: MobileInviteFriendSubtitleLabels & MobileInviteMetaLabels,
  now: number,
): string {
  if (friend.isMember) {
    return labels.alreadyMember;
  }

  if (friend.status !== "OFFLINE") {
    return labels.online;
  }

  const elapsed =
    friend.lastSeenAt === null ? null : formatMobileElapsedSince(friend.lastSeenAt, labels, now);
  return elapsed === null ? labels.offline : fillTemplate(labels.lastSeen, { duration: elapsed });
}

/** Mirror of `formatMobileInviteRemaining`, pointing backwards instead of forwards. */
export function formatMobileElapsedSince(
  timestamp: string,
  labels: MobileInviteMetaLabels,
  now: number,
): string | null {
  const seen = Date.parse(timestamp);
  if (!Number.isFinite(seen)) {
    return null;
  }

  const minutes = Math.max(0, Math.floor((now - seen) / 60_000));
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days >= 1) {
    return fillTemplate(labels.durationDays, { count: String(days) });
  }
  if (hours >= 1) {
    return fillTemplate(labels.durationHours, { count: String(hours) });
  }
  return fillTemplate(labels.durationMinutes, { count: String(Math.max(1, minutes)) });
}

export type MobileInviteResultEmphasis = "filled" | "soft";

/**
 * 2b gives one result the elevated button: the first row, or any row the viewer
 * already shares a server with. Members get no invite button at all.
 */
export function getMobileInviteResultEmphasis(input: {
  readonly index: number;
  readonly mutualServerCount: number;
}): MobileInviteResultEmphasis {
  return input.index === 0 || input.mutualServerCount > 0 ? "filled" : "soft";
}

export interface MobileInviteResultSubtitleLabels {
  readonly alreadyMember: string;
  readonly mutualServers: string;
  readonly noMutualServers: string;
}

/** "Doğukan Yazar · 2 ortak sunucu" / "Ortak sunucu yok" / "Zaten üye". */
export function formatMobileInviteResultSubtitle(
  result: Pick<MobileUserSearchResult, "displayName" | "isMember" | "mutualServerCount">,
  labels: MobileInviteResultSubtitleLabels,
): string {
  if (result.isMember) {
    return labels.alreadyMember;
  }

  const mutuals =
    result.mutualServerCount > 0
      ? fillTemplate(labels.mutualServers, { count: String(result.mutualServerCount) })
      : labels.noMutualServers;

  const displayName = result.displayName?.trim() ?? "";
  return displayName.length > 0 ? `${displayName}${META_SEPARATOR}${mutuals}` : mutuals;
}

/** Turkish-safe sentence case, so a relative time like "dün" opens the line. */
function capitalizeForLocale(value: string, locale: "en" | "tr"): string {
  const [first] = value;
  if (first === undefined) {
    return value;
  }

  return (
    (locale === "tr" ? first.toLocaleUpperCase("tr") : first.toLocaleUpperCase("en")) +
    value.slice(first.length)
  );
}

/** "Dün gönderildi · yanıt bekleniyor" for a 2b pending row. */
export function formatMobileInvitePendingSubtitle(
  invite: Pick<MobileServerPendingInvite, "createdAt">,
  labels: { readonly pendingStatus: string },
  locale: "en" | "tr",
  now: number,
): string {
  const relative = formatMobileRelativeTime(invite.createdAt, locale, now);
  return fillTemplate(labels.pendingStatus, {
    time: capitalizeForLocale(relative, locale),
  });
}
