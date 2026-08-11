import {
  resolveServerScheduledEventAction,
  type MobileNotificationItem,
  type MobileWorkspaceChannelSummary,
  type ServerProfileAccessLevel,
  type ServerScheduledEventAction,
} from "@wizards/types";
import { mobileServerNameLayout } from "../design/tokens";
import { mobileCopy, type MobileLocale } from "../locale/mobile-copy";
import { parseMobileMentionSegments, type MobileMentionSegment } from "./mobile-mention";

/**
 * Pure logic for the Sunucular (servers) redesign: rail/switcher badge
 * selection, the compact server-pill unread aggregate, channel-name slugging
 * and collision detection, the "Kaçırdıkların" notification merge, the
 * create-access gate, and per-user category collapse persistence. Kept free of
 * React/storage so every rule is unit-tested from `scripts/*.test.ts`.
 */

export type MobileServerBadge =
  | { readonly count: number; readonly kind: "mention" }
  | { readonly count: number; readonly kind: "unread" }
  | { readonly kind: "none" };

/**
 * Badge priority shared by the rail (1a), the compact pill (1b) and the switcher
 * rows (1c): a mention outranks a plain unread, which outranks nothing.
 */
export function getMobileServerBadge(server: {
  readonly mentionCount: number;
  readonly unreadCount: number;
}): MobileServerBadge {
  if (server.mentionCount > 0) {
    return { count: server.mentionCount, kind: "mention" };
  }

  if (server.unreadCount > 0) {
    return { count: server.unreadCount, kind: "unread" };
  }

  return { kind: "none" };
}

/**
 * The compact header pill shows the unread waiting on the servers you are not
 * currently looking at, so the badge is the sum of every *other* server.
 */
export function getMobileOtherServersUnreadTotal(
  servers: readonly { readonly id: string; readonly unreadCount: number }[],
  currentServerId: string | null,
): number {
  return servers.reduce(
    (total, server) => (server.id === currentServerId ? total : total + server.unreadCount),
    0,
  );
}

const TURKISH_SLUG_MAP: Readonly<Record<string, string>> = {
  Ç: "c",
  Ğ: "g",
  İ: "i",
  Ö: "o",
  Ş: "s",
  Ü: "u",
  ç: "c",
  ğ: "g",
  ı: "i",
  ö: "o",
  ş: "s",
  ü: "u",
};

const TURKISH_SLUG_PATTERN = new RegExp(`[${Object.keys(TURKISH_SLUG_MAP).join("")}]`, "g");

/**
 * Channel-name slug rule from 1e: Turkish letters transliterate to ascii, then
 * everything lowercases, whitespace/punctuation runs become single hyphens, and
 * stray edge hyphens are trimmed. Transliteration runs before lowercasing so
 * `İ` never expands into a combining-dot sequence.
 */
export function slugifyMobileChannelName(input: string): string {
  return input
    .replace(TURKISH_SLUG_PATTERN, (char) => TURKISH_SLUG_MAP[char] ?? char)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Live variant for the 1e name field: same rules but it keeps a trailing hyphen
 * so a space typed between two words stays visible as `-` while typing, instead
 * of being swallowed. Submit still runs {@link slugifyMobileChannelName} to trim it.
 */
export function slugifyMobileChannelNameInput(input: string): string {
  return input
    .replace(TURKISH_SLUG_PATTERN, (char) => TURKISH_SLUG_MAP[char] ?? char)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "");
}

/**
 * Client-side pre-check for the "Bu ad zaten kullanılıyor" error. Both sides are
 * slugged so `Welcome Chat` collides with an existing `welcome-chat`.
 */
export function hasMobileChannelNameCollision(
  existingNames: readonly string[],
  candidate: string,
): boolean {
  const target = slugifyMobileChannelName(candidate);
  if (target.length === 0) {
    return false;
  }

  return existingNames.some((name) => slugifyMobileChannelName(name) === target);
}

/**
 * "Kaçırdıkların": cross-server mentions and voice-room starts merged into one
 * newest-first list, bounded to a couple of cards.
 */
export function getMobileMissedNotifications(
  notifications: readonly MobileNotificationItem[],
  options?: { readonly limit?: number },
): MobileNotificationItem[] {
  const limit = options?.limit ?? 3;

  return (
    notifications
      // "Kaçırdıkların" means unread. A mention the user already opened from the
      // notifications tab is not missed any more, so it must not come back on the
      // servers screen.
      .filter(
        (item) =>
          !item.read && (item.type === "MENTION" || item.eventKind === "voice-room-started"),
      )
      .slice()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, Math.max(0, limit))
  );
}

