import {
  Pressable,
  Text,
  View,
  copy,
  getBoundedMobileList,
  getMobileChannelPriority,
  getMobileHomeQuickActions,
  getMobileWorkspaceChannels,
  MOBILE_RENDER_LIMITS,
  useMemo,
  type MobileBootstrapFeature,
  type MobileBootstrapPayload,
  type MobileBootstrapViewState,
  type MobileChannelMessagesViewState,
  type MobileChannelSendViewState,
  type MobileHomeQuickAction,
  type MobileLocale,
  type MobileMediaRuntimeState,
  type MobileMessageSearchViewState,
  type MobilePushToTalkPhase,
  type MobileSyncHealthSummary,
  type MobileTabId,
  type MobileVoiceAudioOutputMode,
  type MobileVoiceInputMode,
  type MobileVoiceInviteSendState,
  type MobileVoiceRoomState,
  type MobileWorkspaceChannelSummary,
  type MobileWorkspaceServerViewState,
} from "../mobile-root-screen-shared";
import { FlashList } from "@shopify/flash-list";
import { ChannelMessagesPreviewCard } from "./channel-screen";
import {
  AvatarMark,
  BootstrapStateNotice,
  EmptyState,
  HomeMetricTile,
  MobileSyncHealthBanner,
  StatusChip,
} from "../components/ui-atoms";
import { useHomeScreenStyles } from "./home-screen.styles";
import { MobileWorkspaceBrowser } from "./workspace-browser";

export { MobileWorkspaceBrowser } from "./workspace-browser";
export {
  WorkspaceChannelCompactRow,
  WorkspaceChannelSectionList,
} from "./workspace-channel-section-list";

