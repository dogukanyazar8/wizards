import {
  FlatList,
  Ionicons,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  Text,
  View,
  copy,
  getMobileChannelChatHeaderModel,
  getMobileChannelChatSearchVisibility,
  getMobileMessageListPerformanceConfig,
  getMobileMessageStreamItems,
  INITIAL_CHANNEL_SEND_STATE,
  mobileColors,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MobileBootstrapFeature,
  type MobileChannelMessagesViewState,
  type MobileChannelSendViewState,
  type MobileMediaRuntimeState,
  type MobileMessageSearchViewState,
  type MobileMessageStreamItem,
  type MobileWorkspaceChannelSummary,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "../mobile-root-screen-shared";
import { DMComposer } from "../composer/mobile-composer";
import {
  MessageDateSeparator,
  MessageSearchPanel,
  MessageStream,
  MemoizedMessagePreviewRow,
  isMessageSearchStateForContext,
  type MobileRenderableMessage,
} from "../components/message-primitives";
import { StatusChip } from "../components/ui-atoms";
import { styles } from "./channel-screen.styles";

export function MobileChannelChatScreen({
  attachmentsFeature,
  channel,
  currentUserId,
  mediaState,
  memberCount,
  messageSearchFeature,
  messageSearchState,
  onBack,
  onClearMessageSearch,
  onClearSelectedMediaAsset,
  onDraftChange,
  onRefresh,
  onRequestDocumentPicker,
  onRequestPhotoLibraryPicker,
  onSearchMessages,
  onSendMessage,
  sendState,
  serverName,
  state,
  typingLabel,
}: {
  attachmentsFeature: MobileBootstrapFeature | null;
  channel: MobileWorkspaceChannelSummary;
  currentUserId: string;
  mediaState: MobileMediaRuntimeState;
  memberCount: number;
  messageSearchFeature: MobileBootstrapFeature | null;
  messageSearchState: MobileMessageSearchViewState;
  onBack(): void;
  onClearMessageSearch(): void;
  onClearSelectedMediaAsset(): void;
  onDraftChange(content: string): void;
  onRefresh(): void;
  onRequestDocumentPicker(): Promise<void>;
  onRequestPhotoLibraryPicker(): Promise<void>;
  onSearchMessages(input: {
    conversationId: string;
    query: string;
    scope: "channel";
  }): Promise<void>;
  onSendMessage(content: string): Promise<boolean>;
  sendState: MobileChannelSendViewState;
  serverName: string;
  state: MobileChannelMessagesViewState;
  typingLabel: string | null;
}) {
  const channelSendState =
    sendState.channelId === channel.id ? sendState : INITIAL_CHANNEL_SEND_STATE;
  const [isSearchPanelOpen, setSearchPanelOpen] = useState(false);
  const isChannelSearchContextActive = isMessageSearchStateForContext(
    messageSearchState,
    "channel",
    channel.id,
  );
  const headerModel = useMemo(
    () =>
      getMobileChannelChatHeaderModel(
        state.payload?.channel
          ? {
              ...channel,
              name: state.payload.channel.name,
            }
          : channel,
        {
          fallbackChannelName: copy.workspaceTextChannel,
          memberCount,
          membersSuffix: copy.membersSuffix,
          serverName,
        },
      ),
    [channel, memberCount, serverName, state.payload?.channel],
  );
  const searchVisibility = getMobileChannelChatSearchVisibility({
    closeLabel: copy.channelSearchCloseAction,
    featureStatus: messageSearchFeature?.status,
    hasActiveSearchContext: isChannelSearchContextActive,
    isSearchPanelOpen,
    openLabel: copy.channelSearchAction,
  });

  useEffect(() => {
    setSearchPanelOpen(false);
  }, [channel.id]);

  const handleToggleSearch = useCallback(() => {
    if (!searchVisibility.isSearchAvailable) {
      return;
    }

    if (searchVisibility.shouldRenderSearchPanel) {
      setSearchPanelOpen(false);
      if (isChannelSearchContextActive) {
        onClearMessageSearch();
      }
      return;
    }

    setSearchPanelOpen(true);
  }, [
    isChannelSearchContextActive,
    onClearMessageSearch,
    searchVisibility.isSearchAvailable,
    searchVisibility.shouldRenderSearchPanel,
  ]);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
      style={styles.mobileChannelChatKeyboard}
    >
      <View
        accessibilityLabel={headerModel.accessibilityLabel}
        style={styles.mobileChannelChatScreen}
        testID="mobile-channel-chat-screen"
      >
        <View style={styles.mobileChannelChatHeader} testID="mobile-channel-chat-header">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={copy.channelBackAction}
            onPress={onBack}
            style={({ pressed }) => [
              styles.mobileChannelChatBackButton,
              pressed && styles.actionButtonPressed,
            ]}
            testID="mobile-channel-back-button"
          >
            <Ionicons name="chevron-back" size={20} color={mobileColors.text} />
          </Pressable>
          <View
            accessible
            accessibilityLabel={headerModel.channelName}
            style={styles.mobileChannelChatHash}
          >
            <Text style={styles.mobileChannelChatHashText}>#</Text>
          </View>
          <View style={styles.mobileChannelChatHeaderText}>
            <Text style={styles.mobileChannelChatTitle} numberOfLines={1}>
              # {headerModel.channelName}
            </Text>
            <Text style={styles.mobileChannelChatTopic} numberOfLines={1}>
              {headerModel.topic ?? copy.channelStartDescription}
            </Text>
          </View>
          {searchVisibility.isSearchAvailable ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={searchVisibility.toggleAccessibilityLabel}
              accessibilityState={{ expanded: searchVisibility.shouldRenderSearchPanel }}
              onPress={handleToggleSearch}
              style={({ pressed }) => [
                styles.mobileChannelChatIconButton,
                searchVisibility.shouldRenderSearchPanel &&
                  styles.mobileChannelChatIconButtonActive,
                pressed && styles.actionButtonPressed,
              ]}
            >
              <Ionicons
                name={searchVisibility.shouldRenderSearchPanel ? "close" : "search"}
                size={18}
                color={
                  searchVisibility.shouldRenderSearchPanel
                    ? mobileColors.accentStrong
                    : mobileColors.muted
                }
              />
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={copy.membersSuffix}
            accessibilityState={{ disabled: true }}
            disabled
            style={({ pressed }) => [
              styles.mobileChannelChatIconButton,
              styles.mobileChannelChatIconButtonDisabled,
              pressed && styles.actionButtonPressed,
            ]}
            testID="mobile-channel-members-button"
          >
            <Ionicons name="people-outline" size={18} color={mobileColors.muted} />
          </Pressable>
        </View>

        {searchVisibility.shouldRenderSearchPanel ? (
          <MessageSearchPanel
            conversationId={channel.id}
            scope="channel"
            state={messageSearchState}
            onClear={onClearMessageSearch}
            onSearch={onSearchMessages}
          />
        ) : null}

        <ChannelMessageList currentUserId={currentUserId} onRefresh={onRefresh} state={state} />

        {state.status === "ready" ? (
          <>
            <ChannelTypingIndicator label={typingLabel} />
            <DMComposer
              attachmentsFeature={attachmentsFeature}
              placeholder={copy.channelComposerPlaceholder}
              sendActionLabel={copy.channelSendAction}
              sendState={channelSendState}
              sendingActionLabel={copy.channelSendingAction}
              mediaState={mediaState}
              onClearSelectedMediaAsset={onClearSelectedMediaAsset}
              onDraftChange={onDraftChange}
              onRequestDocumentPicker={onRequestDocumentPicker}
              onSend={onSendMessage}
              variant="channel"
            />
          </>
        ) : null}
      </View>
    </KeyboardAvoidingView>
  );
}

export function ChannelMessageList({
  currentUserId,
  onRefresh,
  state,
}: {
  currentUserId: string;
  onRefresh(): void;
  state: MobileChannelMessagesViewState;
}) {
  const messages = state.payload?.messages ?? [];
  const streamItems = useMemo(() => getMobileMessageStreamItems(messages), [messages]);
  const latestMessageId = messages[messages.length - 1]?.id ?? null;
  const listRef = useRef<FlatList<MobileMessageStreamItem<MobileRenderableMessage>> | null>(null);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const performanceConfig = useMemo(
    () => getMobileMessageListPerformanceConfig(messages.length),
    [messages.length],
  );
  const scrollToLatestMessage = useCallback(
    (animated = true) => {
      if (streamItems.length === 0) {
        return;
      }

      requestAnimationFrame(() => {
        listRef.current?.scrollToEnd({ animated });
      });
    },
    [streamItems.length],
  );
  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const distanceFromBottom = contentSize.height - (contentOffset.y + layoutMeasurement.height);
    setShowScrollToBottom(distanceFromBottom > 120);
  }, []);

  useEffect(() => {
    scrollToLatestMessage(true);
  }, [latestMessageId, scrollToLatestMessage]);

  const renderItem = useCallback(
    ({ item }: { item: MobileMessageStreamItem<MobileRenderableMessage> }) => (
      <View style={styles.messageStreamItem}>
        {item.showDateSeparator ? (
          <MessageDateSeparator createdAt={item.message.createdAt} />
        ) : null}
        <MemoizedMessagePreviewRow
          message={item.message}
          mode="channel"
          own={item.message.author.id === currentUserId}
        />
      </View>
    ),
    [currentUserId],
  );

  const emptyComponent = useMemo(() => {
    if (state.status === "loading" && !state.payload) {
      return <Text style={styles.contractDescription}>{copy.workspaceMessagesLoading}</Text>;
    }

    if (state.status === "error") {
      return (
        <View style={styles.dmErrorRow}>
          <Text style={styles.errorText}>{state.error}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={copy.retryAction}
            onPress={onRefresh}
            style={({ pressed }) => [styles.retryButton, pressed && styles.actionButtonPressed]}
          >
            <Text style={styles.retryButtonText}>{copy.retryAction}</Text>
          </Pressable>
        </View>
      );
    }

    if (state.status === "ready" && messages.length === 0) {
      return <Text style={styles.contractDescription}>{copy.workspaceNoMessages}</Text>;
    }

    return null;
  }, [messages.length, onRefresh, state.error, state.payload, state.status]);

  return (
    <View style={styles.mobileChannelChatBodyShell}>
      <FlatList
        contentContainerStyle={[
          styles.mobileChannelChatBodyContent,
          streamItems.length === 0 && styles.mobileChannelChatBodyEmptyContent,
        ]}
        data={streamItems}
        ref={listRef}
        initialNumToRender={performanceConfig.initialNumToRender}
        keyboardShouldPersistTaps="handled"
        keyExtractor={(item) => item.id}
        ListEmptyComponent={emptyComponent}
        maxToRenderPerBatch={performanceConfig.maxToRenderPerBatch}
        onContentSizeChange={() => scrollToLatestMessage(false)}
        onLayout={() => scrollToLatestMessage(false)}
        onScroll={handleScroll}
        removeClippedSubviews={Platform.OS === "android"}
        renderItem={renderItem}
        refreshControl={
          <RefreshControl
            colors={[mobileColors.accentStrong]}
            progressBackgroundColor={mobileColors.card}
            refreshing={state.status === "loading"}
            tintColor={mobileColors.accentStrong}
            onRefresh={onRefresh}
          />
        }
        scrollEventThrottle={80}
        showsVerticalScrollIndicator={false}
        style={styles.mobileChannelChatBody}
        testID="mobile-channel-message-list"
        windowSize={performanceConfig.windowSize}
      />
      <ChannelScrollToBottomButton
        onPress={() => scrollToLatestMessage(true)}
        visible={showScrollToBottom && streamItems.length > 0}
      />
    </View>
  );
}