/**
 * `isAdmin` gate for every create entry point (header +, FAB, category +, 1d/1e):
 * channel management is the "Kanalları Yönet"/owner permission.
 */
export function getMobileServerCreateAccess(
  capabilities: { readonly canManageChannels: boolean } | null | undefined,
): boolean {
  return capabilities?.canManageChannels === true;
}

/**
 * 1a/1b channel-row tone. The open channel always reads as active; otherwise the
 * badge priority (mention > unread > read) also drives the row's typography and
 * preview colour, so name weight and badge can never disagree.
 */
export type MobileChannelRowTone = "active" | "mention" | "read" | "unread";

export function getMobileChannelRowTone(
  channel: Pick<MobileWorkspaceChannelSummary, "mentionCount" | "unreadCount">,
  isSelected: boolean,
): MobileChannelRowTone {
  if (isSelected) {
    return "active";
  }

  const badge = getMobileServerBadge(channel);
  return badge.kind === "mention" ? "mention" : badge.kind === "unread" ? "unread" : "read";
}

export interface MobileChannelRowPreview {
  /** Author label rendered before the body ("DY: …"). */
  readonly author: string;
  /** Body split into runs so a `@handle` can render in primary like the design. */
  readonly segments: readonly MobileMentionSegment[];
}

/**
 * Last-message preview for a text row. Voice rows show live presence instead, so
 * they never carry a preview.
 */
export function getMobileChannelRowPreview(
  channel: Pick<MobileWorkspaceChannelSummary, "lastMessage" | "type">,
): MobileChannelRowPreview | null {
  if (channel.type !== "TEXT" || !channel.lastMessage) {
    return null;
  }

  const { author, text } = channel.lastMessage;
  return {
    author: author.displayName ?? author.username,
    segments: parseMobileMentionSegments(text),
  };
}

/** Names stay readable up to this many people; beyond it the row shows a count. */
const MOBILE_VOICE_ROW_NAME_LIMIT = 3;

export type MobileVoiceRowPresence =
  | { readonly count: number; readonly kind: "count" }
  | { readonly kind: "names"; readonly names: readonly string[] };

/**
 * Live voice row subtitle source: the rail (1a) pairs a people count with stacked
 * avatars, the compact row (1b) spells the names out instead.
 */
export function getMobileVoiceRowPresence(
  participants: readonly {
    readonly displayName: string | null;
    readonly username: string;
  }[],
  layout: "compact" | "rail",
): MobileVoiceRowPresence {
  if (layout === "rail" || participants.length > MOBILE_VOICE_ROW_NAME_LIMIT) {
    return { count: participants.length, kind: "count" };
  }

  return {
    kind: "names",
    names: participants.map((participant) => participant.displayName ?? participant.username),
  };
}

/** "N seste": people currently across every voice channel in the server. */
export function getMobileVoiceParticipantTotal(
  voiceStates: readonly { readonly participants: readonly unknown[] }[],
): number {
  return voiceStates.reduce((total, state) => total + state.participants.length, 0);
}

/** Collapse state persists per user, keyed by server so the same section id in two servers stays independent. */
export function buildMobileCollapsedSectionKey(serverId: string, sectionId: string): string {
  return `${serverId}:${sectionId}`;
}

export function parseMobileCollapsedSections(
  raw: string | null | undefined,
): Record<string, boolean> {
  if (!raw) {
    return {};
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object") {
      return {};
    }

    const result: Record<string, boolean> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (value === true) {
        result[key] = true;
      }
    }

    return result;
  } catch {
    return {};
  }
}

export function serializeMobileCollapsedSections(map: Readonly<Record<string, boolean>>): string {
  return JSON.stringify(map);
}

/* -------------------------------------------------------------------------- */
/* Sunucular 6a-6f (Faz 2)                                                     */
/* -------------------------------------------------------------------------- */

/** 6a/6b filter strip. Device-local: the choice is never sent to the server. */
export type MobileWorkspaceFilterId = "all" | "unread" | "voice";

const MOBILE_WORKSPACE_FILTER_IDS: readonly MobileWorkspaceFilterId[] = ["all", "unread", "voice"];

/** The default segment; storing it would only grow the persisted map. */
export const MOBILE_WORKSPACE_DEFAULT_FILTER: MobileWorkspaceFilterId = "all";

