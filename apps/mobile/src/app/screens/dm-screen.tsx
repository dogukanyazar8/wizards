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
  INITIAL_DM_SEND_STATE,
  MOBILE_RENDER_LIMITS,
  mobileColors,
  useMemo,
  useState,
  type MobileBootstrapFeature,
  type MobileBootstrapPayload,
  type MobileBootstrapViewState,
  type MobileConversationFilter,
  type MobileDMMessagesViewState,
  type MobileDMSendViewState,
  type MobileMediaRuntimeState,
  type MobileMessageSearchViewState,
  type MobileSyncHealthSummary,
} from "../mobile-root-screen-shared";
import { FlashList } from "@shopify/flash-list";
import { DMComposer } from "../composer/mobile-composer";
import { MessageSearchPanel, MessageStream } from "../components/message-primitives";
import {
  AvatarMark,
  BootstrapStateNotice,
  EmptyState,
  MetricMiniPill,
  MobileSyncHealthBanner,
  StatusChip,
} from "../components/ui-atoms";
import { styles } from "./dm-screen.styles";

export function MessagesScreen({
  bootstrapState,
  dmMessagesState,
  dmSendState,
  mediaState,
  messageSearchState,
  selectedConversation,
  selectedConversationId,
  syncHealth,
  onClearMessageSearch,
  onClearSelectedMediaAsset,
  onOpenConversation,
  onCloseConversation,
  onRefreshBootstrap,
  onRefreshConversation,
  onRefreshVisibleData,
  onRequestDocumentPicker,
  onRequestPhotoLibraryPicker,
  onSearchMessages,
  onSendMessage,
}: {
  bootstrapState: MobileBootstrapViewState;
  dmMessagesState: MobileDMMessagesViewState;
  dmSendState: MobileDMSendViewState;
  mediaState: MobileMediaRuntimeState;
  messageSearchState: MobileMessageSearchViewState;
  selectedConversation: MobileBootstrapPayload["home"]["directMessages"]["recent"][number] | null;
  selectedConversationId: string | null;
  syncHealth: MobileSyncHealthSummary;
  onClearMessageSearch(): void;
  onClearSelectedMediaAsset(): void;
  onCloseConversation(): void;
  onOpenConversation(conversationId: string): void;
  onRefreshBootstrap(): void;
  onRefreshConversation(): void;
  onRefreshVisibleData(): void;
  onRequestDocumentPicker(): Promise<void>;
  onRequestPhotoLibraryPicker(): Promise<void>;
  onSearchMessages(input: { conversationId: string; query: string; scope: "dm" }): Promise<void>;
  onSendMessage(content: string): Promise<boolean>;
}) {
  const hasConversations =
    bootstrapState.status === "ready" &&
    bootstrapState.payload.home.directMessages.recent.length > 0;
  const shouldShowEmpty =
    bootstrapState.status === "idle" ||
    (bootstrapState.status === "ready" &&
      bootstrapState.payload.home.directMessages.recent.length === 0);
  const attachmentsFeature =
    bootstrapState.status === "ready" ? bootstrapState.payload.features.attachments : null;
  const messageSearchFeature =
    bootstrapState.status === "ready" ? bootstrapState.payload.features.messageSearch : null;

  if (selectedConversation) {
    return (
      <DMConversationScreen
        attachmentsFeature={attachmentsFeature}
        conversation={selectedConversation}
        currentUserId={bootstrapState.status === "ready" ? bootstrapState.payload.user.id : ""}
        sendState={dmSendState}
        state={dmMessagesState}
        syncHealth={syncHealth}
        mediaState={mediaState}
        messageSearchFeature={messageSearchFeature}
        onBack={onCloseConversation}
        messageSearchState={messageSearchState}
        onClearMessageSearch={onClearMessageSearch}
        onClearSelectedMediaAsset={onClearSelectedMediaAsset}
        onRefreshConversation={onRefreshConversation}
        onRefreshVisibleData={onRefreshVisibleData}
        onRequestDocumentPicker={onRequestDocumentPicker}
        onRequestPhotoLibraryPicker={onRequestPhotoLibraryPicker}
        onSearchMessages={onSearchMessages}
        onSendMessage={onSendMessage}
      />
    );
  }

  return (
    <View style={[styles.chatScreen, styles.dmInboxScreen]} testID="mobile-dm-inbox-screen">
      <DMInboxHeader />
      <MobileSyncHealthBanner health={syncHealth} onRetry={onRefreshVisibleData} />
      <BootstrapStateNotice state={bootstrapState} onRetry={onRefreshBootstrap} />
      {bootstrapState.status === "ready" ? (
        <DirectMessageSummaryCard
          totalCount={bootstrapState.payload.home.directMessages.totalCount}
          unreadCount={bootstrapState.payload.home.directMessages.unreadCount}
        />
      ) : null}
      {hasConversations ? (
        <DirectMessageListCard
          conversations={bootstrapState.payload.home.directMessages.recent}
          selectedConversationId={selectedConversationId}
          onOpenConversation={onOpenConversation}
        />
      ) : shouldShowEmpty ? (
        <EmptyState tone="accent" label={copy.messagesEmpty} />
      ) : null}
    </View>
  );
}

