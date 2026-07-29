import { FlashList } from "@shopify/flash-list";
import { memo, useEffect, useRef, useState } from "react";
import { PanResponder, ScrollView } from "react-native";
import {
  Ionicons,
  Pressable,
  Text,
  TextInput,
  View,
  copy,
  filterMobileConversations,
  formatMobileDisplayTime,
  formatMobileUnreadCount,
  getMobileConversationAvatarUrl,
  getMobileConversationInitialsLabel,
  getMobileConversationTitle,
  getMobilePresenceTone,
  isMobilePresenceActive,
  useMemo,
  type MobileDMConversationListItem,
} from "../mobile-root-screen-shared";
import { getMobilePresenceColor } from "../../design/mobile-presence-color";
import { MobileLineIcon } from "../../design/mobile-line-icons";
import { mobileMessagingMetrics as msg } from "../../design/tokens";
import { AvatarMark, MetricMiniPill } from "../components/ui-atoms";
import { useTheme } from "../providers/mobile-theme-provider";
import { useDmScreenStyles } from "./dm-screen.styles";
import type { MobileDMInboxSegment, MobileDMOnlineFriend } from "./dm-screen.types";

const DM_INBOX_SEGMENTS: readonly MobileDMInboxSegment[] = ["conversations", "friends", "requests"];
const EMPTY_PRESENCE_MAP: ReadonlyMap<string, string> = new Map<string, string>();
const EMPTY_VOICE_SET: ReadonlySet<string> = new Set<string>();
import { mobileListLoadHandlers } from "../../performance/mobile-performance-metrics";
import {
  getMobileRecentDMPrefetchReadiness,
  subscribeMobileRecentDMPrefetchReadiness,
} from "../../query/mobile-message-prefetch";

/** Horizontal swipe gesture that steps between the three inbox segments. */
export function useMobileDmSegmentSwipe(
  segment: MobileDMInboxSegment,
  onSelectSegment: (next: MobileDMInboxSegment) => void,
) {
  const segmentRef = useRef(segment);
  segmentRef.current = segment;
  return useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gesture) =>
          Math.abs(gesture.dx) > 28 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.8,
        onPanResponderRelease: (_event, gesture) => {
          const index = DM_INBOX_SEGMENTS.indexOf(segmentRef.current);
          const next =
            gesture.dx <= -40
              ? DM_INBOX_SEGMENTS[index + 1]
              : gesture.dx >= 40
                ? DM_INBOX_SEGMENTS[index - 1]
                : undefined;
          if (next) {
            onSelectSegment(next);
          }
        },
      }).panHandlers,
    [onSelectSegment],
  );
}

/**
 * §2 "1a".2 / "1b" / "1c". One header for all three tabs: only the FAB glyph
 * changes (a pencil starts a chat, a person-plus adds a friend). The old
 * "Sohbetlerin ve arkadaşların" subtitle is gone, so the band is the same height
 * on every tab and the segment below it never shifts.
 */
export function DMInboxHeader({
  onCompose,
  segment,
}: {
  onCompose(): void;
  segment: MobileDMInboxSegment;
}) {
  const theme = useTheme();
  const styles = useDmScreenStyles();
  const composesChat = segment === "conversations";
  return (
    <View style={styles.dmInboxHeader}>
      <Text style={styles.dmInboxTitle}>{copy.dmInboxTitle}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={composesChat ? copy.dmComposeAction : copy.dmAddFriendAction}
        onPress={onCompose}
        testID="mobile-dm-compose-button"
        style={styles.dmComposeButton}
      >
        <MobileLineIcon
          color={theme.messaging.surface}
          name={composesChat ? "edit" : "person-plus"}
          size={19}
        />
      </Pressable>
    </View>
  );
}

