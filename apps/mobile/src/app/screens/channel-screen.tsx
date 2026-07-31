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
import type { ChatMessage, MessageAttachment, UploadedAttachmentInput } from "@wizards/types";
import { FlashList, type FlashListRef } from "@shopify/flash-list";
import { forwardRef, useImperativeHandle } from "react";
import { Alert, ScrollView } from "react-native";
import { DMComposer, type MobileComposerIntent } from "../composer/mobile-composer";
import {
  ChannelMessageOverlays,
  ChannelSystemEventRow,
  ChannelUnreadSeparator,
  MessageDateSeparator,
  MessageListSkeleton,
  MessageReactionOverlays,
  MessageSearchPanel,
  MessageStream,
  MessageTypingDots,
  MemoizedMessagePreviewRow,
  isMessageSearchStateForContext,
  isMobileChannelSystemEvent,
  useMobileMessageReactionOverlay,
  type MobileRenderableMessage,
  type MobileMessageActionTarget,
} from "../components/message-primitives";
import {
  getMobileMessageGroupModel,
  resolveMobileMessageUnreadAnchor,
} from "../components/message-grouping";
import {
  MobileMessageMenuBoundsProvider,
  measureMobileMessageAnchor,
  type MobileMessageAnchorRect,
} from "../components/message-menu-anchor";
import { MobileLineIcon } from "../../design/mobile-line-icons";
import { reportMobileListBlankArea } from "../components/message-list-blank-area";
import { StatusChip } from "../components/ui-atoms";
import { BottomSheet, EmptyState, SheetHeader, Skeleton } from "../components/kit";
import { MobileChatKeyboardRegion, useMobileScreenFocus } from "../mobile-chat-keyboard-region";
import type { MobileMentionCandidate } from "../mobile-mention";
import {
  MessageForwardSheet,
  type MobileForwardSendInput,
  type MobileForwardTarget,
} from "../components/message-forward-sheet";
import { useChannelScreenStyles } from "./channel-screen.styles";
import { useTheme } from "../providers/mobile-theme-provider";
import {
  mobileListLoadHandlers,
  notifyMobileFirstPaint,
} from "../../performance/mobile-performance-metrics";
import type { MobileChannelTypingUser } from "../../realtime/mobile-typing-state";
import {
  annotateMobileNavigationSpan,
  getMobileNavigationSampleId,
  markMobileNavigationPhase,
} from "../../performance/mobile-navigation-timing";

function toChannelCountClass(value: number): "0" | "1-5" | "6-20" | "21-50" | "51+" {
  if (value <= 0) return "0";
  if (value <= 5) return "1-5";
  if (value <= 20) return "6-20";
  if (value <= 50) return "21-50";
  return "51+";
}

