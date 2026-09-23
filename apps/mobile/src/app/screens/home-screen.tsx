import {
  Pressable,
  Text,
  View,
  copy,
  formatMobileUnreadCount,
  getBoundedMobileList,
  getMobileChannelPriority,
  MOBILE_RENDER_LIMITS,
  useMemo,
  type MobileBootstrapPayload,
  type MobileBootstrapViewState,
  type MobileChannelMessagesViewState,
  type MobileMediaRuntimeState,
  type MobileMessageSearchViewState,
  type MobileSyncHealthSummary,
  type MobileWorkspaceChannelSummary,
  type MobileWorkspaceServerViewState,
} from "../mobile-root-screen-shared";
import type { ChatMessage, UploadedAttachmentInput } from "@wizards/types";
import { FlashList } from "@shopify/flash-list";
import {
  AvatarMark,
  BootstrapStateNotice,
  MobileSyncHealthBanner,
  StatusChip,
} from "../components/ui-atoms";
import { useHomeScreenStyles } from "./home-screen.styles";
import { mobileListLoadHandlers } from "../../performance/mobile-performance-metrics";
import { MobileWorkspaceBrowser } from "./workspace-browser";
import type { MobileForwardSendInput } from "../components/message-forward-sheet";

export { MobileWorkspaceBrowser } from "./workspace-browser";
export {
  WorkspaceChannelCompactRow,
  WorkspaceChannelSectionList,
} from "./workspace-channel-section-list";

