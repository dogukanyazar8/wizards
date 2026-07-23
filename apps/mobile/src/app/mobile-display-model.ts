import type {
  ChatMessage,
  DMMessagePayload,
  MobileBootstrapPayload,
  MobileWorkspaceChannelSummary,
  MobileWorkspaceServerDetailResponse,
} from "@wizards/types";
import type {
  MobileVoiceRoomParticipant,
  MobileVoiceRoomState,
} from "../voice/mobile-voice-room-contract";
import { getMobileNoiseSuppressionLabel } from "../voice/mobile-voice-noise-contract";
import { mobileCopy } from "../locale/mobile-copy";
import type { MobileLocale } from "../locale/mobile-locale-preferences";
import type { MobileTabId } from "../navigation/mobile-navigation";

export type MobileConversationSummary =
  MobileBootstrapPayload["home"]["directMessages"]["recent"][number];
export type MobileWorkspaceChannelSection = {
  readonly channels: MobileWorkspaceChannelSummary[];
  readonly id: string;
  readonly name: string;
};
export type MobileVisibleWorkspaceChannelSection = MobileWorkspaceChannelSection & {
  readonly isCollapsed: boolean;
  readonly totalChannelCount: number;
};

export type MobileDisplayMessage = ChatMessage | DMMessagePayload;
export type MobileConversationFilter = "all" | "groups" | "unread";
export type MobileHomeQuickActionKind = "direct-message" | "server" | "voice";
export type MobileWorkspaceChannelSurface = "channel-chat" | "voice-room" | "workspace-browser";
export interface MobileChannelChatHeaderModel {
  readonly accessibilityLabel: string;
  readonly channelName: string;
  readonly memberCountLabel: string;
  readonly serverName: string;
  readonly topic: string | null;
}
export interface MobileChannelChatSearchVisibility {
  readonly isSearchAvailable: boolean;
  readonly shouldRenderSearchPanel: boolean;
  readonly toggleAccessibilityLabel: string;
}
export interface MobileVoiceChannelScreenModel {
  readonly allParticipants: MobileVoiceRoomParticipant[];
  readonly canLeave: boolean;
  readonly canOpenSettings: boolean;
  readonly canSelectDefaultAudio: boolean;
  readonly canSelectSpeaker: boolean;
  readonly canShareScreen: boolean;
  readonly canToggleCamera: boolean;
  readonly canToggleMicrophone: boolean;
  readonly channelName: string;
  readonly isConnected: boolean;
  readonly noiseSuppressionLabel: string;
  readonly listeningParticipants: MobileVoiceRoomParticipant[];
  readonly memberCountLabel: string;
  readonly participantCountLabel: string;
  readonly qualityLabel: string;
  readonly serverName: string;
  readonly serverShortName: string;
  readonly shouldSplitParticipantsBySpeakingState: boolean;
  readonly signalLabel: string;
  readonly speakingParticipants: MobileVoiceRoomParticipant[];
  readonly title: string;
}

export const MOBILE_RENDER_LIMITS = {
  channels: 80,
  conversations: 50,
  messages: 60,
  servers: 50,
  voiceParticipants: 40,
} as const;

export type MobileBoundedListDirection = "end" | "start";

export interface MobileHomeQuickAction {
  readonly badge: number | null;
  readonly id: string;
  readonly isEnabled: boolean;
  readonly kind: MobileHomeQuickActionKind;
  readonly subtitle: string;
  readonly targetId: string | null;
  readonly title: string;
}

const ACTIVE_PRESENCE_STATUSES = new Set(["ONLINE", "IDLE", "DND"]);

export type MobilePresenceTone = "online" | "idle" | "dnd" | "offline";

const MOBILE_CHANNEL_CHAT_LABEL_LIMITS = {
  accessibilityLabel: 160,
  channelName: 48,
  serverName: 48,
  topic: 96,
} as const;

function normalizeMobileDisplayText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function truncateMobileDisplayText(value: string, limit: number): string {
  const normalized = normalizeMobileDisplayText(value);

  if (normalized.length <= limit) {
    return normalized;
  }

  if (limit <= 3) {
    return normalized.slice(0, Math.max(0, limit));
  }

  return `${normalized.slice(0, limit - 3).trimEnd()}...`;
}

export function getBoundedMobileList<T>(
  items: readonly T[],
  limit: number,
  direction: MobileBoundedListDirection = "start",
): T[] {
  if (limit <= 0) {
    return [];
  }

  if (items.length <= limit) {
    return [...items];
  }

  return direction === "end" ? items.slice(-limit) : items.slice(0, limit);
}