export interface MobileWorkspaceFilterableChannel {
  readonly id: string;
  readonly mentionCount: number;
  readonly type: MobileWorkspaceChannelSummary["type"];
  readonly unreadCount: number;
}

export interface MobileWorkspaceFilterableSection<
  TChannel extends MobileWorkspaceFilterableChannel,
> {
  readonly channels: readonly TChannel[];
}

/**
 * Voice liveness is not on the channel summary — it arrives through the voice
 * state query — so the two filter helpers take it as data instead of guessing.
 * Structurally the same shape as `MobileVoiceChannelState`.
 */
export interface MobileWorkspaceVoicePresence {
  readonly channelId: string;
  readonly participants: readonly unknown[];
}

function isMobileChannelUnread(channel: MobileWorkspaceFilterableChannel): boolean {
  return channel.unreadCount > 0 || channel.mentionCount > 0;
}

export interface MobileRealtimeTargetSnapshot {
  readonly channelId: string | null;
  readonly conversationId: string | null;
  readonly serverId: string | null;
}

/**
 * The realtime client emits `voice:states:watch` from the active-target store,
 * and until now only the pushed `ChannelChat` route ever wrote a server into
 * it. A user sitting on the Sunucular list had no watch at all, so the live
 * voice row, the "N seste" meta and the "Sesli" segment's dot were frozen at
 * whatever the first HTTP read returned.
 *
 * The list may claim the target, but only when nothing more specific owns it:
 * a mounted channel or DM screen is the authority while it is open, and
 * `setServer` would clear its channel id out from under it. Re-claiming the
 * server that is already set is also skipped -- `setActiveTargets` only emits
 * on a change, but a redundant store write would still re-render every
 * subscriber.
 */
export function shouldClaimMobileVoiceWatchTarget(
  current: MobileRealtimeTargetSnapshot,
  serverId: string | null,
): boolean {
  if (serverId === null || serverId.length === 0) {
    return false;
  }

  if (current.channelId !== null || current.conversationId !== null) {
    return false;
  }

  return current.serverId !== serverId;
}

/**
 * Either the raw voice-state list or the set a caller already built from it.
 * The screen builds it once per render and hands the same set to every helper
 * below, so a presence tick cannot rebuild it three times.
 */
export type MobileWorkspaceVoiceLiveness =
  ReadonlySet<string> | readonly MobileWorkspaceVoicePresence[];

export function collectMobileLiveVoiceChannelIds(
  voiceStates: readonly MobileWorkspaceVoicePresence[],
): ReadonlySet<string> {
  return new Set(
    voiceStates.filter((state) => state.participants.length > 0).map((state) => state.channelId),
  );
}

function resolveLiveVoiceChannelIds(source: MobileWorkspaceVoiceLiveness): ReadonlySet<string> {
  return Array.isArray(source)
    ? collectMobileLiveVoiceChannelIds(source as readonly MobileWorkspaceVoicePresence[])
    : (source as ReadonlySet<string>);
}

/**
 * 6a/6b filter strip. `all` hands the tree back untouched; `unread` keeps the
 * channels still waiting on the user and drops the categories that emptied out;
 * `voice` keeps only voice rows, lifts the live ones to the top of their own
 * category, and keeps the category grouping rather than flattening it.
 *
 * `all` returns the *same* array reference it was given: it is the default and
 * the most common state, the servers tab re-renders on every presence tick, and
 * a fresh array each time would kill FlashList's bail-out.
 */
export function filterMobileWorkspaceSections<
  TChannel extends MobileWorkspaceFilterableChannel,
  TSection extends MobileWorkspaceFilterableSection<TChannel>,
>(
  sections: readonly TSection[],
  filter: MobileWorkspaceFilterId,
  voiceStates: MobileWorkspaceVoiceLiveness = [],
): readonly TSection[] {
  if (filter === "all") {
    return sections;
  }

  const liveVoiceChannelIds = resolveLiveVoiceChannelIds(voiceStates);

  return sections
    .map((section) => {
      if (filter === "unread") {
        return { ...section, channels: section.channels.filter(isMobileChannelUnread) };
      }

      const voiceChannels = section.channels.filter((channel) => channel.type === "VOICE");
      const live = voiceChannels.filter((channel) => liveVoiceChannelIds.has(channel.id));
      const idle = voiceChannels.filter((channel) => !liveVoiceChannelIds.has(channel.id));

      return { ...section, channels: [...live, ...idle] };
    })
    .filter((section) => section.channels.length > 0) as TSection[];
}