export function OverviewScreen({
  bootstrapState,
  channelAnchorMessageId = null,
  channelFirstUnreadMessageId = null,
  isViewingChannelHistory = false,
  onExitChannelHistory,
  channelMessagesState,
  channelPinnedMessages = [],
  canRenderChannelChat = false,
  isReactionMutationPending,
  mediaState,
  messageSearchState,
  activeWorkspaceTextChannelId,
  selectedWorkspaceChannelId,
  selectedWorkspaceServerId,
  syncHealth,
  workspaceServerState,
  onClearMessageSearch,
  onClearSelectedMediaAsset,
  onCloseWorkspaceChannel,
  onLoadMoreChannelMessages,
  onOpenWorkspaceChannel,
  onOpenWorkspaceServer,
  onRefreshBootstrap,
  onRefreshChannelMessages,
  onRefreshVisibleData,
  onRefreshWorkspaceServer,
  onRequestDocumentPicker,
  onChannelDraftChange,
  onSearchMessages,
  onSendChannelMessage,
  onSendChannelGif,
  onDeleteMessage,
  onDiscardMessage,
  onEditMessage,
  onForwardMessage,
  onOpenThread,
  onPinMessage,
  onRetryMessage,
  onToggleMessageReaction,
}: {
  bootstrapState: MobileBootstrapViewState;
  /** A search hit opens the channel at this message instead of at its tail. */
  channelAnchorMessageId?: string | null;
  channelFirstUnreadMessageId?: string | null;
  isViewingChannelHistory?: boolean;
  onExitChannelHistory?(): void;
  channelMessagesState: MobileChannelMessagesViewState;
  channelPinnedMessages?: readonly ChatMessage[];
  /** Set only by the pushed ChannelChat route — see MobileWorkspaceBrowser. */
  canRenderChannelChat?: boolean;
  isReactionMutationPending: boolean;
  mediaState: MobileMediaRuntimeState;
  messageSearchState: MobileMessageSearchViewState;
  activeWorkspaceTextChannelId: string | null;
  selectedWorkspaceChannelId: string | null;
  selectedWorkspaceServerId: string | null;
  syncHealth: MobileSyncHealthSummary;
  workspaceServerState: MobileWorkspaceServerViewState;
  onClearMessageSearch(): void;
  onClearSelectedMediaAsset(): void;
  onCloseWorkspaceChannel(): void;
  onLoadMoreChannelMessages(): void;
  onOpenWorkspaceChannel(channel: MobileWorkspaceChannelSummary): Promise<boolean>;
  onOpenWorkspaceServer(serverId: string): void;
  onRefreshBootstrap(): void;
  onRefreshChannelMessages(): void;
  onRefreshVisibleData(): void;
  onRefreshWorkspaceServer(): void;
  onRequestDocumentPicker(): Promise<void>;
  onChannelDraftChange(content: string): void;
  onSearchMessages(input: {
    conversationId: string;
    query: string;
    scope: "channel";
  }): Promise<void>;
  onSendChannelMessage(
    content: string,
    intent?: {
      readonly attachments?: readonly UploadedAttachmentInput[];
      readonly replyToId?: string;
      readonly threadParentId?: string;
    },
  ): Promise<boolean>;
  onSendChannelGif?(gifId: string): Promise<boolean>;
  onDeleteMessage(messageId: string): Promise<boolean>;
  onDiscardMessage(messageId: string): void;
  onEditMessage(input: { content: string; messageId: string }): Promise<boolean>;
  onForwardMessage?(input: MobileForwardSendInput): Promise<boolean>;
  onOpenThread?(messageId: string): void;
  onPinMessage?(messageId: string, shouldPin: boolean): Promise<boolean>;
  onRetryMessage(messageId: string): void;
  onToggleMessageReaction(input: { emoji: string; messageId: string; shouldReact: boolean }): void;
}) {
  const styles = useHomeScreenStyles();
  const attachmentsFeature =
    bootstrapState.status === "ready" ? bootstrapState.payload.features.attachments : null;
  const messageSearchFeature =
    bootstrapState.status === "ready" ? bootstrapState.payload.features.messageSearch : null;

  return (
    <View style={styles.homeScreen} testID="mobile-overview-screen">
      <MobileSyncHealthBanner health={syncHealth} onRetry={onRefreshVisibleData} />
      <BootstrapStateNotice state={bootstrapState} onRetry={onRefreshBootstrap} />
      {bootstrapState.status === "ready" ? (
        <MobileWorkspaceBrowser
          attachmentsFeature={attachmentsFeature}
          bootstrapState={bootstrapState}
          canRenderChannelChat={canRenderChannelChat}
          channelAnchorMessageId={channelAnchorMessageId}
          channelFirstUnreadMessageId={channelFirstUnreadMessageId}
          isViewingChannelHistory={isViewingChannelHistory}
          {...(onExitChannelHistory ? { onExitChannelHistory } : {})}
          channelMessagesState={channelMessagesState}
          channelPinnedMessages={channelPinnedMessages}
          isReactionMutationPending={isReactionMutationPending}
          mediaState={mediaState}
          messageSearchFeature={messageSearchFeature}
          messageSearchState={messageSearchState}
          activeWorkspaceTextChannelId={activeWorkspaceTextChannelId}
          selectedChannelId={selectedWorkspaceChannelId}
          selectedServerId={selectedWorkspaceServerId}
          serverState={workspaceServerState}
          onClearMessageSearch={onClearMessageSearch}
          onClearSelectedMediaAsset={onClearSelectedMediaAsset}
          onCloseWorkspaceChannel={onCloseWorkspaceChannel}
          onLoadMoreChannelMessages={onLoadMoreChannelMessages}
          onOpenChannel={onOpenWorkspaceChannel}
          onOpenServer={onOpenWorkspaceServer}
          onRefreshChannel={onRefreshChannelMessages}
          onRefreshServer={onRefreshWorkspaceServer}
          onRequestDocumentPicker={onRequestDocumentPicker}
          onChannelDraftChange={onChannelDraftChange}
          onSearchMessages={onSearchMessages}
          onSendChannelMessage={onSendChannelMessage}
          {...(onSendChannelGif ? { onSendChannelGif } : {})}
          onDeleteMessage={onDeleteMessage}
          onDiscardMessage={onDiscardMessage}
          onEditMessage={onEditMessage}
          {...(onForwardMessage ? { onForwardMessage } : {})}
          {...(onOpenThread ? { onOpenThread } : {})}
          {...(onPinMessage ? { onPinMessage } : {})}
          onRetryMessage={onRetryMessage}
          onToggleMessageReaction={onToggleMessageReaction}
        />
      ) : null}
    </View>
  );
}