export function DMInboxHeader() {
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
        <Ionicons name="chatbubble-ellipses-outline" size={20} color={mobileColors.accentStrong} />
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
  return (
    <View style={styles.dmSummaryCard} testID="mobile-dm-summary-card">
      <View style={styles.dmSummaryIcon}>
        <Ionicons name="paper-plane" size={18} color={mobileColors.accentStrong} />
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

export function DMConversationScreen({
  attachmentsFeature,
  conversation,
  currentUserId,
  mediaState,
  messageSearchFeature,
  messageSearchState,
  onBack,
  onClearMessageSearch,
  onClearSelectedMediaAsset,
  onRefreshConversation,
  onRefreshVisibleData,
  onRequestDocumentPicker,
  onRequestPhotoLibraryPicker,
  onSearchMessages,
  onSendMessage,
  sendState,
  state,
  syncHealth,
}: {
  attachmentsFeature: MobileBootstrapFeature | null;
  conversation: MobileBootstrapPayload["home"]["directMessages"]["recent"][number];
  currentUserId: string;
  mediaState: MobileMediaRuntimeState;
  messageSearchFeature: MobileBootstrapFeature | null;
  messageSearchState: MobileMessageSearchViewState;
  sendState: MobileDMSendViewState;
  state: MobileDMMessagesViewState;
  syncHealth: MobileSyncHealthSummary;
  onBack(): void;
  onClearMessageSearch(): void;
  onClearSelectedMediaAsset(): void;
  onRefreshConversation(): void;
  onRefreshVisibleData(): void;
  onRequestDocumentPicker(): Promise<void>;
  onRequestPhotoLibraryPicker(): Promise<void>;
  onSearchMessages(input: { conversationId: string; query: string; scope: "dm" }): Promise<void>;
  onSendMessage(content: string): Promise<boolean>;
}) {
  const title = getMobileConversationTitle(conversation, copy.directMessageFallback);
  const activeCount = getMobileConversationActiveCount(conversation);
  const participantCount =
    state.payload?.conversation.participants.length ?? conversation.participantCount;

  return (
    <View style={styles.chatScreen} testID="mobile-dm-chat-screen">
      <View style={styles.dmConversationHeader}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copy.dmBackAction}
          testID="mobile-dm-back-button"
          onPress={onBack}
          style={({ pressed }) => [styles.dmBackButton, pressed && styles.actionButtonPressed]}
        >
          <Text style={styles.dmBackButtonText}>{"<"}</Text>
        </Pressable>
        <AvatarMark
          label={title}
          imageUrl={getMobileConversationAvatarUrl(conversation)}
          status={activeCount > 0 ? "active" : "idle"}
        />
        <View style={styles.dmConversationHeaderText}>
          <Text style={styles.dmPreviewTitle} numberOfLines={1}>
            {state.payload?.conversation.name ?? title}
          </Text>
          <View style={styles.dmMetaRow}>
            <StatusChip
              label={`${activeCount}/${participantCount} ${copy.activePeopleSuffix}`}
              tone={activeCount > 0 ? "success" : "muted"}
            />
            {conversation.unreadCount > 0 ? (
              <StatusChip
                label={`${conversation.unreadCount} ${copy.unreadSuffix}`}
                tone="accent"
              />
            ) : null}
          </View>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copy.retryAction}
          onPress={onRefreshConversation}
          style={({ pressed }) => [styles.dmRefreshButton, pressed && styles.actionButtonPressed]}
        >
          <Text style={styles.dmRefreshButtonText}>{copy.refreshShortAction}</Text>
        </Pressable>
      </View>
      <MobileSyncHealthBanner health={syncHealth} onRetry={onRefreshVisibleData} />
      {messageSearchFeature?.status === "available" ? (
        <MessageSearchPanel
          conversationId={conversation.id}
          scope="dm"
          state={messageSearchState}
          onClear={onClearMessageSearch}
          onSearch={onSearchMessages}
        />
      ) : null}
      <DMConversationPreviewCard
        attachmentsFeature={attachmentsFeature}
        conversation={conversation}
        currentUserId={currentUserId}
        sendState={sendState}
        state={state}
        mediaState={mediaState}
        onClearSelectedMediaAsset={onClearSelectedMediaAsset}
        onRetry={onRefreshConversation}
        onRequestDocumentPicker={onRequestDocumentPicker}
        onRequestPhotoLibraryPicker={onRequestPhotoLibraryPicker}
        onSendMessage={onSendMessage}
      />
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
          <Ionicons name="search" size={19} color={mobileColors.mutedSoft} />
          <TextInput
            accessibilityLabel={copy.directMessageSearchPlaceholder}
            autoCapitalize="none"
            autoCorrect={false}
            clearButtonMode="while-editing"
            onChangeText={setQuery}
            placeholder={copy.directMessageSearchPlaceholder}
            placeholderTextColor={mobileColors.mutedSoft}
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
          <Ionicons name="options-outline" size={20} color={mobileColors.accentStrong} />
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
      <Ionicons name="chevron-forward" size={18} color={mobileColors.mutedSoft} />
    </Pressable>
  );
}

