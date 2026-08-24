import {
  buildGroupInviteDisplayUrl,
  buildGroupNameFromMembers,
  getGroupCapabilities,
  getGroupMemberActions,
  GROUP_DM_DESCRIPTION_MAX_LENGTH,
  GROUP_DM_NAME_MAX_LENGTH,
  GROUP_MEMBER_NAME_COLORS,
  type DMNotifyLevel,
  type DMParticipantRole,
  type GroupAction,
  type GroupAvatarTile,
  type GroupCallStateDTO,
  type GroupCapabilities,
  type GroupDisappearingWindow,
  type GroupHistoryVisibility,
  type GroupMemberAction,
  type GroupMemberNameColor,
  type GroupNameLocale,
  type GroupPermissionLevel,
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

export interface MobileConversationFilterCounts {
  readonly groups: number;
  readonly muted: number;
  readonly unread: number;
}

/**
 * 2a §1's `Okunmamış · 3` and `Gruplar · 4`. Counted with the very predicates
 * the chips filter by, so the number on a chip and the length of the list it
 * opens can never disagree — a chip that promised three rows and produced four
 * is the failure this shares one rule to avoid.
 *
 * "Sessiz" carries no counter in the design, but it is counted anyway: one pass
 * over the inbox answers all three, and the caller decides what to print.
 */
export function getConversationFilterCounts(
  rows: readonly MobileConversationFilterRow[],
): MobileConversationFilterCounts {
  const isUnread = getConversationFilterPredicate("unread");
  const isGroup = getConversationFilterPredicate("groups");
  const isMuted = getConversationFilterPredicate("muted");
  let groups = 0;
  let muted = 0;
  let unread = 0;

  for (const row of rows) {
    if (isUnread(row)) {
      unread += 1;
    }
    if (isGroup(row)) {
      groups += 1;
    }
    if (isMuted(row)) {
      muted += 1;
    }
  }

  return { groups, muted, unread };
}

export interface MobileConversationSplit<Row> {
  readonly pinned: Row[];
  readonly rest: Row[];
}

/**
 * V3 / 2a §2. The SABİTLENEN block and the list under it, from one already
 * sorted pass: the section is a slice of the ordering, not a second ordering,
 * so a row cannot appear in one and be missing from the other.
 */
export function splitPinnedConversations<Row extends MobileConversationFilterRow>(
  rows: readonly Row[],
): MobileConversationSplit<Row> {
  const sorted = sortConversationsForInbox(rows);
  const pinnedCount = sorted.findIndex((row) => !row.pinnedAt);

  return pinnedCount === -1
    ? { pinned: sorted, rest: [] }
    : { pinned: sorted.slice(0, pinnedCount), rest: sorted.slice(pinnedCount) };
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

/**
 * Faz 5 §H. The capability rule and the member-action list moved to
 * `@wizards/types` when the web panels grew the same two screens: a permission
 * that means one thing on a phone and another in a browser is exactly the drift
 * K5 forbids. Re-exported under their mobile names so the five screens and the
 * 106 model tests keep reading one module.
 */
export { getGroupCapabilities, getGroupMemberActions as getMemberSheetActions };

export type MobileGroupCapabilities = GroupCapabilities;
export type MobileGroupMemberSheetAction = GroupMemberAction;

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

/* ------------------------------------------------------------------------- *
 * Faz 5 §B/§C/§D. What 2d, 2e and 2f derive on top of the Faz 3 layer above.
 * ------------------------------------------------------------------------- */

export interface MobileGroupMemberSource {
  readonly avatarUrl?: string | null | undefined;
  readonly displayName?: string | null | undefined;
  readonly joinedAt?: string | undefined;
  readonly lastSeenAt?: string | null | undefined;
  readonly nameColor?: string | null | undefined;
  readonly role?: DMParticipantRole | undefined;
  readonly status?: string | undefined;
  readonly userId: string;
  readonly username: string;
}

/**
 * §11.0.1. One pass over the roster, so a bubble, a reply quote and its left
 * rule all read the same map rather than each calling the resolver with a
 * participant it happened to find. A message from somebody who has since left
 * is not in the map — the caller falls back, it does not invent a colour here.
 */
export function getGroupSenderColors(
  members: readonly MobileGroupMemberSource[],
): Record<string, string> {
  const colors: Record<string, string> = {};

  for (const member of members) {
    colors[member.userId] = resolveSenderNameColor(member);
  }

  return colors;
}

export interface MobileGroupMentionCandidate {
  readonly avatarUrl: string | null;
  /** Never null: the suggestion row prints a name, and a username is one. */
  readonly displayName: string;
  readonly userId: string;
  readonly username: string;
}

/**
 * 2d §B4. The `@` suggestions, from the group's own roster.
 *
 * Yourself is not a candidate — mentioning yourself notifies nobody — and
 * `@everyone` is deliberately absent: it is a channel concept, and a group DM
 * has no definition for it (§B4).
 */
export function getGroupMentionCandidates(
  members: readonly MobileGroupMemberSource[],
  viewerId: string,
): MobileGroupMentionCandidate[] {
  return members
    .filter((member) => member.userId !== viewerId && member.username.trim().length > 0)
    .map((member) => ({
      avatarUrl: member.avatarUrl ?? null,
      displayName: member.displayName?.trim() ? member.displayName : member.username,
      userId: member.userId,
      username: member.username,
    }));
}

/**
 * 2d §1's `6 üye · ● 3 çevrimiçi`. The online half is dropped rather than
 * printed as a zero: "0 çevrimiçi" is a sentence about nobody, and the design
 * only ever shows the dot beside a number that means something.
 */
export function formatGroupHeaderMeta(
  memberCount: number,
  onlineCount: number,
  copy: { readonly groupChatMembersOnline: string },
): { readonly members: string; readonly online: string | null } {
  const members = Math.max(0, Math.trunc(memberCount));
  const online = Math.max(0, Math.trunc(onlineCount));
  const [membersPart, onlinePart] = copy.groupChatMembersOnline
    .replace("{total}", String(members))
    .replace("{online}", String(online))
    .split("·");

  return {
    members: (membersPart ?? "").trim(),
    online: online > 0 ? (onlinePart ?? "").trim() : null,
  };
}

export type MobileGroupMemberSubtitle = "creator" | "lastSeen" | "username";

export interface MobileGroupMemberRow {
  readonly isSelf: boolean;
  readonly member: MobileGroupMemberSource;
  readonly online: boolean;
  readonly role: DMParticipantRole;
  readonly subtitle: MobileGroupMemberSubtitle;
}

const ROLE_ORDER: Record<DMParticipantRole, number> = { OWNER: 0, ADMIN: 1, MEMBER: 2 };

/**
 * 2e §6 / the full roster behind `Tümü`. Owner first, then the admins, then the
 * members in join order — the same order on both screens, because the card is
 * the first four rows of this list and not a second ordering (2a §2's rule,
 * applied to people).
 *
 * The subtitle is decided here, not in the row: `Grubu oluşturdu` belongs to the
 * owner, an offline member shows when they were last seen, and everybody else
 * shows their username (HTML 408–411).
 */
export function getGroupMemberRows(
  members: readonly MobileGroupMemberSource[],
  viewerId: string,
): MobileGroupMemberRow[] {
  return [...members]
    .map((member) => {
      const role = member.role ?? "MEMBER";
      const online = member.status === "ONLINE";

      return {
        isSelf: member.userId === viewerId,
        member,
        online,
        role,
        subtitle:
          role === "OWNER"
            ? ("creator" as const)
            : !online && member.lastSeenAt
              ? ("lastSeen" as const)
              : ("username" as const),
      };
    })
    .sort((left, right) => {
      const byRole = ROLE_ORDER[left.role] - ROLE_ORDER[right.role];
      if (byRole !== 0) {
        return byRole;
      }

      const byJoin = (left.member.joinedAt ?? "").localeCompare(right.member.joinedAt ?? "");
      return byJoin !== 0 ? byJoin : left.member.userId.localeCompare(right.member.userId);
    });
}

/** 2e §6: the card holds the first four; the rest live behind `Tümü`. */
export const GROUP_INFO_MEMBER_PREVIEW_COUNT = 4;

export type MobileGroupQuickAction = "invite" | "mute" | "search" | "video";

/**
 * 2e §3. Four equal boxes — unless the viewer may not add anybody, in which case
 * `Davet et` is *gone* rather than greyed out (§C1.3) and the remaining three
 * spread. A disabled box would tell a member the control exists and only the
 * tap is missing.
 */
export function getGroupQuickActions(
  capabilities: Pick<MobileGroupCapabilities, "canAddMembers">,
): MobileGroupQuickAction[] {
  const actions: MobileGroupQuickAction[] = ["mute", "video", "search"];

  if (capabilities.canAddMembers) {
    actions.push("invite");
  }

  return actions;
}

export interface MobileGroupMediaTile {
  readonly kind: "file" | "image" | "overflow" | "video";
  /** File tiles print `12 dosya`; the overflow tile prints `+42`. */
  readonly count: number;
  readonly id: string;
  readonly thumbnailUrl: string | null;
}

/** 2e §5's four-up strip: three attachments and, past that, one `+N` counter. */
export const GROUP_MEDIA_STRIP_SIZE = 4;

export interface MobileGroupMediaSource {
  readonly contentType: string;
  readonly id: string;
  readonly thumbnailUrl?: string | null | undefined;
  readonly url?: string | null | undefined;
}

/**
 * 2e §5. The strip is four boxes wide: the newest three attachments and a `+N`
 * that counts everything they hide, including the file group's own tail.
 *
 * `total` is the server's count, not `items.length`: the strip asks for a page
 * of four and the header already prints the real total beside `MEDYA VE
 * DOSYALAR`, so the two numbers have to come from the same place.
 */
export function getGroupMediaTiles(
  items: readonly MobileGroupMediaSource[],
  total: number,
): MobileGroupMediaTile[] {
  const shown = items.slice(0, GROUP_MEDIA_STRIP_SIZE - 1);
  const tiles: MobileGroupMediaTile[] = shown.map((item) => ({
    count: 1,
    id: item.id,
    kind: item.contentType.startsWith("image/")
      ? ("image" as const)
      : item.contentType.startsWith("video/")
        ? ("video" as const)
        : ("file" as const),
    thumbnailUrl: item.thumbnailUrl ?? item.url ?? null,
  }));

  const hidden = Math.max(0, Math.trunc(total) - shown.length);

  if (hidden > 0) {
    tiles.push({ count: hidden, id: "overflow", kind: "overflow", thumbnailUrl: null });
  }

  return tiles;
}

export interface MobileGroupPermissionRow {
  readonly action: GroupAction;
  readonly level: GroupPermissionLevel;
}

/** 2f §3's four rows, in the order the design lists them (HTML 439–442). */
export function getGroupPermissionRows(
  permissions: GroupPermissions | undefined,
): MobileGroupPermissionRow[] {
  if (!permissions) {
    return [];
  }

  return [
    { action: "sendMessage", level: permissions.sendMessage },
    { action: "addMembers", level: permissions.addMembers },
    { action: "editInfo", level: permissions.editInfo },
    { action: "pinMessage", level: permissions.pinMessage },
  ];
}

/** 2f §2's three radio rows, in the order the design lists them. */
export const MOBILE_GROUP_NOTIFY_LEVELS: readonly DMNotifyLevel[] = ["ALL", "MENTIONS", "NONE"];

export type MobileGroupLeaveIntent = "confirm" | "transfer";

/**
 * V8 / 2f §5. An owner who is the last person able to run the group has to hand
 * it over first; the server refuses with `409 OWNER_TRANSFER_REQUIRED` either
 * way, and this only decides which sheet opens.
 *
 * An owner with another admin beside them leaves through the ordinary confirm:
 * `resolveNextGroupOwner` already has somebody to promote.
 */
export function getGroupLeaveIntent(
  viewerRole: DMParticipantRole | undefined,
  members: readonly MobileGroupMemberSource[],
): MobileGroupLeaveIntent {
  if (viewerRole !== "OWNER") {
    return "confirm";
  }

  const hasAnotherAdmin = members.some((member) => member.role === "ADMIN");
  const hasAnybodyElse = members.some((member) => member.role !== "OWNER");

  return hasAnotherAdmin || !hasAnybodyElse ? "confirm" : "transfer";
}

/**
 * 2d §8. The receipt belongs to the **last outgoing bubble** and nothing else,
 * so the transcript carries one line rather than one per message. Returns the
 * id of that bubble, or `null` when the viewer's last word is not the last word.
 *
 * System rows are skipped: they are nobody's message, and a group event landing
 * after your message must not take the receipt away from it.
 */
export function resolveGroupReadReceiptMessageId(
  messages: readonly {
    readonly author: { readonly id: string };
    readonly id: string;
    readonly systemType?: string | null | undefined;
  }[],
  viewerId: string,
): string | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message || message.systemType) {
      continue;
    }

    return message.author.id === viewerId ? message.id : null;
  }

  return null;
}