export function RecentServersCard({
  onOpenServer,
  selectedServerId,
  servers,
}: {
  onOpenServer?(serverId: string): void;
  selectedServerId?: string | null;
  servers: MobileBootstrapPayload["home"]["servers"]["recent"];
}) {
  const styles = useHomeScreenStyles();
  const visibleServers = useMemo(
    () => getBoundedMobileList(servers, MOBILE_RENDER_LIMITS.servers),
    [servers],
  );

  return (
    <View style={styles.homeSectionCard}>
      <Text style={styles.environmentLabel}>{copy.homeRecentServersTitle}</Text>
      {servers.length > 0 ? (
        <FlashList
          contentContainerStyle={styles.compactList}
          data={visibleServers}
          keyExtractor={(server) => server.id}
          onLoad={mobileListLoadHandlers.workspaceServers}
          renderItem={({ item: server }) => (
            <Pressable
              accessibilityRole={onOpenServer ? "button" : undefined}
              accessibilityLabel={
                onOpenServer ? `${copy.openWorkspaceServerAction}: ${server.name}` : server.name
              }
              accessibilityState={{ selected: server.id === selectedServerId }}
              testID="mobile-workspace-server-row"
              disabled={!onOpenServer}
              onPress={() => onOpenServer?.(server.id)}
              style={({ pressed }) => [
                styles.compactListRow,
                onOpenServer && styles.compactListRowButton,
                server.id === selectedServerId && styles.compactListRowSelected,
                pressed && styles.compactListRowPressed,
              ]}
            >
              <AvatarMark label={server.shortName ?? server.name} imageUrl={server.iconUrl} />
              <View style={styles.compactListText}>
                <Text style={styles.compactListTitle} numberOfLines={1}>
                  {server.name}
                </Text>
                <Text style={styles.compactListMeta} numberOfLines={1}>
                  {server.memberCount} {copy.membersSuffix} - {server.channelCount}{" "}
                  {copy.channelsSuffix}
                </Text>
              </View>
            </Pressable>
          )}
          showsVerticalScrollIndicator={false}
          style={styles.compactListViewport}
          testID="mobile-workspace-server-list"
        />
      ) : (
        <Text style={styles.contractDescription}>{copy.homeNoServers}</Text>
      )}
    </View>
  );
}

export function WorkspaceChannelList({
  channels,
  onOpenChannel,
  selectedChannelId,
}: {
  channels: MobileWorkspaceChannelSummary[];
  onOpenChannel(channel: MobileWorkspaceChannelSummary): void;
  selectedChannelId: string | null;
}) {
  const styles = useHomeScreenStyles();
  if (channels.length === 0) {
    return <Text style={styles.contractDescription}>{copy.workspaceNoChannels}</Text>;
  }

  const visibleChannels = getBoundedMobileList(channels, MOBILE_RENDER_LIMITS.channels);

  return (
    <View style={styles.workspaceChannelList}>
      {visibleChannels.map((channel) => {
        const isSelected = channel.id === selectedChannelId;
        const typeLabel =
          channel.type === "TEXT" ? copy.workspaceTextChannel : copy.workspaceVoiceChannel;
        const priority = getMobileChannelPriority(channel);

        return (
          <Pressable
            key={channel.id}
            accessibilityRole="button"
            accessibilityLabel={`${copy.openWorkspaceChannelAction}: ${channel.name}`}
            accessibilityState={{ selected: isSelected }}
            testID={`mobile-workspace-channel-${channel.type.toLowerCase()}`}
            onPress={() => onOpenChannel(channel)}
            style={({ pressed }) => [
              styles.workspaceChannelRow,
              isSelected && styles.compactListRowSelected,
              pressed && styles.compactListRowPressed,
            ]}
          >
            <Text style={styles.workspaceChannelIcon}>{channel.type === "TEXT" ? "#" : "V"}</Text>
            <View style={styles.compactListText}>
              <View style={styles.compactListTitleRow}>
                <Text style={styles.compactListTitle} numberOfLines={1}>
                  {channel.name}
                </Text>
                {priority.hasMentions ? (
                  <Text style={styles.channelMentionBadge}>{channel.mentionCount}</Text>
                ) : null}
              </View>
              <View style={styles.dmMetaRow}>
                <StatusChip
                  label={typeLabel}
                  tone={channel.type === "VOICE" ? "success" : "muted"}
                />
                {channel.categoryName ? (
                  <StatusChip label={channel.categoryName} tone="muted" />
                ) : null}
                {priority.hasUnread ? (
                  <StatusChip
                    label={`${formatMobileUnreadCount(channel.unreadCount)} ${copy.unreadSuffix}`}
                    tone="accent"
                  />
                ) : null}
                {priority.isLocked ? (
                  <StatusChip label={copy.workspaceLockedLabel} tone="muted" />
                ) : null}
                {priority.isReadOnly ? (
                  <StatusChip label={copy.workspaceReadOnlyLabel} tone="muted" />
                ) : null}
              </View>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}
