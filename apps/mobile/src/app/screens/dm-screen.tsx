import { useMemo } from "react";
import { View } from "react-native";
import { copy, getMobileConversationTitle, useState } from "../mobile-root-screen-shared";
import type { MobileForwardTarget } from "../components/message-forward-sheet";
import { BootstrapStateNotice, MobileSyncHealthBanner } from "../components/ui-atoms";
import { useDmScreenStyles } from "./dm-screen.styles";
import { DMConversationBootSkeleton, DMConversationScreen } from "./dm-conversation-screen";
import {
  DMInboxEmptyState,
  DMInboxHeader,
  DMInboxLoadingSkeleton,
  DMInboxSearchField,
  DMInboxSegmentTabs,
  DirectMessageListCard,
  useMobileDmSegmentSwipe,
} from "./dm-inbox";
import type {
  MobileDMInboxSegment,
  MobileDMOnlineFriend,
  MobileMessagesScreenProps,
} from "./dm-screen.types";
import { FriendsHub } from "../../social/friends-hub";
import { useMobileAuth } from "../../auth/mobile-auth-context";
import { mobileNavigationRef } from "../../navigation/mobile-navigation-ref";
import { useMobileDMRowTyping } from "../features/use-mobile-dm-row-typing";
import { useMobileFriendsQuery, useMobileSocialMutations } from "../../social/mobile-social-query";

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
  canRenderConversation = false,
  dmConversations,
  dmConversationsHasNextPage,
  dmConversationsIsLoading,
  dmMessagesState,
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
  onDiscardMessage,
  onEditMessage,
  onForwardMessage,
  onOpenThread,
  onRetryMessage,
  onToggleMessageReaction,
  onStartVideoCall,
  onStartVoiceCall,
}: MobileMessagesScreenProps) {
  const styles = useDmScreenStyles();
  const [inboxSegment, setInboxSegment] = useState<MobileDMInboxSegment>("conversations");
  const [searchQuery, setSearchQuery] = useState("");
  const { apiClient, status } = useMobileAuth();
  const friendsQuery = useMobileFriendsQuery(apiClient, status === "signed-in");
  const socialMutations = useMobileSocialMutations(apiClient);
  const incomingRequestCount = friendsQuery.data?.pending.incoming.length ?? 0;
  const onlineFriends = useMemo<readonly MobileDMOnlineFriend[]>(
    () =>
      (friendsQuery.data?.friends ?? [])
        .filter((friend) => friend.status !== "OFFLINE")
        .map((friend) => ({
          id: friend.id,
          username: friend.username,
          displayName: friend.displayName,
          avatarUrl: friend.avatarUrl,
          status: friend.status,
          // §2 "1a".5: M4A's live voice-room join, so the strip can draw the
          // wave tile instead of the presence dot.
          voiceRoom: friend.voiceRoom,
        })),
    [friendsQuery.data?.friends],
  );
  const openFriendDM = async (userId: string) => {
    const result = await socialMutations.openDM.mutateAsync(userId);
    if (mobileNavigationRef.isReady()) {
      mobileNavigationRef.navigate("DirectMessage", { conversationId: result.conversation.id });
    }
  };
  const rowTyping = useMobileDMRowTyping();
  const swipeHandlers = useMobileDmSegmentSwipe(inboxSegment, setInboxSegment);
  const forwardTargets = useMemo<readonly MobileForwardTarget[]>(
    () =>
      dmConversations.map((conversation) => ({
        id: conversation.id,
        label: getMobileConversationTitle(conversation, copy.directMessageFallback),
        type: "dm" as const,
      })),
    [dmConversations],
  );
  const hasConversations = dmConversations.length > 0;
  const shouldShowEmpty =
    bootstrapState.status === "ready" && !dmConversationsIsLoading && !hasConversations;
  const attachmentsFeature =
    bootstrapState.status === "ready" ? bootstrapState.payload.features.attachments : null;

  if (canRenderConversation && !selectedConversation) {
    // The route is the conversation, so hold a chat-shaped frame instead of
    // dropping back to the inbox while the selection resolves.
    return <DMConversationBootSkeleton />;
  }

  if (canRenderConversation && selectedConversation) {
    return (
      <DMConversationScreen
        attachmentsFeature={attachmentsFeature}
        conversation={selectedConversation}
        currentUserId={bootstrapState.status === "ready" ? bootstrapState.payload.user.id : ""}
        {...(getAccessToken ? { getAccessToken } : {})}
        isReactionMutationPending={isReactionMutationPending}
        {...(isEndToEndEncrypted !== undefined ? { isEndToEndEncrypted } : {})}
        {...(lastSeenAt !== undefined ? { lastSeenAt } : {})}
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
        onDiscardMessage={onDiscardMessage}
        onEditMessage={onEditMessage}
        {...(onForwardMessage ? { forwardTargets, onForwardMessage } : {})}
        {...(onOpenThread ? { onOpenThread } : {})}
        onRetryMessage={onRetryMessage}
        onToggleMessageReaction={onToggleMessageReaction}
        {...(onStartVideoCall ? { onStartVideoCall } : {})}
        {...(onStartVoiceCall ? { onStartVoiceCall } : {})}
      />
    );
  }

  return (
    <View style={[styles.chatScreen, styles.dmInboxScreen]} testID="mobile-dm-inbox-screen">
      <DMInboxHeader
        onCompose={() => setInboxSegment(inboxSegment === "conversations" ? "friends" : "requests")}
        segment={inboxSegment}
      />
      <DMInboxSegmentTabs
        incomingRequestCount={incomingRequestCount}
        onSelectSegment={setInboxSegment}
        segment={inboxSegment}
      />
      {inboxSegment === "requests" ? null : (
        <DMInboxSearchField
          onChangeText={setSearchQuery}
          placeholder={
            inboxSegment === "friends"
              ? copy.dmFriendSearchPlaceholder
              : copy.dmConversationSearchPlaceholder
          }
          value={searchQuery}
        />
      )}
      <MobileSyncHealthBanner health={syncHealth} onRetry={onRefreshVisibleData} />
      <BootstrapStateNotice state={bootstrapState} onRetry={onRefreshBootstrap} />
      <View style={styles.dmInboxBody} {...swipeHandlers}>
        {inboxSegment === "conversations" ? (
          dmConversationsIsLoading ? (
            <DMInboxLoadingSkeleton />
          ) : hasConversations ? (
            <DirectMessageListCard
              conversations={dmConversations}
              currentUserId={
                bootstrapState.status === "ready" ? bootstrapState.payload.user.id : ""
              }
              hasNextPage={dmConversationsHasNextPage}
              onlineFriends={onlineFriends}
              onAddFriend={() => setInboxSegment("requests")}
              onLoadMore={onLoadMoreConversations}
              onOpenConversation={onOpenConversation}
              onOpenFriendDM={(friendId) => void openFriendDM(friendId)}
              query={searchQuery}
              selectedConversationId={selectedConversationId}
              typingByConversationId={rowTyping}
            />
          ) : shouldShowEmpty ? (
            <DMInboxEmptyState onCompose={() => setInboxSegment("friends")} />
          ) : null
        ) : inboxSegment === "friends" ? (
          <FriendsHub
            embedded
            externalSearch={searchQuery}
            mode="friends"
            onSelectMode={(nextMode) => setInboxSegment(nextMode)}
          />
        ) : (
          <FriendsHub
            embedded
            mode="requests"
            onSelectMode={(nextMode) => setInboxSegment(nextMode)}
          />
        )}
      </View>
    </View>
  );
}
