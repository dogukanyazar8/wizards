import {
  ActivityIndicator,
  Image,
  Ionicons,
  Pressable,
  Text,
  TextInput,
  View,
  copy,
  filterMobileWorkspaceChannelSections,
  getBoundedMobileList,
  getMobileVoiceInviteCandidates,
  getMobileWorkspaceChannelSections,
  getMobileWorkspaceChannelSurface,
  getMobileWorkspaceChannels,
  getVisibleMobileWorkspaceChannelSections,
  MOBILE_RENDER_LIMITS,
  useCallback,
  useMemo,
  useState,
  whisprIcon,
  type MobileBootstrapFeature,
  type MobileBootstrapPayload,
  type MobileBootstrapViewState,
  type MobileChannelMessagesViewState,
  type MobileChannelSendViewState,
  type MobileLocale,
  type MobileMediaRuntimeState,
  type MobileMessageSearchViewState,
  type MobilePushToTalkPhase,
  type MobileVoiceAudioOutputMode,
  type MobileVoiceInputMode,
  type MobileVoiceInviteSendState,
  type MobileVoiceRoomState,
  type MobileWorkspaceChannelSummary,
  type MobileWorkspaceServerViewState,
} from "../mobile-root-screen-shared";
import { useMobileServerManagementFeature } from "../features/use-mobile-server-management-feature";
import { MobileServerCreateJoinSheet } from "../../workspace/mobile-server-create-join-sheet";
import { shareMobileInviteUrl } from "../../invite/mobile-invite-share";
import { useMobileAuth } from "../../auth/mobile-auth-context";
import { MobileChannelChatScreen } from "./channel-screen";
import { AvatarMark } from "../components/ui-atoms";
import { useTheme } from "../providers/mobile-theme-provider";
import { MobileVoiceChannelScreen } from "./voice-screen";
import { useHomeScreenStyles } from "./home-screen.styles";
import { WorkspaceChannelSectionList } from "./workspace-channel-section-list";