/** Filter-strip badge: how many channels are still unread. Zero hides the badge. */
export function getMobileWorkspaceUnreadChannelCount<
  TChannel extends MobileWorkspaceFilterableChannel,
>(sections: readonly MobileWorkspaceFilterableSection<TChannel>[]): number {
  return sections.reduce(
    (total, section) => total + section.channels.filter(isMobileChannelUnread).length,
    0,
  );
}

/** Green dot on the "Sesli" segment: one of *this* server's rooms has people in it. */
export function hasMobileWorkspaceLiveVoice<TChannel extends MobileWorkspaceFilterableChannel>(
  sections: readonly MobileWorkspaceFilterableSection<TChannel>[],
  voiceStates: MobileWorkspaceVoiceLiveness,
): boolean {
  const liveVoiceChannelIds = resolveLiveVoiceChannelIds(voiceStates);

  return sections.some((section) =>
    section.channels.some(
      (channel) => channel.type === "VOICE" && liveVoiceChannelIds.has(channel.id),
    ),
  );
}

/** The filter is per user *and* per server, exactly like the collapse map. */
export function buildMobileWorkspaceFilterKey(userId: string, serverId: string): string {
  return `${userId}:${serverId}`;
}

function isMobileWorkspaceFilterId(value: unknown): value is MobileWorkspaceFilterId {
  return (
    typeof value === "string" &&
    MOBILE_WORKSPACE_FILTER_IDS.includes(value as MobileWorkspaceFilterId)
  );
}

export function parseMobileWorkspaceFilters(
  raw: string | null | undefined,
): Record<string, MobileWorkspaceFilterId> {
  if (!raw) {
    return {};
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object") {
      return {};
    }

    const result: Record<string, MobileWorkspaceFilterId> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (isMobileWorkspaceFilterId(value) && value !== MOBILE_WORKSPACE_DEFAULT_FILTER) {
        result[key] = value;
      }
    }

    return result;
  } catch {
    return {};
  }
}

export function serializeMobileWorkspaceFilters(
  map: Readonly<Record<string, MobileWorkspaceFilterId>>,
): string {
  return JSON.stringify(map);
}

/** Back to "Tümü" means "no preference", so the entry is dropped rather than stored. */
export function setMobileWorkspaceFilter(
  map: Readonly<Record<string, MobileWorkspaceFilterId>>,
  key: string,
  filter: MobileWorkspaceFilterId,
): Record<string, MobileWorkspaceFilterId> {
  const next: Record<string, MobileWorkspaceFilterId> = {};
  for (const [existingKey, value] of Object.entries(map)) {
    if (existingKey !== key) {
      next[existingKey] = value;
    }
  }

  if (filter !== MOBILE_WORKSPACE_DEFAULT_FILTER) {
    next[key] = filter;
  }

  return next;
}

export type MobileServerNameContext = keyof typeof mobileServerNameLayout;

export interface MobileServerNameLayout {
  readonly fontSize: number;
  readonly letterSpacing: number;
  readonly lineHeight: number;
  readonly numberOfLines: number;
}

/**
 * 6f: a server name is clamped, never truncated to one line. Every surface that
 * prints one asks here instead of writing its own `numberOfLines`, so the rule
 * cannot be applied to four screens and forgotten on the fifth. The sticky 6e
 * header is the single-line exception the handoff draws that way; a blank name
 * has nothing to wrap either.
 */
export function getMobileServerNameLayout(
  name: string,
  context: MobileServerNameContext,
): MobileServerNameLayout {
  const layout = mobileServerNameLayout[context];

  return {
    fontSize: layout.fontSize,
    letterSpacing: layout.letterSpacing,
    lineHeight: layout.lineHeight,
    numberOfLines: name.trim().length === 0 ? 1 : layout.numberOfLines,
  };
}

export interface MobileCategoryHeaderState {
  readonly channelCount: number;
  readonly chevronRotation: "-90deg" | "0deg";
  readonly isCollapsed: boolean;
  /** A collapsed category still has to admit it is hiding something unread. */
  readonly showUnreadDot: boolean;
  /** Maps to `theme.workspace.categoryLabel` / `categoryCollapsed` — colours stay in the theme. */
  readonly tone: "collapsed" | "idle";
}

/**
 * 6a/6b category header. A category with no channels left in it is always drawn
 * collapsed, whatever the persisted map says: there is nothing to open.
 */
