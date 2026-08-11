import {
  buildGroupInviteDisplayUrl,
  buildGroupNameFromMembers,
  canMemberDo,
  GROUP_DM_DESCRIPTION_MAX_LENGTH,
  GROUP_DM_NAME_MAX_LENGTH,
  GROUP_MEMBER_NAME_COLORS,
  type DMParticipantRole,
  type GroupAvatarTile,
  type GroupCallStateDTO,
  type GroupDisappearingWindow,
  type GroupHistoryVisibility,
  type GroupMemberNameColor,
  type GroupNameLocale,
  type GroupPermissions,
} from "@wizards/types";

/**
 * Pure logic for the group surfaces (2a–2f): the crossed avatar pair, the typing
 * and read-receipt sentences, the inbox filter and ordering, the capability and
 * member-sheet gates, the pinned strip, the call banner, the two counters and
 * 2b's "frequent contacts" derivation.
 *
 * Free of React and of storage so every rule is unit-tested from
 * `scripts/mobile-group-chat-model.test.ts` (§4.7 — the node runner cannot load
 * React Native). Five screens read these; none of them re-derives one.
 */

/**
 * §B3. `buildGroupInviteDisplayUrl` is re-exported rather than reimplemented:
 * the group settings row and the web invite card have to print the same string,
 * and that rule already lives in `@wizards/types`.
 */
export { buildGroupInviteDisplayUrl };

export interface MobileGroupAvatarPair {
  /** `+4` when the slot hides members, `null` when both tiles are people. */
  readonly overflowLabel: string | null;
  readonly tiles: GroupAvatarTile[];
}

const GROUP_AVATAR_SLOT_TILES = 2;

/**
 * V7 / §11.0.7. The 46px slot holds two 30px tiles; once anybody is hidden the
 * second tile becomes the `+N` counter, so the badge covers the member it
 * displaced as well as everyone `overflowCount` already counted.
 *
 * The design's own mock is inconsistent here — HTML 104 draws `+3` while HTML 67
 * draws two initials for a six-person group — and §11.0.7 is the rule the user
 * confirmed (03 §F).
 */
export function getGroupAvatarPair(
  pair: readonly GroupAvatarTile[],
  overflowCount: number,
): MobileGroupAvatarPair {
  const hidden = Math.max(0, Math.trunc(overflowCount));

  if (hidden === 0) {
    return { overflowLabel: null, tiles: pair.slice(0, GROUP_AVATAR_SLOT_TILES) };
  }

  const tiles = pair.slice(0, GROUP_AVATAR_SLOT_TILES - 1);
  // A pair that arrived with a single tile has nothing to displace, so the badge
  // counts exactly what the server said was hidden.
  const displaced = Math.min(pair.length, GROUP_AVATAR_SLOT_TILES) - tiles.length;

  return { overflowLabel: `+${hidden + displaced}`, tiles };
}

/**
 * 2c §4's live hint. Delegates to the shared rule so the hint and the name the
 * group ends up with are the same string (§4.4); a local join here is exactly
 * the duplication §B3 forbids.
 */
export function buildGroupNameHint(
  memberNames: readonly string[],
  locale: GroupNameLocale,
): string {
  return buildGroupNameFromMembers(memberNames, locale);
}

export interface MobileGroupTypingCopy {
  readonly messagesTypingMany: string;
  readonly messagesTypingOne: string;
  readonly messagesTypingTwo: string;
}

/**
 * 2a §4 / 2d §9. One name, two names, or the first name plus a count. `null`
 * means "draw no line", which is not the same as an empty string — the row
 * keeps its message preview instead of blanking it.
 */
export function formatGroupTypingLabel(
  names: readonly string[],
  copy: MobileGroupTypingCopy,
): string | null {
  const typists = names.map((name) => name.trim()).filter((name) => name.length > 0);
  const [first, second] = typists;

  if (!first) {
    return null;
  }

  if (typists.length === 1) {
    return copy.messagesTypingOne.replace("{name}", first);
  }

  if (typists.length === 2 && second) {
    return copy.messagesTypingTwo.replace("{a}", first).replace("{b}", second);
  }

  return copy.messagesTypingMany
    .replace("{a}", first)
    .replace("{count}", String(typists.length - 1));
}

export interface MobileGroupReadReceiptCopy {
  readonly groupChatReadBy: string;
  readonly groupChatReadByAll: string;
}

/**
 * 2d §8. `null` is the "no line" signal: a message nobody has read yet carries
 * no receipt row at all, so the bubble does not reserve space for one.
 *
 * A zero count wins over `everyone`: an empty reader set is not everybody, and
 * the two arrive from the same payload where a group of one can set both.
 */
