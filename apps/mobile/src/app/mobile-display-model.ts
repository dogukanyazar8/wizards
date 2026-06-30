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
