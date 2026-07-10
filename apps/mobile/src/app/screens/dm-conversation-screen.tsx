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
} from "../mobile-root-screen-shared";
import { DMComposer } from "../composer/mobile-composer";
import {
  MessageListSkeleton,
  MessageSearchPanel,
  MessageStream,
} from "../components/message-primitives";
import { AvatarMark, EmptyState, MobileSyncHealthBanner, StatusChip } from "../components/ui-atoms";
import { useDmScreenStyles } from "./dm-screen.styles";

export function DMConversationScreen({
  attachmentsFeature,
  conversation,
  currentUserId,
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
  sendState,
  state,
  syncHealth,
}: {
  attachmentsFeature: MobileBootstrapFeature | null;
  conversation: MobileBootstrapPayload["home"]["directMessages"]["recent"][number];
  currentUserId: string;
  mediaState: MobileMediaRuntimeState;
  messageSearchFeature: MobileBootstrapFeature | null;
  messageSearchState: MobileMessageSearchViewState;
  sendState: MobileDMSendViewState;
  state: MobileDMMessagesViewState;
  syncHealth: MobileSyncHealthSummary;
  onBack(): void;
  onClearMessageSearch(): void;
  onClearSelectedMediaAsset(): void;
  onRefreshConversation(): void;
  onRefreshVisibleData(): void;
  onRequestDocumentPicker(): Promise<void>;
  onRequestPhotoLibraryPicker(): Promise<void>;
  onSearchMessages(input: { conversationId: string; query: string; scope: "dm" }): Promise<void>;
  onSendMessage(content: string): Promise<boolean>;
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
        sendState={sendState}
        state={state}
        mediaState={mediaState}
        onClearSelectedMediaAsset={onClearSelectedMediaAsset}
        onRetry={onRefreshConversation}
        onRequestDocumentPicker={onRequestDocumentPicker}
        onRequestPhotoLibraryPicker={onRequestPhotoLibraryPicker}
        onSendMessage={onSendMessage}
      />
    </View>
  );
}

export function DMConversationPreviewCard({
  attachmentsFeature,
  conversation,
  currentUserId,
  mediaState,
  onClearSelectedMediaAsset,
  onRetry,
  onRequestDocumentPicker,
  onRequestPhotoLibraryPicker,
  onSendMessage,
  sendState,
  state,
}: {
  attachmentsFeature: MobileBootstrapFeature | null;
  conversation: MobileBootstrapPayload["home"]["directMessages"]["recent"][number] | null;
  currentUserId: string;
  mediaState: MobileMediaRuntimeState;
  onClearSelectedMediaAsset(): void;
  onRetry(): void;
  onRequestDocumentPicker(): Promise<void>;
  onRequestPhotoLibraryPicker(): Promise<void>;
  onSendMessage(content: string): Promise<boolean>;
  sendState: MobileDMSendViewState;
  state: MobileDMMessagesViewState;
}) {
  const styles = useDmScreenStyles();
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
        <MessageStream currentUserId={currentUserId} messages={state.payload.messages} />
      ) : null}
      {state.status === "ready" && state.payload.messages.length === 0 ? (
        <Text style={styles.contractDescription}>{copy.dmNoMessages}</Text>
      ) : null}
      {state.status === "ready" ? (
        <DMComposer
          attachmentsFeature={attachmentsFeature}
          sendState={conversationSendState}
          mediaState={mediaState}
          onClearSelectedMediaAsset={onClearSelectedMediaAsset}
          onRequestDocumentPicker={onRequestDocumentPicker}
          onRequestPhotoLibraryPicker={onRequestPhotoLibraryPicker}
          onSend={onSendMessage}
        />
      ) : null}
    </View>
  );
}