export interface MobileGroupReadReceiptView {
  readonly count: number;
  readonly everyone: boolean;
  readonly readerIds: readonly string[];
}

/**
 * 2d §8, live. The server computes the receipt once, for the page it serves —
 * so a reader who opens the conversation a second later would never move the
 * line until the next fetch. `dm:conversation:read` already patches
 * `participantReadStates` into the same cache entry, so the receipt is derived
 * from those instead of frozen at fetch time.
 *
 * Same rule as the server's `buildGroupReadReceipt`: the author never counts as
 * a reader, and `everyone` means every *other* member has read it.
 */
export function buildLiveGroupReadReceipt(input: {
  readonly createdAt: string;
  readonly memberCount: number;
  readonly readStates: readonly {
    readonly lastReadAt?: string | null;
    readonly userId: string;
  }[];
  readonly viewerId: string;
}): MobileGroupReadReceiptView {
  const sentAt = Date.parse(input.createdAt);
  const readerIds = Number.isNaN(sentAt)
    ? []
    : input.readStates
        .filter((state) => {
          if (state.userId === input.viewerId || !state.lastReadAt) {
            return false;
          }

          const readAt = Date.parse(state.lastReadAt);
          return !Number.isNaN(readAt) && readAt >= sentAt;
        })
        .map((state) => state.userId);
  const others = Math.max(input.memberCount - 1, 0);

  return {
    count: readerIds.length,
    everyone: others > 0 && readerIds.length >= others,
    readerIds,
  };
}

