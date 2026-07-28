import type { MessageAttachment, UploadedAttachmentInput } from "@wizards/types";
import {
  Pressable,
  Text,
  View,
  copy,
  getMobileConversationAvatarUrl,
  getMobileConversationTitle,
  type MobileBootstrapFeature,
  type MobileBootstrapPayload,
  type MobileDMMessagesViewState,
  type MobileMediaRuntimeState,
  type MobileSyncHealthSummary,
  useCallback,
  useState,
} from "../mobile-root-screen-shared";
import { DMComposer, type MobileComposerIntent } from "../composer/mobile-composer";
import { MobileChatKeyboardRegion } from "../mobile-chat-keyboard-region";
import {
  DMChatEncryptionNotice,
  DMChatHeader,
  DMChatMessageList,
  DMChatTypingIndicator,
} from "../components/dm-chat-primitives";
import {
  MessageListSkeleton,
  type MobileMessageActionTarget,
} from "../components/message-primitives";
import {
  MessageForwardSheet,
  type MobileForwardSendInput,
  type MobileForwardTarget,
} from "../components/message-forward-sheet";
import { EmptyState, MobileSyncHealthBanner } from "../components/ui-atoms";
import {
  getMobileDMPartnerLastDeliveredAt,
  getMobileDMPartnerLastReadAt,
} from "../../dm/mobile-dm-client";
import { useDMChatStyles } from "../components/dm-chat-primitives.styles";

export { formatDMLastSeenRelativeTime } from "../components/dm-chat-primitives";

type DMSendIntent = {
  readonly attachments?: readonly UploadedAttachmentInput[];
  readonly attachmentPreviews?: readonly MessageAttachment[];
  readonly replyToId?: string;
  readonly threadParentId?: string;
};

export function DMConversationScreen({
  attachmentsFeature,
  conversation,
  currentUserId,
  forwardTargets,
  getAccessToken,
  isEndToEndEncrypted = false,
  isReactionMutationPending,
  lastSeenAt,
  mediaState,
  onBack,
  onClearSelectedMediaAsset,
  onDeleteMessage,
  onDiscardMessage,
  onDraftChange,
  onEditMessage,
  onForwardMessage,
  onLoadMoreMessages,
  onOpenThread,
  onRefreshConversation,
  onRefreshVisibleData,
  onRequestDocumentPicker,
  onRequestPhotoLibraryPicker,
  onRetryMessage,
  onSendGif,
  onSendMessage,
  onStartVideoCall,
  onStartVoiceCall,
  onToggleMessageReaction,
  state,
  syncHealth,
  typingLabel,
}: {
  attachmentsFeature: MobileBootstrapFeature | null;
  conversation: MobileBootstrapPayload["home"]["directMessages"]["recent"][number];
  currentUserId: string;
  forwardTargets?: readonly MobileForwardTarget[];
  getAccessToken?: () => Promise<string | null>;
  isEndToEndEncrypted?: boolean;
  isReactionMutationPending: boolean;
  lastSeenAt?: string | null;
  mediaState: MobileMediaRuntimeState;
  state: MobileDMMessagesViewState;
  syncHealth: MobileSyncHealthSummary;
  typingLabel: string | null;
  onBack(): void;
  onClearSelectedMediaAsset(): void;
  onDeleteMessage(messageId: string): Promise<boolean>;
  onDiscardMessage(messageId: string): void;
  onDraftChange(content: string): void;
  onEditMessage(input: { content: string; messageId: string }): Promise<boolean>;
  onForwardMessage?(input: MobileForwardSendInput): Promise<boolean>;
  onLoadMoreMessages?: () => void;
  onOpenThread?(messageId: string): void;
  onRefreshConversation(): void;
  onRefreshVisibleData(): void;
  onRequestDocumentPicker(): Promise<void>;
  onRequestPhotoLibraryPicker(): Promise<void>;
  onRetryMessage(messageId: string): void;
  onSendGif?(gifId: string): Promise<boolean>;
  onSendMessage(content: string, intent?: DMSendIntent): Promise<boolean>;
  onStartVideoCall?(): void;
  onStartVoiceCall?(): void;
  onToggleMessageReaction(input: { emoji: string; messageId: string; shouldReact: boolean }): void;
}) {
  const styles = useDMChatStyles();
  // §2 "1g".1: the header dims behind an open long-press menu, nothing else does.
  const [isActionMenuOpen, setActionMenuOpen] = useState(false);
  const title =
    state.payload?.conversation.name ??
    getMobileConversationTitle(conversation, copy.directMessageFallback, currentUserId);
  const responsePartner = state.payload?.conversation.participants.find(
    (participant) => participant.userId !== currentUserId,
  );
  const summaryPartner = conversation.participants.find(
    (participant) => participant.id !== currentUserId,
  );
  const avatarUrl =
    responsePartner?.avatarUrl ??
    summaryPartner?.avatarUrl ??
    getMobileConversationAvatarUrl(conversation, currentUserId);
  const isOnline = (responsePartner?.status ?? summaryPartner?.status) === "ONLINE";
  // Presence has no dedicated last-seen field; the conversation's real
  // last-activity timestamp is the closest honest signal for the 4a status line.
  const resolvedLastSeenAt = lastSeenAt ?? conversation.lastMessageAt ?? null;

  return (
    <View style={styles.root} testID="mobile-dm-conversation-screen">
      <View style={styles.root} testID="mobile-dm-chat-screen">
        <DMChatHeader
          avatarUrl={avatarUrl}
          // §2 "1g".1: the header dims to .5 behind the menu; the composer does not.
          dimmed={isActionMenuOpen}
          isOnline={isOnline}
          lastSeenAt={resolvedLastSeenAt}
          onBack={onBack}
          {...(onStartVideoCall ? { onStartVideoCall } : {})}
          {...(onStartVoiceCall ? { onStartVoiceCall } : {})}
          partnerUserId={responsePartner?.userId ?? summaryPartner?.id ?? null}
          title={title}
          typing={typingLabel !== null}
        />
        <MobileSyncHealthBanner health={syncHealth} onRetry={onRefreshVisibleData} />
        <DMConversationPreviewCard
          attachmentsFeature={attachmentsFeature}
          conversation={conversation}
          currentUserId={currentUserId}
          {...(forwardTargets ? { forwardTargets } : {})}
          {...(getAccessToken ? { getAccessToken } : {})}
          isEndToEndEncrypted={isEndToEndEncrypted}
          isReactionMutationPending={isReactionMutationPending}
          mediaState={mediaState}
          onClearSelectedMediaAsset={onClearSelectedMediaAsset}
          onDeleteMessage={onDeleteMessage}
          onDiscardMessage={onDiscardMessage}
          onMenuOpenChange={setActionMenuOpen}
          onDraftChange={onDraftChange}
          onEditMessage={onEditMessage}
          {...(onForwardMessage ? { onForwardMessage } : {})}
          {...(onLoadMoreMessages ? { onLoadMoreMessages } : {})}
          {...(onOpenThread ? { onOpenThread } : {})}
          onRequestDocumentPicker={onRequestDocumentPicker}
          onRequestPhotoLibraryPicker={onRequestPhotoLibraryPicker}
          onRetry={onRefreshConversation}
          onRetryMessage={onRetryMessage}
          {...(onSendGif ? { onSendGif } : {})}
          onSendMessage={onSendMessage}
          onToggleMessageReaction={onToggleMessageReaction}
          state={state}
          typingLabel={typingLabel}
        />
      </View>
    </View>
  );
}

