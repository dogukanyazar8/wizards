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
import { BootstrapStateNotice, MobileSyncHealthBanner } from "../components/ui-atoms";
import { useDmScreenStyles } from "./dm-screen.styles";
import { DMConversationScreen } from "./dm-conversation-screen";
import { DMInboxEmptyState, DMInboxHeader, DMInboxLoadingSkeleton, DirectMessageListCard } from "./dm-inbox";
import { FriendsHub } from "../../social/friends-hub";
import { useMobileAuth } from "../../auth/mobile-auth-context";
import { useMobileFriendsQuery } from "../../social/mobile-social-query";

export { DMConversationScreen, DMConversationPreviewCard } from "./dm-conversation-screen";
export {
  DMInboxHeader,
  DMInboxEmptyState,
  DMInboxLoadingSkeleton,
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
  const [inboxSegment, setInboxSegment] = useState<"conversations" | "friends" | "requests">(
    "conversations",
  );
  const { apiClient, status } = useMobileAuth();
  const friendsQuery = useMobileFriendsQuery(apiClient, status === "signed-in");
  const incomingRequestCount = friendsQuery.data?.pending.incoming.length ?? 0;
  const hasConversations = dmConversations.length > 0;
  const shouldShowEmpty =
    bootstrapState.status === "ready" && !dmConversationsIsLoading && !hasConversations;
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
      <DMInboxHeader onCompose={() => setInboxSegment("friends")} />
      <View testID="mobile-dm-filter-tabs">
        <View style={styles.inboxFilterRow} testID="mobile-social-segment">
          {(["conversations", "friends", "requests"] as const).map((segment) => {
          const selected = inboxSegment === segment;
          const label =
            segment === "conversations"
              ? copy.socialSegmentConversations
              : segment === "friends"
                ? copy.socialSegmentFriends
                : copy.socialSegmentRequests;
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
                  : segment === "requests"
                    ? "mobile-social-segment-requests"
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
                {segment === "requests" && incomingRequestCount > 0 ? (
                  <Text style={styles.inboxFilterRequestCount}> ·{incomingRequestCount}</Text>
                ) : null}
              </Text>
            </Pressable>
          );
          })}
        </View>
      </View>
      {inboxSegment !== "conversations" ? (
        <FriendsHub mode={inboxSegment === "requests" ? "requests" : "friends"} />
      ) : (
        <>
          <MobileSyncHealthBanner health={syncHealth} onRetry={onRefreshVisibleData} />
          <BootstrapStateNotice state={bootstrapState} onRetry={onRefreshBootstrap} />
          {dmConversationsIsLoading ? (
            <DMInboxLoadingSkeleton />
          ) : hasConversations ? (
            <DirectMessageListCard
              conversations={dmConversations}
              hasNextPage={dmConversationsHasNextPage}
              onLoadMore={onLoadMoreConversations}
              selectedConversationId={selectedConversationId}
              onOpenConversation={onOpenConversation}
            />
          ) : shouldShowEmpty ? (
            <DMInboxEmptyState onCompose={() => setInboxSegment("friends")} />
          ) : null}
        </>
      )}
    </View>
  );
}
