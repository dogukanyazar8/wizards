import {
  Pressable,
  Text,
  View,
  copy,
  getMobileConversationActiveCount,
  getMobileConversationAvatarUrl,
  getMobileConversationTitle,
  INITIAL_DM_SEND_STATE,
  type MobileBootstrapFeature,
  type MobileBootstrapPayload,
  type MobileDMMessagesViewState,
  type MobileDMSendViewState,
  type MobileMediaRuntimeState,
  type MobileMessageSearchViewState,
  type MobileSyncHealthSummary,
  useCallback,
  useState,
} from "../mobile-root-screen-shared";
import { DMComposer, type MobileComposerIntent } from "../composer/mobile-composer";
import {
  MessageListSkeleton,
  MessageSearchPanel,
  MessageStream,
  type MobileMessageActionTarget,
} from "../components/message-primitives";
import { AvatarMark, EmptyState, MobileSyncHealthBanner, StatusChip } from "../components/ui-atoms";
import { useDmScreenStyles } from "./dm-screen.styles";

export function DMConversationScreen({
  attachmentsFeature,
  conversation,
  currentUserId,
  isReactionMutationPending,
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
  onDraftChange,
  onDeleteMessage,
  onEditMessage,
  onOpenThread,
  onToggleMessageReaction,
  sendState,
  state,
  syncHealth,
  typingLabel,
}: {
  attachmentsFeature: MobileBootstrapFeature | null;
  conversation: MobileBootstrapPayload["home"]["directMessages"]["recent"][number];
  currentUserId: string;
  isReactionMutationPending: boolean;
  mediaState: MobileMediaRuntimeState;
  messageSearchFeature: MobileBootstrapFeature | null;
  messageSearchState: MobileMessageSearchViewState;
  sendState: MobileDMSendViewState;
  state: MobileDMMessagesViewState;
  syncHealth: MobileSyncHealthSummary;
  typingLabel: string | null;
  onBack(): void;
  onClearMessageSearch(): void;
  onClearSelectedMediaAsset(): void;
  onRefreshConversation(): void;
  onRefreshVisibleData(): void;
  onRequestDocumentPicker(): Promise<void>;
  onRequestPhotoLibraryPicker(): Promise<void>;
  onSearchMessages(input: { conversationId: string; query: string; scope: "dm" }): Promise<void>;
  onSendMessage(
    content: string,
    intent?: { readonly replyToId?: string; readonly threadParentId?: string },
  ): Promise<boolean>;
  onDraftChange(content: string): void;
  onDeleteMessage(messageId: string): Promise<boolean>;
  onEditMessage(input: { content: string; messageId: string }): Promise<boolean>;
  onOpenThread?(messageId: string): void;
  onToggleMessageReaction(input: { emoji: string; messageId: string; shouldReact: boolean }): void;
}) {
  const styles = useDmScreenStyles();
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
        isReactionMutationPending={isReactionMutationPending}
        sendState={sendState}
        state={state}
        mediaState={mediaState}
        onClearSelectedMediaAsset={onClearSelectedMediaAsset}
        onRetry={onRefreshConversation}
        onRequestDocumentPicker={onRequestDocumentPicker}
        onRequestPhotoLibraryPicker={onRequestPhotoLibraryPicker}
        onSendMessage={onSendMessage}
        onDraftChange={onDraftChange}
        onDeleteMessage={onDeleteMessage}
        onEditMessage={onEditMessage}
        {...(onOpenThread ? { onOpenThread } : {})}
        onToggleMessageReaction={onToggleMessageReaction}
        typingLabel={typingLabel}
      />
    </View>
  );
}

export function DMConversationPreviewCard({
  attachmentsFeature,
  conversation,
  currentUserId,
  isReactionMutationPending,
  mediaState,
  onClearSelectedMediaAsset,
  onRetry,
  onRequestDocumentPicker,
  onRequestPhotoLibraryPicker,
  onSendMessage,
  onDraftChange,
  onDeleteMessage,
  onEditMessage,
  onOpenThread,
  onToggleMessageReaction,
  sendState,
  state,
  typingLabel,
}: {
  attachmentsFeature: MobileBootstrapFeature | null;
  conversation: MobileBootstrapPayload["home"]["directMessages"]["recent"][number] | null;
  currentUserId: string;
  isReactionMutationPending: boolean;
  mediaState: MobileMediaRuntimeState;
  onClearSelectedMediaAsset(): void;
  onRetry(): void;
  onRequestDocumentPicker(): Promise<void>;
  onRequestPhotoLibraryPicker(): Promise<void>;
  onSendMessage(
    content: string,
    intent?: { readonly replyToId?: string; readonly threadParentId?: string },
  ): Promise<boolean>;
  onDraftChange(content: string): void;
  onDeleteMessage(messageId: string): Promise<boolean>;
  onEditMessage(input: { content: string; messageId: string }): Promise<boolean>;
  onOpenThread?(messageId: string): void;
  onToggleMessageReaction(input: { emoji: string; messageId: string; shouldReact: boolean }): void;
  sendState: MobileDMSendViewState;
  state: MobileDMMessagesViewState;
  typingLabel: string | null;
}) {
  const styles = useDmScreenStyles();
  const [composerIntent, setComposerIntent] = useState<MobileComposerIntent | null>(null);
  const handleReplyMessage = useCallback((message: MobileMessageActionTarget) => {
    setComposerIntent({ content: message.content, messageId: message.id, mode: "reply" });
  }, []);
  const handleEditMessage = useCallback((message: MobileMessageActionTarget) => {
    setComposerIntent({ content: message.content, messageId: message.id, mode: "edit" });
  }, []);
  const handleComposerSend = useCallback(
    (content: string) =>
      composerIntent?.mode === "edit"
        ? onEditMessage({ content, messageId: composerIntent.messageId })
        : onSendMessage(
            content,
            composerIntent ? { replyToId: composerIntent.messageId } : undefined,
          ),
    [composerIntent, onEditMessage, onSendMessage],
  );
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
        <MessageStream
          currentUserId={currentUserId}
          isReactionMutationPending={isReactionMutationPending}
          messages={state.payload.messages}
          {...(onOpenThread ? { onOpenThread } : {})}
          onDeleteMessage={(messageId) => void onDeleteMessage(messageId)}
          onEditMessage={handleEditMessage}
          onReplyMessage={handleReplyMessage}
          onToggleReaction={onToggleMessageReaction}
        />
      ) : null}
      {state.status === "ready" && state.payload.messages.length === 0 ? (
        <Text style={styles.contractDescription}>{copy.dmNoMessages}</Text>
      ) : null}
      {state.status === "ready" ? (
        <>
          {typingLabel ? <Text testID="mobile-dm-typing-indicator">{typingLabel}</Text> : null}
          <DMComposer
            attachmentsFeature={attachmentsFeature}
            sendState={conversationSendState}
            mediaState={mediaState}
            onClearSelectedMediaAsset={onClearSelectedMediaAsset}
            onDraftChange={onDraftChange}
            onRequestDocumentPicker={onRequestDocumentPicker}
            onRequestPhotoLibraryPicker={onRequestPhotoLibraryPicker}
            intent={composerIntent}
            onCancelIntent={() => setComposerIntent(null)}
            onSend={handleComposerSend}
          />
        </>
      ) : null}
    </View>
  );
}