export interface MobileGroupReadStackEntry {
  readonly avatarUrl: string | null;
  readonly label: string;
  readonly userId: string;
}

/** 2d §8's 16px stack. Three faces at most; the sentence carries the rest. */
export const GROUP_READ_STACK_LIMIT = 3;

/**
 * 2d §8. Reader ids become faces against the roster the screen already holds —
 * the receipt payload carries ids only (Faz 1), and a second read for three
 * avatars is exactly the N+1 §4.5 forbids.
 *
 * A reader who has since left the group has no row to draw and is dropped from
 * the stack; the count beside it still comes from the server.
 */
export function getGroupReadStack(
  readerIds: readonly string[],
  members: readonly MobileGroupMemberSource[],
): MobileGroupReadStackEntry[] {
  const byId = new Map(members.map((member) => [member.userId, member]));

  return readerIds
    .map((userId) => byId.get(userId))
    .filter((member): member is MobileGroupMemberSource => member !== undefined)
    .slice(0, GROUP_READ_STACK_LIMIT)
    .map((member) => ({
      avatarUrl: member.avatarUrl ?? null,
      label: member.displayName?.trim() ? member.displayName : member.username,
      userId: member.userId,
    }));
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
  readonly groupHistory7d: string;
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
    case "LAST_7D":
      return copy.groupHistory7d;
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