export function getMobileCategoryHeaderState<TChannel extends MobileWorkspaceFilterableChannel>(
  section: MobileWorkspaceFilterableSection<TChannel>,
  collapsed: boolean,
): MobileCategoryHeaderState {
  const channelCount = section.channels.length;
  const isCollapsed = collapsed || channelCount === 0;

  return {
    channelCount,
    chevronRotation: isCollapsed ? "-90deg" : "0deg",
    isCollapsed,
    showUnreadDot: isCollapsed && section.channels.some(isMobileChannelUnread),
    tone: isCollapsed ? "collapsed" : "idle",
  };
}

export type MobileServerProfileStatId = "channels" | "members" | "voice" | "weekly";

export interface MobileServerProfileStat {
  readonly id: MobileServerProfileStatId;
  readonly value: string;
}

/** Placeholder for a stat the backend could not produce; 6d keeps the cell, not the number. */
const MOBILE_SERVER_PROFILE_STAT_PLACEHOLDER = "—";

/**
 * 6d's four-cell stat card, in design order. `weeklyMessageCount` is nullable by
 * contract (the count is cached and may fail), and the design keeps the cell
 * with an em dash rather than collapsing the card.
 */
export function getMobileServerProfileStats(profile: {
  readonly channelCount: number;
  readonly memberCount: number;
  readonly voiceActiveCount: number;
  readonly weeklyMessageCount: number | null;
}): MobileServerProfileStat[] {
  return [
    { id: "members", value: String(profile.memberCount) },
    { id: "channels", value: String(profile.channelCount) },
    { id: "voice", value: String(profile.voiceActiveCount) },
    {
      id: "weekly",
      value:
        profile.weeklyMessageCount === null
          ? MOBILE_SERVER_PROFILE_STAT_PLACEHOLDER
          : String(profile.weeklyMessageCount),
    },
  ];
}

/**
 * 6d clamps the description to three lines and offers "Devamı" underneath. The
 * link is only honest when there is a fourth line to reveal, so it waits for a
 * real line count rather than for the text to be non-empty.
 *
 * `lineCount === null` means "not measured yet" and keeps the link hidden: a
 * link that appears for one frame and then vanishes on a short description is
 * worse than one that appears a frame late.
 */
export function shouldShowMobileDescriptionMore(input: {
  readonly expanded: boolean;
  readonly lineCount: number | null;
  readonly maxLines: number;
}): boolean {
  if (input.expanded || input.lineCount === null) {
    return false;
  }

  return input.lineCount > input.maxLines;
}

export interface MobileStrongTextSegment {
  readonly strong: boolean;
  readonly text: string;
}

/**
 * 6d prints "Arkadaşlarından **3 kişi** bu sunucuda" with the middle span in
 * 800 weight and the darker ink. Which words belong to that span is a property
 * of the sentence, not of the layout — Turkish bolds a counter and its noun,
 * English bolds a different slice — so each locale marks its own with `**`
 * and the screen renders whatever it is handed.
 *
 * Unpaired markers are left as literal text rather than swallowed: a copy typo
 * should look wrong, not silently delete a word.
 */
export function splitMobileStrongSegments(template: string): MobileStrongTextSegment[] {
  const segments: MobileStrongTextSegment[] = [];
  let index = 0;

  while (index < template.length) {
    const open = template.indexOf("**", index);
    if (open < 0) {
      break;
    }

    const close = template.indexOf("**", open + 2);
    if (close < 0) {
      break;
    }

    if (open > index) {
      segments.push({ strong: false, text: template.slice(index, open) });
    }

    const strongText = template.slice(open + 2, close);
    if (strongText.length > 0) {
      segments.push({ strong: true, text: strongText });
    }

    index = close + 2;
  }

  if (index < template.length) {
    segments.push({ strong: false, text: template.slice(index) });
  }

  return segments;
}

export interface MobileLiveVoiceParticipant {
  readonly avatarUrl: string | null;
  readonly displayName: string | null;
  readonly userId: string;
  readonly username: string;
}

interface MobileLiveVoiceProfileChannel {
  readonly id: string;
  readonly liveCount: number | null;
  readonly participants: readonly {
    readonly avatarUrl: string | null;
    readonly displayName: string;
    readonly id: string;
    readonly shortName: string | null;
  }[];
  readonly type: "text" | "voice";
}

interface MobileLiveVoiceProfile {
  readonly channels: readonly MobileLiveVoiceProfileChannel[];
  readonly voiceActiveCount: number;
}