export function DirectMessageSummaryCard({
  totalCount,
  unreadCount,
}: {
  totalCount: number;
  unreadCount: number;
}) {
  const theme = useTheme();
  const styles = useDmScreenStyles();
  return (
    <View style={styles.dmSummaryCard} testID="mobile-dm-summary-card">
      <View style={styles.dmSummaryIcon}>
        <Ionicons name="paper-plane" size={18} color={theme.accent.strong} />
      </View>
      <View style={styles.dmSummaryContent}>
        <Text style={styles.dmSummaryTitle}>{copy.homeRecentDmsTitle}</Text>
        <Text style={styles.dmSummaryDescription}>{copy.messagesDescription}</Text>
      </View>
      <View style={styles.dmSummaryMetricGrid}>
        <MetricMiniPill label={copy.homeDmLabel} value={totalCount} />
        <MetricMiniPill label={copy.homeUnreadLabel} value={unreadCount} />
      </View>
    </View>
  );
}

export function DMInboxSearchField({
  onChangeText,
  placeholder,
  value,
}: {
  onChangeText(next: string): void;
  placeholder: string;
  value: string;
}) {
  const theme = useTheme();
  const styles = useDmScreenStyles();
  return (
    <View style={styles.dmUnifiedSearchWrap}>
      <View style={styles.dmUnifiedSearchPill}>
        <Ionicons name="search" size={17} color={theme.text.visualPlaceholder} />
        <TextInput
          accessibilityLabel={placeholder}
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={theme.text.visualPlaceholder}
          returnKeyType="search"
          style={styles.dmUnifiedSearchInput}
          testID="mobile-dm-search-input"
          value={value}
        />
      </View>
    </View>
  );
}

/**
 * A non-visual synchronization point for the device benchmark. The normal UI
 * intentionally does not promise that a speculative fetch has reached cache;
 * this marker prevents the benchmark's cache-hit phase from racing it.
 */
export function MobileDMPrefetchReadinessMarker() {
  const [readiness, setReadiness] = useState(getMobileRecentDMPrefetchReadiness);

  useEffect(
    () =>
      subscribeMobileRecentDMPrefetchReadiness(() => {
        setReadiness(getMobileRecentDMPrefetchReadiness());
      }),
    [],
  );

  return (
    <View
      accessible
      accessibilityLabel={
        readiness.ready ? "mobile-dm-prefetch-ready" : "mobile-dm-prefetch-pending"
      }
      style={{ height: 1, opacity: 0.01, width: 1 }}
      testID="mobile-dm-prefetch-readiness"
    />
  );
}

