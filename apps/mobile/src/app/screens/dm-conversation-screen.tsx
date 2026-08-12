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
  useEffect,
  useMemo,
  useRef,
  useState,
} from "../mobile-root-screen-shared";
import { DMComposer, type MobileComposerIntent } from "../composer/mobile-composer";
import { MobileChatKeyboardRegion } from "../mobile-chat-keyboard-region";
import {
  DMChatEmptyState,
  DMChatEncryptionNotice,
  DMChatHeader,
  DMChatMessageList,
  DMChatTypingIndicator,
} from "../components/dm-chat-primitives";
import {
  GroupCallBanner,
  GroupChatHeader,
  GroupPinnedStrip,
  GroupSendBlockedNotice,
  GroupTypingIndicator,
} from "../components/group-chat-primitives";
import {
  GroupChatMenuSheet,
  GroupLeaveFlow,
  GroupReadersSheet,
} from "../components/group-management-sheets";
import type { MobileGroupChatState } from "../features/use-mobile-group-chat";
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
import { notifyMobileFirstPaint } from "../../performance/mobile-performance-metrics";
import {
  getMobileDMPartnerLastDeliveredAt,
  getMobileDMPartnerLastReadAt,
} from "../../dm/mobile-dm-client";
import { useDMChatStyles } from "../components/dm-chat-primitives.styles";
import { getMobileNavigationSampleId } from "../../performance/mobile-navigation-timing";

export { formatDMLastSeenRelativeTime } from "../components/dm-chat-primitives";

/**
 * Stable across renders on purpose: `?? []` would mint a new array every time,
 * and `participants` is a dependency of the message list's `renderItem` —
 * a fresh identity there re-renders every mounted row of the transcript.
 */
const EMPTY_PARTICIPANTS: readonly [] = [];

type DMSendIntent = {
  readonly attachments?: readonly UploadedAttachmentInput[];
  readonly attachmentPreviews?: readonly MessageAttachment[];
  readonly replyToId?: string;
  readonly threadParentId?: string;
};

/**
 * Grup sohbetleri 2a–2f, Faz 5 §B. The group half of this one chat surface.
 *
 * `state` is what the group *is* (read through `groupDetails`); the callbacks
 * are what the shell can do about it. Absent for a 1:1 — every branch below is
 * `group ? … : …`, so a direct message renders exactly the screen it did before.
 */
export interface MobileGroupChatBindings {
  readonly muted: boolean;
  readonly onJoinCall: () => void;
  readonly onLeave: (input: { transferOwnershipTo?: string }) => void;
  readonly onOpenSearch: () => void;
  readonly onToggleMuted: () => void;
  readonly state: MobileGroupChatState;
}

