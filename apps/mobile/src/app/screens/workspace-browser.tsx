import {
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
  resolveMobileActiveTextChannel,
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
import { Share } from "react-native";
import type { ChatMessage, ServerNotificationLevel, UploadedAttachmentInput } from "@wizards/types";
import { useMobileServerManagementFeature } from "../features/use-mobile-server-management-feature";
import { useMobileChannelTypingLabels } from "../features/use-mobile-typing-labels";
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
import { useMobileWorkspaceFilter } from "../providers/use-mobile-workspace-filter";
import { useMobileServerUserSettings } from "../../query/use-mobile-server-user-settings";
import { useInfiniteQuery } from "@tanstack/react-query";
import {
  buildMobileCollapsedSectionKey,
  collectMobileLiveVoiceChannelIds,
  filterMobileWorkspaceSections,
  getMobileMissedNotifications,
  getMobileOtherServersUnreadTotal,
  getMobileServerBadge,
  getMobileVoiceParticipantTotal,
  getMobileWorkspaceUnreadChannelCount,
  hasMobileWorkspaceLiveVoice,
  sortMobileServersByStar,
} from "../mobile-sunucular-model";
import { WorkspaceFilterStrip } from "./workspace-filter-strip";
import { WorkspaceHeaderRow } from "./workspace-header-row";
import { WorkspaceServerMenuSheet } from "./workspace-server-menu-sheet";
import {
  useMobileServerMessageSearchQuery,
  WorkspaceMessageSearchResults,
} from "./workspace-message-search-results";
import {
  MobileWorkspaceEditorSheets,
  type MobileWorkspaceEditorState,
} from "../../workspace/mobile-workspace-editor-sheets";
import { getMobileNotificationsQueryOptions } from "../../notifications/mobile-notification-query";
import { Button, DestructiveConfirmationSheet, EmptyState, Skeleton } from "../components/kit";
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
  channelAnchorMessageId = null,
  channelFirstUnreadMessageId = null,
  isViewingChannelHistory = false,
  onExitChannelHistory,
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
  /** A search hit opens the channel at this message instead of at its tail. */
  channelAnchorMessageId?: string | null;
  channelFirstUnreadMessageId?: string | null;
  isViewingChannelHistory?: boolean;
  onExitChannelHistory?(): void;
  channelPinnedMessages?: readonly ChatMessage[];
  bootstrapState: MobileBootstrapViewState & {
    payload: MobileBootstrapPayload;
    status: "ready";
  };
  channelMessagesState: MobileChannelMessagesViewState;
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
  const [isServerMenuOpen, setServerMenuOpen] = useState(false);
  const [isLeaveConfirmOpen, setLeaveConfirmOpen] = useState(false);
  const [createState, setCreateState] = useState<MobileWorkspaceCreateState>(null);
  const [editorState, setEditorState] = useState<MobileWorkspaceEditorState>(null);
  const [pendingCreatedChannelId, setPendingCreatedChannelId] = useState<string | null>(null);
  const [isChannelSearchOpen, setChannelSearchOpen] = useState(false);
  const workspaceFilter = useMobileWorkspaceFilter(bootstrapState.payload.user.id);
  const serverManagement = useMobileServerManagementFeature({
    client: apiClient,
    onOpenServer,
  });
  // 6c: the rail is ordered `starred desc` over whatever order the bootstrap
  // produced. The bound is applied first — starring must not smuggle a 51st
  // server past the render limit, only reorder the ones already drawn.
  const servers = useMemo(
    () =>
      sortMobileServersByStar(
        getBoundedMobileList(
          bootstrapState.payload.home.servers.recent,
          MOBILE_RENDER_LIMITS.servers,
        ),
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
  // 6c reads its three toggles and the invite address straight off the rail
  // summary — opening the menu costs no request (04 §A0.3).
  const activeServerInviteAddress = activeServerSummary?.inviteAddress ?? null;
  const isActiveServerMuted = activeServerSummary?.muted ?? false;
  const isActiveServerStarred = activeServerSummary?.starred ?? false;
  const activeServerNotificationLevel: ServerNotificationLevel =
    activeServerSummary?.notificationLevel ?? "all";
  const serverUserSettings = useMobileServerUserSettings(apiClient, activeServerId);
  const voiceStatesQuery = useMobileVoiceStatesQuery(apiClient, activeServerId ?? "");
  // Memoized because the live-voice set below keys off it: `?? []` alone hands
  // out a new empty array on every render and defeats every memo under it.
  const voiceStates = useMemo(() => voiceStatesQuery.data?.states ?? [], [voiceStatesQuery.data]);
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
  // The detail read stays authoritative, but the chat no longer waits for it:
  // the message stream returns the summary for the channel it answered for, and
  // that is enough to draw the frame the reader tapped into.
  const activeTextChannel = resolveMobileActiveTextChannel({
    activeChannelId: activeWorkspaceTextChannelId,
    detailChannels: workspacePayload ? getMobileWorkspaceChannels(workspacePayload.detail) : [],
    streamChannel:
      channelMessagesState.channelId === activeWorkspaceTextChannelId
        ? (channelMessagesState.payload?.channel ?? null)
        : null,
  });
  const activeChannelSurface = getMobileWorkspaceChannelSurface(activeTextChannel, {
    isExplicitlyOpened: activeTextChannel?.id === activeWorkspaceTextChannelId,
  });
  // Read where it is drawn, not carried down from the product root: a typing
  // event in a channel nobody has open must not re-render the app.
  const { channelTypingLabel, channelTypingUsers } = useMobileChannelTypingLabels(
    activeWorkspaceTextChannelId,
  );
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
  // A0.2: one set per render, shared by the filter, the strip's live-voice dot
  // and the rows — `collectLiveVoiceChannelIds` used to run twice per render.
  const liveVoiceChannelIds = useMemo(
    () => collectMobileLiveVoiceChannelIds(voiceStates),
    [voiceStates],
  );
  const activeFilter = workspaceFilter.filter(activeServerId ?? "");
  // A0.1: the "all" path returns the same array, so this memo hands FlashList a
  // stable reference on every presence tick.
  const filteredChannelSections = useMemo(
    () => filterMobileWorkspaceSections(channelSections, activeFilter, liveVoiceChannelIds),
    [activeFilter, channelSections, liveVoiceChannelIds],
  );
  const unreadChannelCount = useMemo(
    () => getMobileWorkspaceUnreadChannelCount(channelSections),
    [channelSections],
  );
  const hasLiveVoice = useMemo(
    () => hasMobileWorkspaceLiveVoice(channelSections, liveVoiceChannelIds),
    [channelSections, liveVoiceChannelIds],
  );
  // Computed before the collapse pass empties a folded category's channels —
  // afterwards there is nothing left to look at.
  const unreadSectionIds = useMemo(
    () =>
      new Set(
        filteredChannelSections
          .filter((section) =>
            section.channels.some((channel) => channel.unreadCount > 0 || channel.mentionCount > 0),
          )
          .map((section) => section.id),
      ),
    [filteredChannelSections],
  );
  const visibleChannelSections = useMemo(() => {
    const collapsedMap = Object.fromEntries(
      filteredChannelSections.map((section) => [
        section.id,
        isSearchingChannels || !activeServerId
          ? false
          : collapsedSections[buildMobileCollapsedSectionKey(activeServerId, section.id)] === true,
      ]),
    );

    return getVisibleMobileWorkspaceChannelSections(filteredChannelSections, collapsedMap);
  }, [activeServerId, collapsedSections, filteredChannelSections, isSearchingChannels]);
  // 6b: the box searches channel names locally and message content through the
  // server-wide endpoint, which is what the placeholder promises.
  const messageSearchQuery = useMobileServerMessageSearchQuery(
    apiClient,
    activeServerId ?? "",
    channelQuery,
  );
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
  // One handler for every discover entry (create/join sheet, switcher sheet, and
  // the zero-server empty state) so a new surface cannot ship a second, subtly
  // different route into the same screen.
  const openDiscover = useCallback(() => {
    if (mobileNavigationRef.isReady()) {
      mobileNavigationRef.navigate("Discover");
    }
  }, []);
  // 2a/2b: the header invite icon (1a) and the compact header button (1b) now
  // open the "Davet et" sheet. Sharing the link directly moved inside it, so
  // the entry points no longer mint an invite on tap.
  const handleOpenInviteSheet = useCallback(() => {
    if (!activeServerId) {
      return;
    }

    setInviteSheetOpen(true);
  }, [activeServerId]);
  // 6c "Paylaş": the native sheet with the server's own address. The card is
  // not rendered without one, so there is nothing to guard against here.
  const handleShareServer = useCallback(() => {
    if (!activeServerInviteAddress) {
      return;
    }

    void Share.share({ message: activeServerInviteAddress }).catch(() => undefined);
  }, [activeServerInviteAddress]);
  // 6c: the server refuses an owner's leave, so the row is hidden rather than
  // shown and answered with a 400.
  const canLeaveActiveServer =
    activeServerId !== null &&
    workspacePayload !== null &&
    ownerUserId !== bootstrapState.payload.user.id;
  const handleLeaveServer = useCallback(async () => {
    if (!activeServerId) {
      return;
    }

    // Pick the replacement *before* the membership goes away: after the
    // bootstrap refetch this server is no longer in the list to skip over.
    const nextServerId = servers.find((server) => server.id !== activeServerId)?.id ?? null;
    await serverManagement.leaveServer({ nextServerId, serverId: activeServerId });
    setLeaveConfirmOpen(false);
  }, [activeServerId, serverManagement, servers]);
  // 6a B3: the category "+" is gone, so renaming and deleting a category live
  // behind a long press on its header — through the existing editor sheet, not
  // a second editing surface. Reordering is not offered: there is no drag
  // affordance in this phase.
  const handleEditSection = useCallback(
    (sectionId: string, sectionName: string) => {
      if (!canManageChannels || sectionId === "ungrouped") {
        return;
      }

      setEditorState({ categoryId: sectionId, initialName: sectionName, kind: "category-edit" });
    },
    [canManageChannels],
  );
  // A message hit opens the channel it lives in: the chat surface is entered by
  // channel, and jumping to a specific message id is not a route this app has.
  /**
   * A hit opens its channel *at that message*: the route carries the message id
   * and the transcript loads the window around it. `onOpenChannel` still runs —
   * it owns the selection, typing and read state — the navigate only adds the
   * anchor the pushed screen reads.
   */
  const handleOpenSearchResult = useCallback(
    (result: { readonly channelId?: string | null | undefined; readonly messageId: string }) => {
      if (!workspacePayload || !result.channelId || !activeServerId) {
        return;
      }

      const channel = getMobileWorkspaceChannels(workspacePayload.detail).find(
        (entry) => entry.id === result.channelId,
      );
      if (!channel) {
        return;
      }

      onOpenChannel(channel);
      if (mobileNavigationRef.isReady()) {
        mobileNavigationRef.navigate("ChannelChat", {
          channelId: channel.id,
          messageId: result.messageId,
          serverId: activeServerId,
        });
      }
    },
    [activeServerId, onOpenChannel, workspacePayload],
  );

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
            channelAnchorMessageId={channelAnchorMessageId}
            channelFirstUnreadMessageId={channelFirstUnreadMessageId}
            isViewingChannelHistory={isViewingChannelHistory}
            {...(onExitChannelHistory ? { onExitChannelHistory } : {})}
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
                      avatarBorderRadius={theme.workspace.railAvatarRadius}
                      avatarBorderWidth={0}
                      dimension={theme.workspace.railAvatarSize}
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
              action={
                // A user with no servers cannot reach discover from the rail's
                // create/join sheet without knowing the sheet holds it.
                <Button
                  icon="compass-outline"
                  label={copy.workspaceServerDiscoverAction}
                  onPress={openDiscover}
                  testID="mobile-workspace-empty-discover"
                  variant="primary"
                />
              }
              description={copy.homePrimaryServerEmpty}
              icon="server-outline"
              title={copy.homeNoServers}
            />
          </View>
        ) : (
          <>
            <WorkspaceHeaderRow
              isLoading={isActiveServerLoading}
              layout={workspaceLayout}
              meta={serverMeta}
              onOpenMenu={() => setServerMenuOpen(true)}
              onOpenSwitcher={() => setServerSwitcherOpen(true)}
              onToggleSearch={
                isCompactWorkspaceLayout
                  ? undefined
                  : () => {
                      const next = !isChannelSearchOpen;
                      setChannelSearchOpen(next);
                      if (!next) {
                        setChannelQuery("");
                      }
                    }
              }
              otherServersUnreadTotal={otherServersUnreadTotal}
              serverIconUrl={activeServerIconUrl}
              serverName={activeServerName}
              serverShortName={activeServerShortName}
            />
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
                  <MobileLineIcon color={theme.text.visualPlaceholder} name="search" size={15} />
                  <TextInput
                    accessibilityLabel={copy.workspaceChannelSearchPlaceholderExpanded}
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoFocus={!isCompactWorkspaceLayout && isChannelSearchOpen}
                    clearButtonMode="while-editing"
                    onChangeText={setChannelQuery}
                    placeholder={copy.workspaceChannelSearchPlaceholderExpanded}
                    placeholderTextColor={theme.text.visualPlaceholder}
                    returnKeyType="search"
                    style={styles.mobileWorkspaceSearchInput}
                    value={channelQuery}
                  />
                </View>
              </View>
            ) : null}

            {/* The strip filters the list the user is looking at; while a search
                is running the two labelled result sections replace it. */}
            {!isSearchingChannels && activeServerId ? (
              <WorkspaceFilterStrip
                filter={activeFilter}
                hasLiveVoice={hasLiveVoice}
                onChange={(next) => workspaceFilter.setFilter(activeServerId, next)}
                unreadChannelCount={unreadChannelCount}
              />
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
                {isSearchingChannels ? (
                  <Text style={styles.mobileWorkspaceSearchSectionLabel}>
                    {copy.workspaceSearchChannelsSection}
                  </Text>
                ) : null}
                <WorkspaceChannelSectionList
                  layout={workspaceLayout}
                  sections={visibleChannelSections}
                  selectedChannelId={selectedChannelId}
                  unreadSectionIds={unreadSectionIds}
                  voiceStates={voiceStates}
                  isCollapseDisabled={isSearchingChannels}
                  canEditCategories={canManageChannels}
                  onOpenChannel={onOpenChannel}
                  onToggleSection={handleToggleSection}
                  onEditSection={handleEditSection}
                />
                {channelQuery.trim().length > 0 && channelSections.length === 0 ? (
                  <Text style={styles.contractDescription}>
                    {copy.workspaceNoChannelSearchResults}
                  </Text>
                ) : null}
                {isSearchingChannels ? (
                  <WorkspaceMessageSearchResults
                    isLoading={messageSearchQuery.isLoading}
                    onOpenResult={handleOpenSearchResult}
                    results={messageSearchQuery.data?.results ?? []}
                  />
                ) : null}
                {workspacePayload.detail.hasMoreChannels ? (
                  <Text style={styles.workspaceHint}>{copy.workspaceMoreChannelsHidden}</Text>
                ) : null}
              </>
            ) : null}
          </>
        )}
        {/* 6a/6b: the one create entry left. Rendered only for a channel manager
            — 00 §2 forbids a disabled control standing in for a missing one. */}
        {canManageChannels && servers.length > 0 ? (
          <MobileWorkspaceCreateFab
            accessibilityLabel={copy.workspaceCreateMenuTitle}
            label={copy.workspaceCreateChannelFab}
            layout={workspaceLayout}
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
        onOpenDiscover={openDiscover}
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
        onOpenDiscover={openDiscover}
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
      {activeServerId ? (
        <WorkspaceServerMenuSheet
          canManageInvites={canManageInvites}
          canManageServer={canManageServer}
          canLeaveServer={canLeaveActiveServer}
          inviteAddress={activeServerInviteAddress}
          isMuted={isActiveServerMuted}
          isStarred={isActiveServerStarred}
          memberCount={activeMemberCount}
          notificationLevel={activeServerNotificationLevel}
          onSelectNotificationLevel={(level) =>
            serverUserSettings.update({ notificationLevel: level })
          }
          onShare={handleShareServer}
          onToggleMute={(next) => serverUserSettings.update({ muted: next })}
          onToggleStar={(next) => serverUserSettings.update({ starred: next })}
          serverIconUrl={activeServerIconUrl}
          serverShortName={activeServerShortName}
          onClose={() => setServerMenuOpen(false)}
          onLeave={() => {
            setServerMenuOpen(false);
            setLeaveConfirmOpen(true);
          }}
          onOpenInvite={() => {
            setServerMenuOpen(false);
            handleOpenInviteSheet();
          }}
          onOpenMembers={() => {
            setServerMenuOpen(false);
            if (mobileNavigationRef.isReady()) {
              mobileNavigationRef.navigate("ServerMembers", { serverId: activeServerId });
            }
          }}
          onOpenProfile={() => {
            setServerMenuOpen(false);
            if (mobileNavigationRef.isReady()) {
              mobileNavigationRef.navigate("ServerProfile", { serverId: activeServerId });
            }
          }}
          onOpenSettings={() => {
            setServerMenuOpen(false);
            if (mobileNavigationRef.isReady()) {
              mobileNavigationRef.navigate("ServerSettings", { serverId: activeServerId });
            }
          }}
          open={isServerMenuOpen}
          serverId={activeServerId}
          serverName={activeServerName}
        />
      ) : null}
      {activeServerId ? (
        <DestructiveConfirmationSheet
          body={copy.serverMenuLeaveBody.replace("{server}", activeServerName)}
          busy={serverManagement.isLeavingServer}
          confirmLabel={copy.serverMenuLeave}
          icon="log-out-outline"
          onCancel={() => setLeaveConfirmOpen(false)}
          onConfirm={handleLeaveServer}
          open={isLeaveConfirmOpen}
          testID="mobile-server-leave-confirm"
          title={copy.serverMenuLeave}
        />
      ) : null}
      {workspacePayload && activeServerId ? (
        <MobileWorkspaceEditorSheets
          detail={workspacePayload.detail}
          editor={editorState}
          onClose={() => setEditorState(null)}
          serverId={activeServerId}
        />
      ) : null}
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
