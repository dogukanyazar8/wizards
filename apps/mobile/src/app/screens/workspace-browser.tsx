import {
  ActivityIndicator,
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
import type { UploadedAttachmentInput } from "@wizards/types";
import { useMobileServerManagementFeature } from "../features/use-mobile-server-management-feature";
import { MobileServerCreateJoinSheet } from "../../workspace/mobile-server-create-join-sheet";
import { shareMobileInviteUrl } from "../../invite/mobile-invite-share";
import { useMobileAuth } from "../../auth/mobile-auth-context";
import { useMobileVoiceStatesQuery } from "../../query/mobile-voice-states-query";
import { MobileChannelChatScreen } from "./channel-screen";
import { AvatarMark } from "../components/ui-atoms";
import { useTheme } from "../providers/mobile-theme-provider";
import { useMobileWorkspaceLayoutPreference } from "../providers/mobile-workspace-layout-provider";
import { MobileVoiceChannelScreen } from "./voice-screen";
import { useHomeScreenStyles } from "./home-screen.styles";
import { WorkspaceChannelSectionList } from "./workspace-channel-section-list";
import { MobileWorkspaceServerSwitcherSheet } from "./mobile-workspace-server-switcher-sheet";
import { EmptyState, Skeleton } from "../components/kit";
import { MobileLineIcon } from "../../design/mobile-line-icons";
import { mobileNavigationRef } from "../../navigation/mobile-navigation-ref";
import type { MobileChannelTypingUser } from "../../realtime/mobile-typing-state";

export function MobileWorkspaceBrowser({
  attachmentsFeature,
  bootstrapState,
  channelMessagesState,
  channelSendState,
  channelTypingLabel,
  channelTypingUsers,
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
  onFlipVoiceCamera,
  onRefreshVoiceDevices,
  onSelectVoiceAudioInput,
  onSelectVoiceAudioOutputDevice,
  onSelectVoiceAudioOutput,
  onSelectVoiceNoiseSuppression,
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
  channelTypingUsers: readonly MobileChannelTypingUser[];
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
  onFlipVoiceCamera(): Promise<void>;
  onRefreshVoiceDevices(): Promise<void>;
  onSelectVoiceAudioInput(id: string): Promise<void>;
  onSelectVoiceAudioOutputDevice(id: string): Promise<void>;
  onSelectVoiceAudioOutput(mode: MobileVoiceAudioOutputMode): Promise<void>;
  onSelectVoiceNoiseSuppression(enabled: boolean): Promise<void>;
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
    intent?: {
      readonly attachments?: readonly UploadedAttachmentInput[];
      readonly replyToId?: string;
      readonly threadParentId?: string;
    },
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
  const { layout: workspaceLayout } = useMobileWorkspaceLayoutPreference();
  const { apiClient, getAccessToken } = useMobileAuth();
  const [channelQuery, setChannelQuery] = useState("");
  const [collapsedSectionIds, setCollapsedSectionIds] = useState<Record<string, boolean>>({});
  const [inviteShareError, setInviteShareError] = useState<string | null>(null);
  const [isServerSwitcherOpen, setServerSwitcherOpen] = useState(false);
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
  const voiceStatesQuery = useMobileVoiceStatesQuery(apiClient, activeServerId ?? "");
  const voiceStates = voiceStatesQuery.data?.states ?? [];
  const activeMemberCount = activeServer?.memberCount ?? activeServerSummary?.memberCount ?? 0;
  const activeOnlineMemberCount = activeServer?.onlineMemberCount ?? 0;
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
  const isCompactWorkspaceLayout = workspaceLayout === "compact";
  const canManageInvites = workspacePayload?.detail.capabilities.canManageInvites === true;
  const canManageServer = workspacePayload?.detail.capabilities.canManageServer === true;
  const ownerUserId =
    workspacePayload?.detail.members.find((member) => member.accessLevel === "OWNER")?.userId ?? null;
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
        getAccessToken={getAccessToken}
        isReactionMutationPending={isReactionMutationPending}
        mediaState={mediaState}
        memberCount={activeMemberCount}
        onlineMemberCount={activeOnlineMemberCount}
        messageSearchFeature={messageSearchFeature}
        messageSearchState={messageSearchState}
        sendState={channelSendState}
        serverName={activeServerName}
        state={channelMessagesState}
        typingLabel={channelTypingLabel}
        typingUsers={channelTypingUsers}
        ownerUserId={ownerUserId}
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
        onOpenMembers={() => {
          if (activeServerId && mobileNavigationRef.isReady()) {
            mobileNavigationRef.navigate("ServerMembers", { serverId: activeServerId });
          }
        }}
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
        onFlipCamera={onFlipVoiceCamera}
        onLeave={onLeaveWorkspaceVoiceChannel}
        onRefreshVoiceDevices={onRefreshVoiceDevices}
        onSelectAudioInput={onSelectVoiceAudioInput}
        onSelectAudioOutputDevice={onSelectVoiceAudioOutputDevice}
        onSelectAudioOutput={onSelectVoiceAudioOutput}
        onSelectNoiseSuppression={onSelectVoiceNoiseSuppression}
        onSendInvite={onSendVoiceInvite}
        onToggleCamera={onToggleVoiceCamera}
        onToggleMute={onToggleVoiceMute}
        onToggleScreenShare={onToggleVoiceScreenShare}
      />
    );
  }

  return (
    <View
      style={[
        styles.workspaceBrowserShell,
        isCompactWorkspaceLayout && styles.workspaceBrowserShellCompact,
      ]}
    >
      {!isCompactWorkspaceLayout ? <View style={styles.mobileServerRail}>
        <View style={styles.mobileServerRailList}>
          {servers.map((server) => {
            const isActive = server.id === activeServerId;
            const unreadCount = server.unreadCount;

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
                {isActive ? <View style={styles.mobileServerRailActiveIndicator} /> : null}
                <AvatarMark
                  avatarBorderRadius={16}
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
      </View> : null}

      <View
        style={[
          styles.mobileWorkspacePanel,
          isCompactWorkspaceLayout && styles.mobileWorkspacePanelCompact,
        ]}
      >
        {servers.length === 0 ? (
          <View style={styles.mobileWorkspaceEmpty} testID="mobile-workspace-empty">
            <EmptyState
              description={copy.homePrimaryServerEmpty}
              icon="server-outline"
              title={copy.homeNoServers}
            />
          </View>
        ) : (
          <>
            <View style={styles.mobileWorkspaceHeaderRow}>
              <Pressable
                accessibilityLabel={copy.openWorkspaceServerAction}
                accessibilityRole="button"
                onPress={() => setServerSwitcherOpen(true)}
                style={({ pressed }) => [
                  styles.mobileWorkspaceHeader,
                  isCompactWorkspaceLayout && styles.mobileWorkspaceHeaderCompact,
                  pressed && styles.compactListRowPressed,
                ]}
                testID="mobile-workspace-server-switcher-open"
              >
                {isCompactWorkspaceLayout ? (
                  <AvatarMark
                    avatarBorderRadius={15}
                    avatarBorderWidth={0}
                    fallbackTextStyle={styles.mobileWorkspaceHeaderAvatarFallback}
                    imageUrl={activeServerIconUrl}
                    label={activeServerShortName}
                    size="regular"
                  />
                ) : null}
                <View style={styles.mobileWorkspaceHeaderText}>
                  <Text style={styles.mobileWorkspaceTitle} numberOfLines={1}>
                    {activeServerName}
                  </Text>
                  <Text style={styles.mobileWorkspaceMeta} numberOfLines={1}>
                    {activeMemberCount} {copy.membersSuffix} · {activeChannelCount}{" "}
                    {copy.channelsSuffix}
                  </Text>
                </View>
                {isActiveServerLoading ? (
                  <ActivityIndicator color={theme.accent.strong} size="small" />
                ) : (
                  <MobileLineIcon
                    color={theme.text.visualSecondary}
                    name="chevron-down"
                    size={20}
                  />
                )}
              </Pressable>
              {isCompactWorkspaceLayout && canManageInvites ? (
                <Pressable
                  accessibilityLabel={copy.workspaceServerInviteShareAction}
                  accessibilityRole="button"
                  disabled={serverManagement.busy}
                  onPress={() => void handleInviteShare()}
                  style={({ pressed }) => [
                    styles.mobileWorkspaceCompactAddButton,
                    pressed && styles.compactListRowPressed,
                  ]}
                  testID={`mobile-server-invite-share-${activeServerId}`}
                >
                  <MobileLineIcon
                    color={theme.accent.default}
                    name="invite-user"
                    size={20}
                  />
                </Pressable>
              ) : null}
              {isCompactWorkspaceLayout && canManageServer && activeServerId ? (
                <Pressable
                  accessibilityLabel={copy.workspaceServerSettingsAction}
                  accessibilityRole="button"
                  onPress={() => {
                    if (mobileNavigationRef.isReady()) {
                      mobileNavigationRef.navigate("ServerSettings", { serverId: activeServerId });
                    }
                  }}
                  style={({ pressed }) => [
                    styles.mobileWorkspaceCompactAddButton,
                    pressed && styles.compactListRowPressed,
                  ]}
                  testID={`mobile-server-settings-open-${activeServerId}`}
                >
                  <Ionicons name="settings-outline" size={20} color={theme.accent.default} />
                </Pressable>
              ) : null}
            </View>
            {isActiveServerLoading ? (
              <View style={styles.mobileWorkspaceSearchRow} testID="mobile-workspace-loading">
                <Skeleton height={48} />
                <Skeleton height={48} />
                <Skeleton height={48} />
              </View>
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

            <View
              style={[
                styles.mobileWorkspaceSearchRow,
                isCompactWorkspaceLayout && styles.mobileWorkspaceSearchRowCompact,
              ]}
            >
              <View style={styles.mobileWorkspaceSearchBox}>
                <MobileLineIcon color={theme.text.visualPlaceholder} name="search" size={18} />
                <TextInput
                  accessibilityLabel={
                    isCompactWorkspaceLayout
                      ? copy.workspaceChannelSearchPlaceholder
                      : copy.workspaceSearchPlaceholder
                  }
                  autoCapitalize="none"
                  autoCorrect={false}
                  clearButtonMode="while-editing"
                  onChangeText={setChannelQuery}
                  placeholder={
                    isCompactWorkspaceLayout
                      ? copy.workspaceChannelSearchPlaceholder
                      : copy.workspaceSearchPlaceholder
                  }
                    placeholderTextColor={theme.text.visualPlaceholder}
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
                  layout={workspaceLayout}
                  sections={visibleChannelSections}
                  selectedChannelId={selectedChannelId}
                  voiceStates={voiceStates}
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
      <MobileWorkspaceServerSwitcherSheet
        activeServerId={activeServerId}
        onClose={() => setServerSwitcherOpen(false)}
        onOpenCreateJoin={serverManagement.openCreateJoinSheet}
        onOpenServer={handleServerPress}
        open={isServerSwitcherOpen}
        servers={servers}
      />
    </View>
  );
}