export function ChannelScrollToBottomButton({
  onPress,
  visible,
}: {
  onPress(): void;
  visible: boolean;
}) {
  if (!visible) {
    return null;
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={copy.scrollToLatestMessageAction}
      onPress={onPress}
      style={({ pressed }) => [
        styles.channelScrollToBottomButton,
        pressed && styles.actionButtonPressed,
      ]}
    >
      <Ionicons name="arrow-down" size={18} color={mobileColors.text} />
    </Pressable>
  );
}

export function ChannelTypingIndicator({ label }: { label: string | null }) {
  if (!label) {
    return null;
  }

  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={label}
      style={styles.mobileChannelTypingIndicator}
    >
      <Text style={styles.mobileChannelTypingText} numberOfLines={1}>
        {label}
      </Text>
      <View style={styles.mobileChannelTypingDots} accessibilityElementsHidden>
        <View style={styles.mobileChannelTypingDot} />
        <View style={styles.mobileChannelTypingDot} />
        <View style={styles.mobileChannelTypingDot} />
      </View>
    </View>
  );
}

export function ChannelMessagesPreviewCard({
  attachmentsFeature,
  channel,
  currentUserId,
  mediaState,
  messageSearchFeature,
  messageSearchState,
  onClearMessageSearch,
  onClearSelectedMediaAsset,
  onRetry,
  onRequestDocumentPicker,
  onSearchMessages,
  onSendMessage,
  sendState,
  state,
}: {
  attachmentsFeature: MobileBootstrapFeature | null;
  channel: MobileWorkspaceChannelSummary;
  currentUserId: string;
  mediaState: MobileMediaRuntimeState;
  messageSearchFeature: MobileBootstrapFeature | null;
  messageSearchState: MobileMessageSearchViewState;
  onClearMessageSearch(): void;
  onClearSelectedMediaAsset(): void;
  onRetry(): void;
  onRequestDocumentPicker(): Promise<void>;
  onSearchMessages(input: {
    conversationId: string;
    query: string;
    scope: "channel";
  }): Promise<void>;
  onSendMessage(content: string): Promise<boolean>;
  sendState: MobileChannelSendViewState;
  state: MobileChannelMessagesViewState;
}) {
  const channelSendState =
    sendState.channelId === channel.id ? sendState : INITIAL_CHANNEL_SEND_STATE;

  return (
    <View style={styles.dmPreviewCard}>
      <View style={styles.dmPreviewHeader}>
        <Text style={styles.workspaceChannelIconLarge}>#</Text>
        <View style={styles.dmPreviewTitleBlock}>
          <Text style={styles.dmPreviewTitle} numberOfLines={1}>
            {state.payload?.channel.name ?? channel.name}
          </Text>
          <View style={styles.dmMetaRow}>
            <StatusChip label={copy.workspaceTextChannel} tone="muted" />
            {channel.unreadCount > 0 ? (
              <StatusChip label={`${channel.unreadCount} ${copy.unreadSuffix}`} tone="accent" />
            ) : null}
          </View>
          {channel.topic ? (
            <Text style={styles.dmPreviewMeta} numberOfLines={2}>
              {channel.topic}
            </Text>
          ) : null}
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

      {messageSearchFeature?.status === "available" ? (
        <MessageSearchPanel
          conversationId={channel.id}
          scope="channel"
          state={messageSearchState}
          onClear={onClearMessageSearch}
          onSearch={onSearchMessages}
        />
      ) : null}

      {state.status === "loading" && !state.payload ? (
        <Text style={styles.contractDescription}>{copy.workspaceMessagesLoading}</Text>
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
        <Text style={styles.contractDescription}>{copy.workspaceNoMessages}</Text>
      ) : null}
      {state.status === "ready" ? (
        <DMComposer
          attachmentsFeature={attachmentsFeature}
          placeholder={copy.channelComposerPlaceholder}
          sendActionLabel={copy.channelSendAction}
          sendState={channelSendState}
          sendingActionLabel={copy.channelSendingAction}
          mediaState={mediaState}
          onClearSelectedMediaAsset={onClearSelectedMediaAsset}
          onRequestDocumentPicker={onRequestDocumentPicker}
          onSend={onSendMessage}
        />
      ) : null}
    </View>
  );
}