export function OverviewScreen({
  bootstrapState,
  channelMessagesState,
  channelSendState,
  channelTypingLabel,
  isReactionMutationPending,
  locale,
  mediaState,
  messageSearchState,
  voiceInputMode,
  voicePushToTalkPhase,
  voiceRoomState,
  activeWorkspaceTextChannelId,
  activeWorkspaceVoiceChannelId,
  selectedWorkspaceChannelId,
  selectedWorkspaceServerId,
  syncHealth,
  workspaceServerState,
  onClearMessageSearch,
  onClearSelectedMediaAsset,
  onCloseWorkspaceChannel,
  onCloseWorkspaceVoiceChannel,
  onLeaveWorkspaceVoiceChannel,
  onOpenWorkspaceChannel,
  onOpenWorkspaceServer,
  onRefreshBootstrap,
  onRefreshChannelMessages,
  onRefreshVisibleData,
  onRefreshWorkspaceServer,
  onRequestDocumentPicker,
  onRequestPhotoLibraryPicker,
  onBeginVoicePushToTalk,
  onEndVoicePushToTalk,
  onSelectVoiceAudioOutput,
  onToggleVoiceCamera,
  onToggleVoiceMute,
  onToggleVoiceScreenShare,
  voiceInviteSendStates,
  onChannelDraftChange,
  onSearchMessages,
  onSendChannelMessage,
  onToggleMessageReaction,
  onSendVoiceInvite,
}: {
  bootstrapState: MobileBootstrapViewState;
  channelMessagesState: MobileChannelMessagesViewState;
  channelSendState: MobileChannelSendViewState;
  channelTypingLabel: string | null;
  isReactionMutationPending: boolean;
  locale: MobileLocale;
  mediaState: MobileMediaRuntimeState;
  messageSearchState: MobileMessageSearchViewState;
  voiceInputMode: MobileVoiceInputMode;
  voicePushToTalkPhase: MobilePushToTalkPhase;
  voiceRoomState: MobileVoiceRoomState;
  activeWorkspaceTextChannelId: string | null;
  activeWorkspaceVoiceChannelId: string | null;
  selectedWorkspaceChannelId: string | null;
  selectedWorkspaceServerId: string | null;
  syncHealth: MobileSyncHealthSummary;
  workspaceServerState: MobileWorkspaceServerViewState;
  onClearMessageSearch(): void;
  onClearSelectedMediaAsset(): void;
  onCloseWorkspaceChannel(): void;
  onCloseWorkspaceVoiceChannel(): void;
  onLeaveWorkspaceVoiceChannel(): Promise<void>;
  onOpenWorkspaceChannel(channel: MobileWorkspaceChannelSummary): void;
  onOpenWorkspaceServer(serverId: string): void;
  onRefreshBootstrap(): void;
  onRefreshChannelMessages(): void;
  onRefreshVisibleData(): void;
  onRefreshWorkspaceServer(): void;
  onRequestDocumentPicker(): Promise<void>;
  onRequestPhotoLibraryPicker(): Promise<void>;
  onBeginVoicePushToTalk(): Promise<void>;
  onEndVoicePushToTalk(): void;
  onSelectVoiceAudioOutput(mode: MobileVoiceAudioOutputMode): Promise<void>;
  onToggleVoiceCamera(): Promise<void>;
  onToggleVoiceMute(): Promise<void>;
  onToggleVoiceScreenShare(): Promise<void>;
  voiceInviteSendStates: Readonly<Record<string, MobileVoiceInviteSendState>>;
  onChannelDraftChange(content: string): void;
  onSearchMessages(input: {
    conversationId: string;
    query: string;
    scope: "channel";
  }): Promise<void>;
  onSendChannelMessage(content: string): Promise<boolean>;
  onToggleMessageReaction(input: { emoji: string; messageId: string; shouldReact: boolean }): void;
  onSendVoiceInvite(targetUserId: string): void;
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
          channelMessagesState={channelMessagesState}
          channelSendState={channelSendState}
          channelTypingLabel={channelTypingLabel}
          isReactionMutationPending={isReactionMutationPending}
          locale={locale}
          mediaState={mediaState}
          messageSearchFeature={messageSearchFeature}
          messageSearchState={messageSearchState}
          voiceInputMode={voiceInputMode}
          voicePushToTalkPhase={voicePushToTalkPhase}
          voiceRoomState={voiceRoomState}
          activeWorkspaceTextChannelId={activeWorkspaceTextChannelId}
          activeWorkspaceVoiceChannelId={activeWorkspaceVoiceChannelId}
          selectedChannelId={selectedWorkspaceChannelId}
          selectedServerId={selectedWorkspaceServerId}
          serverState={workspaceServerState}
          onClearMessageSearch={onClearMessageSearch}
          onClearSelectedMediaAsset={onClearSelectedMediaAsset}
          onCloseWorkspaceChannel={onCloseWorkspaceChannel}
          onCloseWorkspaceVoiceChannel={onCloseWorkspaceVoiceChannel}
          onLeaveWorkspaceVoiceChannel={onLeaveWorkspaceVoiceChannel}
          onOpenChannel={onOpenWorkspaceChannel}
          onOpenServer={onOpenWorkspaceServer}
          onRefreshChannel={onRefreshChannelMessages}
          onRefreshServer={onRefreshWorkspaceServer}
          onRequestDocumentPicker={onRequestDocumentPicker}
          onRequestPhotoLibraryPicker={onRequestPhotoLibraryPicker}
          onBeginVoicePushToTalk={onBeginVoicePushToTalk}
          onEndVoicePushToTalk={onEndVoicePushToTalk}
          onSelectVoiceAudioOutput={onSelectVoiceAudioOutput}
          onToggleVoiceCamera={onToggleVoiceCamera}
          onToggleVoiceMute={onToggleVoiceMute}
          onToggleVoiceScreenShare={onToggleVoiceScreenShare}
          voiceInviteSendStates={voiceInviteSendStates}
          onChannelDraftChange={onChannelDraftChange}
          onSearchMessages={onSearchMessages}
          onSendChannelMessage={onSendChannelMessage}
          onToggleMessageReaction={onToggleMessageReaction}
          onSendVoiceInvite={onSendVoiceInvite}
        />
      ) : null}
    </View>
  );
}

