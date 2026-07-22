import {
  Ionicons,
  Pressable,
  RefreshControl,
  Text,
  View,
  copy,
  formatMobileDisplayTime,
  getMobileChannelChatHeaderModel,
  getMobileChannelChatSearchVisibility,
  getMobileMessageListPerformanceConfig,
  getMobileMessageStreamItems,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MobileBootstrapFeature,
  type MobileChannelMessagesViewState,
  type MobileMediaRuntimeState,
  type MobileMessageSearchViewState,
  type MobileMessageStreamItem,
  type MobileWorkspaceChannelSummary,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "../mobile-root-screen-shared";
import type { ChatMessage, UploadedAttachmentInput } from "@wizards/types";
import { FlashList, type FlashListRef } from "@shopify/flash-list";
import { forwardRef, useImperativeHandle } from "react";
import { Alert, ScrollView } from "react-native";
import { DMComposer, type MobileComposerIntent } from "../composer/mobile-composer";
import {
  ChannelUnreadSeparator,
  MessageDateSeparator,
  MessageListSkeleton,
  MessageSearchPanel,
  MessageStream,
  MemoizedMessagePreviewRow,
  isMessageSearchStateForContext,
  type MobileRenderableMessage,
  type MobileMessageActionTarget,
} from "../components/message-primitives";
import { StatusChip } from "../components/ui-atoms";
import { Avatar, BottomSheet, EmptyState } from "../components/kit";
import {
  MessageForwardSheet,
  type MobileForwardSendInput,
  type MobileForwardTarget,
} from "../components/message-forward-sheet";
import { useChannelScreenStyles } from "./channel-screen.styles";
import { useTheme } from "../providers/mobile-theme-provider";
import { mobileListLoadHandlers } from "../../performance/mobile-performance-metrics";
import type { MobileChannelTypingUser } from "../../realtime/mobile-typing-state";

export function MobileChannelChatScreen({
  attachmentsFeature,
  channel,
  channelFirstUnreadMessageId = null,
  channelPinnedMessages = [],
  currentUserId,
  forwardTargets,
  isReactionMutationPending,
  mediaState,
  memberCount,
  onlineMemberCount,
  messageSearchFeature,
  messageSearchState,
  onBack,
  onClearMessageSearch,
  onClearSelectedMediaAsset,
  onDraftChange,
  onForwardMessage,
  onLoadMore,
  onPinMessage,
  onRefresh,
  onRequestDocumentPicker,
  onRequestPhotoLibraryPicker,
  onSearchMessages,
  onSendMessage,
  onSendGif,
  onDeleteMessage,
  onDiscardMessage,
  onEditMessage,
  onOpenThread,
  onOpenMembers,
  onRetryMessage,
  onToggleMessageReaction,
  ownerUserId,
  serverName,
  state,
  typingLabel,
  typingUsers,
  getAccessToken,
}: {
  attachmentsFeature: MobileBootstrapFeature | null;
  channel: MobileWorkspaceChannelSummary;
  channelFirstUnreadMessageId?: string | null;
  channelPinnedMessages?: readonly ChatMessage[];
  forwardTargets?: readonly MobileForwardTarget[];
  getAccessToken(): Promise<string | null>;
  currentUserId: string;
  isReactionMutationPending: boolean;
  mediaState: MobileMediaRuntimeState;
  memberCount: number;
  onlineMemberCount: number;
  messageSearchFeature: MobileBootstrapFeature | null;
  messageSearchState: MobileMessageSearchViewState;
  onBack(): void;
  onClearMessageSearch(): void;
  onClearSelectedMediaAsset(): void;
  onDraftChange(content: string): void;
  onForwardMessage?(input: MobileForwardSendInput): Promise<boolean>;
  onLoadMore?(): void;
  onPinMessage?(messageId: string, shouldPin: boolean): Promise<boolean>;
  onRefresh(): void;
  onRequestDocumentPicker(): Promise<void>;
  onRequestPhotoLibraryPicker(): Promise<void>;
  onSearchMessages(input: {
    conversationId: string;
    query: string;
    scope: "channel";
  }): Promise<void>;
  onSendMessage(
    content: string,
    intent?: {
      readonly attachments?: readonly UploadedAttachmentInput[];
      readonly replyToId?: string;
      readonly threadParentId?: string;
    },
  ): Promise<boolean>;
  onSendGif?(gifId: string): Promise<boolean>;
  onDeleteMessage(messageId: string): Promise<boolean>;
  onDiscardMessage(messageId: string): void;
  onEditMessage(input: { content: string; messageId: string }): Promise<boolean>;
  onOpenThread?(messageId: string): void;
  onOpenMembers?(): void;
  onRetryMessage(messageId: string): void;
  onToggleMessageReaction(input: { emoji: string; messageId: string; shouldReact: boolean }): void;
  ownerUserId: string | null;
  serverName: string;
  state: MobileChannelMessagesViewState;
  typingLabel: string | null;
  typingUsers: readonly MobileChannelTypingUser[];
}) {
  const theme = useTheme();
  const styles = useChannelScreenStyles();
  const [isSearchPanelOpen, setSearchPanelOpen] = useState(false);
  const [composerIntent, setComposerIntent] = useState<MobileComposerIntent | null>(null);
  const [forwardSource, setForwardSource] = useState<MobileMessageActionTarget | null>(null);
  const [isPinsSheetOpen, setPinsSheetOpen] = useState(false);
  const messageListRef = useRef<ChannelMessageListHandle | null>(null);
  const latestPinnedMessage = channelPinnedMessages[0] ?? null;
  const handleRequestForward = useCallback((message: MobileMessageActionTarget) => {
    setForwardSource(message);
  }, []);
  const handleJumpToMessage = useCallback((messageId: string) => {
    setPinsSheetOpen(false);
    messageListRef.current?.scrollToMessage(messageId);
  }, []);
  const handlePinMessage = useCallback(
    (messageId: string, shouldPin: boolean) => {
      if (!onPinMessage) return;
      void onPinMessage(messageId, shouldPin).then((didComplete) => {
        if (!didComplete) {
          Alert.alert(copy.messagePinFailedNotice);
        }
      });
    },
    [onPinMessage],
  );
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
  const memberPresenceLabel = useMemo(
    () =>
      `${headerModel.memberCountLabel} \u00B7 ${Math.max(0, onlineMemberCount)} ${copy.onlineMembersSuffix}`,
    [headerModel.memberCountLabel, onlineMemberCount],
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
  const handleReplyMessage = useCallback((message: MobileMessageActionTarget) => {
    setComposerIntent({
      ...(message.authorLabel ? { authorLabel: message.authorLabel } : {}),
      content: message.content,
      messageId: message.id,
      mode: "reply",
    });
  }, []);
  const handleEditMessage = useCallback((message: MobileMessageActionTarget) => {
    setComposerIntent({ content: message.content, messageId: message.id, mode: "edit" });
  }, []);
  const handleComposerSend = useCallback(
    (content: string, attachments: readonly UploadedAttachmentInput[] = []) => {
      if (composerIntent?.mode === "edit") {
        return attachments.length === 0
          ? onEditMessage({ content, messageId: composerIntent.messageId })
          : Promise.resolve(false);
      }

      return onSendMessage(content, {
        ...(composerIntent ? { replyToId: composerIntent.messageId } : {}),
        ...(attachments.length > 0 ? { attachments } : {}),
      });
    },
    [composerIntent, onEditMessage, onSendMessage],
  );

  return (
    // MobileAppShell shrinks by the tracked keyboard height for every screen, so
    // the chat tree only has to fill what is left of the shell.
    <View style={styles.mobileChannelChatKeyboard}>
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
            hitSlop={11}
            style={({ pressed }) => [
              styles.mobileChannelChatBackButton,
              pressed && styles.actionButtonPressed,
            ]}
            testID="mobile-channel-back-button"
          >
            <Ionicons name="chevron-back" size={20} color={theme.text.primary} />
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
              {headerModel.channelName}
            </Text>
            <Text style={styles.mobileChannelChatTopic} numberOfLines={1}>
              {memberPresenceLabel}
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
                  searchVisibility.shouldRenderSearchPanel ? theme.accent.strong : theme.text.muted
                }
              />
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={memberPresenceLabel}
            accessibilityState={{ disabled: !onOpenMembers }}
            disabled={!onOpenMembers}
            onPress={onOpenMembers}
            style={({ pressed }) => [
              styles.mobileChannelChatIconButton,
              !onOpenMembers && styles.mobileChannelChatIconButtonDisabled,
              pressed && styles.actionButtonPressed,
            ]}
            testID="mobile-channel-members-button"
          >
            <Ionicons name="person-outline" size={17} color={theme.text.muted} />
          </Pressable>
        </View>

        {latestPinnedMessage ? (
          <View style={styles.pinnedBanner} testID="mobile-channel-pinned-banner">
            <Ionicons name="pin-outline" size={15} color={theme.accent.strong} />
            <Pressable
              accessibilityLabel={copy.messagePinnedJumpAction}
              accessibilityRole="button"
              onPress={() => handleJumpToMessage(latestPinnedMessage.id)}
              style={styles.pinnedBannerBody}
              testID="mobile-channel-pinned-banner-jump"
            >
              <Text numberOfLines={1} style={styles.pinnedBannerTitle}>
                {copy.messagePinnedBannerTitleTemplate.replace(
                  "{name}",
                  latestPinnedMessage.author.displayName ?? latestPinnedMessage.author.username,
                )}
              </Text>
              <Text numberOfLines={1} style={styles.pinnedBannerContent}>
                {latestPinnedMessage.content}
              </Text>
            </Pressable>
            <Pressable
              accessibilityLabel={copy.messagePinnedSheetTitle}
              accessibilityRole="button"
              onPress={() => setPinsSheetOpen(true)}
              style={({ pressed }) => [
                styles.pinnedBannerCountButton,
                pressed && styles.actionButtonPressed,
              ]}
              testID="mobile-channel-pinned-banner-count"
            >
              <Text style={styles.pinnedBannerCount}>
                {copy.messagePinnedCountTemplate.replace(
                  "{count}",
                  String(channelPinnedMessages.length),
                )}
              </Text>
              <Ionicons name="chevron-forward" size={15} color={theme.accent.strong} />
            </Pressable>
          </View>
        ) : null}

        {searchVisibility.shouldRenderSearchPanel ? (
          <MessageSearchPanel
            conversationId={channel.id}
            scope="channel"
            state={messageSearchState}
            onClear={onClearMessageSearch}
            onSearch={onSearchMessages}
          />
        ) : null}

        <ChannelMessageList
          currentUserId={currentUserId}
          firstUnreadMessageId={channelFirstUnreadMessageId}
          isReactionMutationPending={isReactionMutationPending}
          {...(onLoadMore ? { onLoadMore } : {})}
          onRefresh={onRefresh}
          onDeleteMessage={onDeleteMessage}
          onDiscardMessage={onDiscardMessage}
          onEditMessage={handleEditMessage}
          {...(onForwardMessage ? { onForwardMessage: handleRequestForward } : {})}
          {...(onPinMessage ? { onPinMessage: handlePinMessage } : {})}
          onReplyMessage={handleReplyMessage}
          onRetryMessage={onRetryMessage}
          onToggleMessageReaction={onToggleMessageReaction}
          ownerUserId={ownerUserId}
          {...(onOpenThread ? { onOpenThread } : {})}
          ref={messageListRef}
          state={state}
        />
        <BottomSheet
          accessibilityLabel={copy.messagePinnedSheetTitle}
          onClose={() => setPinsSheetOpen(false)}
          open={isPinsSheetOpen}
          snapPoint={520}
          testID="mobile-channel-pins-sheet"
        >
          <Text style={styles.pinnedSheetTitle}>{copy.messagePinnedSheetTitle}</Text>
          {channelPinnedMessages.length === 0 ? (
            <Text style={styles.pinnedSheetEmptyText}>{copy.messagePinnedEmptyNotice}</Text>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false} style={styles.pinnedSheetList}>
              {channelPinnedMessages.map((pinnedMessage) => (
                <Pressable
                  accessibilityLabel={copy.messagePinnedJumpAction}
                  accessibilityRole="button"
                  key={pinnedMessage.id}
                  onPress={() => handleJumpToMessage(pinnedMessage.id)}
                  style={({ pressed }) => [
                    styles.pinnedSheetRow,
                    pressed && styles.pinnedSheetRowPressed,
                  ]}
                  testID={`mobile-channel-pinned-row-${pinnedMessage.id}`}
                >
                  <View style={styles.pinnedSheetRowBody}>
                    <Text numberOfLines={1} style={styles.pinnedSheetRowAuthor}>
                      {pinnedMessage.author.displayName ?? pinnedMessage.author.username}
                    </Text>
                    <Text numberOfLines={1} style={styles.pinnedSheetRowContent}>
                      {pinnedMessage.content}
                    </Text>
                  </View>
                  <Text style={styles.pinnedSheetRowTime}>
                    {formatMobileDisplayTime(pinnedMessage.createdAt)}
                  </Text>
                  {onPinMessage ? (
                    <Pressable
                      accessibilityLabel={copy.messageUnpinAction}
                      accessibilityRole="button"
                      hitSlop={6}
                      onPress={() => handlePinMessage(pinnedMessage.id, false)}
                      style={({ pressed }) => [
                        styles.pinnedSheetUnpinButton,
                        pressed && styles.pinnedSheetRowPressed,
                      ]}
                      testID={`mobile-channel-pinned-unpin-${pinnedMessage.id}`}
                    >
                      <Ionicons name="close" size={16} color={theme.text.visualSecondary} />
                    </Pressable>
                  ) : null}
                </Pressable>
              ))}
            </ScrollView>
          )}
        </BottomSheet>
        {onForwardMessage ? (
          <MessageForwardSheet
            onClose={() => setForwardSource(null)}
            onForward={async (target) =>
              forwardSource
                ? onForwardMessage({
                    content: forwardSource.content,
                    forwardOfMessageId: forwardSource.id,
                    target,
                  })
                : false
            }
            open={forwardSource !== null}
            targets={forwardTargets ?? []}
          />
        ) : null}

        {state.status === "ready" ? (
          <>
            <ChannelTypingIndicator label={typingLabel} users={typingUsers} />
            <DMComposer
              attachmentsFeature={attachmentsFeature}
              getAccessToken={getAccessToken}
              placeholder={copy.channelComposerPlaceholder}
              sendActionLabel={copy.channelSendAction}
              mediaState={mediaState}
              intent={composerIntent}
              onCancelIntent={() => setComposerIntent(null)}
              onClearSelectedMediaAsset={onClearSelectedMediaAsset}
              onDraftChange={onDraftChange}
              onRequestDocumentPicker={onRequestDocumentPicker}
              onSend={handleComposerSend}
              {...(onSendGif ? { onSendGif } : {})}
              variant="channel"
            />
          </>
        ) : null}
      </View>
    </View>
  );
}