/**
 * 6d reads its voice numbers from the profile HTTP payload, which is a snapshot:
 * the "Seste" stat and every voice row froze the moment the screen opened. The
 * socket already streams `voice:state:update` into the voice-states query, so
 * this folds that live map over the snapshot instead of refetching the profile
 * on every join and leave.
 *
 * Applied only once the voice read has actually answered -- an empty map from a
 * still-loading query would otherwise zero out counts the server did produce.
 * When nothing changes the input object is returned by identity, so a presence
 * tick in an unrelated server cannot re-render the whole profile.
 */
export function applyMobileLiveVoiceToProfile<TProfile extends MobileLiveVoiceProfile>(
  profile: TProfile,
  liveByChannelId: ReadonlyMap<string, readonly MobileLiveVoiceParticipant[]> | null,
): TProfile {
  if (liveByChannelId === null) {
    return profile;
  }

  let changed = false;
  let voiceActiveCount = 0;

  const channels = profile.channels.map((channel) => {
    if (channel.type !== "voice") {
      return channel;
    }

    const live = liveByChannelId.get(channel.id) ?? [];
    voiceActiveCount += live.length;

    const participants = live.map((participant) => ({
      avatarUrl: participant.avatarUrl,
      displayName: participant.displayName ?? participant.username,
      id: participant.userId,
      shortName: toMobileVoiceParticipantShortName(participant.displayName ?? participant.username),
    }));

    if (channel.liveCount === live.length && channel.participants.length === live.length) {
      return channel;
    }

    changed = true;
    return { ...channel, liveCount: live.length, participants };
  });

  if (!changed && voiceActiveCount === profile.voiceActiveCount) {
    return profile;
  }

  return { ...profile, channels, voiceActiveCount };
}

/** Same two-initial rule the profile route applies server-side. */
function toMobileVoiceParticipantShortName(displayName: string): string | null {
  const initials = displayName
    .trim()
    .split(/\s+/)
    .filter((part) => part.length > 0)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  return initials.length > 0 ? initials : null;
}

export interface MobileProfileChannelGroup<TChannel> {
  readonly categoryId: string | null;
  readonly categoryName: string | null;
  readonly channels: TChannel[];
}

/**
 * 6e groups the profile's channel list under its categories. The profile route
 * already returns channels in category-position then channel-position order
 * (`server-public-profile-service.ts`), so first appearance *is* the design's
 * order; re-sorting here would need a `position` the read model does not carry.
 * Uncategorised channels collect into one trailing group.
 */
export function groupMobileProfileChannelsByCategory<
  TChannel extends {
    readonly categoryId: string | null;
    readonly categoryName: string | null;
  },
>(channels: readonly TChannel[]): MobileProfileChannelGroup<TChannel>[] {
  const groups: MobileProfileChannelGroup<TChannel>[] = [];
  const byCategoryId = new Map<string, MobileProfileChannelGroup<TChannel>>();
  let uncategorised: MobileProfileChannelGroup<TChannel> | null = null;

  for (const channel of channels) {
    if (channel.categoryId === null) {
      uncategorised ??= { categoryId: null, categoryName: null, channels: [] };
      uncategorised.channels.push(channel);
      continue;
    }

    let group = byCategoryId.get(channel.categoryId);
    if (!group) {
      group = {
        categoryId: channel.categoryId,
        categoryName: channel.categoryName,
        channels: [],
      };
      byCategoryId.set(channel.categoryId, group);
      groups.push(group);
    }

    group.channels.push(channel);
  }

  return uncategorised ? [...groups, uncategorised] : groups;
}

export interface MobileProfileChannelPreview<TChannel> {
  readonly groups: MobileProfileChannelGroup<TChannel>[];
  /** Feeds "Kalan {count} kanalı gör"; zero hides the row. */
  readonly remaining: number;
}

/**
 * 6d shows a short preview of 6e's list. The cut runs across the whole list, not
 * per category, so a category that falls entirely past the limit disappears
 * instead of appearing empty.
 */
export function getMobileProfileChannelPreview<TChannel>(
  groups: readonly MobileProfileChannelGroup<TChannel>[],
  limit: number,
): MobileProfileChannelPreview<TChannel> {
  const total = groups.reduce((count, group) => count + group.channels.length, 0);
  const budget = Math.max(0, limit);
  let taken = 0;

  const previewGroups: MobileProfileChannelGroup<TChannel>[] = [];
  for (const group of groups) {
    if (taken >= budget) {
      break;
    }

    const channels = group.channels.slice(0, budget - taken);
    taken += channels.length;
    previewGroups.push({ ...group, channels });
  }

  return { groups: previewGroups, remaining: Math.max(0, total - taken) };
}