export function MobileWorkspaceBrowser({
  attachmentsFeature,
  bootstrapState,
  channelMessagesState,
  channelSendState,
  channelTypingLabel,
  isReactionMutationPending,
  locale,
  mediaState,
  messageSearchFeature,
  messageSearchState,
  voiceInputMode,
  voicePushToTalkPhase,
  voiceRoomState,
  activeWorkspaceTextChannelId,
  activeWorkspaceVoiceChannelId,
  selectedChannelId,
  selectedServerId,
  serverState,
  onClearMessageSearch,
  onClearSelectedMediaAsset,
  onCloseWorkspaceChannel,
  onCloseWorkspaceVoiceChannel,
  onLeaveWorkspaceVoiceChannel,
  onOpenChannel,
  onOpenServer,
  onRefreshChannel,
  onRefreshServer,
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
  onSendChannelGif,
  onDeleteMessage,
  onEditMessage,
  onOpenThread,
  onToggleMessageReaction,
  onSendVoiceInvite,
}: {
  attachmentsFeature: MobileBootstrapFeature | null;
  bootstrapState: MobileBootstrapViewState & {
    payload: MobileBootstrapPayload;
    status: "ready";
  };
  channelMessagesState: MobileChannelMessagesViewState;
  channelSendState: MobileChannelSendViewState;
  channelTypingLabel: string | null;
  isReactionMutationPending: boolean;
  locale: MobileLocale;
  mediaState: MobileMediaRuntimeState;
  messageSearchFeature: MobileBootstrapFeature | null;
  messageSearchState: MobileMessageSearchViewState;
  voiceInputMode: MobileVoiceInputMode;
  voicePushToTalkPhase: MobilePushToTalkPhase;
  voiceRoomState: MobileVoiceRoomState;
  activeWorkspaceTextChannelId: string | null;
  activeWorkspaceVoiceChannelId: string | null;
  selectedChannelId: string | null;
  selectedServerId: string | null;
  serverState: MobileWorkspaceServerViewState;
  onClearMessageSearch(): void;
  onClearSelectedMediaAsset(): void;
  onCloseWorkspaceChannel(): void;
  onCloseWorkspaceVoiceChannel(): void;
  onLeaveWorkspaceVoiceChannel(): Promise<void>;
  onOpenChannel(channel: MobileWorkspaceChannelSummary): void;
  onOpenServer(serverId: string): void;
  onRefreshChannel(): void;
  onRefreshServer(): void;
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
  onSendChannelMessage(
    content: string,
    intent?: { readonly replyToId?: string; readonly threadParentId?: string },
  ): Promise<boolean>;
  onSendChannelGif?(gifId: string): Promise<boolean>;
  onDeleteMessage(messageId: string): Promise<boolean>;
  onEditMessage(input: { content: string; messageId: string }): Promise<boolean>;
  onOpenThread?(messageId: string): void;
  onToggleMessageReaction(input: { emoji: string; messageId: string; shouldReact: boolean }): void;
  onSendVoiceInvite(targetUserId: string): void;
}) {
  const styles = useHomeScreenStyles();
  const theme = useTheme();
  const { apiClient } = useMobileAuth();
  const [channelQuery, setChannelQuery] = useState("");
  const [collapsedSectionIds, setCollapsedSectionIds] = useState<Record<string, boolean>>({});
  const [inviteShareError, setInviteShareError] = useState<string | null>(null);
  const serverManagement = useMobileServerManagementFeature({
    client: apiClient,
    onOpenServer,
  });
  const servers = useMemo(
    () =>
      getBoundedMobileList(
        bootstrapState.payload.home.servers.recent,
        MOBILE_RENDER_LIMITS.servers,
      ),
    [bootstrapState.payload.home.servers.recent],
  );
  const activeServerId = selectedServerId ?? servers[0]?.id ?? null;
  const activeServerSummary =
    servers.find((server) => server.id === activeServerId) ?? servers[0] ?? null;
  const workspacePayload = serverState.serverId === activeServerId ? serverState.payload : null;
  const activeServer = workspacePayload?.detail.server ?? null;
  const activeServerName = activeServer?.name ?? activeServerSummary?.name ?? copy.overviewTitle;
  const activeServerShortName =
    activeServer?.shortName ?? activeServerSummary?.shortName ?? activeServerName;
  const activeServerIconUrl = activeServer?.iconUrl ?? activeServerSummary?.iconUrl ?? null;
  const activeMemberCount = activeServer?.memberCount ?? activeServerSummary?.memberCount ?? 0;
  const activeChannelCount =
    activeServer?.visibleChannelCount ?? activeServerSummary?.channelCount ?? 0;
  const activeTextChannel =
    workspacePayload && activeWorkspaceTextChannelId
      ? (getMobileWorkspaceChannels(workspacePayload.detail).find(
          (channel) => channel.id === activeWorkspaceTextChannelId && channel.type === "TEXT",
        ) ?? null)
      : null;
  const activeVoiceChannel =
    workspacePayload && activeWorkspaceVoiceChannelId
      ? (getMobileWorkspaceChannels(workspacePayload.detail).find(
          (channel) => channel.id === activeWorkspaceVoiceChannelId && channel.type === "VOICE",
        ) ?? null)
      : null;
  const activeChannelSurface = getMobileWorkspaceChannelSurface(activeTextChannel, {
    isExplicitlyOpened: activeTextChannel?.id === activeWorkspaceTextChannelId,
  });
  const activeVoiceChannelSurface = getMobileWorkspaceChannelSurface(activeVoiceChannel, {
    isExplicitlyOpened: activeVoiceChannel?.id === activeWorkspaceVoiceChannelId,
  });
  const voiceInviteCandidates = useMemo(() => {
    if (!workspacePayload) {
      return [];
    }

    return getMobileVoiceInviteCandidates({
      currentUserId: bootstrapState.payload.user.id,
      members: workspacePayload.detail.members,
      participants: voiceRoomState.participants,
    });
  }, [bootstrapState.payload.user.id, voiceRoomState.participants, workspacePayload]);
  const channelSections = useMemo(() => {
    if (!workspacePayload) {
      return [];
    }

    return filterMobileWorkspaceChannelSections(
      getMobileWorkspaceChannelSections(workspacePayload.detail, {
        ungrouped: copy.workspaceOtherChannelsLabel,
      }),
      channelQuery,
    );
  }, [channelQuery, workspacePayload]);
  const isSearchingChannels = channelQuery.trim().length > 0;
  const visibleChannelSections = useMemo(() => {
    const collapsedMap = Object.fromEntries(
      channelSections.map((section) => [
        section.id,
        isSearchingChannels
          ? false
          : collapsedSectionIds[`${activeServerId}:${section.id}`] === true,
      ]),
    );

    return getVisibleMobileWorkspaceChannelSections(channelSections, collapsedMap);
  }, [activeServerId, channelSections, collapsedSectionIds, isSearchingChannels]);
  const isActiveServerLoading =
    activeServerId !== null &&
    serverState.serverId === activeServerId &&
    serverState.status === "loading";
  const isActiveServerError =
    activeServerId !== null &&
    serverState.serverId === activeServerId &&
    serverState.status === "error";
  const canManageInvites = workspacePayload?.detail.capabilities.canManageInvites === true;
  const canUploadServerIcon = workspacePayload?.detail.capabilities.canUploadServerIcon === true;
  const handleServerPress = useCallback(
    (serverId: string) => {
      setChannelQuery("");
      onOpenServer(serverId);
    },
    [onOpenServer],
  );
  const handleToggleSection = useCallback(
    (sectionId: string) => {
      if (!activeServerId || isSearchingChannels) {
        return;
      }

      const sectionKey = `${activeServerId}:${sectionId}`;
      setCollapsedSectionIds((current) => ({
        ...current,
        [sectionKey]: current[sectionKey] !== true,
      }));
    },
    [activeServerId, isSearchingChannels],
  );
  const handleInviteShare = useCallback(async () => {
    if (!activeServerId) {
      return;
    }

    setInviteShareError(null);
    try {
      const response = await serverManagement.createInvite(activeServerId);
      await shareMobileInviteUrl(response.invite.shareUrl);
    } catch {
      setInviteShareError(copy.workspaceServerInviteShareFailed);
    }
  }, [activeServerId, serverManagement]);

  if (activeChannelSurface === "channel-chat" && activeTextChannel) {
    return (
      <MobileChannelChatScreen
        attachmentsFeature={attachmentsFeature}
        channel={activeTextChannel}
        currentUserId={bootstrapState.payload.user.id}
        isReactionMutationPending={isReactionMutationPending}
        mediaState={mediaState}
        memberCount={activeMemberCount}
        messageSearchFeature={messageSearchFeature}
        messageSearchState={messageSearchState}
        sendState={channelSendState}
        serverName={activeServerName}
        state={channelMessagesState}
        typingLabel={channelTypingLabel}
        onBack={onCloseWorkspaceChannel}
        onClearMessageSearch={onClearMessageSearch}
        onClearSelectedMediaAsset={onClearSelectedMediaAsset}
        onDraftChange={onChannelDraftChange}
        onRefresh={onRefreshChannel}
        onRequestDocumentPicker={onRequestDocumentPicker}
        onRequestPhotoLibraryPicker={onRequestPhotoLibraryPicker}
        onSearchMessages={onSearchMessages}
        onSendMessage={onSendChannelMessage}
        {...(onSendChannelGif ? { onSendGif: onSendChannelGif } : {})}
        onDeleteMessage={onDeleteMessage}
        onEditMessage={onEditMessage}
        {...(onOpenThread ? { onOpenThread } : {})}
        onToggleMessageReaction={onToggleMessageReaction}
      />
    );
  }

  if (activeVoiceChannelSurface === "voice-room" && activeVoiceChannel) {
    return (
      <MobileVoiceChannelScreen
        channel={activeVoiceChannel}
        memberCount={activeMemberCount}
        room={voiceRoomState}
        serverIconUrl={activeServerIconUrl}
        serverName={activeServerName}
        serverShortName={activeServerShortName}
        inviteCandidates={voiceInviteCandidates}
        inviteSendStates={voiceInviteSendStates}
        locale={locale}
        voiceInputMode={voiceInputMode}
        voicePushToTalkPhase={voicePushToTalkPhase}
        onBack={onCloseWorkspaceVoiceChannel}
        onBeginPushToTalk={onBeginVoicePushToTalk}
        onEndPushToTalk={onEndVoicePushToTalk}
        onLeave={onLeaveWorkspaceVoiceChannel}
        onSelectAudioOutput={onSelectVoiceAudioOutput}
        onSendInvite={onSendVoiceInvite}
        onToggleCamera={onToggleVoiceCamera}
        onToggleMute={onToggleVoiceMute}
        onToggleScreenShare={onToggleVoiceScreenShare}
      />
    );
  }

  return (
    <View style={styles.workspaceBrowserShell}>
      <View style={styles.mobileServerRail}>
        <Image
          accessibilityIgnoresInvertColors
          accessibilityLabel={copy.appTitle}
          source={whisprIcon}
          style={styles.mobileServerRailLogo}
        />
        <View style={styles.mobileServerRailDivider} />
        <View style={styles.mobileServerRailList}>
          {servers.map((server) => {
            const isActive = server.id === activeServerId;
            const unreadCount = isActive && activeServer ? activeServer.unreadCount : 0;

            return (
              <Pressable
                key={server.id}
                accessibilityRole="button"
                accessibilityLabel={`${copy.openWorkspaceServerAction}: ${server.name}`}
                accessibilityState={{ selected: isActive }}
                onPress={() => handleServerPress(server.id)}
                style={({ pressed }) => [
                  styles.mobileServerRailItem,
                  isActive && styles.mobileServerRailItemActive,
                  pressed && styles.compactListRowPressed,
                ]}
              >
                <AvatarMark
                  imageUrl={server.iconUrl}
                  label={server.shortName ?? server.name}
                  size="regular"
                />
                {unreadCount > 0 ? (
                  <Text style={styles.mobileServerRailBadge}>{Math.min(unreadCount, 99)}</Text>
                ) : null}
              </Pressable>
            );
          })}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copy.workspaceAddServerAction}
          accessibilityState={{ disabled: false }}
          onPress={serverManagement.openCreateJoinSheet}
          style={styles.mobileServerRailAddButton}
          testID="mobile-server-add-open"
        >
          <Ionicons name="add" size={22} color={theme.accent.strong} />
        </Pressable>
      </View>

      <View style={styles.mobileWorkspacePanel}>
        {servers.length === 0 ? (
          <View style={styles.mobileWorkspaceEmpty}>
            <Text style={styles.screenEyebrow}>{copy.overviewTitle}</Text>
            <Text style={styles.screenTitle}>{copy.homeNoServers}</Text>
            <Text style={styles.screenDescription}>{copy.homePrimaryServerEmpty}</Text>
          </View>
        ) : (
          <>
            <View style={styles.mobileWorkspaceHeader}>
              <AvatarMark
                imageUrl={activeServerIconUrl}
                label={activeServerShortName}
                size="large"
              />
              <View style={styles.mobileWorkspaceHeaderText}>
                <Text style={styles.mobileWorkspaceTitle} numberOfLines={1}>
                  {activeServerName}
                </Text>
                <Text style={styles.mobileWorkspaceMeta} numberOfLines={1}>
                  {activeMemberCount} {copy.membersSuffix} - {activeChannelCount}{" "}
                  {copy.channelsSuffix}
                </Text>
              </View>
              {isActiveServerLoading ? (
                <ActivityIndicator color={theme.accent.strong} size="small" />
              ) : (
                <Ionicons name="chevron-down" size={18} color={theme.text.muted} />
              )}
            </View>

            {canManageInvites ? (
              <Pressable
                accessibilityLabel={copy.workspaceServerInviteShareAction}
                accessibilityRole="button"
                disabled={serverManagement.busy}
                onPress={() => void handleInviteShare()}
                style={styles.retryButton}
                testID={`mobile-server-invite-share-${activeServerId}`}
              >
                <Text style={styles.retryButtonText}>{copy.workspaceServerInviteShareAction}</Text>
              </Pressable>
            ) : null}
            {canUploadServerIcon && activeServerId ? (
              <Pressable
                accessibilityLabel={copy.workspaceServerIconAction}
                accessibilityRole="button"
                disabled={serverManagement.busy}
                onPress={() => serverManagement.openServerIconUpload(activeServerId)}
                style={styles.retryButton}
                testID={`mobile-server-icon-edit-${activeServerId}`}
              >
                <Text style={styles.retryButtonText}>{copy.workspaceServerIconAction}</Text>
              </Pressable>
            ) : null}
            {inviteShareError ? (
              <Text
                accessibilityRole="alert"
                style={styles.errorText}
                testID="mobile-server-invite-share-error"
              >
                {inviteShareError}
              </Text>
            ) : null}

            <View style={styles.mobileWorkspaceSearchRow}>
              <View style={styles.mobileWorkspaceSearchBox}>
                <Ionicons name="search-outline" size={16} color={theme.text.soft} />
                <TextInput
                  accessibilityLabel={copy.workspaceSearchPlaceholder}
                  autoCapitalize="none"
                  autoCorrect={false}
                  clearButtonMode="while-editing"
                  onChangeText={setChannelQuery}
                  placeholder={copy.workspaceSearchPlaceholder}
                  placeholderTextColor={theme.text.soft}
                  returnKeyType="search"
                  style={styles.mobileWorkspaceSearchInput}
                  value={channelQuery}
                />
              </View>
            </View>

            {isActiveServerError ? (
              <View style={styles.dmErrorRow}>
                <Text style={styles.errorText}>{serverState.error}</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={copy.retryAction}
                  onPress={onRefreshServer}
                  style={({ pressed }) => [
                    styles.retryButton,
                    pressed && styles.actionButtonPressed,
                  ]}
                >
                  <Text style={styles.retryButtonText}>{copy.retryAction}</Text>
                </Pressable>
              </View>
            ) : null}

            {!workspacePayload && isActiveServerLoading ? (
              <Text style={styles.contractDescription}>{copy.workspaceLoading}</Text>
            ) : null}

            {workspacePayload ? (
              <>
                <WorkspaceChannelSectionList
                  sections={visibleChannelSections}
                  selectedChannelId={selectedChannelId}
                  isCollapseDisabled={isSearchingChannels}
                  onOpenChannel={onOpenChannel}
                  onToggleSection={handleToggleSection}
                />
                {channelQuery.trim().length > 0 && channelSections.length === 0 ? (
                  <Text style={styles.contractDescription}>
                    {copy.workspaceNoChannelSearchResults}
                  </Text>
                ) : null}
                {workspacePayload.detail.hasMoreChannels ? (
                  <Text style={styles.workspaceHint}>{copy.workspaceMoreChannelsHidden}</Text>
                ) : null}
              </>
            ) : null}
          </>
        )}
      </View>
      <MobileServerCreateJoinSheet
        busy={serverManagement.busy}
        error={null}
        onClose={serverManagement.closeCreateJoinSheet}
        onCreate={serverManagement.createServer}
        onJoin={serverManagement.joinServer}
        onServerReady={serverManagement.selectServer}
        onUploadServerIcon={serverManagement.uploadServerIcon}
        open={serverManagement.isCreateJoinSheetOpen}
        serverIconTargetId={serverManagement.serverIconTargetId}
      />
    </View>
  );
}
