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
  getBoundedMobileList,
  getMobileConversationActiveCount,
  getMobileConversationAvatarUrl,
  getMobileConversationInitialsLabel,
  getMobileConversationTitle,
  MOBILE_RENDER_LIMITS,
  useMemo,
  useState,
  type MobileBootstrapPayload,
  type MobileConversationFilter,
} from "../mobile-root-screen-shared";
import { AvatarMark, MetricMiniPill, StatusChip } from "../components/ui-atoms";
import { useTheme } from "../providers/mobile-theme-provider";
import { useDmScreenStyles } from "./dm-screen.styles";

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
        <Ionicons name="chatbubble-ellipses-outline" size={20} color={theme.accent.strong} />
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
  onOpenConversation,
  selectedConversationId,
}: {
  conversations: MobileBootstrapPayload["home"]["directMessages"]["recent"];
  onOpenConversation(conversationId: string): void;
  selectedConversationId: string | null;
}) {
  const theme = useTheme();
  const styles = useDmScreenStyles();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<MobileConversationFilter>("all");
  const filteredConversations = useMemo(
    () =>
      filterMobileConversations(conversations, {
        fallback: copy.directMessageFallback,
        filter,
        query,
      }),
    [conversations, filter, query],
  );
  const visibleConversations = useMemo(
    () => getBoundedMobileList(filteredConversations, MOBILE_RENDER_LIMITS.conversations),
    [filteredConversations],
  );
  const filters: Array<{
    disabled?: boolean;
    id: MobileConversationFilter | "favorites";
    label: string;
  }> = [
    { id: "all", label: copy.directMessageFilterAll },
    { id: "unread", label: copy.directMessageFilterUnread },
    {
      disabled: true,
      id: "favorites",
      label: copy.directMessageFilterFavorites,
    },
    { id: "groups", label: copy.directMessageFilterGroups },
  ];

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
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copy.directMessageFilterAction}
          accessibilityState={{ disabled: true }}
          disabled
          style={styles.dmSearchFilterButton}
        >
          <Ionicons name="options-outline" size={20} color={theme.accent.strong} />
        </Pressable>
      </View>
      <View style={styles.inboxFilterRow} testID="mobile-dm-filter-tabs">
        {filters.map((item) => {
          const isActive = !item.disabled && item.id === filter;

          return (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              accessibilityLabel={item.label}
              accessibilityState={{
                disabled: item.disabled,
                selected: isActive,
              }}
              disabled={item.disabled}
              onPress={() => {
                if (!item.disabled) {
                  setFilter(item.id as MobileConversationFilter);
                }
              }}
              style={({ pressed }) => [
                styles.inboxFilterButton,
                isActive && styles.inboxFilterButtonActive,
                item.disabled && styles.inboxFilterButtonDisabled,
                pressed && !item.disabled && styles.actionButtonPressed,
              ]}
            >
              <Text
                style={[
                  styles.inboxFilterButtonText,
                  isActive && styles.inboxFilterButtonTextActive,
                  item.disabled && styles.inboxFilterButtonTextDisabled,
                ]}
              >
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.dmSectionHeaderRow}>
        <Text style={styles.dmSectionTitle}>{copy.directMessageSectionAll}</Text>
        <Text style={styles.inboxResultText}>
          {filteredConversations.length} {copy.directMessageResultCount}
        </Text>
      </View>
      <FlashList
        contentContainerStyle={styles.dmConversationList}
        data={visibleConversations}
        keyExtractor={(conversation) => conversation.id}
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
  conversation: MobileBootstrapPayload["home"]["directMessages"]["recent"][number];
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
        selected && styles.dmConversationCardSelected,
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
          {copy.homeContinueLatestDirectMessage}
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