export function DMOnlineStrip({
  friends,
  onAddFriend,
  onOpenFriendDM,
}: {
  friends: readonly MobileDMOnlineFriend[];
  onAddFriend(): void;
  onOpenFriendDM(friendId: string): void;
}) {
  const styles = useDmScreenStyles();
  const theme = useTheme();
  if (friends.length === 0) {
    return null;
  }
  return (
    <View testID="mobile-dm-online-strip">
      <View style={styles.dmOnlineStripLabelRow}>
        <Text style={styles.dmOnlineStripLabel}>{copy.dmSectionOnlineLabel}</Text>
        <Text style={styles.dmOnlineStripCount} testID="mobile-dm-online-strip-count">
          {friends.length}
        </Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.dmOnlineStripContent}
      >
        {friends.map((friend) => {
          const title = friend.displayName ?? friend.username;
          const presenceColor = getMobilePresenceColor(getMobilePresenceTone(friend.status), theme);
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${copy.openConversationAction}: ${title}`}
              key={friend.id}
              onPress={() => onOpenFriendDM(friend.id)}
              style={styles.dmOnlineStripCell}
              testID={`mobile-dm-online-friend-${friend.id}`}
            >
              <View style={styles.dmOnlineStripAvatarWrap}>
                <AvatarMark
                  avatarBorderRadius={msg.avatar.onlineStripRadius}
                  dimension={msg.avatar.onlineStrip}
                  identityId={friend.id}
                  imageUrl={friend.avatarUrl}
                  label={title}
                />
                {friend.voiceRoom ? (
                  <View
                    style={styles.dmOnlineStripVoiceTile}
                    testID={`mobile-dm-online-voice-${friend.id}`}
                  >
                    <MobileLineIcon
                      accessibilityLabel={copy.dmVoiceRoomPresenceLabel}
                      color={theme.messaging.accent}
                      name="audio-wave"
                      size={10}
                    />
                  </View>
                ) : (
                  <View
                    style={[styles.dmOnlineStripDot, { backgroundColor: presenceColor }]}
                    testID={`mobile-dm-online-dot-${friend.id}`}
                  />
                )}
              </View>
              <Text numberOfLines={1} style={styles.dmOnlineStripName}>
                {friend.username}
              </Text>
            </Pressable>
          );
        })}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copy.dmAddFriendAction}
          onPress={onAddFriend}
          style={styles.dmOnlineStripCell}
          testID="mobile-dm-online-add"
        >
          <View style={styles.dmOnlineStripAddCell}>
            <MobileLineIcon color={theme.messaging.groupLabel} name="plus" size={18} />
          </View>
          <Text numberOfLines={1} style={styles.dmOnlineStripAddLabel}>
            {copy.dmOnlineStripAddLabel}
          </Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

export function DirectMessageListCard({
  conversations,
  currentUserId = "",
  hasNextPage,
  onlineFriends = [],
  onAddFriend = () => {},
  onLoadMore,
  onOpenConversation,
  onOpenFriendDM = () => {},
  query = "",
  selectedConversationId,
  typingByConversationId = {},
}: {
  conversations: readonly MobileDMConversationListItem[];
  currentUserId?: string;
  hasNextPage: boolean;
  onlineFriends?: readonly MobileDMOnlineFriend[];
  onAddFriend?(): void;
  onLoadMore(): void;
  onOpenConversation(conversationId: string): void;
  onOpenFriendDM?(friendId: string): void;
  query?: string;
  selectedConversationId: string | null;
  /** §2 "1a".6.2; defaulted so the list renders without the realtime provider. */
  typingByConversationId?: Readonly<Record<string, readonly string[]>>;
}) {
  const styles = useDmScreenStyles();
  const filteredConversations = useMemo(
    () =>
      filterMobileConversations(conversations, {
        fallback: copy.directMessageFallback,
        filter: "all",
        query,
      }),
    [conversations, query],
  );
  // Live friend presence keyed by user id, so conversation rows match the strip.
  const presenceByUserId = useMemo(
    () => new Map(onlineFriends.map((friend) => [friend.id, friend.status] as const)),
    [onlineFriends],
  );
  // §2 "1a".5: the same voice-room fact the strip draws, so a row cannot show a
  // plain online dot for someone the strip has in a call.
  const voiceUserIds = useMemo(
    () =>
      new Set(
        onlineFriends.filter((friend) => friend.voiceRoom !== null).map((friend) => friend.id),
      ),
    [onlineFriends],
  );

  return (
    <View style={styles.dmListCard}>
      <FlashList
        contentContainerStyle={styles.dmConversationList}
        data={filteredConversations}
        keyExtractor={(conversation) => conversation.id}
        ListHeaderComponent={
          <View>
            {query.trim().length === 0 ? (
              <DMOnlineStrip
                friends={onlineFriends}
                onAddFriend={onAddFriend}
                onOpenFriendDM={onOpenFriendDM}
              />
            ) : null}
            <Text style={styles.dmConversationsSectionLabel}>
              {copy.dmSectionConversationsLabel}
            </Text>
          </View>
        }
        onLoad={mobileListLoadHandlers.dmInbox}
        onEndReached={hasNextPage ? onLoadMore : undefined}
        onEndReachedThreshold={0.6}
        renderItem={({ index, item: conversation }) => (
          <>
            <DirectMessageConversationCard
              conversation={conversation}
              currentUserId={currentUserId}
              presenceByUserId={presenceByUserId}
              selected={conversation.id === selectedConversationId}
              onOpenConversation={onOpenConversation}
              typingNames={typingByConversationId[conversation.id] ?? []}
              voiceUserIds={voiceUserIds}
            />
            {index < filteredConversations.length - 1 ? (
              <View
                style={styles.dmConversationHairline}
                testID="mobile-dm-conversation-hairline"
              />
            ) : null}
          </>
        )}
        ListEmptyComponent={
          <Text style={styles.contractDescription}>{copy.directMessageFilteredEmpty}</Text>
        }
        showsVerticalScrollIndicator={false}
        style={{ ...styles.dmConversationListViewport, ...styles.dmInboxListArea }}
        testID="mobile-dm-conversation-list"
      />
    </View>
  );
}

/**
 * Presence shown on a conversation avatar: the counterpart's status, never the
 * viewer's own (the API returns every participant, including the viewer).
 * Live friend presence wins over the list payload so the row and the online
 * strip never disagree.
 */
export function getMobileConversationPresenceStatus(
  conversation: MobileDMConversationListItem,
  currentUserId: string,
  presenceByUserId: ReadonlyMap<string, string>,
): string | null {
  const counterparts = conversation.participants.filter(
    (participant) => participant.id !== currentUserId,
  );
  if (counterparts.length === 0) {
    return null;
  }

  const statuses = counterparts.map(
    (participant) => presenceByUserId.get(participant.id) ?? participant.status ?? "OFFLINE",
  );
  return (
    statuses.find((status) => status.toUpperCase() === "ONLINE") ??
    statuses.find((status) => isMobilePresenceActive(status)) ??
    "OFFLINE"
  );
}

/**
 * §2 "1a".5 on a row: true when someone other than the viewer is sitting in a
 * voice room right now. The row then draws the wave tile instead of the presence
 * dot, exactly like the online strip above it.
 */
export function isMobileConversationCounterpartInVoice(
  conversation: MobileDMConversationListItem,
  currentUserId: string,
  voiceUserIds: ReadonlySet<string>,
): boolean {
  return conversation.participants.some(
    (participant) => participant.id !== currentUserId && voiceUserIds.has(participant.id),
  );
}

/** §2 "1a".6.6: "Sesli mesaj · 0:42" — the duration is M4A's `durationSec`. */
export function formatMobileVoicePreviewLabel(durationSec: number | null): string {
  if (durationSec === null || durationSec <= 0) {
    return copy.dmPreviewVoiceMessage;
  }

  const minutes = Math.floor(durationSec / 60);
  const seconds = durationSec % 60;
  return `${copy.dmPreviewVoiceMessage} · ${minutes}:${String(seconds).padStart(2, "0")}`;
}

export const DirectMessageConversationCard = memo(function DirectMessageConversationCard({
  conversation,
  currentUserId = "",
  onOpenConversation,
  presenceByUserId = EMPTY_PRESENCE_MAP,
  selected,
  typingNames = [],
  voiceUserIds = EMPTY_VOICE_SET,
}: {
  conversation: MobileDMConversationListItem;
  currentUserId?: string;
  onOpenConversation(conversationId: string): void;
  presenceByUserId?: ReadonlyMap<string, string>;
  selected: boolean;
  typingNames?: readonly string[];
  /** §2 "1a".5: friends the strip currently shows inside a voice room. */
  voiceUserIds?: ReadonlySet<string>;
}) {
  const theme = useTheme();
  const styles = useDmScreenStyles();
  const title = getMobileConversationTitle(conversation, copy.directMessageFallback, currentUserId);
  const presenceStatus = getMobileConversationPresenceStatus(
    conversation,
    currentUserId,
    presenceByUserId,
  );
  const lastActivity = formatMobileDisplayTime(conversation.lastMessageAt);
  const isGroupConversation = conversation.type === "GROUP_DM" && conversation.participantCount > 1;
  const isCounterpartInVoice = isMobileConversationCounterpartInVoice(
    conversation,
    currentUserId,
    voiceUserIds,
  );
  const isUnread = conversation.unreadCount > 0;
  const lastMessage = conversation.lastMessage;
  const isTyping = typingNames.length > 0;
  // M4A marks the bot participant; a 1:1 with a bot is what draws the badge.
  const isBotConversation =
    !isGroupConversation &&
    conversation.participants.some(
      (participant) => participant.id !== currentUserId && participant.isBot,
    );
  // §2 "1a".6.4: the viewer's own outgoing preview carries the tick state; an
  // incoming preview has `deliveryStatus === null` and draws nothing.
  const previewDelivery = lastMessage?.deliveryStatus ?? null;
  const isVoicePreview = lastMessage?.kind === "voice";
  const preview = lastMessage
    ? isVoicePreview
      ? formatMobileVoicePreviewLabel(lastMessage.durationSec)
      : `${
          lastMessage.authorIsCurrentUser
            ? `${copy.directMessagePreviewYouPrefix}: `
            : isGroupConversation
              ? `${lastMessage.author.displayName ?? lastMessage.author.username}: `
              : ""
        }${lastMessage.text}`
    : copy.homeContinueLatestDirectMessage;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${copy.openConversationAction}: ${title || copy.directMessageFallback}`}
      accessibilityState={{ selected }}
      testID="mobile-dm-conversation-row"
      onPress={() => onOpenConversation(conversation.id)}
      style={({ pressed }) => [
        styles.dmConversationCard,
        selected && styles.dmConversationCardSelected,
        pressed && styles.dmConversationCardPressed,
      ]}
    >
      <View style={styles.dmConversationAvatarWrap}>
        <AvatarMark
          avatarBorderRadius={msg.avatar.conversationListRadius}
          dimension={msg.avatar.conversationList}
          identityId={conversation.id}
          label={getMobileConversationInitialsLabel(
            conversation,
            copy.directMessageFallback,
            currentUserId,
          )}
          imageUrl={getMobileConversationAvatarUrl(conversation, currentUserId)}
          style={styles.dmConversationAvatar}
        />
        {isGroupConversation ? (
          <View style={styles.dmConversationGroupBadge} testID="mobile-dm-conversation-group-badge">
            <MobileLineIcon color={theme.messaging.accent} name="members" size={9} />
          </View>
        ) : isCounterpartInVoice ? (
          <View style={styles.dmConversationVoiceTile} testID="mobile-dm-conversation-voice-tile">
            <MobileLineIcon
              accessibilityLabel={copy.dmVoiceRoomPresenceLabel}
              color={theme.messaging.accent}
              name="audio-wave"
              size={9}
            />
          </View>
        ) : presenceStatus ? (
          <View
            style={[
              styles.dmActivePresenceDot,
              {
                backgroundColor: getMobilePresenceColor(
                  getMobilePresenceTone(presenceStatus),
                  theme,
                ),
              },
            ]}
            testID="mobile-dm-conversation-online-dot"
          />
        ) : null}
      </View>
      <View style={styles.dmConversationContent}>
        <View style={styles.dmConversationTitleRow}>
          <View style={styles.dmConversationNameRow}>
            <Text
              style={[styles.dmConversationName, isUnread && styles.dmConversationNameUnread]}
              numberOfLines={1}
            >
              {title || copy.directMessageFallback}
            </Text>
            {isBotConversation ? (
              <View style={styles.dmBotBadge} testID="mobile-dm-conversation-bot-badge">
                <Text style={styles.dmBotBadgeText}>{copy.dmBotBadge}</Text>
              </View>
            ) : null}
          </View>
        </View>
        {isTyping ? (
          <View style={styles.dmConversationPreviewRow} testID="mobile-dm-conversation-typing">
            <View style={styles.dmTypingDots}>
              <View style={styles.dmTypingDot} />
              <View style={[styles.dmTypingDot, styles.dmTypingDotSecond]} />
              <View style={[styles.dmTypingDot, styles.dmTypingDotThird]} />
            </View>
            <Text style={styles.dmTypingLabel} numberOfLines={1}>
              {copy.dmTypingShortLabel}
            </Text>
          </View>
        ) : (
          <View style={styles.dmConversationPreviewRow}>
            {previewDelivery ? (
              <MobileLineIcon
                accessibilityLabel={
                  previewDelivery === "read"
                    ? copy.dmReadReceiptLabel
                    : previewDelivery === "delivered"
                      ? copy.dmChatDeliveredLabel
                      : copy.dmChatSentLabel
                }
                color={
                  previewDelivery === "read" ? theme.messaging.tickRead : theme.messaging.tickSent
                }
                name={previewDelivery === "sent" ? "tick-single" : "tick-double"}
                size={msg.listTick.size}
                testID={`mobile-dm-conversation-tick-${previewDelivery}`}
              />
            ) : null}
            {isVoicePreview ? (
              <MobileLineIcon color={theme.messaging.groupLabel} name="mic" size={13} />
            ) : null}
            <Text
              style={[
                styles.dmConversationPreview,
                styles.dmConversationPreviewText,
                isUnread && styles.dmConversationPreviewUnread,
              ]}
              numberOfLines={1}
            >
              {preview}
            </Text>
          </View>
        )}
      </View>
      <View style={styles.dmConversationRightMeta}>
        {lastActivity ? (
          <Text style={[styles.dmConversationTime, isUnread && styles.dmConversationTimeUnread]}>
            {lastActivity}
          </Text>
        ) : null}
        {conversation.mentionCount > 0 ? (
          <View style={styles.dmMentionBadge} testID="mobile-dm-conversation-mention-badge">
            <MobileLineIcon
              accessibilityLabel={copy.dmMentionBadgeLabel}
              color={theme.text.onPrimary}
              name="mention"
              size={12}
            />
          </View>
        ) : isUnread ? (
          <Text style={styles.dmUnreadBadge}>
            {formatMobileUnreadCount(conversation.unreadCount)}
          </Text>
        ) : conversation.muted ? (
          <MobileLineIcon
            accessibilityLabel={copy.dmMutedLabel}
            color={theme.messaging.tickSent}
            name="bell-off"
            size={15}
          />
        ) : null}
      </View>
    </Pressable>
  );
});