/**
 * What the pushed DirectMessage route shows while the selected conversation is
 * still resolving (cold start, notification tap). Falling back to the inbox
 * here read as the conversation opening, closing, then opening again.
 */
export function DMConversationBootSkeleton() {
  const styles = useDMChatStyles();

  return (
    <View style={styles.root} testID="mobile-dm-boot-skeleton">
      <MessageListSkeleton />
    </View>
  );
}

export function DMConversationPreviewCard({
  attachmentsFeature,
  conversation,
  currentUserId,
  forwardTargets,
  getAccessToken,
  isEndToEndEncrypted = false,
  isReactionMutationPending,
  mediaState,
  onClearSelectedMediaAsset,
  onDeleteMessage,
  onDiscardMessage,
  onDraftChange,
  onEditMessage,
  onForwardMessage,
  onLoadMoreMessages,
  onMenuOpenChange,
  onOpenThread,
  onRequestDocumentPicker,
  onRequestPhotoLibraryPicker,
  onRetry,
  onRetryMessage,
  onSendGif,
  onSendMessage,
  onToggleMessageReaction,
  state,
  typingLabel,
}: {
  attachmentsFeature: MobileBootstrapFeature | null;
  conversation: MobileBootstrapPayload["home"]["directMessages"]["recent"][number] | null;
  currentUserId: string;
  forwardTargets?: readonly MobileForwardTarget[];
  getAccessToken?: () => Promise<string | null>;
  isEndToEndEncrypted?: boolean;
  isReactionMutationPending: boolean;
  mediaState: MobileMediaRuntimeState;
  onClearSelectedMediaAsset(): void;
  onDeleteMessage(messageId: string): Promise<boolean>;
  onDiscardMessage(messageId: string): void;
  onDraftChange(content: string): void;
  onEditMessage(input: { content: string; messageId: string }): Promise<boolean>;
  onForwardMessage?(input: MobileForwardSendInput): Promise<boolean>;
  onLoadMoreMessages?: () => void;
  /** §2 "1g".1: raised while a long-press menu is up, so the header can dim. */
  onMenuOpenChange?(open: boolean): void;
  onOpenThread?(messageId: string): void;
  onRequestDocumentPicker(): Promise<void>;
  onRequestPhotoLibraryPicker(): Promise<void>;
  onRetry(): void;
  onRetryMessage(messageId: string): void;
  onSendGif?(gifId: string): Promise<boolean>;
  onSendMessage(content: string, intent?: DMSendIntent): Promise<boolean>;
  onToggleMessageReaction(input: { emoji: string; messageId: string; shouldReact: boolean }): void;
  state: MobileDMMessagesViewState;
  typingLabel: string | null;
}) {
  const styles = useDMChatStyles();
  const [composerIntent, setComposerIntent] = useState<MobileComposerIntent | null>(null);
  const [forwardSource, setForwardSource] = useState<MobileMessageActionTarget | null>(null);
  const handleRequestForward = useCallback((message: MobileMessageActionTarget) => {
    setForwardSource(message);
  }, []);
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
      attachments?: readonly UploadedAttachmentInput[],
      attachmentPreviews?: readonly MessageAttachment[],
    ) =>
      composerIntent?.mode === "edit"
        ? onEditMessage({ content, messageId: composerIntent.messageId })
        : onSendMessage(content, {
            ...(attachments?.length ? { attachments } : {}),
            ...(attachmentPreviews?.length ? { attachmentPreviews } : {}),
            ...(composerIntent ? { replyToId: composerIntent.messageId } : {}),
          }),
    [composerIntent, onEditMessage, onSendMessage],
  );

  if (!conversation) return <EmptyState tone="accent" label={copy.dmSelectConversation} />;

  const responseConversation = state.payload?.conversation;
  const partner = responseConversation?.participants.find(
    (participant) => participant.userId !== currentUserId,
  );
  const title =
    responseConversation?.name ??
    getMobileConversationTitle(conversation, copy.directMessageFallback, currentUserId);
  const avatarUrl =
    partner?.avatarUrl ?? getMobileConversationAvatarUrl(conversation, currentUserId);
  const partnerId =
    partner?.userId ??
    conversation.participants.find((item) => item.id !== currentUserId)?.id ??
    conversation.id;
  const partnerLastReadAt = getMobileDMPartnerLastReadAt(
    state.payload?.participantReadStates,
    currentUserId,
  );
  const partnerLastDeliveredAt = getMobileDMPartnerLastDeliveredAt(
    state.payload?.participantReadStates,
    currentUserId,
  );

  return (
    // The chat body rides the IME with a transform (no per-frame relayout of
    // the message list); the shell keeps only the system inset underneath.
    <MobileChatKeyboardRegion style={styles.messageArea} testID="mobile-dm-chat-keyboard-region">
      {isEndToEndEncrypted ? <DMChatEncryptionNotice /> : null}
      {state.status === "loading" && !state.payload ? <MessageListSkeleton /> : null}
      {state.status === "error" ? (
        <View style={styles.errorRow}>
          <Text style={styles.errorText}>{state.error}</Text>
          <Pressable
            accessibilityLabel={copy.retryAction}
            accessibilityRole="button"
            onPress={onRetry}
            style={({ pressed }) => [styles.retryButton, pressed && styles.actionButtonPressed]}
          >
            <Text style={styles.retryButtonText}>{copy.retryAction}</Text>
          </Pressable>
        </View>
      ) : null}
      {state.payload && state.payload.messages.length > 0 ? (
        <DMChatMessageList
          currentUserId={currentUserId}
          isReactionMutationPending={isReactionMutationPending}
          messages={state.payload.messages}
          onDeleteMessage={(messageId) => void onDeleteMessage(messageId)}
          onDiscardFailedMessage={onDiscardMessage}
          onEditMessage={handleEditMessage}
          {...(onForwardMessage ? { onForwardMessage: handleRequestForward } : {})}
          {...(onLoadMoreMessages ? { onLoadMore: onLoadMoreMessages } : {})}
          {...(onMenuOpenChange ? { onMenuOpenChange } : {})}
          {...(onOpenThread ? { onOpenThread } : {})}
          onReplyMessage={handleReplyMessage}
          onRetryFailedMessage={onRetryMessage}
          onToggleReaction={onToggleMessageReaction}
          partnerLastDeliveredAt={partnerLastDeliveredAt}
          partnerLastReadAt={partnerLastReadAt}
        />
      ) : null}
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
      {state.status === "ready" && state.payload.messages.length === 0 ? (
        <Text style={styles.emptyText}>{copy.dmNoMessages}</Text>
      ) : null}
      {state.status === "ready" && typingLabel ? (
        <DMChatTypingIndicator avatarUrl={avatarUrl} participantId={partnerId} title={title} />
      ) : null}
      {state.status === "ready" ? (
        <DMComposer
          attachmentsFeature={attachmentsFeature}
          {...(getAccessToken ? { getAccessToken } : {})}
          intent={composerIntent}
          mediaState={mediaState}
          onCancelIntent={() => setComposerIntent(null)}
          onClearSelectedMediaAsset={onClearSelectedMediaAsset}
          onDraftChange={onDraftChange}
          onRequestDocumentPicker={onRequestDocumentPicker}
          onRequestPhotoLibraryPicker={onRequestPhotoLibraryPicker}
          onSend={handleComposerSend}
          {...(onSendGif ? { onSendGif } : {})}
          placeholder={copy.dmChatComposerPlaceholder}
          sendActionLabel={copy.dmChatSendAction}
          variant="dm"
        />
      ) : null}
    </MobileChatKeyboardRegion>
  );
}
