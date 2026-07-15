import { FlashList } from "@shopify/flash-list";
import {
  Ionicons,
  Pressable,
  Text,
  TextInput,
  View,
  copy,
  filterMobileConversations,
  formatMobileDisplayTime,
  getMobileConversationActiveCount,
  getMobileConversationAvatarUrl,
  getMobileConversationInitialsLabel,
  getMobileConversationTitle,
  useMemo,
  useState,
  type MobileDMConversationListItem,
} from "../mobile-root-screen-shared";
import { AvatarMark, MetricMiniPill, StatusChip } from "../components/ui-atoms";
import { useTheme } from "../providers/mobile-theme-provider";
import { useDmScreenStyles } from "./dm-screen.styles";
import { mobileListLoadHandlers } from "../../performance/mobile-performance-metrics";

export function DMInboxHeader() {
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
        accessibilityLabel={copy.directMessageComposeUnavailable}
        accessibilityState={{ disabled: true }}
        disabled
        testID="mobile-dm-compose-button"
        style={styles.dmComposeButton}
      >
        <Ionicons name="add" size={22} color={theme.text.onPrimary} />
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

export function DirectMessageListCard({
  conversations,
  hasNextPage,
  onLoadMore,
  onOpenConversation,
  selectedConversationId,
}: {
  conversations: readonly MobileDMConversationListItem[];
  hasNextPage: boolean;
  onLoadMore(): void;
  onOpenConversation(conversationId: string): void;
  selectedConversationId: string | null;
}) {
  const theme = useTheme();
  const styles = useDmScreenStyles();
  const [query, setQuery] = useState("");
  const filteredConversations = useMemo(
    () =>
      filterMobileConversations(conversations, {
        fallback: copy.directMessageFallback,
        filter: "all",
        query,
      }),
    [conversations, query],
  );

  return (
    <View style={styles.dmListCard}>
      <View style={styles.dmSearchRow}>
        <View style={styles.dmSearchShell}>
          <Ionicons name="search" size={19} color={theme.text.soft} />
          <TextInput
            accessibilityLabel={copy.directMessageSearchPlaceholder}
            autoCapitalize="none"
            autoCorrect={false}
            clearButtonMode="while-editing"
            onChangeText={setQuery}
            placeholder={copy.directMessageSearchPlaceholder}
            placeholderTextColor={theme.text.soft}
            returnKeyType="search"
            style={styles.inboxSearchInput}
            testID="mobile-dm-search-input"
            value={query}
          />
        </View>
      </View>
      <FlashList
        contentContainerStyle={styles.dmConversationList}
        data={filteredConversations}
        keyExtractor={(conversation) => conversation.id}
        onLoad={mobileListLoadHandlers.dmInbox}
        onEndReached={hasNextPage ? onLoadMore : undefined}
        onEndReachedThreshold={0.6}
        renderItem={({ item: conversation }) => (
          <DirectMessageConversationCard
            conversation={conversation}
            selected={conversation.id === selectedConversationId}
            onOpenConversation={onOpenConversation}
          />
        )}
        showsVerticalScrollIndicator={false}
        style={styles.dmConversationListViewport}
        testID="mobile-dm-conversation-list"
      />
      {filteredConversations.length === 0 ? (
        <Text style={styles.contractDescription}>{copy.directMessageFilteredEmpty}</Text>
      ) : null}
    </View>
  );
}

export function DirectMessageConversationCard({
  conversation,
  onOpenConversation,
  selected,
}: {
  conversation: MobileDMConversationListItem;
  onOpenConversation(conversationId: string): void;
  selected: boolean;
}) {
  const theme = useTheme();
  const styles = useDmScreenStyles();
  const title = getMobileConversationTitle(conversation, copy.directMessageFallback);
  const activeCount = getMobileConversationActiveCount(conversation);
  const lastActivity = formatMobileDisplayTime(conversation.lastMessageAt);
  const shouldShowActivePill =
    conversation.type === "GROUP_DM" && conversation.participantCount > 1;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${copy.openConversationAction}: ${title || copy.directMessageFallback}`}
      accessibilityState={{ selected }}
      testID="mobile-dm-conversation-row"
      onPress={() => onOpenConversation(conversation.id)}
      style={({ pressed }) => [
        styles.dmConversationCard,
        (selected || conversation.unreadCount > 0) && styles.dmConversationCardSelected,
        pressed && styles.dmConversationCardPressed,
      ]}
    >
      <AvatarMark
        label={getMobileConversationInitialsLabel(conversation, copy.directMessageFallback)}
        imageUrl={getMobileConversationAvatarUrl(conversation)}
        status={activeCount > 0 ? "active" : "idle"}
        size="large"
      />
      <View style={styles.dmConversationContent}>
        <View style={styles.dmConversationTitleRow}>
          <Text style={styles.dmConversationName} numberOfLines={1}>
            {title || copy.directMessageFallback}
          </Text>
          <View style={styles.dmConversationRightMeta}>
            {conversation.unreadCount > 0 ? (
              <Text style={styles.dmUnreadBadge}>{conversation.unreadCount}</Text>
            ) : null}
            {lastActivity ? <Text style={styles.dmConversationTime}>{lastActivity}</Text> : null}
          </View>
        </View>
        <Text style={styles.dmConversationPreview} numberOfLines={1}>
          {conversation.lastMessage
            ? `${conversation.lastMessage.authorIsCurrentUser ? copy.directMessagePreviewYouPrefix : (conversation.lastMessage.author.displayName ?? conversation.lastMessage.author.username)}: ${conversation.lastMessage.text}`
            : copy.homeContinueLatestDirectMessage}
        </Text>
        <View style={styles.dmConversationFooterRow}>
          {shouldShowActivePill ? (
            <View style={styles.dmActivePresencePill}>
              <View style={styles.dmActivePresenceDot} />
              <Text style={styles.dmActivePresenceText}>
                {activeCount}/{conversation.participantCount} {copy.activePeopleSuffix}
              </Text>
            </View>
          ) : null}
          {conversation.muted ? <StatusChip label={copy.mutedSuffix} tone="muted" /> : null}
        </View>
      </View>
      <Ionicons name="chevron-forward" size={18} color={theme.text.soft} />
    </Pressable>
  );
}
