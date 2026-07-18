import { View, useState } from "../mobile-root-screen-shared";
import { BootstrapStateNotice, MobileSyncHealthBanner } from "../components/ui-atoms";
import { useDmScreenStyles } from "./dm-screen.styles";
import { DMConversationScreen } from "./dm-conversation-screen";
import {
  DMInboxEmptyState,
  DMInboxHeader,
  DMInboxLoadingSkeleton,
  DMInboxSegmentTabs,
  DirectMessageListCard,
} from "./dm-inbox";
import type { MobileDMInboxSegment, MobileMessagesScreenProps } from "./dm-screen.types";
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
  getAccessToken,
  isReactionMutationPending,
  isEndToEndEncrypted,
  lastSeenAt,
  mediaState,
  selectedConversation,
  selectedConversationId,
  syncHealth,
  onClearSelectedMediaAsset,
  onOpenConversation,
  onCloseConversation,
  onRefreshBootstrap,
  onRefreshConversation,
  onRefreshVisibleData,
  onRequestDocumentPicker,
  onRequestPhotoLibraryPicker,
  onSendMessage,
  onSendGif,
  onDraftChange,
  onLoadMoreConversations,
  onLoadMoreMessages,
  onDeleteMessage,
  onEditMessage,
  onOpenThread,
  onToggleMessageReaction,
  onOpenDetails,
  onStartVideoCall,
  onStartVoiceCall,
}: MobileMessagesScreenProps) {
  const styles = useDmScreenStyles();
  const [inboxSegment, setInboxSegment] = useState<MobileDMInboxSegment>("conversations");
  const { apiClient, status } = useMobileAuth();
  const friendsQuery = useMobileFriendsQuery(apiClient, status === "signed-in");
  const incomingRequestCount = friendsQuery.data?.pending.incoming.length ?? 0;
  const hasConversations = dmConversations.length > 0;
  const shouldShowEmpty =
    bootstrapState.status === "ready" && !dmConversationsIsLoading && !hasConversations;
  const attachmentsFeature =
    bootstrapState.status === "ready" ? bootstrapState.payload.features.attachments : null;

  if (selectedConversation) {
    return (
      <DMConversationScreen
        attachmentsFeature={attachmentsFeature}
        conversation={selectedConversation}
        currentUserId={bootstrapState.status === "ready" ? bootstrapState.payload.user.id : ""}
        {...(getAccessToken ? { getAccessToken } : {})}
        isReactionMutationPending={isReactionMutationPending}
        {...(isEndToEndEncrypted !== undefined ? { isEndToEndEncrypted } : {})}
        {...(lastSeenAt !== undefined ? { lastSeenAt } : {})}
        sendState={dmSendState}
        typingLabel={dmTypingLabel}
        state={dmMessagesState}
        syncHealth={syncHealth}
        mediaState={mediaState}
        onBack={onCloseConversation}
        onClearSelectedMediaAsset={onClearSelectedMediaAsset}
        onRefreshConversation={onRefreshConversation}
        onRefreshVisibleData={onRefreshVisibleData}
        onRequestDocumentPicker={onRequestDocumentPicker}
        onRequestPhotoLibraryPicker={onRequestPhotoLibraryPicker}
        onSendMessage={onSendMessage}
        {...(onSendGif ? { onSendGif } : {})}
        onDraftChange={onDraftChange}
        {...(onLoadMoreMessages ? { onLoadMoreMessages } : {})}
        onDeleteMessage={onDeleteMessage}
        onEditMessage={onEditMessage}
        {...(onOpenThread ? { onOpenThread } : {})}
        onToggleMessageReaction={onToggleMessageReaction}
        {...(onOpenDetails ? { onOpenDetails } : {})}
        {...(onStartVideoCall ? { onStartVideoCall } : {})}
        {...(onStartVoiceCall ? { onStartVoiceCall } : {})}
      />
    );
  }

  return (
    <View style={[styles.chatScreen, styles.dmInboxScreen]} testID="mobile-dm-inbox-screen">
      {inboxSegment !== "conversations" ? (
        <FriendsHub
          mode={inboxSegment === "requests" ? "requests" : "friends"}
          onBack={() => setInboxSegment("conversations")}
          onSelectMode={(nextMode) => setInboxSegment(nextMode)}
        />
      ) : (
        <>
          <DMInboxHeader onCompose={() => setInboxSegment("friends")} />
          <DMInboxSegmentTabs
            incomingRequestCount={incomingRequestCount}
            onSelectSegment={setInboxSegment}
            segment={inboxSegment}
          />
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
