import { useMemo } from "react";
import { View } from "react-native";
import { copy, useState } from "../mobile-root-screen-shared";
import { BootstrapStateNotice, MobileSyncHealthBanner } from "../components/ui-atoms";
import { useDmScreenStyles } from "./dm-screen.styles";
import { DMConversationBootSkeleton } from "./dm-conversation-screen";
import { DMConversationShell } from "./dm-conversation-shell";
import {
  DMInboxConversationsPane,
  DMInboxHeader,
  DMInboxSearchField,
  DMInboxSegmentTabs,
  useMobileDmSegmentSwipe,
} from "./dm-inbox";
import { useToast } from "../components/kit/toast";
import { useMobileConversationFilter } from "../features/use-mobile-conversation-filter";
import { useMobileConversationRowActions } from "../features/use-mobile-conversation-row-actions";
import { useMobileForwardTargets } from "../features/use-mobile-forward-targets";
import type {
  MobileDMInboxSegment,
  MobileDMOnlineFriend,
  MobileMessagesScreenProps,
} from "./dm-screen.types";
import { FriendsHub } from "../../social/friends-hub";
import { useMobileAuth } from "../../auth/mobile-auth-context";
import { mobileNavigationRef } from "../../navigation/mobile-navigation-ref";
import { useMobileDMRowTyping } from "../features/use-mobile-dm-row-typing";
import { useMobileDMTypingLabel } from "../features/use-mobile-typing-labels";
import { useMobileFriendsQuery } from "../../social/mobile-social-query";

export { DMConversationScreen, DMConversationPreviewCard } from "./dm-conversation-screen";
export { DirectMessageConversationCard, DirectMessageListCard } from "./dm-inbox";

/** 2a's FAB. Nothing to close over, so it is not rebuilt per render. */
function openGroupCreate() {
  if (mobileNavigationRef.isReady()) {
    mobileNavigationRef.navigate("GroupCreate");
  }
}