export type ChannelMessageListHandle = {
  scrollToMessage(messageId: string): void;
};

export const ChannelMessageList = forwardRef<
  ChannelMessageListHandle,
  {
    currentUserId: string;
    firstUnreadMessageId?: string | null;
    isReactionMutationPending?: boolean;
    onLoadMore?(): void;
    onRefresh(): void;
    onDeleteMessage?(messageId: string): Promise<boolean>;
    onDiscardMessage?(messageId: string): void;
    onEditMessage?(message: MobileMessageActionTarget): void;
    onForwardMessage?(message: MobileMessageActionTarget): void;
    onPinMessage?(messageId: string, shouldPin: boolean): void;
    onReplyMessage?(message: MobileMessageActionTarget): void;
    onOpenThread?(messageId: string): void;
    onRetryMessage?(messageId: string): void;
    onToggleMessageReaction?(input: {
      emoji: string;
      messageId: string;
      shouldReact: boolean;
    }): void;
    ownerUserId: string | null;
    state: MobileChannelMessagesViewState;
  }
>(function ChannelMessageList(
  {
    currentUserId,
    firstUnreadMessageId = null,
    isReactionMutationPending = false,
    onLoadMore,
    onRefresh,
    onDeleteMessage,
    onDiscardMessage,
    onEditMessage,
    onForwardMessage,
    onPinMessage,
    onReplyMessage,
    onOpenThread,
    onRetryMessage,
    onToggleMessageReaction,
    ownerUserId,
    state,
  },
  ref,
) {
  const theme = useTheme();
  const styles = useChannelScreenStyles();
  const messages = useMemo(() => state.payload?.messages ?? [], [state.payload?.messages]);
  const streamItems = useMemo(() => getMobileMessageStreamItems(messages), [messages]);
  const listRef = useRef<FlashListRef<MobileMessageStreamItem<MobileRenderableMessage>> | null>(
    null,
  );
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  // 8c: only one row shows the floating action bar; scroll dismisses it.
  const [actionBarMessageId, setActionBarMessageId] = useState<string | null>(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const highlightMessage = useCallback((messageId: string) => {
    setHighlightedMessageId(messageId);
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    highlightTimerRef.current = setTimeout(() => setHighlightedMessageId(null), 1_600);
  }, []);
  useEffect(
    () => () => {
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    },
    [],
  );
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
    setActionBarMessageId(null);
  }, []);
  const handleOpenReply = useCallback(
    (messageId: string) => {
      const index = streamItems.findIndex((item) => item.message.id === messageId);
      if (index >= 0) {
        listRef.current?.scrollToIndex({ animated: true, index, viewPosition: 0.5 });
        highlightMessage(messageId);
        return;
      }
      onRefresh();
    },
    [highlightMessage, onRefresh, streamItems],
  );

  useImperativeHandle(
    ref,
    () => ({
      scrollToMessage: handleOpenReply,
    }),
    [handleOpenReply],
  );

  const renderItem = useCallback(
    ({ item }: { item: MobileMessageStreamItem<MobileRenderableMessage> }) => (
      <View
        style={[
          styles.messageStreamItem,
          styles.mobileChannelMessageItem,
          item.isGroupedWithNext
            ? styles.mobileChannelMessageGroupedSpacing
            : styles.mobileChannelMessageGroupSpacing,
        ]}
      >
        {item.showDateSeparator ? (
          <MessageDateSeparator createdAt={item.message.createdAt} variant="channel" />
        ) : null}
        {firstUnreadMessageId !== null && item.message.id === firstUnreadMessageId ? (
          <ChannelUnreadSeparator />
        ) : null}
        <MemoizedMessagePreviewRow
          actionBarOpen={item.message.id === actionBarMessageId}
          currentUserId={currentUserId}
          isHighlighted={item.message.id === highlightedMessageId}
          isReactionMutationPending={isReactionMutationPending}
          message={item.message}
          mode="channel"
          channelGroupContinuation={item.isGroupedWithPrevious}
          isServerOwner={item.message.author.id === ownerUserId}
          own={item.message.author.id === currentUserId}
          {...(onOpenThread ? { onOpenThread } : {})}
          onOpenReply={handleOpenReply}
          onSetActionBar={setActionBarMessageId}
          {...(onDeleteMessage
            ? { onDeleteMessage: (messageId: string) => void onDeleteMessage(messageId) }
            : {})}
          {...(onDiscardMessage ? { onDiscardFailedMessage: onDiscardMessage } : {})}
          {...(onEditMessage ? { onEditMessage } : {})}
          {...(onForwardMessage ? { onForwardMessage } : {})}
          {...(onPinMessage ? { onPinMessage } : {})}
          {...(onReplyMessage ? { onReplyMessage } : {})}
          {...(onRetryMessage ? { onRetryFailedMessage: onRetryMessage } : {})}
          {...(onToggleMessageReaction ? { onToggleReaction: onToggleMessageReaction } : {})}
        />
      </View>
    ),
    [
      actionBarMessageId,
      currentUserId,
      firstUnreadMessageId,
      handleOpenReply,
      highlightedMessageId,
      isReactionMutationPending,
      onDeleteMessage,
      onDiscardMessage,
      onEditMessage,
      onForwardMessage,
      onOpenThread,
      onPinMessage,
      onReplyMessage,
      onRetryMessage,
      onToggleMessageReaction,
      ownerUserId,
      styles,
    ],
  );

  const emptyComponent = useMemo(() => {
    if (state.status === "loading" && !state.payload) {
      return <MessageListSkeleton />;
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
      return (
        <EmptyState
          description={copy.channelEmptyDescription}
          icon="chatbubble-ellipses-outline"
          title={copy.channelEmptyTitle}
        />
      );
    }

    return null;
  }, [messages.length, onRefresh, state.error, state.payload, state.status, styles]);

  return (
    <View style={styles.mobileChannelChatBodyShell}>
      <FlashList
        contentContainerStyle={[
          styles.mobileChannelChatBodyContent,
          streamItems.length === 0 && styles.mobileChannelChatBodyEmptyContent,
        ]}
        data={streamItems}
        ref={listRef}
        drawDistance={performanceConfig.windowSize * 100}
        keyboardShouldPersistTaps="handled"
        keyExtractor={(item) => item.id}
        ListEmptyComponent={emptyComponent}
        // FlashList anchors the viewport itself: it renders from the bottom,
        // keeps the visible message pinned when an older page prepends, and
        // only follows a new message when the reader is already near the end.
        // The manual scrollToEnd this replaced fought pagination — every
        // prepended page changed the content size and yanked the view back down.
        maintainVisibleContentPosition={{
          animateAutoScrollToBottom: true,
          autoscrollToBottomThreshold: 0.2,
          startRenderingFromBottom: true,
        }}
        onLoad={mobileListLoadHandlers.channelMessages}
        onScroll={handleScroll}
        {...(onLoadMore ? { onStartReached: onLoadMore, onStartReachedThreshold: 0.35 } : {})}
        renderItem={renderItem}
        refreshControl={
          <RefreshControl
            colors={[theme.accent.strong]}
            progressBackgroundColor={theme.surface.card}
            refreshing={state.status === "loading"}
            tintColor={theme.accent.strong}
            onRefresh={onRefresh}
          />
        }
        scrollEventThrottle={80}
        showsVerticalScrollIndicator={false}
        style={styles.mobileChannelChatBody}
        testID="mobile-channel-message-list"
      />
      <ChannelScrollToBottomButton
        onPress={() => scrollToLatestMessage(true)}
        visible={showScrollToBottom && streamItems.length > 0}
      />
    </View>
  );
});