/**
 * The API caps unread counting at MOBILE_UNREAD_COUNT_CAP so the read stays a
 * bounded scan, which means a count sitting exactly on the cap means "at least
 * this many". Render that as a ceiling rather than claiming an exact total.
 */
export const MOBILE_UNREAD_DISPLAY_CAP = 99;

export function formatMobileUnreadCount(count: number): string {
  if (Number.isNaN(count) || count <= 0) {
    return "0";
  }

  const whole = Math.trunc(count);
  return whole >= MOBILE_UNREAD_DISPLAY_CAP ? `${MOBILE_UNREAD_DISPLAY_CAP}+` : String(whole);
}

export function isMobilePresenceActive(status: string | null | undefined): boolean {
  if (!status) {
    return false;
  }

  return ACTIVE_PRESENCE_STATUSES.has(status.toUpperCase());
}

/** Presence tone shared by every surface, mirroring the web status colours. */
export function getMobilePresenceTone(status: string | null | undefined): MobilePresenceTone {
  switch (status?.toUpperCase()) {
    case "ONLINE":
      return "online";
    case "IDLE":
      return "idle";
    case "DND":
      return "dnd";
    default:
      return "offline";
  }
}

export function getMobileConversationTitle(
  conversation: MobileConversationSummary,
  fallback: string,
): string {
  const participantNames = conversation.participants
    .map((participant) => participant.displayName ?? participant.username)
    .filter(Boolean);

  return (
    conversation.name ?? (participantNames.length > 0 ? participantNames.join(", ") : fallback)
  );
}

export function getMobileConversationAvatarUrl(
  conversation: MobileConversationSummary,
): string | null {
  return conversation.iconUrl ?? conversation.participants[0]?.avatarUrl ?? null;
}

export function getMobileConversationActiveCount(conversation: MobileConversationSummary): number {
  return conversation.participants.filter((participant) =>
    isMobilePresenceActive(participant.status),
  ).length;
}

