import {
  View,
  Pressable,
  Text,
  copy,
  type MobileBootstrapPayload,
  type MobileBootstrapViewState,
  type MobileDMMessagesViewState,
  type MobileDMSendViewState,
  type MobileMediaRuntimeState,
  type MobileMessageSearchViewState,
  type MobileSyncHealthSummary,
  useState,
} from "../mobile-root-screen-shared";
import { BootstrapStateNotice, EmptyState, MobileSyncHealthBanner } from "../components/ui-atoms";
import { useDmScreenStyles } from "./dm-screen.styles";
import { DMConversationScreen } from "./dm-conversation-screen";
import { DMInboxHeader, DirectMessageListCard, DirectMessageSummaryCard } from "./dm-inbox";
import { FriendsHub } from "../../social/friends-hub";

export { DMConversationScreen, DMConversationPreviewCard } from "./dm-conversation-screen";
export {
  DMInboxHeader,
  DirectMessageConversationCard,
  DirectMessageListCard,
  DirectMessageSummaryCard,
} from "./dm-inbox";

export function MessagesScreen({
  bootstrapState,
  dmMessagesState,
  dmSendState,
  dmTypingLabel,
  isReactionMutationPending,
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
  onSendGif,
  onDraftChange,
  onDeleteMessage,
  onEditMessage,
  onOpenThread,
  onToggleMessageReaction,
  onOpenDetails,
}: {
  bootstrapState: MobileBootstrapViewState;
  dmMessagesState: MobileDMMessagesViewState;
  dmSendState: MobileDMSendViewState;
  dmTypingLabel: string | null;
  isReactionMutationPending: boolean;
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
  onSendMessage(
    content: string,
    intent?: { readonly replyToId?: string; readonly threadParentId?: string },
  ): Promise<boolean>;
  onSendGif?(gifId: string): Promise<boolean>;
  onDraftChange(content: string): void;
  onDeleteMessage(messageId: string): Promise<boolean>;
  onEditMessage(input: { content: string; messageId: string }): Promise<boolean>;
  onOpenThread?(messageId: string): void;
  onToggleMessageReaction(input: { emoji: string; messageId: string; shouldReact: boolean }): void;
  onOpenDetails?(): void;
}) {
  const styles = useDmScreenStyles();
  const [inboxSegment, setInboxSegment] = useState<"conversations" | "friends">("conversations");
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
        isReactionMutationPending={isReactionMutationPending}
        sendState={dmSendState}
        typingLabel={dmTypingLabel}
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
        {...(onSendGif ? { onSendGif } : {})}
        onDraftChange={onDraftChange}
        onDeleteMessage={onDeleteMessage}
        onEditMessage={onEditMessage}
        {...(onOpenThread ? { onOpenThread } : {})}
        onToggleMessageReaction={onToggleMessageReaction}
        {...(onOpenDetails ? { onOpenDetails } : {})}
      />
    );
  }

  return (
    <View style={[styles.chatScreen, styles.dmInboxScreen]} testID="mobile-dm-inbox-screen">
      <DMInboxHeader />
      <View style={styles.inboxFilterRow} testID="mobile-social-segment">
        {(["conversations", "friends"] as const).map((segment) => {
          const selected = inboxSegment === segment;
          const label =
            segment === "conversations"
              ? copy.socialSegmentConversations
              : copy.socialSegmentFriends;
          return (
            <Pressable
              key={segment}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              onPress={() => setInboxSegment(segment)}
              style={[styles.inboxFilterButton, selected && styles.inboxFilterButtonActive]}
              testID={
                segment === "friends"
                  ? "mobile-social-segment-friends"
                  : "mobile-social-segment-conversations"
              }
            >
              <Text
                style={[
                  styles.inboxFilterButtonText,
                  selected && styles.inboxFilterButtonTextActive,
                ]}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {inboxSegment === "friends" ? (
        <FriendsHub />
      ) : (
        <>
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
        </>
      )}
    </View>
  );
}