/**
 * 6d/6e event button. The 15 minute threshold is Faz 1's pure function
 * (`resolveServerScheduledEventAction`); mobile calls it rather than keeping a
 * second copy of the window that can drift from the web one.
 */
export function resolveMobileEventAction(
  event: { readonly scheduledStartAt: string; readonly status: string },
  nowMs: number,
): ServerScheduledEventAction | null {
  return resolveServerScheduledEventAction(event, nowMs);
}

/**
 * Month abbreviations are a table rather than `Intl.DateTimeFormat`: Hermes
 * ships without a guaranteed ICU date catalogue, so a formatter would render
 * differently on device than it does in this test run.
 */
const MOBILE_EVENT_MONTH_ABBREVIATIONS: Readonly<Record<MobileLocale, readonly string[]>> = {
  en: ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"],
  tr: ["OCA", "ŞUB", "MAR", "NİS", "MAY", "HAZ", "TEM", "AĞU", "EYL", "EKİ", "KAS", "ARA"],
};

export interface MobileEventDateBlock {
  readonly label: string;
  readonly time: string;
}

function padTwoDigits(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

function daysBetweenLocalDates(from: Date, to: Date): number {
  const fromMidnight = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime();
  const toMidnight = new Date(to.getFullYear(), to.getMonth(), to.getDate()).getTime();

  return Math.round((toMidnight - fromMidnight) / 86_400_000);
}

/**
 * 6d's date block: an uppercase day label over a 24h clock, both in the device's
 * own timezone. "Today"/"tomorrow" are calendar-day comparisons, not 24/48 hour
 * windows — an event at 23:50 tonight is still BUGÜN at 09:00.
 */
export function formatMobileEventDateBlock(
  event: { readonly scheduledStartAt: string },
  nowMs: number,
  locale: MobileLocale,
): MobileEventDateBlock {
  const start = new Date(event.scheduledStartAt);
  const time = `${padTwoDigits(start.getHours())}:${padTwoDigits(start.getMinutes())}`;
  const dayOffset = daysBetweenLocalDates(new Date(nowMs), start);

  if (dayOffset === 0) {
    return { label: mobileCopy[locale].eventToday, time };
  }

  if (dayOffset === 1) {
    return { label: mobileCopy[locale].eventTomorrow, time };
  }

  const month = MOBILE_EVENT_MONTH_ABBREVIATIONS[locale][start.getMonth()] ?? "";
  return { label: `${start.getDate()} ${month}`, time };
}

/** 6d shows this many channels before "Kalan {count} kanalı gör" takes over. */
export const MOBILE_SERVER_PROFILE_CHANNEL_PREVIEW_LIMIT = 5;

/**
 * Title-case month names for the surfaces that print a date inside a sentence
 * rather than inside 6d's uppercase date block. Same reason as the abbreviation
 * table above: Hermes has no guaranteed ICU catalogue, so `Intl.DateTimeFormat`
 * would render differently on device than it does here. Turkish casing is the
 * second reason — `"EKİ".toLowerCase()` is not `"eki"` in the default locale.
 */
const MOBILE_MONTH_SHORT_LABELS: Readonly<Record<MobileLocale, readonly string[]>> = {
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  tr: ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"],
};

const MOBILE_MONTH_LONG_LABELS: Readonly<Record<MobileLocale, readonly string[]>> = {
  en: [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ],
  tr: [
    "Ocak",
    "Şubat",
    "Mart",
    "Nisan",
    "Mayıs",
    "Haziran",
    "Temmuz",
    "Ağustos",
    "Eylül",
    "Ekim",
    "Kasım",
    "Aralık",
  ],
};

/** 6d/6e text-channel trailing label: `31 Tem`. A channel with no activity prints nothing. */
export function formatMobileChannelActivityLabel(
  lastActivityAt: string | null,
  locale: MobileLocale,
): string {
  if (!lastActivityAt) {
    return "";
  }

  const date = new Date(lastActivityAt);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return `${date.getDate()} ${MOBILE_MONTH_SHORT_LABELS[locale][date.getMonth()] ?? ""}`.trim();
}

/** 6e "Oluşturulma": `12 Mart 2025` / `March 12, 2025`. */
export function formatMobileServerCreatedDate(createdAt: string, locale: MobileLocale): string {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const month = MOBILE_MONTH_LONG_LABELS[locale][date.getMonth()] ?? "";
  return locale === "tr"
    ? `${date.getDate()} ${month} ${date.getFullYear()}`
    : `${month} ${date.getDate()}, ${date.getFullYear()}`;
}

export interface MobileServerEventSplit<TEvent> {
  readonly past: TEvent[];
  readonly upcoming: TEvent[];
}

/**
 * The event list's two sections. The split follows `status`, not the clock: the
 * backend owns when a scheduled event becomes completed, and a second, device
 * local rule would disagree with it while a worker is behind.
 */
export function splitMobileServerEvents<
  TEvent extends { readonly scheduledStartAt: string; readonly status: string },
>(events: readonly TEvent[]): MobileServerEventSplit<TEvent> {
  const upcoming: TEvent[] = [];
  const past: TEvent[] = [];

  for (const event of events) {
    if (event.status === "SCHEDULED" || event.status === "ACTIVE") {
      upcoming.push(event);
    } else {
      past.push(event);
    }
  }

  const startMs = (event: TEvent) => Date.parse(event.scheduledStartAt);

  return {
    past: past.sort((left, right) => startMs(right) - startMs(left)),
    upcoming: upcoming.sort((left, right) => startMs(left) - startMs(right)),
  };
}

const MOBILE_EVENT_DATE_TIME_PATTERN = /^(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2})$/;