export function HomeGreetingHeader({
  onOpenNotifications,
  signedInUserLabel,
  state,
}: {
  onOpenNotifications(): void;
  signedInUserLabel: string | null;
  state: MobileBootstrapViewState;
}) {
  const styles = useHomeScreenStyles();
  const user = state.status === "ready" ? state.payload.user : null;
  const label = user?.displayName ?? signedInUserLabel ?? user?.username ?? copy.appTitle;

  return (
    <View style={styles.homeGreetingHeader}>
      <AvatarMark
        imageUrl={user?.avatarUrl ?? null}
        label={label}
        status={user?.status === "ONLINE" ? "active" : "idle"}
      />
      <View style={styles.homeGreetingText}>
        <Text style={styles.homeGreetingTitle} numberOfLines={1}>
          {copy.homeGreetingTitle.replace("{name}", label)}
        </Text>
        <Text style={styles.homeGreetingSubtitle} numberOfLines={1}>
          {copy.homeGreetingSubtitle}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={copy.tabNotifications}
        onPress={onOpenNotifications}
        style={({ pressed }) => [
          styles.homeNotificationButton,
          pressed && styles.actionButtonPressed,
        ]}
      >
        <Text style={styles.homeNotificationButtonText}>!</Text>
      </Pressable>
    </View>
  );
}

export function HomeSummaryCard({ state }: { state: MobileBootstrapViewState }) {
  const styles = useHomeScreenStyles();
  if (state.status !== "ready") {
    return null;
  }

  const primaryServer = state.payload.home.servers.recent[0] ?? null;
  const title = primaryServer?.name ?? copy.overviewTitle;
  const subtitle = primaryServer
    ? `${primaryServer.memberCount} ${copy.membersSuffix} - ${primaryServer.channelCount} ${copy.channelsSuffix}`
    : copy.homePrimaryServerEmpty;

  return (
    <View style={styles.homeSummaryCard}>
      <View style={styles.homePrimaryServerRow}>
        <AvatarMark
          imageUrl={primaryServer?.iconUrl ?? null}
          label={primaryServer?.shortName ?? title}
        />
        <View style={styles.homePrimaryServerText}>
          <Text style={styles.homePrimaryServerTitle} numberOfLines={1}>
            {title}
          </Text>
          <Text style={styles.homePrimaryServerMeta} numberOfLines={1}>
            {subtitle}
          </Text>
        </View>
      </View>
      <View style={styles.homeMetricGrid}>
        <HomeMetricTile label={copy.homeServersLabel} value={state.summary.workspaceCount} />
        <HomeMetricTile label={copy.homeDmLabel} value={state.summary.directMessageCount} />
        <HomeMetricTile
          label={copy.homeUnreadLabel}
          value={state.summary.unreadDirectMessageCount}
        />
      </View>
    </View>
  );
}