export function MessagesScreen({
  bootstrapState,
  canRenderConversation = false,
  dmConversations,
  dmConversationsHasNextPage,
  dmConversationsIsLoading,
  dmMessagesState,
  getAccessToken,
  isReactionMutationPending,
  isEndToEndEncrypted,
  lastSeenAt,
  mediaState,
  messageSearchState,
  onClearMessageSearch,
  onSearchMessages,
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
  const viewerId = bootstrapState.status === "ready" ? bootstrapState.payload.user.id : null;
  // V4. Read synchronously from the hook's own state, so the stored chip is the
  // one drawn on the first frame rather than a flash of "Tümü".
  const { filter, setFilter } = useMobileConversationFilter(viewerId);
  const { showToast } = useToast();
  const rowActions = useMobileConversationRowActions(apiClient, dmConversations, viewerId, () =>
    showToast({ title: copy.confirmationError, variant: "error" }),
  );
  const rowTyping = useMobileDMRowTyping();
  // Same rule as the inbox rows: read the typing store here, so a conversation
  // nobody has open cannot re-render the app to move a label.
  const dmTypingLabel = useMobileDMTypingLabel(selectedConversationId);
  const swipeHandlers = useMobileDmSegmentSwipe(inboxSegment, setInboxSegment);
  const forwardTargets = useMobileForwardTargets(dmConversations);
  const shouldShowEmpty =
    bootstrapState.status === "ready" && !dmConversationsIsLoading && dmConversations.length === 0;
  const attachmentsFeature =
    bootstrapState.status === "ready" ? bootstrapState.payload.features.attachments : null;
  if (canRenderConversation && !selectedConversation) {
    // The route is the conversation, so hold a chat-shaped frame instead of
    // dropping back to the inbox while the selection resolves.
    return <DMConversationBootSkeleton />;
  }

  if (canRenderConversation && selectedConversation) {
    return (
      <DMConversationShell
        attachmentsFeature={attachmentsFeature}
        conversation={selectedConversation}
        currentUserId={viewerId ?? ""}
        {...(getAccessToken ? { getAccessToken } : {})}
        isReactionMutationPending={isReactionMutationPending}
        {...(isEndToEndEncrypted !== undefined ? { isEndToEndEncrypted } : {})}
        {...(lastSeenAt !== undefined ? { lastSeenAt } : {})}
        mediaState={mediaState}
        {...(messageSearchState ? { messageSearchState } : {})}
        {...(onClearMessageSearch ? { onClearMessageSearch } : {})}
        onClearSelectedMediaAsset={onClearSelectedMediaAsset}
        onCloseConversation={onCloseConversation}
        onDeleteMessage={onDeleteMessage}
        onDiscardMessage={onDiscardMessage}
        onDraftChange={onDraftChange}
        onEditMessage={onEditMessage}
        {...(onForwardMessage ? { forwardTargets, onForwardMessage } : {})}
        {...(onLoadMoreMessages ? { onLoadMoreMessages } : {})}
        {...(onOpenThread ? { onOpenThread } : {})}
        onRefreshConversation={onRefreshConversation}
        onRefreshVisibleData={onRefreshVisibleData}
        onRequestDocumentPicker={onRequestDocumentPicker}
        onRequestPhotoLibraryPicker={onRequestPhotoLibraryPicker}
        onRetryMessage={onRetryMessage}
        {...(onSearchMessages ? { onSearchMessages } : {})}
        {...(onSendGif ? { onSendGif } : {})}
        onSendMessage={onSendMessage}
        {...(onStartVideoCall ? { onStartVideoCall } : {})}
        {...(onStartVoiceCall ? { onStartVoiceCall } : {})}
        onToggleMessageReaction={onToggleMessageReaction}
        state={dmMessagesState}
        syncHealth={syncHealth}
        typingLabel={dmTypingLabel}
        viewerId={viewerId ?? ""}
      />
    );
  }

  return (
    <View style={[styles.chatScreen, styles.dmInboxScreen]} testID="mobile-dm-inbox-screen">
      <DMInboxHeader
        onCompose={() => setInboxSegment(inboxSegment === "conversations" ? "friends" : "requests")}
        onCreateGroup={openGroupCreate}
        segment={inboxSegment}
      />
      <DMInboxSegmentTabs
        incomingRequestCount={incomingRequestCount}
        onSelectSegment={setInboxSegment}
        segment={inboxSegment}
      />
      {/*
       * §2 "1c": one search band for all three tabs. On the requests tab it is
       * the user lookup the hub used to carry as a second field of its own.
       */}
      <DMInboxSearchField
        onChangeText={setSearchQuery}
        placeholder={
          inboxSegment === "conversations"
            ? copy.dmConversationSearchPlaceholder
            : inboxSegment === "friends"
              ? copy.dmFriendSearchPlaceholder
              : copy.friendsSearchPlaceholder
        }
        value={searchQuery}
      />
      <MobileSyncHealthBanner health={syncHealth} onRetry={onRefreshVisibleData} />
      <BootstrapStateNotice state={bootstrapState} onRetry={onRefreshBootstrap} />
      <View style={styles.dmInboxBody} {...swipeHandlers}>
        {inboxSegment === "conversations" ? (
          <DMInboxConversationsPane
            conversations={dmConversations}
            currentUserId={viewerId ?? ""}
            filter={filter}
            hasNextPage={dmConversationsHasNextPage}
            isLoading={dmConversationsIsLoading}
            onCompose={() => setInboxSegment("friends")}
            onLoadMore={onLoadMoreConversations}
            onOpenConversation={onOpenConversation}
            onSelectFilter={setFilter}
            onlineFriends={onlineFriends}
            query={searchQuery}
            rowActions={rowActions}
            selectedConversationId={selectedConversationId}
            showEmpty={shouldShowEmpty}
            typingByConversationId={rowTyping}
          />
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
            externalSearch={searchQuery}
            mode="requests"
            onSelectMode={(nextMode) => setInboxSegment(nextMode)}
          />
        )}
      </View>
    </View>
  );
}