export function DMConversationScreen({
  attachmentsFeature,
  conversation,
  currentUserId,
  forwardTargets,
  getAccessToken,
  group = null,
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
  /** Faz 5 §B. Present only for a `GROUP_DM`; null keeps 1d exactly as it was. */
  group?: MobileGroupChatBindings | null;
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
  const [isGroupMenuOpen, setGroupMenuOpen] = useState(false);
  const [isLeaveOpen, setLeaveOpen] = useState(false);
  const title =
    group?.state.title ??
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
  // Conversation activity belongs to both participants; only the partner's
  // presence-derived value can describe when that person was last seen.
  const resolvedLastSeenAt = responsePartner?.lastSeenAt ?? lastSeenAt ?? null;

  return (
    <View style={styles.root} testID="mobile-dm-conversation-screen">
      <View style={styles.root} testID="mobile-dm-chat-screen">
        {group ? (
          // §B1 / §11.3/23-24: two icon buttons, the phone being the voice one;
          // the video entry point exists only on 2e.
          <GroupChatHeader
            avatarPair={group.state.details?.avatarPair ?? conversation.avatarPair ?? []}
            memberCount={
              group.state.details?.memberCount ??
              (group.state.members.length || conversation.participantCount)
            }
            onBack={onBack}
            onOpenInfo={group.state.onOpenInfo}
            onOpenMenu={() => setGroupMenuOpen(true)}
            onlineCount={group.state.details?.onlineCount ?? 0}
            overflowCount={group.state.details?.overflowCount ?? conversation.overflowCount ?? 0}
            {...(onStartVoiceCall ? { onStartVoiceCall } : {})}
            title={title}
          />
        ) : (
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
        )}
        {/* §B5: the banner rides above the pinned strip, in that order. */}
        {group && group.state.callBanner.status === "ongoing" ? (
          <GroupCallBanner
            onJoin={group.onJoinCall}
            participantCount={group.state.callBanner.count}
          />
        ) : null}
        {group && group.state.pinnedStrip.visible ? (
          <GroupPinnedStrip
            onDismiss={group.state.onDismissPin}
            onOpen={group.state.onOpenInfo}
            preview={group.state.pinnedStrip.preview}
          />
        ) : null}
        <MobileSyncHealthBanner health={syncHealth} onRetry={onRefreshVisibleData} />
        <DMConversationPreviewCard
          attachmentsFeature={attachmentsFeature}
          conversation={conversation}
          currentUserId={currentUserId}
          {...(forwardTargets ? { forwardTargets } : {})}
          {...(getAccessToken ? { getAccessToken } : {})}
          {...(group ? { group } : {})}
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
        {group ? (
          <>
            <GroupChatMenuSheet
              muted={group.muted}
              onClose={() => setGroupMenuOpen(false)}
              onLeave={() => setLeaveOpen(true)}
              onOpenInfo={group.state.onOpenInfo}
              onOpenSettings={group.state.onOpenSettings}
              onSearch={group.onOpenSearch}
              onToggleMuted={group.onToggleMuted}
              open={isGroupMenuOpen}
            />
            <GroupLeaveFlow
              members={group.state.members}
              onClose={() => setLeaveOpen(false)}
              onLeave={(input) => {
                setLeaveOpen(false);
                group.onLeave(input);
              }}
              open={isLeaveOpen}
              viewerId={currentUserId}
              viewerRole={group.state.details?.role}
            />
          </>
        ) : null}
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
  group = null,
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
  group?: MobileGroupChatBindings | null;
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
  const navigationSampleIdRef = useRef(getMobileNavigationSampleId("DirectMessage"));
  const [composerIntent, setComposerIntent] = useState<MobileComposerIntent | null>(null);
  const [forwardSource, setForwardSource] = useState<MobileMessageActionTarget | null>(null);
  // §B3: which message's readers are on screen. Held here rather than on the row
  // because FlashList recycles a row out from under an open sheet.
  const [readersMessageId, setReadersMessageId] = useState<string | null>(null);
  const groupMembers = group?.state.members;
  const handleOpenReaders = useCallback((messageId: string) => {
    setReadersMessageId(messageId);
  }, []);
  const groupTranscript = useMemo(
    () => (groupMembers ? { members: groupMembers, onOpenReaders: handleOpenReaders } : undefined),
    [groupMembers, handleOpenReaders],
  );
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

  // A conversation that opens empty — or fails — never renders a list, and the
  // list's `onLoad` is the only thing that closes the chat-open span. Ten DM
  // opens in a device run went to the abandoned counter for want of this.
  const isSettledWithoutList =
    state.status === "error" || (state.status === "ready" && state.payload.messages.length === 0);
  useEffect(() => {
    if (isSettledWithoutList) {
      navigationSampleIdRef.current ??= getMobileNavigationSampleId("DirectMessage");
      notifyMobileFirstPaint("DirectMessage", navigationSampleIdRef.current);
    }
  }, [isSettledWithoutList]);

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
          {...(groupTranscript ? { group: groupTranscript } : {})}
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
          // Faz 5 §16.3: the roster a system row resolves its ids against.
          participants={responseConversation?.participants ?? EMPTY_PARTICIPANTS}
          // 2d §8: the live source the group receipt is derived from.
          {...(state.payload?.participantReadStates
            ? { participantReadStates: state.payload.participantReadStates }
            : {})}
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
        <DMChatEmptyState />
      ) : null}
      {state.status === "ready" && typingLabel ? (
        group ? (
          // §B3: a group names who is typing and stacks their faces; a 1:1 has
          // exactly one candidate and shows the dots alone.
          <GroupTypingIndicator label={typingLabel} typists={group.state.members.slice(0, 2)} />
        ) : (
          <DMChatTypingIndicator avatarUrl={avatarUrl} participantId={partnerId} title={title} />
        )
      ) : null}
      {state.status === "ready" && group && !group.state.capabilities.canSend ? (
        // §B4: the server refuses the write anyway; this is what stops a member
        // typing a message that was never going to land.
        <GroupSendBlockedNotice />
      ) : state.status === "ready" ? (
        <DMComposer
          attachmentsFeature={attachmentsFeature}
          {...(getAccessToken ? { getAccessToken } : {})}
          intent={composerIntent}
          mediaState={mediaState}
          {...(group ? { mentionCandidates: group.state.mentionCandidates } : {})}
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
      {group ? (
        <GroupReadersSheet
          members={group.state.members}
          onClose={() => setReadersMessageId(null)}
          open={readersMessageId !== null}
          readerIds={
            state.payload?.messages.find((message) => message.id === readersMessageId)?.readReceipt
              ?.readerIds ?? []
          }
        />
      ) : null}
    </MobileChatKeyboardRegion>
  );
}
