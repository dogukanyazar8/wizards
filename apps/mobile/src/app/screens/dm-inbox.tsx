import { FlashList } from "@shopify/flash-list";
import { memo, useRef } from "react";
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
  getMobileConversationAvatarUrl,
  getMobileConversationInitialsLabel,
  getMobileConversationTitle,
  getMobilePresenceTone,
  isMobilePresenceActive,
  useMemo,
  type MobileDMConversationListItem,
} from "../mobile-root-screen-shared";
import { getMobilePresenceColor } from "../../design/mobile-presence-color";
import { AvatarMark, MetricMiniPill, StatusChip } from "../components/ui-atoms";
import { useTheme } from "../providers/mobile-theme-provider";
import { useDmScreenStyles } from "./dm-screen.styles";
import type { MobileDMInboxSegment, MobileDMOnlineFriend } from "./dm-screen.types";

const DM_INBOX_SEGMENTS: readonly MobileDMInboxSegment[] = ["conversations", "friends", "requests"];
const EMPTY_PRESENCE_MAP: ReadonlyMap<string, string> = new Map<string, string>();
import { mobileListLoadHandlers } from "../../performance/mobile-performance-metrics";

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

export function DMInboxHeader({ onCompose }: { onCompose(): void }) {
  const theme = useTheme();
  const styles = useDmScreenStyles();
  return (
    <View style={styles.dmInboxHeader}>
      <View style={styles.dmInboxHeaderText}>
        <Text style={styles.dmInboxTitle}>{copy.dmInboxTitle}</Text>
        <Text style={styles.dmInboxDescription}>{copy.dmInboxDescription}</Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={copy.dmAddFriendAction}
        onPress={onCompose}
        testID="mobile-dm-compose-button"
        style={styles.dmComposeButton}
      >
        <Ionicons name="person-add-outline" size={19} color={theme.text.onPrimary} />
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
      <Text style={styles.dmOnlineStripLabel}>
        {`${copy.dmSectionOnlineLabel} — ${friends.length}`}
      </Text>
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
                  avatarBorderColor={presenceColor}
                  avatarBorderRadius={20}
                  avatarBorderWidth={2}
                  dimension={56}
                  identityId={friend.id}
                  imageUrl={friend.avatarUrl}
                  label={title}
                />
                <View
                  style={[styles.dmOnlineStripDot, { backgroundColor: presenceColor }]}
                  testID={`mobile-dm-online-dot-${friend.id}`}
                />
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
            <Ionicons name="add" size={20} color={theme.text.visualFaint} />
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
        renderItem={({ item: conversation }) => (
          <DirectMessageConversationCard
            conversation={conversation}
            currentUserId={currentUserId}
            presenceByUserId={presenceByUserId}
            selected={conversation.id === selectedConversationId}
            onOpenConversation={onOpenConversation}
          />
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

export const DirectMessageConversationCard = memo(function DirectMessageConversationCard({
  conversation,
  currentUserId = "",
  onOpenConversation,
  presenceByUserId = EMPTY_PRESENCE_MAP,
  selected,
}: {
  conversation: MobileDMConversationListItem;
  currentUserId?: string;
  onOpenConversation(conversationId: string): void;
  presenceByUserId?: ReadonlyMap<string, string>;
  selected: boolean;
}) {
  const theme = useTheme();
  const styles = useDmScreenStyles();
  const title = getMobileConversationTitle(conversation, copy.directMessageFallback);
  const presenceStatus = getMobileConversationPresenceStatus(
    conversation,
    currentUserId,
    presenceByUserId,
  );
  const lastActivity = formatMobileDisplayTime(conversation.lastMessageAt);
  const isGroupConversation = conversation.type === "GROUP_DM" && conversation.participantCount > 1;
  const isUnread = conversation.unreadCount > 0;
  const preview = conversation.lastMessage
    ? `${
        conversation.lastMessage.authorIsCurrentUser
          ? `${copy.directMessagePreviewYouPrefix}: `
          : isGroupConversation
            ? `${conversation.lastMessage.author.displayName ?? conversation.lastMessage.author.username}: `
            : ""
      }${conversation.lastMessage.text}`
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
        isUnread && styles.dmConversationCardUnread,
        selected && styles.dmConversationCardSelected,
        pressed && styles.dmConversationCardPressed,
      ]}
    >
      <View style={styles.dmConversationAvatarWrap}>
        <AvatarMark
          avatarBorderRadius={18}
          dimension={50}
          identityId={conversation.id}
          label={getMobileConversationInitialsLabel(conversation, copy.directMessageFallback)}
          imageUrl={getMobileConversationAvatarUrl(conversation)}
          style={styles.dmConversationAvatar}
        />
        {isGroupConversation ? (
          <View style={styles.dmConversationGroupBadge} testID="mobile-dm-conversation-group-badge">
            <Ionicons name="people" size={9} color={theme.accent.default} />
          </View>
        ) : presenceStatus ? (
          <View
            style={[
              styles.dmActivePresenceDot,
              { backgroundColor: getMobilePresenceColor(getMobilePresenceTone(presenceStatus), theme) },
            ]}
            testID="mobile-dm-conversation-online-dot"
          />
        ) : null}
      </View>
      <View style={styles.dmConversationContent}>
        <View style={styles.dmConversationTitleRow}>
          <Text style={styles.dmConversationName} numberOfLines={1}>
            {title || copy.directMessageFallback}
          </Text>
          <View style={styles.dmConversationRightMeta}>
            {isUnread ? (
              <Text style={styles.dmUnreadBadge}>{conversation.unreadCount}</Text>
            ) : null}
            {lastActivity ? (
              <Text style={[styles.dmConversationTime, isUnread && styles.dmConversationTimeUnread]}>
                {lastActivity}
              </Text>
            ) : null}
          </View>
        </View>
        <Text style={styles.dmConversationPreview} numberOfLines={1}>
          {preview}
        </Text>
        {conversation.muted ? (
          <View style={styles.dmConversationFooterRow}>
            <StatusChip label={copy.mutedSuffix} tone="muted" />
          </View>
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
                <View style={styles.dmSegmentRequestBadge} testID="mobile-social-segment-request-badge">
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