export function DMInboxLoadingSkeleton() {
  const styles = useDmScreenStyles();

  return (
    <View style={styles.dmInboxListArea} testID="mobile-dm-inbox-loading-skeleton">
      {[0, 1, 2].map((index) => (
        <View key={index} style={styles.dmInboxSkeletonRow}>
          <View style={styles.dmInboxSkeletonAvatar} />
          <View style={styles.dmInboxSkeletonText}>
            <View style={[styles.dmInboxSkeletonLine, styles.dmInboxSkeletonTitle]} />
            <View style={styles.dmInboxSkeletonLine} />
          </View>
        </View>
      ))}
    </View>
  );
}

export function DMInboxEmptyState({ onCompose }: { onCompose(): void }) {
  const styles = useDmScreenStyles();

  return (
    <View style={styles.dmInboxEmptyState} testID="mobile-dm-inbox-empty-state">
      <Text style={styles.dmInboxEmptyTitle}>{copy.messagesEmpty}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={copy.dmEmptyWriteFriendsAction}
        onPress={onCompose}
        style={styles.dmInboxEmptyAction}
      >
        <Text style={styles.dmInboxEmptyActionText}>{copy.dmEmptyWriteFriendsAction}</Text>
      </Pressable>
    </View>
  );
}

export function DMInboxSegmentTabs({
  incomingRequestCount,
  onSelectSegment,
  segment,
}: {
  incomingRequestCount: number;
  onSelectSegment(segment: MobileDMInboxSegment): void;
  segment: MobileDMInboxSegment;
}) {
  const styles = useDmScreenStyles();

  return (
    <View testID="mobile-dm-filter-tabs">
      <View style={styles.dmSegmentTrack} testID="mobile-social-segment">
        {DM_INBOX_SEGMENTS.map((candidate) => {
          const selected = segment === candidate;
          const label =
            candidate === "conversations"
              ? copy.dmSegmentConversations
              : candidate === "friends"
                ? copy.socialSegmentFriends
                : copy.socialSegmentRequests;
          const showBadge = candidate === "requests" && incomingRequestCount > 0;
          return (
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              key={candidate}
              onPress={() => onSelectSegment(candidate)}
              style={[styles.dmSegmentItem, selected && styles.dmSegmentItemActive]}
              testID={`mobile-social-segment-${candidate}`}
            >
              <Text style={[styles.dmSegmentLabel, selected && styles.dmSegmentLabelActive]}>
                {label}
              </Text>
              {showBadge ? (
                <View
                  style={styles.dmSegmentRequestBadge}
                  testID="mobile-social-segment-request-badge"
                >
                  <Text style={styles.dmSegmentRequestBadgeText}>{incomingRequestCount}</Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