export function DMConversationPreviewCard({
  attachmentsFeature,
  conversation,
  currentUserId,
  mediaState,
  onClearSelectedMediaAsset,
  onRetry,
  onRequestDocumentPicker,
  onRequestPhotoLibraryPicker,
  onSendMessage,
  sendState,
  state,
}: {
  attachmentsFeature: MobileBootstrapFeature | null;
  conversation: MobileBootstrapPayload["home"]["directMessages"]["recent"][number] | null;
  currentUserId: string;
  mediaState: MobileMediaRuntimeState;
  onClearSelectedMediaAsset(): void;
  onRetry(): void;
  onRequestDocumentPicker(): Promise<void>;
  onRequestPhotoLibraryPicker(): Promise<void>;
  onSendMessage(content: string): Promise<boolean>;
  sendState: MobileDMSendViewState;
  state: MobileDMMessagesViewState;
}) {
  if (!conversation) {
    return <EmptyState tone="accent" label={copy.dmSelectConversation} />;
  }

  const title = getMobileConversationTitle(conversation, copy.directMessageFallback);
  const responseConversation = state.payload?.conversation;
  const participantCount =
    responseConversation?.participants.length ?? conversation.participantCount;
  const activeCount = getMobileConversationActiveCount(conversation);
  const conversationSendState =
    sendState.conversationId === conversation.id ? sendState : INITIAL_DM_SEND_STATE;

  return (
    <View style={styles.dmPreviewCard}>
      <View style={styles.dmPreviewHeader}>
        <AvatarMark
          label={title}
          imageUrl={getMobileConversationAvatarUrl(conversation)}
          size="large"
          status={activeCount > 0 ? "active" : "idle"}
        />
        <View style={styles.dmPreviewTitleBlock}>
          <Text style={styles.dmPreviewTitle} numberOfLines={1}>
            {responseConversation?.name ?? title}
          </Text>
          <View style={styles.dmMetaRow}>
            <StatusChip
              label={`${activeCount}/${participantCount} ${copy.activePeopleSuffix}`}
              tone={activeCount > 0 ? "success" : "muted"}
            />
            {conversation.unreadCount > 0 ? (
              <StatusChip
                label={`${conversation.unreadCount} ${copy.unreadSuffix}`}
                tone="accent"
              />
            ) : null}
          </View>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copy.retryAction}
          onPress={onRetry}
          style={({ pressed }) => [styles.dmRefreshButton, pressed && styles.actionButtonPressed]}
        >
          <Text style={styles.dmRefreshButtonText}>{copy.refreshShortAction}</Text>
        </Pressable>
      </View>

      {state.status === "loading" && !state.payload ? (
        <Text style={styles.contractDescription}>{copy.dmMessagesLoading}</Text>
      ) : null}
      {state.status === "error" ? (
        <View style={styles.dmErrorRow}>
          <Text style={styles.errorText}>{state.error}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={copy.retryAction}
            onPress={onRetry}
            style={({ pressed }) => [styles.retryButton, pressed && styles.actionButtonPressed]}
          >
            <Text style={styles.retryButtonText}>{copy.retryAction}</Text>
          </Pressable>
        </View>
      ) : null}
      {state.payload && state.payload.messages.length > 0 ? (
        <MessageStream currentUserId={currentUserId} messages={state.payload.messages} />
      ) : null}
      {state.status === "ready" && state.payload.messages.length === 0 ? (
        <Text style={styles.contractDescription}>{copy.dmNoMessages}</Text>
      ) : null}
      {state.status === "ready" ? (
        <DMComposer
          attachmentsFeature={attachmentsFeature}
          sendState={conversationSendState}
          mediaState={mediaState}
          onClearSelectedMediaAsset={onClearSelectedMediaAsset}
          onRequestDocumentPicker={onRequestDocumentPicker}
          onRequestPhotoLibraryPicker={onRequestPhotoLibraryPicker}
          onSend={onSendMessage}
        />
      ) : null}
    </View>
  );
}