export function MobileChannelChatScreen({
  attachmentsFeature,
  canModerate = false,
  channel,
  channelFirstUnreadMessageId = null,
  channelPinnedMessages = [],
  currentUserId,
  forwardTargets,
  isReactionMutationPending,
  mediaState,
  memberCount,
  mentionCandidates,
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
  /** MANAGE_MESSAGES holder: may pin and delete other members' messages. */
  canModerate?: boolean;
  channel: MobileWorkspaceChannelSummary;
  channelFirstUnreadMessageId?: string | null;
  channelPinnedMessages?: readonly ChatMessage[];
  forwardTargets?: readonly MobileForwardTarget[];
  getAccessToken(): Promise<string | null>;
  currentUserId: string;
  isReactionMutationPending: boolean;
  mediaState: MobileMediaRuntimeState;
  memberCount: number;
  /** 10a server members the composer may offer for `@` autocomplete. */
  mentionCandidates?: readonly MobileMentionCandidate[];
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
      readonly attachmentPreviews?: readonly MessageAttachment[];
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
  // §2 "1g".1: while the long-press menu is up the header dims to .5 — and the
  // composer, deliberately, does not.
  const [isActionMenuOpen, setActionMenuOpen] = useState(false);
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
    (
      content: string,
      attachments: readonly UploadedAttachmentInput[] = [],
      attachmentPreviews: readonly MessageAttachment[] = [],
    ) => {
      if (composerIntent?.mode === "edit") {
        return attachments.length === 0
          ? onEditMessage({ content, messageId: composerIntent.messageId })
          : Promise.resolve(false);
      }

      return onSendMessage(content, {
        ...(composerIntent ? { replyToId: composerIntent.messageId } : {}),
        ...(attachments.length > 0 ? { attachments } : {}),
        ...(attachmentPreviews.length > 0 ? { attachmentPreviews } : {}),
      });
    },
    [composerIntent, onEditMessage, onSendMessage],
  );

  return (
    // MobileAppShell only reserves the system inset here; the chat body below
    // the header rides the IME inside MobileChatKeyboardRegion (transform on
    // the UI thread), so the message tree never relayouts during the keyboard
    // animation.
    <View style={styles.mobileChannelChatKeyboard}>
      <View
        accessibilityLabel={headerModel.accessibilityLabel}
        style={styles.mobileChannelChatScreen}
        testID="mobile-channel-chat-screen"
      >
        <View
          style={[
            styles.mobileChannelChatHeader,
            isActionMenuOpen && styles.mobileChannelChatHeaderDimmed,
          ]}
          testID="mobile-channel-chat-header"
        >
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
            <MobileLineIcon
              color={theme.messaging.textPrimary}
              name="back-arrow"
              size={20}
              strokeWidth={2.3}
            />
          </Pressable>
          <View
            accessible
            accessibilityLabel={headerModel.channelName}
            style={styles.mobileChannelChatHash}
          >
            <MobileLineIcon color={theme.messaging.accent} name="hash" size={18} />
          </View>
          <View style={styles.mobileChannelChatHeaderText}>
            <Text style={styles.mobileChannelChatTitle} numberOfLines={1}>
              {headerModel.channelName}
            </Text>
            <Text style={styles.mobileChannelChatTopic} numberOfLines={1}>
              {memberPresenceLabel}
            </Text>
          </View>
          <View style={styles.mobileChannelChatHeaderActions}>
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
                <MobileLineIcon
                  color={theme.messaging.accent}
                  name={searchVisibility.shouldRenderSearchPanel ? "close" : "search"}
                  size={17}
                  strokeWidth={2.1}
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
              <MobileLineIcon color={theme.messaging.accent} name="members" size={18} />
            </Pressable>
          </View>
        </View>

        {latestPinnedMessage ? (
          // §2 "1e".3: pin glyph, count, one clipped summary line, chevron.
          <View style={styles.pinnedBanner} testID="mobile-channel-pinned-banner">
            <MobileLineIcon color={theme.messaging.accent} name="pin" size={14} />
            <Text style={styles.pinnedBannerCount}>
              {copy.messagePinnedCountTemplate.replace(
                "{count}",
                String(channelPinnedMessages.length),
              )}
            </Text>
            {/* §2 "1e".4: touching the strip opens the pinned-messages sheet;
                jumping to a message happens from a row inside it. */}
            <Pressable
              accessibilityLabel={copy.messagePinnedSheetTitle}
              accessibilityRole="button"
              onPress={() => setPinsSheetOpen(true)}
              style={styles.pinnedBannerBody}
              testID="mobile-channel-pinned-banner-open"
            >
              <Text numberOfLines={1} style={styles.pinnedBannerContent}>
                {copy.messagePinnedSummaryTemplate
                  .replace("{content}", latestPinnedMessage.content)
                  .replace(
                    "{name}",
                    latestPinnedMessage.author.displayName ?? latestPinnedMessage.author.username,
                  )}
              </Text>
            </Pressable>
            <Pressable
              accessibilityLabel={copy.messagePinnedSheetTitle}
              accessibilityRole="button"
              hitSlop={12}
              onPress={() => setPinsSheetOpen(true)}
              style={({ pressed }) => [
                styles.pinnedBannerCountButton,
                pressed && styles.actionButtonPressed,
              ]}
              testID="mobile-channel-pinned-banner-count"
            >
              <MobileLineIcon
                color={theme.messaging.bubbleMeta}
                name="chevron-right"
                size={15}
                strokeWidth={2.2}
              />
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

        <MobileChatKeyboardRegion testID="mobile-channel-chat-keyboard-region">
          <ChannelMessageList
            canModerate={canModerate}
            currentUserId={currentUserId}
            firstUnreadMessageId={channelFirstUnreadMessageId}
            isReactionMutationPending={isReactionMutationPending}
            {...(onLoadMore ? { onLoadMore } : {})}
            onRefresh={onRefresh}
            onDeleteMessage={onDeleteMessage}
            onDiscardMessage={onDiscardMessage}
            onEditMessage={handleEditMessage}
            onMenuOpenChange={setActionMenuOpen}
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
            <SheetHeader
              closeAccessibilityLabel={copy.sheetCloseAction}
              icon="pin-outline"
              onClose={() => setPinsSheetOpen(false)}
              testID="mobile-channel-pins-header"
              title={copy.messagePinnedSheetTitle}
            />
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
                // §2 "1e".14: the placeholder names the channel.
                placeholder={copy.channelComposerPlaceholderTemplate.replace(
                  "{channel}",
                  headerModel.channelName,
                )}
                sendActionLabel={copy.channelSendAction}
                mediaState={mediaState}
                intent={composerIntent}
                {...(mentionCandidates ? { mentionCandidates } : {})}
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
        </MobileChatKeyboardRegion>
      </View>
    </View>
  );
}

/**
 * What the pushed channel route shows while the server detail that names the
 * channel is still resolving (cold start, deep link, notification tap). The
 * header geometry matches the real one exactly, so the swap is a content
 * change rather than a layout jump — the alternative was falling back to the
 * server browser, which read as "the channel opened, then closed, then opened".
 */
export function ChannelChatBootSkeleton({
  onBack,
  title,
}: {
  onBack?(): void;
  title?: string | undefined;
}) {
  const theme = useTheme();
  const styles = useChannelScreenStyles();

  return (
    <View style={styles.mobileChannelChatKeyboard}>
      <View style={styles.mobileChannelChatScreen} testID="mobile-channel-chat-boot-skeleton">
        <View style={styles.mobileChannelChatHeader}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={copy.channelBackAction}
            disabled={!onBack}
            hitSlop={11}
            onPress={onBack}
            style={styles.mobileChannelChatBackButton}
          >
            <MobileLineIcon
              color={theme.messaging.textPrimary}
              name="back-arrow"
              size={20}
              strokeWidth={2.3}
            />
          </Pressable>
          <View style={styles.mobileChannelChatHash}>
            <MobileLineIcon color={theme.messaging.accent} name="hash" size={18} />
          </View>
          <View style={styles.mobileChannelChatHeaderText}>
            {title ? (
              <Text style={styles.mobileChannelChatTitle} numberOfLines={1}>
                {title}
              </Text>
            ) : (
              <Skeleton borderRadius={6} height={15} width={140} />
            )}
            <Skeleton borderRadius={6} height={11} width={92} />
          </View>
        </View>
        <View style={styles.mobileChannelChatBodyShell}>
          <MessageListSkeleton />
        </View>
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
    canModerate?: boolean;
    currentUserId: string;
    firstUnreadMessageId?: string | null;
    isReactionMutationPending?: boolean;
    onLoadMore?(): void;
    /** §2 "1g".1: lets the screen dim its header while the menu is up. */
    onMenuOpenChange?(open: boolean): void;
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
    canModerate = false,
    currentUserId,
    firstUnreadMessageId = null,
    isReactionMutationPending = false,
    onLoadMore,
    onMenuOpenChange,
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
  const navigationSampleIdRef = useRef(getMobileNavigationSampleId("ChannelChat"));
  // §1.2/§5: the channel groups through the one shared model — same author,
  // inside five minutes, nothing (system event, day change) in between. The
  // stream-item shape stays so FlashList's typing and keying are untouched.
  const streamItems = useMemo<MobileMessageStreamItem<MobileRenderableMessage>[]>(() => {
    const groups = getMobileMessageGroupModel(
      messages.map((message) => ({
        authorId: message.author.id,
        createdAt: message.createdAt,
        id: message.id,
        isSystemEvent: isMobileChannelSystemEvent(message),
      })),
    );

    return messages.map((message, index) => {
      const group = groups[index];
      const next = groups[index + 1];

      return {
        id: message.id,
        isGroupedWithNext: next !== undefined && !next.isGroupStart,
        isGroupedWithPrevious: group !== undefined && !group.isGroupStart,
        message,
        showDateSeparator: group?.showDateSeparator === true,
      };
    });
  }, [messages]);
  useEffect(() => {
    navigationSampleIdRef.current ??= getMobileNavigationSampleId("ChannelChat");
    markMobileNavigationPhase(
      "ChannelChat",
      "query-observer-bound",
      globalThis.performance.now(),
      navigationSampleIdRef.current,
    );
    markMobileNavigationPhase(
      "ChannelChat",
      "list-mounted",
      globalThis.performance.now(),
      navigationSampleIdRef.current,
    );
  }, []);
  useEffect(() => {
    if (!state.payload) {
      return;
    }
    navigationSampleIdRef.current ??= getMobileNavigationSampleId("ChannelChat");
    const attachmentCount = messages.reduce(
      (total, message) => total + message.attachments.length,
      0,
    );
    const reactionCount = messages.reduce((total, message) => total + message.reactions.length, 0);
    const richContentCount = messages.filter(
      (message) =>
        message.attachments.length > 0 ||
        message.reactions.length > 0 ||
        message.replyTo != null ||
        message.forwardedAt != null,
    ).length;
    annotateMobileNavigationSpan(
      "ChannelChat",
      {
        attachmentCountClass: toChannelCountClass(attachmentCount),
        messageCount: Math.min(messages.length, 200),
        reactionCountClass: toChannelCountClass(reactionCount),
        richContentCountClass: toChannelCountClass(richContentCount),
        visibleInitialRowCount: Math.min(messages.length, 12),
      },
      navigationSampleIdRef.current,
    );
    const now = globalThis.performance.now();
    markMobileNavigationPhase(
      "ChannelChat",
      "query-data-ready",
      now,
      navigationSampleIdRef.current,
    );
    markMobileNavigationPhase(
      "ChannelChat",
      "message-model-built",
      now,
      navigationSampleIdRef.current,
    );
  }, [messages, state.payload]);
  const handleListLoad = useCallback(
    (info: { elapsedTimeInMs: number }) =>
      mobileListLoadHandlers.channelMessages(info, navigationSampleIdRef.current),
    [],
  );
  const listRef = useRef<FlashListRef<MobileMessageStreamItem<MobileRenderableMessage>> | null>(
    null,
  );
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  // 10e: long press opens the full action menu for exactly one row. The id lives
  // here, not inside the recycled row, so realtime updates cannot drop it.
  // 10d keeps the closed entry around for one exit animation before it goes.
  const [menu, setMenu] = useState<{
    readonly anchor: MobileMessageAnchorRect | null;
    readonly id: string;
    readonly open: boolean;
  } | null>(null);
  const handleSetMenuMessage = useCallback(
    (messageId: string | null, anchor: MobileMessageAnchorRect | null = null) => {
      setMenu((current) =>
        messageId === null
          ? current
            ? { ...current, open: false }
            : null
          : { anchor, id: messageId, open: true },
      );
    },
    [],
  );
  // §2 "1g".1: the scrim darkens the flow, not the header or the composer, so
  // the shell publishes its own rectangle to any menu opened inside it.
  const bodyRef = useRef<View | null>(null);
  const [menuBounds, setMenuBounds] = useState<MobileMessageAnchorRect | null>(null);
  const handleBodyLayout = useCallback(() => {
    measureMobileMessageAnchor(bodyRef.current, setMenuBounds);
  }, []);
  const isScreenFocused = useMobileScreenFocus();
  // The reaction chips and the "+" chip live on a recycled row, so the sheet
  // and picker they open are owned here, next to the action menu.
  const {
    closeReactionOverlay,
    reactionOverlay,
    reactionOverlayMessage,
    requestEmojiPicker,
    requestReactionDetails,
  } = useMobileMessageReactionOverlay({ isScreenFocused, messages });
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
  const menuMessage = useMemo(
    () => (menu ? (messages.find((message) => message.id === menu.id) ?? null) : null),
    [menu, messages],
  );
  // A deleted message takes its menu with it; every other list update — a new
  // message, a reaction, a typing event, a refetch — leaves the open menu alone.
  useEffect(() => {
    if (menu !== null && menuMessage === null) {
      setMenu(null);
    }
  }, [menu, menuMessage]);
  // Leaving the screen (thread view, a call, settings) closes it too.
  useEffect(() => {
    if (!isScreenFocused) {
      setMenu(null);
    }
  }, [isScreenFocused]);
  // §2 "1g".1: the header fades to .5 behind the menu. The list knows when the
  // menu is up; the header belongs to the screen, so it is told.
  const isActionMenuOpen = menu?.open === true;
  useEffect(() => {
    onMenuOpenChange?.(isActionMenuOpen);
  }, [isActionMenuOpen, onMenuOpenChange]);
  const performanceConfig = useMemo(
    () => getMobileMessageListPerformanceConfig(messages.length),
    [messages.length],
  );
  // §2 "1e".11: the "YENİ" divider is placed once and then pinned — reading the
  // messages under it while the screen is open must not make it walk down.
  const [unreadAnchorId, setUnreadAnchorId] = useState<string | null>(firstUnreadMessageId);
  const pinnedUnreadMessageId = resolveMobileMessageUnreadAnchor({
    lastReadMessageId: null,
    messages: messages.map((message) => ({
      authorId: message.author.id,
      createdAt: message.createdAt,
      id: message.id,
    })),
    pinnedMessageId: unreadAnchorId,
  });
  useEffect(() => {
    // Re-arms only once the pinned anchor is gone (channel switch, message
    // deleted, everything read), never while it is still on screen.
    if (pinnedUnreadMessageId === null && firstUnreadMessageId !== null) {
      setUnreadAnchorId(firstUnreadMessageId);
    }
  }, [firstUnreadMessageId, pinnedUnreadMessageId]);
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
    // Same instrument as the DM transcript: the channel's `drawDistance` is
    // derived from the performance profile, and no profile may lower it before
    // this number says the renderer is keeping up.
    reportMobileListBlankArea("channel-messages", listRef.current, event.nativeEvent);
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

  // Primitive, so opening a menu does not mint a new renderItem — a new
  // renderItem identity re-renders every mounted cell in the list.
  const openMenuMessageId = menu?.open === true ? menu.id : null;
  const renderItem = useCallback(
    ({ item }: { item: MobileMessageStreamItem<MobileRenderableMessage> }) => (
      <View style={styles.mobileChannelStreamItem}>
        {item.showDateSeparator ? (
          <MessageDateSeparator createdAt={item.message.createdAt} variant="channel" />
        ) : null}
        {pinnedUnreadMessageId !== null && item.message.id === pinnedUnreadMessageId ? (
          <ChannelUnreadSeparator />
        ) : null}
        {isMobileChannelSystemEvent(item.message) ? (
          <ChannelSystemEventRow message={item.message} />
        ) : (
          <MemoizedMessagePreviewRow
            canModerate={canModerate}
            currentUserId={currentUserId}
            isHighlighted={item.message.id === highlightedMessageId}
            isReactionMutationPending={isReactionMutationPending}
            menuOpen={openMenuMessageId === item.message.id}
            message={item.message}
            mode="channel"
            channelGroupContinuation={item.isGroupedWithPrevious}
            isServerOwner={item.message.author.id === ownerUserId}
            own={item.message.author.id === currentUserId}
            {...(onOpenThread ? { onOpenThread } : {})}
            onOpenReply={handleOpenReply}
            onRequestEmojiPicker={requestEmojiPicker}
            onRequestReactionDetails={requestReactionDetails}
            onSetMenuMessage={handleSetMenuMessage}
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
        )}
      </View>
    ),
    [
      canModerate,
      currentUserId,
      pinnedUnreadMessageId,
      handleOpenReply,
      highlightedMessageId,
      isReactionMutationPending,
      handleSetMenuMessage,
      openMenuMessageId,
      requestEmojiPicker,
      requestReactionDetails,
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

  // `onLoad` below never fires for a list with no items, so an empty or failed
  // channel open would leave its span open until an unrelated load closed it.
  // The empty component rendering is that open's first paint.
  const isSettledWithoutMessages =
    state.status === "error" || (state.status === "ready" && messages.length === 0);
  useEffect(() => {
    if (isSettledWithoutMessages) {
      navigationSampleIdRef.current ??= getMobileNavigationSampleId("ChannelChat");
      notifyMobileFirstPaint("ChannelChat", navigationSampleIdRef.current);
    }
  }, [isSettledWithoutMessages]);

  return (
    <MobileMessageMenuBoundsProvider bounds={menuBounds}>
      <View onLayout={handleBodyLayout} ref={bodyRef} style={styles.mobileChannelChatBodyShell}>
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
          onLoad={handleListLoad}
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
        {menuMessage ? (
          <ChannelMessageOverlays
            anchor={menu?.anchor ?? null}
            canModerate={canModerate}
            currentUserId={currentUserId}
            key={menuMessage.id}
            message={menuMessage}
            onClose={() => handleSetMenuMessage(null)}
            open={menu?.open === true}
            own={menuMessage.author.id === currentUserId}
            {...(onDeleteMessage
              ? { onDeleteMessage: (messageId: string) => void onDeleteMessage(messageId) }
              : {})}
            {...(onDiscardMessage ? { onDiscardFailedMessage: onDiscardMessage } : {})}
            {...(onEditMessage ? { onEditMessage } : {})}
            {...(onForwardMessage ? { onForwardMessage } : {})}
            {...(onOpenThread ? { onOpenThread } : {})}
            {...(onPinMessage ? { onPinMessage } : {})}
            {...(onReplyMessage ? { onReplyMessage } : {})}
            {...(onRetryMessage ? { onRetryFailedMessage: onRetryMessage } : {})}
            {...(onToggleMessageReaction ? { onToggleReaction: onToggleMessageReaction } : {})}
          />
        ) : null}
        {reactionOverlay && reactionOverlayMessage ? (
          <MessageReactionOverlays
            currentUserId={currentUserId}
            key={reactionOverlay.id}
            message={reactionOverlayMessage}
            onClose={closeReactionOverlay}
            overlay={reactionOverlay}
            {...(onToggleMessageReaction ? { onToggleReaction: onToggleMessageReaction } : {})}
          />
        ) : null}
      </View>
    </MobileMessageMenuBoundsProvider>
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

/**
 * §2 "1e".13: three 5px accent dots and one 11.5/700 line, indented to 61px so
 * it reads as the next line of the flow rather than a separate strip. The dots
 * are the shared `MessageTypingDots` primitive in its compact form.
 */
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
      accessibilityLiveRegion="polite"
      style={styles.mobileChannelTypingIndicator}
      testID={users[0] ? `mobile-channel-typing-${users[0].userId}` : "mobile-channel-typing"}
    >
      <MessageTypingDots compact testID="mobile-channel-typing-dots" />
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
