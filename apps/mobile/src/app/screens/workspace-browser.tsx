import {
  ActivityIndicator,
  Ionicons,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  copy,
  filterMobileWorkspaceChannelSections,
  formatMobileUnreadCount,
  getBoundedMobileList,
  getMobileWorkspaceChannelSections,
  getMobileWorkspaceChannelSurface,
  getMobileWorkspaceChannels,
  getVisibleMobileWorkspaceChannelSections,
  MOBILE_RENDER_LIMITS,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type MobileBootstrapFeature,
  type MobileBootstrapPayload,
  type MobileBootstrapViewState,
  type MobileChannelMessagesViewState,
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
import type { ChatMessage, UploadedAttachmentInput } from "@wizards/types";
import { useMobileServerManagementFeature } from "../features/use-mobile-server-management-feature";
import { MobileServerCreateJoinSheet } from "../../workspace/mobile-server-create-join-sheet";
import {
  MobileWorkspaceCreateSheets,
  type MobileWorkspaceCreateState,
} from "../../workspace/mobile-workspace-create-sheets";
import { MobileInviteSheet } from "../../invite/mobile-invite-sheet";
import { useMobileAuth } from "../../auth/mobile-auth-context";
import { useMobileVoiceStatesQuery } from "../../query/mobile-voice-states-query";
import { ChannelChatBootSkeleton, MobileChannelChatScreen } from "./channel-screen";
import {
  MobileMentionRegistryProvider,
  useMobileServerMentionRegistry,
} from "../mobile-mention-registry";
import { MobileProfileCardScope } from "../../social/profile-card";
import { AvatarMark } from "../components/ui-atoms";
import { useTheme } from "../providers/mobile-theme-provider";
import { useMobileWorkspaceLayoutPreference } from "../providers/mobile-workspace-layout-provider";
import { useHomeScreenStyles } from "./home-screen.styles";
import { WorkspaceChannelSectionList } from "./workspace-channel-section-list";
import {
  MobileServerRailAddButton,
  MobileWorkspaceCreateFab,
} from "./workspace-add-action-buttons";
import { MobileWorkspaceServerSwitcherSheet } from "./mobile-workspace-server-switcher-sheet";
import { useMobileCollapsedSections } from "../providers/use-mobile-collapsed-sections";
import { useInfiniteQuery } from "@tanstack/react-query";
import {
  buildMobileCollapsedSectionKey,
  getMobileMissedNotifications,
  getMobileOtherServersUnreadTotal,
  getMobileServerBadge,
  getMobileVoiceParticipantTotal,
} from "../mobile-sunucular-model";
import { getMobileNotificationsQueryOptions } from "../../notifications/mobile-notification-query";
import { EmptyState, Skeleton } from "../components/kit";
import { MobileLineIcon } from "../../design/mobile-line-icons";
import { mobileNavigationRef } from "../../navigation/mobile-navigation-ref";
import type { MobileChannelTypingUser } from "../../realtime/mobile-typing-state";
import type {
  MobileForwardSendInput,
  MobileForwardTarget,
} from "../components/message-forward-sheet";

export function MobileWorkspaceBrowser({
  attachmentsFeature,
  bootstrapState,
  canRenderChannelChat = false,
  channelMessagesState,
  channelTypingLabel,
  channelTypingUsers,
  isReactionMutationPending,
  locale,
  mediaState,
  messageSearchFeature,
  messageSearchState,
  activeWorkspaceTextChannelId,
  activeWorkspaceVoiceChannelId,
  selectedChannelId,
  selectedServerId,
  serverState,
  onClearMessageSearch,
  onClearSelectedMediaAsset,
  onCloseWorkspaceChannel,
  onLoadMoreChannelMessages,
  onOpenChannel,
  onOpenServer,
  onRefreshChannel,
  onRefreshServer,
  onRequestDocumentPicker,
  onRequestPhotoLibraryPicker,
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
  channelFirstUnreadMessageId = null,
  channelPinnedMessages = [],
}: {
  attachmentsFeature: MobileBootstrapFeature | null;
  /**
   * Only the pushed ChannelChat route may render the chat. The overview tab
   * shares the same active-channel state, so without this gate both surfaces
   * mounted the channel at once: the tab swapped to it on the tap frame, then
   * the stack screen slid a second copy of it over the top. That double mount
   * is what showed the messages for an instant before the channel "opened".
   */
  canRenderChannelChat?: boolean;
  channelFirstUnreadMessageId?: string | null;
  channelPinnedMessages?: readonly ChatMessage[];
  bootstrapState: MobileBootstrapViewState & {
    payload: MobileBootstrapPayload;
    status: "ready";
  };
  channelMessagesState: MobileChannelMessagesViewState;
  channelTypingLabel: string | null;
  channelTypingUsers: readonly MobileChannelTypingUser[];
  isReactionMutationPending: boolean;
  locale: MobileLocale;
  mediaState: MobileMediaRuntimeState;
  messageSearchFeature: MobileBootstrapFeature | null;
  messageSearchState: MobileMessageSearchViewState;
  activeWorkspaceTextChannelId: string | null;
  activeWorkspaceVoiceChannelId: string | null;
  selectedChannelId: string | null;
  selectedServerId: string | null;
  serverState: MobileWorkspaceServerViewState;
  onClearMessageSearch(): void;
  onClearSelectedMediaAsset(): void;
  onCloseWorkspaceChannel(): void;
  onLoadMoreChannelMessages(): void;
  onOpenChannel(channel: MobileWorkspaceChannelSummary): void;
  onOpenServer(serverId: string): void;
  onRefreshChannel(): void;
  onRefreshServer(): void;
  onRequestDocumentPicker(): Promise<void>;
  onRequestPhotoLibraryPicker(): Promise<void>;
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
  const theme = useTheme();
  const { layout: workspaceLayout } = useMobileWorkspaceLayoutPreference();
  const { apiClient, getAccessToken } = useMobileAuth();
  const [channelQuery, setChannelQuery] = useState("");
  const { collapsedSections, toggleSection: toggleCollapsedSection } = useMobileCollapsedSections();
  const [isInviteSheetOpen, setInviteSheetOpen] = useState(false);
  const [isServerSwitcherOpen, setServerSwitcherOpen] = useState(false);
  const [createState, setCreateState] = useState<MobileWorkspaceCreateState>(null);
  const [pendingCreatedChannelId, setPendingCreatedChannelId] = useState<string | null>(null);
  const [isChannelSearchOpen, setChannelSearchOpen] = useState(false);
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
  const voiceParticipantTotal = getMobileVoiceParticipantTotal(voiceStates);
  const otherServersUnreadTotal = getMobileOtherServersUnreadTotal(servers, activeServerId);
  // "Kaçırdıkların" for the 1c sheet: only fetched while the switcher is open.
  const missedNotificationsQuery = useInfiniteQuery({
    ...getMobileNotificationsQueryOptions(apiClient),
    enabled: isServerSwitcherOpen,
  });
  const missedNotifications = getMobileMissedNotifications(
    missedNotificationsQuery.data?.pages.flatMap((page) => page.notifications) ?? [],
    { limit: 3 },
  );
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
  const activeChannelSurface = getMobileWorkspaceChannelSurface(activeTextChannel, {
    isExplicitlyOpened: activeTextChannel?.id === activeWorkspaceTextChannelId,
  });
  // 10a: only an open channel needs the roster, so the members query stays idle
  // on the server browser. It shares the members screen cache key.
  const mentionRegistry = useMobileServerMentionRegistry({
    apiClient,
    currentUserId: bootstrapState.payload.user.id,
    currentUsername: bootstrapState.payload.user.username,
    enabled: activeChannelSurface === "channel-chat",
    serverId: activeServerId,
  });
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
  // 8b forward targets: every text channel the member can currently see in
  // the active server; DM targets are provided by the messages tab instead.
  const forwardChannelTargets = useMemo<readonly MobileForwardTarget[]>(() => {
    if (!workspacePayload) return [];
    const channels = [
      ...workspacePayload.detail.categories.flatMap((category) => category.channels),
      ...workspacePayload.detail.ungroupedChannels,
    ];
    return channels
      .filter((channel) => channel.type === "TEXT")
      .map((channel) => ({ id: channel.id, label: `#${channel.name}`, type: "channel" as const }));
  }, [workspacePayload]);
  const visibleChannelSections = useMemo(() => {
    const collapsedMap = Object.fromEntries(
      channelSections.map((section) => [
        section.id,
        isSearchingChannels || !activeServerId
          ? false
          : collapsedSections[buildMobileCollapsedSectionKey(activeServerId, section.id)] === true,
      ]),
    );

    return getVisibleMobileWorkspaceChannelSections(channelSections, collapsedMap);
  }, [activeServerId, channelSections, collapsedSections, isSearchingChannels]);
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
  const canManageMessages = workspacePayload?.detail.capabilities.canManageMessages === true;
  const canManageServer = workspacePayload?.detail.capabilities.canManageServer === true;
  const canManageChannels = workspacePayload?.detail.capabilities.canManageChannels === true;
  // The detail payload no longer carries the member list. `ownerUserId` is the
  // authoritative field; the member scan stays as a fallback so a client running
  // against an older API keeps resolving the owner.
  const ownerUserId =
    workspacePayload?.detail.server.ownerUserId ??
    workspacePayload?.detail.members.find((member) => member.accessLevel === "OWNER")?.userId ??
    null;
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

      toggleCollapsedSection(buildMobileCollapsedSectionKey(activeServerId, sectionId));
    },
    [activeServerId, isSearchingChannels, toggleCollapsedSection],
  );
  // 2a/2b: the header invite icon (1a) and the compact header button (1b) now
  // open the "Davet et" sheet. Sharing the link directly moved inside it, so
  // the entry points no longer mint an invite on tap.
  const handleOpenInviteSheet = useCallback(() => {
    if (!activeServerId) {
      return;
    }

    setInviteSheetOpen(true);
  }, [activeServerId]);

  // 1e: once the created channel lands in the refreshed workspace payload, open
  // it (text → chat, voice → room) so the form's success flow ends on the channel.
  useEffect(() => {
    if (!pendingCreatedChannelId || !workspacePayload) {
      return;
    }

    const createdChannel = getMobileWorkspaceChannels(workspacePayload.detail).find(
      (channel) => channel.id === pendingCreatedChannelId,
    );
    if (createdChannel) {
      setPendingCreatedChannelId(null);
      onOpenChannel(createdChannel);
    }
  }, [onOpenChannel, pendingCreatedChannelId, workspacePayload]);

  if (canRenderChannelChat && !(activeChannelSurface === "channel-chat" && activeTextChannel)) {
    // The route is the channel, so never fall back to the server browser here:
    // hold the chat frame until the detail read names the channel.
    return <ChannelChatBootSkeleton onBack={onCloseWorkspaceChannel} />;
  }

  if (canRenderChannelChat && activeTextChannel) {
    return (
      // 11b: everything opened from this channel — message avatars, the reaction
      // sheet — gets the server as profile-card context, which is what makes the
      // role chips appear.
      <MobileProfileCardScope serverId={activeServerId ?? undefined}>
        <MobileMentionRegistryProvider registry={mentionRegistry}>
          <MobileChannelChatScreen
            attachmentsFeature={attachmentsFeature}
            channel={activeTextChannel}
            canModerate={canManageMessages}
            channelFirstUnreadMessageId={channelFirstUnreadMessageId}
            channelPinnedMessages={channelPinnedMessages}
            currentUserId={bootstrapState.payload.user.id}
            getAccessToken={getAccessToken}
            isReactionMutationPending={isReactionMutationPending}
            mediaState={mediaState}
            memberCount={activeMemberCount}
            mentionCandidates={mentionRegistry.candidates}
            onlineMemberCount={activeOnlineMemberCount}
            messageSearchFeature={messageSearchFeature}
            messageSearchState={messageSearchState}
            serverName={activeServerName}
            state={channelMessagesState}
            typingLabel={channelTypingLabel}
            typingUsers={channelTypingUsers}
            ownerUserId={ownerUserId}
            onBack={onCloseWorkspaceChannel}
            onClearMessageSearch={onClearMessageSearch}
            onClearSelectedMediaAsset={onClearSelectedMediaAsset}
            onDraftChange={onChannelDraftChange}
            onLoadMore={onLoadMoreChannelMessages}
            onRefresh={onRefreshChannel}
            onRequestDocumentPicker={onRequestDocumentPicker}
            onRequestPhotoLibraryPicker={onRequestPhotoLibraryPicker}
            onSearchMessages={onSearchMessages}
            onSendMessage={onSendChannelMessage}
            {...(onSendChannelGif ? { onSendGif: onSendChannelGif } : {})}
            onDeleteMessage={onDeleteMessage}
            onDiscardMessage={onDiscardMessage}
            onEditMessage={onEditMessage}
            {...(onForwardMessage
              ? { forwardTargets: forwardChannelTargets, onForwardMessage }
              : {})}
            {...(onOpenThread ? { onOpenThread } : {})}
            {...(onPinMessage ? { onPinMessage } : {})}
            onOpenMembers={() => {
              if (activeServerId && mobileNavigationRef.isReady()) {
                mobileNavigationRef.navigate("ServerMembers", { serverId: activeServerId });
              }
            }}
            onRetryMessage={onRetryMessage}
            onToggleMessageReaction={onToggleMessageReaction}
          />
        </MobileMentionRegistryProvider>
      </MobileProfileCardScope>
    );
  }

  // "N üye · N kanal · ● N seste" from live data. 1a hangs it under the title as
  // its own row (the header buttons would otherwise crush it); 1b nests it in the
  // server pill and drops the channel count, exactly like the handoff.
  const serverMeta = (
    <View
      style={[
        styles.mobileWorkspaceMetaRow,
        !isCompactWorkspaceLayout && styles.mobileWorkspaceMetaRowRail,
      ]}
    >
      <Text
        style={[
          styles.mobileWorkspaceMeta,
          isCompactWorkspaceLayout && styles.mobileWorkspaceMetaCompact,
        ]}
      >
        {activeMemberCount} {copy.membersSuffix}
      </Text>
      {!isCompactWorkspaceLayout ? (
        <>
          <Text style={styles.mobileWorkspaceMetaSep}>·</Text>
          <Text style={styles.mobileWorkspaceMeta}>
            {activeChannelCount} {copy.channelsSuffix}
          </Text>
        </>
      ) : null}
      {voiceParticipantTotal > 0 ? (
        <>
          <Text style={styles.mobileWorkspaceMetaSep}>·</Text>
          <View style={styles.mobileWorkspaceVoiceMeta}>
            <View style={styles.mobileWorkspaceVoiceMetaDot} />
            <Text style={styles.mobileWorkspaceVoiceMetaText}>
              {voiceParticipantTotal} {copy.workspaceInVoiceSuffix}
            </Text>
          </View>
        </>
      ) : null}
    </View>
  );

  return (
    <View
      style={[
        styles.workspaceBrowserShell,
        isCompactWorkspaceLayout && styles.workspaceBrowserShellCompact,
      ]}
    >
      {!isCompactWorkspaceLayout ? (
        <View style={styles.mobileServerRail}>
          {/* The rail holds up to MOBILE_RENDER_LIMITS.servers entries, so the list
              scrolls vertically. The add (+) used to trail the last server inside that
              scroller, which pushed it off-screen for members of many servers; it now
              sits in a pinned footer below a divider and stays one tap away. */}
          <ScrollView
            contentContainerStyle={styles.mobileServerRailList}
            showsVerticalScrollIndicator={false}
            style={styles.mobileServerRailScroll}
          >
            {servers.map((server) => {
              const isActive = server.id === activeServerId;
              const badge = getMobileServerBadge(server);

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
                  <View style={styles.mobileServerRailAvatarWrap}>
                    <AvatarMark
                      avatarBorderRadius={16}
                      avatarBorderWidth={0}
                      dimension={44}
                      imageUrl={server.iconUrl}
                      label={server.shortName ?? server.name}
                      size="regular"
                    />
                    {badge.kind === "mention" ? (
                      <Text style={styles.mobileServerRailBadge}>
                        {formatMobileUnreadCount(badge.count)}
                      </Text>
                    ) : badge.kind === "unread" ? (
                      <View style={styles.mobileServerRailUnreadDot} />
                    ) : null}
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
          <View style={styles.mobileServerRailFooter}>
            {servers.length > 0 ? <View style={styles.mobileServerRailDivider} /> : null}
            <MobileServerRailAddButton
              accessibilityLabel={copy.workspaceAddServerAction}
              highlighted={servers.length === 0}
              onPress={serverManagement.openCreateJoinSheet}
              testID="mobile-server-add-open"
            />
          </View>
        </View>
      ) : null}

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
                  isCompactWorkspaceLayout
                    ? styles.mobileWorkspaceHeader
                    : styles.mobileWorkspaceHeaderRail,
                  isCompactWorkspaceLayout && styles.mobileWorkspaceHeaderCompact,
                  pressed && styles.compactListRowPressed,
                ]}
                testID="mobile-workspace-server-switcher-open"
              >
                {isCompactWorkspaceLayout ? (
                  <View style={styles.mobileWorkspaceHeaderAvatarWrap}>
                    <AvatarMark
                      avatarBorderRadius={14}
                      avatarBorderWidth={0}
                      dimension={38}
                      fallbackTextStyle={styles.mobileWorkspaceHeaderAvatarFallback}
                      imageUrl={activeServerIconUrl}
                      label={activeServerShortName}
                      size="regular"
                    />
                    {otherServersUnreadTotal > 0 ? (
                      <Text style={styles.mobileWorkspaceHeaderAvatarBadge}>
                        {formatMobileUnreadCount(otherServersUnreadTotal)}
                      </Text>
                    ) : null}
                  </View>
                ) : null}
                {isCompactWorkspaceLayout ? (
                  // 1b: the pill stacks name over meta; 1a puts meta on its own row.
                  <View style={styles.mobileWorkspaceHeaderText}>
                    <Text
                      style={[styles.mobileWorkspaceTitle, styles.mobileWorkspaceTitleCompact]}
                      numberOfLines={1}
                    >
                      {activeServerName}
                    </Text>
                    {serverMeta}
                  </View>
                ) : (
                  <Text style={styles.mobileWorkspaceTitle} numberOfLines={1}>
                    {activeServerName}
                  </Text>
                )}
                {isActiveServerLoading ? (
                  <ActivityIndicator color={theme.accent.strong} size="small" />
                ) : (
                  <MobileLineIcon
                    color={theme.text.visualSecondary}
                    name="chevron-down"
                    size={isCompactWorkspaceLayout ? 18 : 16}
                  />
                )}
              </Pressable>
              {!isCompactWorkspaceLayout ? (
                <Pressable
                  accessibilityLabel={copy.workspaceChannelSearchPlaceholder}
                  accessibilityRole="button"
                  hitSlop={6}
                  onPress={() => {
                    const next = !isChannelSearchOpen;
                    setChannelSearchOpen(next);
                    if (!next) {
                      setChannelQuery("");
                    }
                  }}
                  style={({ pressed }) => [
                    styles.mobileWorkspaceHeaderIconButton,
                    pressed && styles.compactListRowPressed,
                  ]}
                  testID="mobile-workspace-search-toggle"
                >
                  <MobileLineIcon color={theme.accent.default} name="search" size={16} />
                </Pressable>
              ) : null}
              {canManageInvites ? (
                <Pressable
                  accessibilityLabel={copy.inviteSheetTitle}
                  accessibilityRole="button"
                  hitSlop={6}
                  onPress={handleOpenInviteSheet}
                  style={({ pressed }) => [
                    isCompactWorkspaceLayout
                      ? styles.mobileWorkspaceCompactAddButton
                      : styles.mobileWorkspaceHeaderIconButton,
                    pressed && styles.compactListRowPressed,
                  ]}
                  testID={`mobile-server-invite-share-${activeServerId}`}
                >
                  <MobileLineIcon
                    color={theme.accent.default}
                    name="invite-user"
                    size={isCompactWorkspaceLayout ? 18 : 16}
                  />
                </Pressable>
              ) : null}
              {/* 1a (rail) and 1b (compact) both need the settings entry — it used to be
                  gated on the compact layout, so the default rail layout had no way in. */}
              {activeServerId && (canManageServer || canManageInvites) ? (
                <Pressable
                  accessibilityLabel={copy.workspaceServerSettingsAction}
                  accessibilityRole="button"
                  hitSlop={6}
                  onPress={() => {
                    if (mobileNavigationRef.isReady()) {
                      mobileNavigationRef.navigate("ServerSettings", { serverId: activeServerId });
                    }
                  }}
                  style={({ pressed }) => [
                    isCompactWorkspaceLayout
                      ? styles.mobileWorkspaceCompactAddButton
                      : styles.mobileWorkspaceHeaderIconButton,
                    pressed && styles.compactListRowPressed,
                  ]}
                  testID={`mobile-server-settings-open-${activeServerId}`}
                >
                  <Ionicons
                    name="settings-outline"
                    size={isCompactWorkspaceLayout ? 18 : 16}
                    color={theme.accent.default}
                  />
                </Pressable>
              ) : null}
              {!isCompactWorkspaceLayout && canManageChannels ? (
                <Pressable
                  accessibilityLabel={copy.workspaceCreateMenuTitle}
                  accessibilityRole="button"
                  hitSlop={6}
                  onPress={() => setCreateState({ categoryId: null, kind: "menu" })}
                  style={({ pressed }) => [
                    styles.mobileWorkspaceCreateButton,
                    pressed && styles.compactListRowPressed,
                  ]}
                  testID="mobile-workspace-create-open"
                >
                  <Ionicons name="add" size={17} color={theme.text.onPrimary} />
                </Pressable>
              ) : null}
            </View>
            {!isCompactWorkspaceLayout ? serverMeta : null}
            {isActiveServerLoading ? (
              <View style={styles.mobileWorkspaceSearchRow} testID="mobile-workspace-loading">
                <Skeleton height={48} />
                <Skeleton height={48} />
                <Skeleton height={48} />
              </View>
            ) : null}

            {isCompactWorkspaceLayout || isChannelSearchOpen || channelQuery.trim().length > 0 ? (
              <View
                style={[
                  styles.mobileWorkspaceSearchRow,
                  isCompactWorkspaceLayout && styles.mobileWorkspaceSearchRowCompact,
                ]}
              >
                <View style={styles.mobileWorkspaceSearchBox}>
                  <MobileLineIcon color={theme.text.visualPlaceholder} name="search" size={18} />
                  <TextInput
                    accessibilityLabel={copy.workspaceChannelSearchPlaceholder}
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoFocus={!isCompactWorkspaceLayout && isChannelSearchOpen}
                    clearButtonMode="while-editing"
                    onChangeText={setChannelQuery}
                    placeholder={copy.workspaceChannelSearchPlaceholder}
                    placeholderTextColor={theme.text.visualPlaceholder}
                    returnKeyType="search"
                    style={styles.mobileWorkspaceSearchInput}
                    value={channelQuery}
                  />
                </View>
              </View>
            ) : null}

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
                  canCreateChannels={canManageChannels}
                  onOpenChannel={onOpenChannel}
                  onToggleSection={handleToggleSection}
                  onCreateInSection={(sectionId) =>
                    setCreateState({
                      categoryId: sectionId === "ungrouped" ? null : sectionId,
                      kind: "menu",
                    })
                  }
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
        {isCompactWorkspaceLayout && canManageChannels && servers.length > 0 ? (
          <MobileWorkspaceCreateFab
            accessibilityLabel={copy.workspaceCreateMenuTitle}
            onPress={() => setCreateState({ categoryId: null, kind: "menu" })}
            testID="mobile-workspace-create-fab"
          />
        ) : null}
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
        missedNotifications={missedNotifications}
        onClose={() => setServerSwitcherOpen(false)}
        onOpenCreateJoin={serverManagement.openCreateJoinSheet}
        onOpenServer={handleServerPress}
        onSeeAllMissed={() => {
          if (mobileNavigationRef.isReady()) {
            mobileNavigationRef.navigate("MainTabs", { screen: "notifications" });
          }
        }}
        open={isServerSwitcherOpen}
        servers={servers}
      />
      <MobileWorkspaceCreateSheets
        detail={workspacePayload?.detail ?? null}
        onChangeState={setCreateState}
        onChannelCreated={setPendingCreatedChannelId}
        serverId={activeServerId}
        serverName={activeServerName}
        state={createState}
      />
      <MobileInviteSheet
        canManageServer={canManageServer}
        onClose={() => setInviteSheetOpen(false)}
        onOpenInviteManagement={() => {
          setInviteSheetOpen(false);
          if (activeServerId && mobileNavigationRef.isReady()) {
            mobileNavigationRef.navigate("ServerInvites", { serverId: activeServerId });
          }
        }}
        open={isInviteSheetOpen && canManageInvites}
        serverId={activeServerId}
        serverName={activeServerName}
      />
    </View>
  );
}
