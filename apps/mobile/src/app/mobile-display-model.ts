import type {
  ChatMessage,
  DMMessagePayload,
  MobileBootstrapPayload,
  MobileWorkspaceChannelSummary,
  MobileWorkspaceServerDetailResponse,
} from "@wizards/types";

export type MobileConversationSummary =
  MobileBootstrapPayload["home"]["directMessages"]["recent"][number];

export type MobileDisplayMessage = ChatMessage | DMMessagePayload;
export type MobileConversationFilter = "active" | "all" | "unread";
export type MobileHomeQuickActionKind = "direct-message" | "server" | "voice";

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

export function isMobilePresenceActive(status: string | null | undefined): boolean {
  if (!status) {
    return false;
  }

  return ACTIVE_PRESENCE_STATUSES.has(status.toUpperCase());
}

export function getMobileConversationTitle(
  conversation: MobileConversationSummary,
  fallback: string,
): string {
  const participantNames = conversation.participants
    .map((participant) => participant.displayName ?? participant.username)
    .filter(Boolean);

  return (
    conversation.name ??
    (participantNames.length > 0 ? participantNames.join(", ") : fallback)
  );
}

export function getMobileConversationAvatarUrl(
  conversation: MobileConversationSummary,
): string | null {
  return conversation.iconUrl ?? conversation.participants[0]?.avatarUrl ?? null;
}

export function getMobileConversationActiveCount(
  conversation: MobileConversationSummary,
): number {
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

export function filterMobileConversations(
  conversations: readonly MobileConversationSummary[],
  options: {
    fallback: string;
    filter: MobileConversationFilter;
    query: string;
  },
): MobileConversationSummary[] {
  const normalizedQuery = options.query.trim().toLowerCase();

  return conversations.filter((conversation) => {
    if (options.filter === "unread" && conversation.unreadCount === 0) {
      return false;
    }

    if (options.filter === "active" && getMobileConversationActiveCount(conversation) === 0) {
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
      title: getMobileConversationTitle(
        unreadConversation,
        labels.directMessageFallback,
      ),
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
    isEnabled:
      voice.status === "available" || voice.status === "requires-native-permission",
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

export function getMobileWorkspaceChannels(
  detail: MobileWorkspaceServerDetailResponse["detail"],
): MobileWorkspaceChannelSummary[] {
  return [
    ...detail.ungroupedChannels,
    ...detail.categories.flatMap((category) => category.channels),
  ];
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