export function formatReadReceiptLabel(
  count: number,
  everyone: boolean,
  copy: MobileGroupReadReceiptCopy,
): string | null {
  if (count <= 0) {
    return null;
  }

  return everyone
    ? copy.groupChatReadByAll
    : copy.groupChatReadBy.replace("{count}", String(count));
}

/** V4. 2a's four chips, client-side over the inbox the reader already has. */
export type MobileConversationFilterId = "all" | "groups" | "muted" | "unread";

export const MOBILE_CONVERSATION_FILTERS: readonly MobileConversationFilterId[] = [
  "all",
  "unread",
  "groups",
  "muted",
];

export const MOBILE_CONVERSATION_DEFAULT_FILTER: MobileConversationFilterId = "all";

export function isMobileConversationFilterId(value: unknown): value is MobileConversationFilterId {
  return (
    typeof value === "string" && (MOBILE_CONVERSATION_FILTERS as readonly string[]).includes(value)
  );
}

/**
 * V4. The choice is per user and never leaves the device, so the stored map is
 * keyed by account id: a shared phone must not show the previous account's chip
 * as active on the first frame.
 */
export function buildMobileConversationFilterKey(userId: string): string {
  return `user:${userId}`;
}

/**
 * A stored value that is no longer a filter id — an older build, a hand-edited
 * store — is dropped rather than trusted, and so is the default: absent already
 * means "Tümü", so writing it would only grow the record.
 */
export function parseMobileConversationFilters(
  raw: string | null | undefined,
): Record<string, MobileConversationFilterId> {
  if (!raw) {
    return {};
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    const result: Record<string, MobileConversationFilterId> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (isMobileConversationFilterId(value) && value !== MOBILE_CONVERSATION_DEFAULT_FILTER) {
        result[key] = value;
      }
    }

    return result;
  } catch {
    return {};
  }
}

export function serializeMobileConversationFilters(
  map: Readonly<Record<string, MobileConversationFilterId>>,
): string {
  return JSON.stringify(map);
}

/** Back to "Tümü" means "no preference", so the entry is dropped rather than stored. */
export function setMobileConversationFilter(
  map: Readonly<Record<string, MobileConversationFilterId>>,
  key: string,
  filter: MobileConversationFilterId,
): Record<string, MobileConversationFilterId> {
  const next: Record<string, MobileConversationFilterId> = {};
  for (const [existingKey, value] of Object.entries(map)) {
    if (existingKey !== key) {
      next[existingKey] = value;
    }
  }

  if (filter !== MOBILE_CONVERSATION_DEFAULT_FILTER) {
    next[key] = filter;
  }

  return next;
}

export interface MobileConversationFilterRow {
  readonly id: string;
  readonly lastMessageAt: string;
  readonly mentionCount: number;
  readonly muted: boolean;
  readonly notifyLevel?: "ALL" | "MENTIONS" | "NONE" | undefined;
  readonly pinnedAt?: string | null | undefined;
  readonly type: "DM" | "GROUP_DM";
  readonly unreadCount: number;
}

/**
 * V4. A predicate rather than a filtered list so the caller keeps one array and
 * one `useMemo`; the chips also count with it (§2a.1 prints `Okunmamış · 3`).
 *
 * "Unread" includes a mention with a zero counter: a row can be marked read and
 * still be holding an unseen `@you`, and that row is the one the filter exists
 * for.
 */
export function getConversationFilterPredicate(
  filter: MobileConversationFilterId,
): (row: MobileConversationFilterRow) => boolean {
  switch (filter) {
    case "unread":
      return (row) => row.unreadCount > 0 || row.mentionCount > 0;
    case "groups":
      return (row) => row.type === "GROUP_DM";
    case "muted":
      // `notifyLevel` is the authority and `muted` its mirror (§4.2); both are
      // read because a row from an older payload only carries the mirror.
      return (row) => row.muted || row.notifyLevel === "NONE";
    case "all":
      return () => true;
  }
}

/**
 * V3 / 2a §2. Pinned conversations lead the list, newest pin first, and the rest
 * keep the server's activity order. Sorted on a copy — the caller's array is the
 * query cache's own page.
 */
export function sortConversationsForInbox<Row extends MobileConversationFilterRow>(
  rows: readonly Row[],
): Row[] {
  return [...rows].sort((left, right) => {
    const leftPin = toEpochMillis(left.pinnedAt);
    const rightPin = toEpochMillis(right.pinnedAt);

    if (leftPin !== rightPin) {
      return rightPin - leftPin;
    }

    return toEpochMillis(right.lastMessageAt) - toEpochMillis(left.lastMessageAt);
  });
}

export interface MobileGroupCapabilities {
  readonly canAddMembers: boolean;
  readonly canEditInfo: boolean;
  readonly canManageRoles: boolean;
  readonly canPin: boolean;
  readonly canSend: boolean;
  readonly canTransferOwnership: boolean;
}