export function getMobileConversationSearchText(
  conversation: MobileConversationSummary,
  fallback: string,
): string {
  return [
    conversation.name,
    getMobileConversationTitle(conversation, fallback),
    conversation.type,
    ...conversation.participants.flatMap((participant) => [
      participant.displayName,
      participant.username,
    ]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function filterMobileConversations<T extends MobileConversationSummary>(
  conversations: readonly T[],
  options: {
    fallback: string;
    filter: MobileConversationFilter;
    query: string;
  },
): T[] {
  const normalizedQuery = options.query.trim().toLowerCase();

  return conversations.filter((conversation) => {
    if (options.filter === "unread" && conversation.unreadCount === 0) {
      return false;
    }

    if (options.filter === "groups" && conversation.type !== "GROUP_DM") {
      return false;
    }

    if (!normalizedQuery) {
      return true;
    }

    return getMobileConversationSearchText(conversation, options.fallback).includes(
      normalizedQuery,
    );
  });
}

export function getMobileHomeQuickActions(
  payload: MobileBootstrapPayload,
  labels: {
    channelsSuffix: string;
    directMessageFallback: string;
    latestDirectMessage: string;
    latestServer: string;
    membersSuffix: string;
    unreadSuffix: string;
  },
): MobileHomeQuickAction[] {
  const actions: MobileHomeQuickAction[] = [];
  const unreadConversation =
    payload.home.directMessages.recent.find((conversation) => conversation.unreadCount > 0) ??
    payload.home.directMessages.recent[0] ??
    null;

  if (unreadConversation) {
    actions.push({
      badge: unreadConversation.unreadCount > 0 ? unreadConversation.unreadCount : null,
      id: `dm:${unreadConversation.id}`,
      isEnabled: true,
      kind: "direct-message",
      subtitle:
        unreadConversation.unreadCount > 0
          ? `${unreadConversation.unreadCount} ${labels.unreadSuffix}`
          : labels.latestDirectMessage,
      targetId: unreadConversation.id,
      title: getMobileConversationTitle(unreadConversation, labels.directMessageFallback),
    });
  }

  const recentServer = payload.home.servers.recent[0] ?? null;

  if (recentServer) {
    actions.push({
      badge: null,
      id: `server:${recentServer.id}`,
      isEnabled: true,
      kind: "server",
      subtitle: `${recentServer.memberCount} ${labels.membersSuffix} - ${recentServer.channelCount} ${labels.channelsSuffix}`,
      targetId: recentServer.id,
      title: recentServer.name || labels.latestServer,
    });
  }

  const voice = payload.features.voice;

  actions.push({
    badge: null,
    id: "voice:readiness",
    isEnabled: voice.status === "available" || voice.status === "requires-native-permission",
    kind: "voice",
    subtitle: voice.reason ?? voice.status,
    targetId: null,
    title: voice.label,
  });

  return actions.slice(0, 3);
}

export function getMobileConversationInitialsLabel(
  conversation: MobileConversationSummary,
  fallback: string,
): string {
  return getMobileConversationTitle(conversation, fallback);
}

export function getMobileMessageBodyPreview(
  message: MobileDisplayMessage,
  labels: {
    attachmentOnly: string;
    deleted: string;
  },
): string {
  if (message.deletedAt) {
    return labels.deleted;
  }

  const trimmedContent = message.content.trim();

  if (trimmedContent.length > 0) {
    return trimmedContent;
  }

  return labels.attachmentOnly;
}

export function getMobileMessageEngagementCounts(message: MobileDisplayMessage): {
  attachmentCount: number;
  reactionCount: number;
} {
  return {
    attachmentCount: message.attachments.length,
    reactionCount: message.reactions.length,
  };
}

export type MobileMessageStreamItem<T extends { readonly createdAt: string; readonly id: string }> =
  {
    readonly id: string;
    readonly isGroupedWithNext: boolean;
    readonly isGroupedWithPrevious: boolean;
    readonly message: T;
    readonly showDateSeparator: boolean;
  };

export interface MobileMessageListPerformanceConfig {
  readonly initialNumToRender: number;
  readonly maxToRenderPerBatch: number;
  readonly windowSize: number;
}

export function getMobileDisplayMessageDayKey(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toISOString().slice(0, 10);
}

function getMobileMessageAuthorId(message: unknown): string | null {
  if (!message || typeof message !== "object" || !("author" in message)) {
    return null;
  }

  const author = message.author;
  if (!author || typeof author !== "object" || !("id" in author)) {
    return null;
  }

  const id = author.id;
  return typeof id === "string" && id.trim().length > 0 ? id : null;
}

function shouldGroupMobileMessageStreamItems<
  T extends { readonly createdAt: string; readonly id: string },
>(previous: T, current: T): boolean {
  const previousDayKey = getMobileDisplayMessageDayKey(previous.createdAt);
  const currentDayKey = getMobileDisplayMessageDayKey(current.createdAt);
  if (!previousDayKey || previousDayKey !== currentDayKey) {
    return false;
  }

  const previousAuthorId = getMobileMessageAuthorId(previous);
  return previousAuthorId !== null && previousAuthorId === getMobileMessageAuthorId(current);
}

/**
 * `limit` is opt-in. The chat lists are virtualized, so bounding them here does
 * not save rendering — it only throws loaded pages away. It used to default to
 * MOBILE_RENDER_LIMITS.messages (60) against a page size of 30, so from the
 * third page on every `onStartReached` fetch was discarded, the list never grew,
 * the reader stayed pinned at the top, and the fetch fired again. That loop is
 * what looked like the messages loading over and over. Non-virtualized preview
 * surfaces still pass a limit explicitly.
 */
export function getMobileMessageStreamItems<
  T extends { readonly createdAt: string; readonly id: string },
>(messages: readonly T[], limit?: number): MobileMessageStreamItem<T>[] {
  const visibleMessages =
    limit === undefined ? messages : getBoundedMobileList(messages, limit, "end");

  return visibleMessages.map((message, index) => {
    const dayKey = getMobileDisplayMessageDayKey(message.createdAt);
    const previousMessage = visibleMessages[index - 1];
    const nextMessage = visibleMessages[index + 1];
    const previousDayKey = previousMessage
      ? getMobileDisplayMessageDayKey(previousMessage.createdAt)
      : "";

    return {
      id: message.id,
      isGroupedWithNext:
        nextMessage !== undefined && shouldGroupMobileMessageStreamItems(message, nextMessage),
      isGroupedWithPrevious:
        previousMessage !== undefined &&
        shouldGroupMobileMessageStreamItems(previousMessage, message),
      message,
      showDateSeparator: dayKey !== "" && dayKey !== previousDayKey,
    };
  });
}

export function getMobileMessageListPerformanceConfig(
  messageCount: number,
): MobileMessageListPerformanceConfig {
  const boundedCount = Math.max(0, Math.min(messageCount, MOBILE_RENDER_LIMITS.messages));

  if (boundedCount <= 12) {
    return {
      initialNumToRender: 8,
      maxToRenderPerBatch: 8,
      windowSize: 5,
    };
  }

  return {
    initialNumToRender: 12,
    maxToRenderPerBatch: 10,
    windowSize: 7,
  };
}

export function getMobileWorkspaceChannels(
  detail: MobileWorkspaceServerDetailResponse["detail"],
): MobileWorkspaceChannelSummary[] {
  return [
    ...detail.ungroupedChannels,
    ...detail.categories.flatMap((category) => category.channels),
  ];
}

export function getMobileWorkspaceChannelSurface(
  channel: MobileWorkspaceChannelSummary | null,
  options: {
    isExplicitlyOpened: boolean;
  },
): MobileWorkspaceChannelSurface {
  if (!channel || !options.isExplicitlyOpened) {
    return "workspace-browser";
  }

  return channel.type === "VOICE" ? "voice-room" : "channel-chat";
}

export function getMobileVoiceChannelScreenModel(
  room: MobileVoiceRoomState,
  options: {
    channelName: string;
    locale: MobileLocale;
    memberCount: number;
    serverName: string;
    serverShortName: string;
  },
): MobileVoiceChannelScreenModel {
  const allParticipants = getBoundedMobileList(
    room.participants,
    MOBILE_RENDER_LIMITS.voiceParticipants,
  );
  const speakingParticipants = allParticipants.filter(
    (participant) => participant.isSpeaking && !participant.isMuted,
  );
  const speakerIds = new Set(speakingParticipants.map((participant) => participant.userId));
  const listeningParticipants = allParticipants.filter(
    (participant) => !speakerIds.has(participant.userId),
  );
  const isConnected = room.status === "connected";
  const localized = mobileCopy[options.locale];

  return {
    allParticipants,
    canLeave: room.status !== "idle",
    canOpenSettings: isConnected,
    canSelectDefaultAudio: isConnected,
    canSelectSpeaker: isConnected,
    canShareScreen: isConnected,
    canToggleCamera: isConnected,
    canToggleMicrophone: isConnected,
    channelName: room.channelName ?? options.channelName,
    isConnected,
    noiseSuppressionLabel: getMobileNoiseSuppressionLabel(options.locale),
    listeningParticipants,
    memberCountLabel: String(Math.max(0, options.memberCount)),
    participantCountLabel: String(allParticipants.length),
    qualityLabel: isConnected ? localized.voiceRoomQualityConnected : localized.voiceRoomQualityPreparing,
    serverName: options.serverName,
    serverShortName: options.serverShortName,
    shouldSplitParticipantsBySpeakingState: false,
    signalLabel: isConnected ? localized.voiceRoomSignalActive : localized.voiceRoomSignalConnecting,
    speakingParticipants,
    title: localized.voiceRoomLiveTitle,
  };
}

export function getMobileChannelChatHeaderModel(
  channel: MobileWorkspaceChannelSummary,
  options: {
    fallbackChannelName: string;
    memberCount: number;
    membersSuffix: string;
    serverName: string;
  },
): MobileChannelChatHeaderModel {
  const channelName = truncateMobileDisplayText(
    channel.name || options.fallbackChannelName,
    MOBILE_CHANNEL_CHAT_LABEL_LIMITS.channelName,
  );
  const serverName = truncateMobileDisplayText(
    options.serverName,
    MOBILE_CHANNEL_CHAT_LABEL_LIMITS.serverName,
  );
  const memberCountLabel = `${Math.max(0, options.memberCount)} ${options.membersSuffix}`;
  const topic = channel.topic
    ? truncateMobileDisplayText(channel.topic, MOBILE_CHANNEL_CHAT_LABEL_LIMITS.topic)
    : null;
  const accessibilityLabel = truncateMobileDisplayText(
    [channelName, serverName, memberCountLabel].filter(Boolean).join(", "),
    MOBILE_CHANNEL_CHAT_LABEL_LIMITS.accessibilityLabel,
  );

  return {
    accessibilityLabel,
    channelName,
    memberCountLabel,
    serverName,
    topic,
  };
}

export function getMobileChannelChatSearchVisibility(options: {
  closeLabel: string;
  featureStatus: MobileBootstrapPayload["features"]["messageSearch"]["status"] | null | undefined;
  hasActiveSearchContext: boolean;
  isSearchPanelOpen: boolean;
  openLabel: string;
}): MobileChannelChatSearchVisibility {
  const isSearchAvailable = options.featureStatus === "available";
  const shouldRenderSearchPanel =
    isSearchAvailable && (options.isSearchPanelOpen || options.hasActiveSearchContext);

  return {
    isSearchAvailable,
    shouldRenderSearchPanel,
    toggleAccessibilityLabel: shouldRenderSearchPanel ? options.closeLabel : options.openLabel,
  };
}

export function getMobileWorkspaceChannelSections(
  detail: MobileWorkspaceServerDetailResponse["detail"],
  labels: {
    ungrouped: string;
  },
): MobileWorkspaceChannelSection[] {
  const sections: MobileWorkspaceChannelSection[] = [];

  if (detail.ungroupedChannels.length > 0) {
    sections.push({
      channels: detail.ungroupedChannels,
      id: "ungrouped",
      name: labels.ungrouped,
    });
  }

  for (const category of detail.categories) {
    if (category.channels.length === 0) {
      continue;
    }

    sections.push({
      channels: category.channels,
      id: category.id,
      name: category.name,
    });
  }

  return sections;
}

export function filterMobileWorkspaceChannelSections(
  sections: readonly MobileWorkspaceChannelSection[],
  query: string,
): MobileWorkspaceChannelSection[] {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return sections.map((section) => ({
      ...section,
      channels: [...section.channels],
    }));
  }

  return sections
    .map((section) => {
      const sectionMatches = section.name.toLowerCase().includes(normalizedQuery);
      const channels = sectionMatches
        ? section.channels
        : section.channels.filter((channel) =>
            [channel.name, channel.topic, channel.categoryName, channel.type]
              .filter(Boolean)
              .join(" ")
              .toLowerCase()
              .includes(normalizedQuery),
          );

      return {
        ...section,
        channels: [...channels],
      };
    })
    .filter((section) => section.channels.length > 0);
}

export function getVisibleMobileWorkspaceChannelSections(
  sections: readonly MobileWorkspaceChannelSection[],
  collapsedSections: Readonly<Record<string, boolean>>,
): MobileVisibleWorkspaceChannelSection[] {
  return sections.map((section) => {
    const isCollapsed = collapsedSections[section.id] === true;

    return {
      ...section,
      channels: isCollapsed ? [] : [...section.channels],
      isCollapsed,
      totalChannelCount: section.channels.length,
    };
  });
}

export function findInitialMobileWorkspaceChannel(
  detail: MobileWorkspaceServerDetailResponse["detail"],
  preferredChannelId?: string | null,
): MobileWorkspaceChannelSummary | null {
  const channels = getMobileWorkspaceChannels(detail);
  const preferredChannel = preferredChannelId
    ? channels.find((channel) => channel.id === preferredChannelId)
    : null;

  if (preferredChannel) {
    return preferredChannel;
  }

  const defaultChannel = detail.server.defaultChannelId
    ? channels.find((channel) => channel.id === detail.server.defaultChannelId)
    : null;

  return (
    (defaultChannel?.type === "TEXT" ? defaultChannel : null) ??
    channels.find((channel) => channel.type === "TEXT") ??
    channels[0] ??
    null
  );
}

export function resolveMobileWorkspaceActiveTextChannelId(
  detail: MobileWorkspaceServerDetailResponse["detail"],
  options: {
    readonly currentChannelId: string | null;
    readonly preferredChannelId: string | null | undefined;
    readonly shouldOpenPreferredChannel: boolean;
  },
): string | null {
  const channels = getMobileWorkspaceChannels(detail);

  if (options.shouldOpenPreferredChannel) {
    const preferredChannel = options.preferredChannelId
      ? channels.find((channel) => channel.id === options.preferredChannelId)
      : null;
    return preferredChannel?.type === "TEXT" ? preferredChannel.id : null;
  }

  if (!options.currentChannelId) {
    return null;
  }

  const currentChannel = channels.find((channel) => channel.id === options.currentChannelId);
  return currentChannel?.type === "TEXT" ? currentChannel.id : null;
}

export function resolveMobileTabActiveTextChannelId(
  tab: MobileTabId,
  channelId: string | null,
): string | null {
  return tab === "overview" ? channelId : null;
}

export function getMobileChannelPriority(channel: MobileWorkspaceChannelSummary): {
  hasMentions: boolean;
  hasUnread: boolean;
  isLocked: boolean;
  isReadOnly: boolean;
} {
  return {
    hasMentions: channel.mentionCount > 0,
    hasUnread: channel.unreadCount > 0,
    isLocked: channel.locked,
    isReadOnly: channel.readOnly,
  };
}

export function formatMobileDisplayTime(value: string, locale = "tr-TR"): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
