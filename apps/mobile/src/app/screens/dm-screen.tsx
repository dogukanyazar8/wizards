import {
  View,
  Pressable,
  Text,
  copy,
  type MobileDMConversationListItem,
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
import { DMInboxHeader, DirectMessageListCard } from "./dm-inbox";
import { FriendsHub } from "../../social/friends-hub";

export { DMConversationScreen, DMConversationPreviewCard } from "./dm-conversation-screen";
export {
  DMInboxHeader,
  DirectMessageConversationCard,
  DirectMessageListCard,
} from "./dm-inbox";

export function MessagesScreen({
  bootstrapState,
  dmConversations,
  dmConversationsHasNextPage,
  dmConversationsIsLoading,
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
  onLoadMoreConversations,
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
  dmConversations: readonly MobileDMConversationListItem[];
  dmConversationsHasNextPage: boolean;
  dmConversationsIsLoading: boolean;
  selectedConversation: MobileDMConversationListItem | null;
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
  onLoadMoreConversations(): void;
  onDeleteMessage(messageId: string): Promise<boolean>;
  onEditMessage(input: { content: string; messageId: string }): Promise<boolean>;
  onOpenThread?(messageId: string): void;
  onToggleMessageReaction(input: { emoji: string; messageId: string; shouldReact: boolean }): void;
  onOpenDetails?(): void;
}) {
  const styles = useDmScreenStyles();
  const [inboxSegment, setInboxSegment] = useState<"conversations" | "friends">("conversations");
  const hasConversations = dmConversations.length > 0;
  const shouldShowEmpty = !dmConversationsIsLoading && !hasConversations;
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
      <View testID="mobile-dm-filter-tabs">
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
      </View>
      {inboxSegment === "friends" ? (
        <FriendsHub />
      ) : (
        <>
          <MobileSyncHealthBanner health={syncHealth} onRetry={onRefreshVisibleData} />
          <BootstrapStateNotice state={bootstrapState} onRetry={onRefreshBootstrap} />
          {hasConversations ? (
            <DirectMessageListCard
              conversations={dmConversations}
              hasNextPage={dmConversationsHasNextPage}
              onLoadMore={onLoadMoreConversations}
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