/**
 * 2f §3 / 2e §7. A thin wrapper over `canMemberDo` so a screen asks one question
 * per control instead of pairing a role with a level at every call site.
 *
 * No `permissions` means a 1:1 conversation, where the server's own gate always
 * passes; the two role controls stay off because a 1:1 has no roles to manage.
 */
export function getGroupCapabilities(
  role: DMParticipantRole | undefined,
  permissions: GroupPermissions | undefined,
): MobileGroupCapabilities {
  const isOwner = role === "OWNER";

  if (!permissions) {
    return {
      canAddMembers: true,
      canEditInfo: true,
      canManageRoles: false,
      canPin: true,
      canSend: true,
      canTransferOwnership: false,
    };
  }

  const effectiveRole = role ?? "MEMBER";

  return {
    canAddMembers: canMemberDo(effectiveRole, permissions.addMembers),
    canEditInfo: canMemberDo(effectiveRole, permissions.editInfo),
    canManageRoles: isOwner,
    canPin: canMemberDo(effectiveRole, permissions.pinMessage),
    canSend: canMemberDo(effectiveRole, permissions.sendMessage),
    canTransferOwnership: isOwner,
  };
}

export type MobileGroupMemberSheetAction = "demote" | "message" | "profile" | "promote" | "remove";

/**
 * 2e §7, in the order the sheet lists them. C5 is binding: an action the viewer
 * may not take is absent, never greyed out — a disabled "Gruptan çıkar" tells a
 * member the control exists and only the tap is missing.
 *
 * Your own row opens no sheet: "message" and "profile" are about somebody else,
 * and the moderation half cannot target yourself (leaving is 2f's own row).
 */
export function getMemberSheetActions(
  viewerRole: DMParticipantRole | undefined,
  targetRole: DMParticipantRole | undefined,
  isSelf: boolean,
): MobileGroupMemberSheetAction[] {
  if (isSelf) {
    return [];
  }

  const actions: MobileGroupMemberSheetAction[] = ["message", "profile"];

  // The owner is not a moderation target: the group changes hands through the
  // explicit transfer, never by demoting or removing whoever holds it.
  if (targetRole === "OWNER") {
    return actions;
  }

  if (viewerRole === "OWNER") {
    actions.push(targetRole === "ADMIN" ? "demote" : "promote", "remove");
    return actions;
  }

  // An admin moderates members only; two admins are peers, so neither can act
  // on the other — that is the owner's call.
  if (viewerRole === "ADMIN" && targetRole !== "ADMIN") {
    actions.push("remove");
  }

  return actions;
}

/**
 * §11.0.1. The colour is handed out at join time and stored on the membership
 * (V2), so this reads it. The palette fallback exists only for a row written
 * before the column did: it is keyed by `userId` so the same member keeps the
 * same colour across renders and across devices.
 */
export function resolveSenderNameColor(member: {
  readonly nameColor?: string | null | undefined;
  readonly userId: string;
}): string {
  const stored = member.nameColor?.trim();
  if (stored) {
    return stored;
  }

  let hash = 0;
  for (let index = 0; index < member.userId.length; index += 1) {
    hash = (hash * 31 + member.userId.charCodeAt(index)) % 1_000_003;
  }

  const fallback: GroupMemberNameColor =
    GROUP_MEMBER_NAME_COLORS[hash % GROUP_MEMBER_NAME_COLORS.length] ?? GROUP_MEMBER_NAME_COLORS[0];

  return fallback;
}

export interface MobileGroupPinnedStripState {
  readonly messageId: string | null;
  readonly preview: string;
  readonly visible: boolean;
}

/**
 * 2d §2 / 2e §4. Dismissal is per viewer and per message: closing the strip
 * hides *that* pin, so the next one opens it again. The id is compared rather
 * than a boolean for exactly that reason.
 */
export function getPinnedStripState(
  conversation: {
    readonly pinnedMessage?:
      | {
          readonly authorName: string;
          readonly dismissed: boolean;
          readonly excerpt: string;
          readonly id: string;
        }
      | null
      | undefined;
  },
  dismissedMessageId: string | null,
): MobileGroupPinnedStripState {
  const pinned = conversation.pinnedMessage;

  if (!pinned) {
    return { messageId: null, preview: "", visible: false };
  }

  return {
    messageId: pinned.id,
    preview: `${pinned.authorName}: ${pinned.excerpt}`,
    visible: !pinned.dismissed && dismissedMessageId !== pinned.id,
  };
}

export interface MobileGroupCallBannerState {
  readonly count: number;
  readonly status: "idle" | "joined" | "ongoing";
  readonly video: boolean;
}