/**
 * The event form takes `GG.AA.YYYY SS:DD` in the device's own timezone and hands
 * the API an instant. There is no date picker in the handoff, so the text field
 * is the input and this is its only parser; anything it cannot read is rejected
 * rather than coerced into a nearby date.
 */
export function parseMobileEventDateTimeInput(value: string): string | null {
  const match = MOBILE_EVENT_DATE_TIME_PATTERN.exec(value.trim());
  if (!match) {
    return null;
  }

  const [day, month, year, hours, minutes] = match.slice(1).map(Number) as [
    number,
    number,
    number,
    number,
    number,
  ];
  if (month < 1 || month > 12 || day < 1 || day > 31 || hours > 23 || minutes > 59) {
    return null;
  }

  const date = new Date(year, month - 1, day, hours, minutes, 0, 0);
  // A rolled-over date (31.02) comes back as a different day; that is a typo,
  // not a request for the 3rd of March.
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }

  return date.toISOString();
}

/** The inverse, for the edit path's initial field values. */
export function formatMobileEventDateTimeInput(value: string | null): string {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return [
    `${padTwoDigits(date.getDate())}.${padTwoDigits(date.getMonth() + 1)}.${date.getFullYear()}`,
    `${padTwoDigits(date.getHours())}:${padTwoDigits(date.getMinutes())}`,
  ].join(" ");
}

export interface MobileServerAccessLabels {
  readonly serverAccessApproval: string;
  readonly serverAccessInvite: string;
  readonly serverAccessPublic: string;
}

/**
 * 6e "Erişim". The labels come in from the locale dictionary rather than living
 * here, so the model stays language-free while the mapping stays in one place.
 */
export function getMobileServerAccessLabel(
  accessLevel: ServerProfileAccessLevel,
  labels: MobileServerAccessLabels,
): string {
  switch (accessLevel) {
    case "approval":
      return labels.serverAccessApproval;
    case "public":
      return labels.serverAccessPublic;
    default:
      return labels.serverAccessInvite;
  }
}

/**
 * Faz 1 §C5's rail order, mobile side: `starred desc` over whatever order the
 * caller already has. `Array.prototype.sort` is stable, so unstarred servers
 * keep the sequence the API produced.
 */
export function sortMobileServersByStar<T extends { readonly starred: boolean }>(
  servers: readonly T[],
): T[] {
  return [...servers].sort((left, right) => Number(right.starred) - Number(left.starred));
}

/** Flip one section; a collapsed section is stored as `true`, an expanded one is dropped so the map stays minimal. */
export function toggleMobileCollapsedSection(
  map: Readonly<Record<string, boolean>>,
  key: string,
): Record<string, boolean> {
  const next: Record<string, boolean> = {};
  for (const [existingKey, value] of Object.entries(map)) {
    if (value === true && existingKey !== key) {
      next[existingKey] = true;
    }
  }

  if (map[key] !== true) {
    next[key] = true;
  }

  return next;
}