export function ChannelScrollToBottomButton({
  onPress,
  visible,
}: {
  onPress(): void;
  visible: boolean;
}) {
  const theme = useTheme();
  const styles = useChannelScreenStyles();
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
      <Ionicons name="arrow-down" size={18} color={theme.text.primary} />
    </Pressable>
  );
}

export function ChannelTypingIndicator({
  label,
  users,
}: {
  label: string | null;
  users: readonly MobileChannelTypingUser[];
}) {
  const styles = useChannelScreenStyles();
  if (!label) {
    return null;
  }

  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={label}
      style={styles.mobileChannelTypingIndicator}
    >
      {users[0] ? (
        <Avatar
          avatarBorderRadius={6}
          avatarBorderWidth={0}
          dimension={18}
          identityId={users[0].userId}
          imageUrl={null}
          label={users[0].name}
          testID={`mobile-channel-typing-avatar-${users[0].userId}`}
        />
      ) : null}
      <Text style={styles.mobileChannelTypingText} numberOfLines={1}>
        {label}
      </Text>
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
  state: MobileChannelMessagesViewState;
}) {
  const styles = useChannelScreenStyles();

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

      {state.status === "loading" && !state.payload ? <MessageListSkeleton /> : null}
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
          mediaState={mediaState}
          onClearSelectedMediaAsset={onClearSelectedMediaAsset}
          onRequestDocumentPicker={onRequestDocumentPicker}
          onSend={onSendMessage}
        />
      ) : null}
    </View>
  );
}