/**
 * 2d/2e's call entry point, derived from `dm:call:state` alone (Faz 2 karar 8):
 * the client never rebuilds the roster from the ring signals it happened to
 * witness. `active: false` is the tombstone.
 */
export function getGroupCallBannerState(
  callState: GroupCallStateDTO | null | undefined,
  viewerId: string,
): MobileGroupCallBannerState {
  if (!callState || !callState.active) {
    return { count: 0, status: "idle", video: false };
  }

  const joined = callState.participants.some((participant) => participant.userId === viewerId);

  return {
    count: callState.participants.length,
    status: joined ? "joined" : "ongoing",
    video: callState.video,
  };
}

export interface MobileGroupWindowCopy {
  readonly groupDisappearing24h: string;
  readonly groupDisappearing7d: string;
  readonly groupDisappearing90d: string;
  readonly groupDisappearingOff: string;
  readonly groupHistory24h: string;
  readonly groupHistory30d: string;
  readonly groupHistoryAll: string;
  readonly groupHistoryNone: string;
}

/** 2f §4's value column. */
export function formatDisappearingLabel(
  window: GroupDisappearingWindow,
  copy: MobileGroupWindowCopy,
): string {
  switch (window) {
    case "OFF":
      return copy.groupDisappearingOff;
    case "H24":
      return copy.groupDisappearing24h;
    case "D7":
      return copy.groupDisappearing7d;
    case "D90":
      return copy.groupDisappearing90d;
  }
}

/** 2c §7 / 2f's "Yeni üyeler geçmişi görür" value column. */
export function formatHistoryLabel(
  visibility: GroupHistoryVisibility,
  copy: MobileGroupWindowCopy,
): string {
  switch (visibility) {
    case "NONE":
      return copy.groupHistoryNone;
    case "LAST_24H":
      return copy.groupHistory24h;
    case "LAST_30D":
      return copy.groupHistory30d;
    case "ALL":
      return copy.groupHistoryAll;
  }
}

export interface MobileGroupCounter {
  readonly label: string;
  readonly over: boolean;
}

function buildCounter(value: string, limit: number): MobileGroupCounter {
  // Trimmed, because that is the length the write schema measures — a counter
  // that counted the trailing space would turn red before the server refused.
  const length = value.trim().length;
  return { label: `${length}/${limit}`, over: length > limit };
}

/** 2c §3's `18/32`. Past the limit the real number is shown, not a clamp. */
export function getGroupNameCounter(value: string): MobileGroupCounter {
  return buildCounter(value, GROUP_DM_NAME_MAX_LENGTH);
}

/** 2c §5's `0/120`. */
export function getGroupDescriptionCounter(value: string): MobileGroupCounter {
  return buildCounter(value, GROUP_DM_DESCRIPTION_MAX_LENGTH);
}

export interface MobileFrequentContactSource {
  /** The other side of a 1:1; null when the payload could not name one. */
  readonly counterpartId: string | null;
  readonly id: string;
  readonly lastMessageAt: string;
  readonly type: "DM" | "GROUP_DM";
}

const FREQUENT_CONTACT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const FREQUENT_CONTACT_LIMIT = 5;
const FREQUENT_CONTACT_MINIMUM = 3;

/**
 * V9. 2b's "SIK MESAJLAŞTIKLARIN" is derived from the inbox the reader already
 * has — no counting endpoint — as the counterparts of the newest 1:1
 * conversations from the last 30 days.
 *
 * Under three rows the section is not drawn at all: two names under a heading
 * that promises the people you talk to most reads as a bug, not a shortlist.
 */
export function getFrequentContacts(
  conversations: readonly MobileFrequentContactSource[],
  now: Date,
): string[] {
  const floor = now.getTime() - FREQUENT_CONTACT_WINDOW_MS;
  const seen = new Set<string>();
  const contacts: string[] = [];

  const recent = [...conversations]
    .filter(
      (conversation) =>
        conversation.type === "DM" &&
        conversation.counterpartId !== null &&
        toEpochMillis(conversation.lastMessageAt) >= floor,
    )
    .sort((left, right) => toEpochMillis(right.lastMessageAt) - toEpochMillis(left.lastMessageAt));

  for (const conversation of recent) {
    const counterpartId = conversation.counterpartId;
    // Two conversations with the same person would otherwise spend two of the
    // five slots on one name.
    if (!counterpartId || seen.has(counterpartId)) {
      continue;
    }

    seen.add(counterpartId);
    contacts.push(counterpartId);

    if (contacts.length === FREQUENT_CONTACT_LIMIT) {
      break;
    }
  }

  return contacts.length >= FREQUENT_CONTACT_MINIMUM ? contacts : [];
}

function toEpochMillis(value: string | null | undefined): number {
  if (!value) {
    return 0;
  }

  const millis = Date.parse(value);
  return Number.isNaN(millis) ? 0 : millis;
}