export function HomeQuickActionsCard({
  onOpenConversation,
  onOpenServer,
  onOpenTab,
  state,
}: {
  onOpenConversation(conversationId: string): void;
  onOpenServer(serverId: string): void;
  onOpenTab(tab: MobileTabId): void;
  state: MobileBootstrapViewState;
}) {
  const styles = useHomeScreenStyles();
  if (state.status !== "ready") {
    return null;
  }

  const actions = getMobileHomeQuickActions(state.payload, {
    channelsSuffix: copy.channelsSuffix,
    directMessageFallback: copy.directMessageFallback,
    latestDirectMessage: copy.homeContinueLatestDirectMessage,
    latestServer: copy.homeContinueLatestServer,
    membersSuffix: copy.membersSuffix,
    unreadSuffix: copy.unreadSuffix,
  });

  const handlePress = (action: MobileHomeQuickAction) => {
    if (!action.isEnabled) {
      return;
    }

    if (action.kind === "direct-message" && action.targetId) {
      onOpenConversation(action.targetId);
      onOpenTab("messages");
      return;
    }

    if (action.kind === "server" && action.targetId) {
      onOpenServer(action.targetId);
      return;
    }

    if (action.kind === "voice") {
      onOpenTab("voice");
    }
  };

  return (
    <View style={styles.continueCard}>
      <View style={styles.cardHeaderText}>
        <Text style={styles.environmentLabel}>{copy.homeContinueTitle}</Text>
        <Text style={styles.contractDescription}>{copy.homeContinueDescription}</Text>
      </View>
      {actions.length > 0 ? (
        <View style={styles.continueActionList}>
          {actions.map((action) => (
            <Pressable
              key={action.id}
              accessibilityRole="button"
              accessibilityLabel={`${action.title}: ${action.subtitle}`}
              accessibilityState={{ disabled: !action.isEnabled }}
              disabled={!action.isEnabled}
              onPress={() => handlePress(action)}
              style={({ pressed }) => [
                styles.continueActionRow,
                !action.isEnabled && styles.continueActionRowDisabled,
                pressed && styles.compactListRowPressed,
              ]}
            >
              <View
                style={[
                  styles.continueActionIcon,
                  action.kind === "server" && styles.continueActionIconServer,
                  action.kind === "voice" && styles.continueActionIconVoice,
                ]}
              >
                <Text style={styles.continueActionIconText}>
                  {action.kind === "direct-message" ? "DM" : action.kind === "server" ? "#" : "VO"}
                </Text>
              </View>
              <View style={styles.continueActionText}>
                <Text style={styles.compactListTitle} numberOfLines={1}>
                  {action.title}
                </Text>
                <Text style={styles.compactListMeta} numberOfLines={1}>
                  {action.subtitle}
                </Text>
              </View>
              {action.badge !== null ? (
                <Text style={styles.continueActionBadge}>{action.badge}</Text>
              ) : null}
            </Pressable>
          ))}
        </View>
      ) : (
        <Text style={styles.contractDescription}>{copy.homeContinueEmpty}</Text>
      )}
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

export function WorkspacePreviewCard({
  attachmentsFeature,
  bootstrapState,
  channelMessagesState,
  channelSendState,
  mediaState,
  messageSearchFeature,
  messageSearchState,
  onClearMessageSearch,
  onClearSelectedMediaAsset,
  onOpenChannel,
  onOpenServer,
  onRefreshChannel,
  onRefreshServer,
  onRequestDocumentPicker,
  onSearchMessages,
  onSendChannelMessage,
  selectedChannelId,
  selectedServerId,
  serverState,
}: {
  attachmentsFeature: MobileBootstrapFeature | null;
  bootstrapState: MobileBootstrapViewState;
  channelMessagesState: MobileChannelMessagesViewState;
  channelSendState: MobileChannelSendViewState;
  mediaState: MobileMediaRuntimeState;
  messageSearchFeature: MobileBootstrapFeature | null;
  messageSearchState: MobileMessageSearchViewState;
  onClearMessageSearch(): void;
  onClearSelectedMediaAsset(): void;
  onOpenChannel(channel: MobileWorkspaceChannelSummary): void;
  onOpenServer(serverId: string): void;
  onRefreshChannel(): void;
  onRefreshServer(): void;
  onRequestDocumentPicker(): Promise<void>;
  onSearchMessages(input: {
    conversationId: string;
    query: string;
    scope: "channel";
  }): Promise<void>;
  onSendChannelMessage(content: string): Promise<boolean>;
  selectedChannelId: string | null;
  selectedServerId: string | null;
  serverState: MobileWorkspaceServerViewState;
}) {
  const styles = useHomeScreenStyles();
  if (bootstrapState.status !== "ready") {
    return null;
  }

  const selectedChannel =
    serverState.status === "ready" && selectedChannelId
      ? (getMobileWorkspaceChannels(serverState.payload.detail).find(
          (channel) => channel.id === selectedChannelId,
        ) ?? null)
      : null;

  return (
    <View style={styles.workspaceCard}>
      <View style={styles.workspaceHeader}>
        <View style={styles.workspaceHeaderText}>
          <Text style={styles.environmentLabel}>{copy.workspaceTitle}</Text>
          <Text style={styles.contractDescription}>{copy.workspaceDescription}</Text>
        </View>
        {serverState.status === "ready" ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={copy.retryAction}
            onPress={onRefreshServer}
            style={({ pressed }) => [styles.dmRefreshButton, pressed && styles.actionButtonPressed]}
          >
            <Text style={styles.dmRefreshButtonText}>{copy.refreshShortAction}</Text>
          </Pressable>
        ) : null}
      </View>

      <RecentServersCard
        servers={bootstrapState.payload.home.servers.recent}
        selectedServerId={selectedServerId}
        onOpenServer={onOpenServer}
      />

      {serverState.status === "loading" && !serverState.payload ? (
        <Text style={styles.contractDescription}>{copy.workspaceLoading}</Text>
      ) : null}

      {serverState.status === "error" ? (
        <View style={styles.dmErrorRow}>
          <Text style={styles.errorText}>{serverState.error}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={copy.retryAction}
            onPress={onRefreshServer}
            style={({ pressed }) => [styles.retryButton, pressed && styles.actionButtonPressed]}
          >
            <Text style={styles.retryButtonText}>{copy.retryAction}</Text>
          </Pressable>
        </View>
      ) : null}

      {serverState.status === "idle" ? (
        <Text style={styles.contractDescription}>{copy.workspaceSelectServer}</Text>
      ) : null}

      {serverState.status === "ready" ? (
        <>
          <View style={styles.workspaceSelectedServer}>
            <AvatarMark
              label={
                serverState.payload.detail.server.shortName ??
                serverState.payload.detail.server.name
              }
              imageUrl={serverState.payload.detail.server.iconUrl}
              size="large"
            />
            <View style={styles.compactListText}>
              <Text style={styles.compactListTitle} numberOfLines={1}>
                {serverState.payload.detail.server.name}
              </Text>
              <View style={styles.dmMetaRow}>
                <StatusChip
                  label={`${serverState.payload.detail.server.memberCount} ${copy.membersSuffix}`}
                  tone="muted"
                />
                <StatusChip
                  label={`${serverState.payload.detail.server.visibleChannelCount} ${copy.channelsSuffix}`}
                  tone="muted"
                />
                {serverState.payload.detail.server.unreadCount > 0 ? (
                  <StatusChip
                    label={`${serverState.payload.detail.server.unreadCount} ${copy.unreadSuffix}`}
                    tone="accent"
                  />
                ) : null}
              </View>
            </View>
          </View>
          <WorkspaceChannelList
            channels={getMobileWorkspaceChannels(serverState.payload.detail)}
            selectedChannelId={selectedChannelId}
            onOpenChannel={onOpenChannel}
          />
          {serverState.payload.detail.hasMoreChannels ? (
            <Text style={styles.workspaceHint}>{copy.workspaceMoreChannelsHidden}</Text>
          ) : null}
          {selectedChannel?.type === "VOICE" ? (
            <EmptyState tone="success" label={copy.workspaceVoiceUnavailable} />
          ) : selectedChannel?.type === "TEXT" ? (
            <ChannelMessagesPreviewCard
              attachmentsFeature={attachmentsFeature}
              channel={selectedChannel}
              currentUserId={bootstrapState.payload.user.id}
              mediaState={mediaState}
              messageSearchFeature={messageSearchFeature}
              messageSearchState={messageSearchState}
              sendState={channelSendState}
              state={channelMessagesState}
              onClearMessageSearch={onClearMessageSearch}
              onClearSelectedMediaAsset={onClearSelectedMediaAsset}
              onRetry={onRefreshChannel}
              onRequestDocumentPicker={onRequestDocumentPicker}
              onSearchMessages={onSearchMessages}
              onSendMessage={onSendChannelMessage}
            />
          ) : (
            <Text style={styles.contractDescription}>{copy.workspaceSelectChannel}</Text>
          )}
        </>
      ) : null}
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
                  <StatusChip label={`${channel.unreadCount} ${copy.unreadSuffix}`} tone="accent" />
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
