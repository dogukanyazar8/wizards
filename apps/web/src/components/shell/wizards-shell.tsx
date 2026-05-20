"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, UserPlus, Users } from "lucide-react";
import React, { type CSSProperties } from "react";
import { useEffect, useMemo } from "react";
import type { WorkspaceServerDetail, WorkspaceServerSummary } from "@wizards/types";
import { useParams, usePathname, useRouter } from "next/navigation";
import { Button } from "@wizards/ui";
import { useShallow } from "zustand/react/shallow";
import { AppStartupScreen } from "@/components/app/app-startup-screen";
import { ChannelSidebar, UserProfileFooter } from "@/components/shell/channel-sidebar";
import { useI18n } from "@/components/providers/locale-provider";
import { MainChannelPanel } from "@/components/shell/main-channel-panel";
import { MobileDrawerTrigger, ServerRail } from "@/components/shell/server-rail";
import { ServerSettingsOverlay } from "@/components/shell/server-settings-overlay";
import { ServerMemberPanel } from "@/components/shell/server-member-panel";
import { WorkspaceModals } from "@/components/shell/workspace-modals";
import { ContextMenu, ContextMenuItem, ContextMenuSeparator } from "@/components/ui/context-menu";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { useSocket } from "@/hooks/use-socket";
import { useShellReadiness } from "@/hooks/use-shell-readiness";
import { useDMConversations } from "@/hooks/use-dm-conversations";
import { getMessagesQueryKey, type MessagePages } from "@/hooks/use-messages";
import { useAppearanceHydration } from "@/hooks/use-appearance-hydration";
import { usePresenceActivity } from "@/hooks/use-presence-activity";
import type { ShellReadinessRoute } from "@/lib/app-startup/readiness";
import type { NotificationSocketPayload, UserProfileUpdatedPayload } from "@/lib/socket/events";
import { useAppStore } from "@/lib/store";
import {
  addServerMemberRequest,
  applyServerUnreadCount,
  fetchWorkspaceServer,
  fetchWorkspaceServers,
  getServerHref,
  leaveServerRequest,
  WorkspaceClientError,
  workspaceQueryKeys,
} from "@/lib/workspace/client";
import { fetchLayoutSettings, settingsQueryKeys } from "@/lib/settings/client";
import { dmQueryKeys, type DMConversationsInfiniteData } from "@/lib/dm/client";
import { ICON_ONLY_SERVER_RAIL_WIDTH } from "@/lib/appearance";
import { isWhisprDesktopRuntime } from "@/lib/desktop/runtime";
import { useVoiceStore } from "@/store/voice-store";

type WizardsShellProps = {
  children?: React.ReactNode;
  currentUser: {
    id: string;
    avatarUrl?: string | null;
    displayName: string;
    status: "ONLINE" | "IDLE" | "DND" | "OFFLINE";
    username: string;
  };
  uploadthingEnabled: boolean;
};

function findActiveChannel(
  serverId: string | null,
  channelId: string | null,
  detail?: Awaited<ReturnType<typeof fetchWorkspaceServer>> | null,
) {
  if (!serverId || !channelId || !detail) {
    return null;
  }

  return (
    [
      ...detail.ungroupedChannels,
      ...detail.categories.flatMap((category) => category.channels),
    ].find((channel) => channel.id === channelId && channel.canAccess !== false) ?? null
  );
}

function getFirstTextChannelId(detail?: Awaited<ReturnType<typeof fetchWorkspaceServer>> | null) {
  if (!detail) {
    return null;
  }

  return (
    [
      ...detail.ungroupedChannels,
      ...detail.categories.flatMap((category) => category.channels),
    ].find((channel) => channel.type === "TEXT" && channel.canAccess !== false)?.id ?? null
  );
}

type AccountUpdatedEventPayload = Omit<UserProfileUpdatedPayload, "userId"> & {
  email?: string;
  id: string;
};

function patchMessageAuthors(
  current: MessagePages | undefined,
  profile: UserProfileUpdatedPayload,
): MessagePages | undefined {
  if (!current) {
    return current;
  }

  return {
    ...current,
    pages: current.pages.map((page) => ({
      ...page,
      messages: page.messages.map((message) =>
        message.author.id === profile.userId
          ? {
              ...message,
              author: {
                ...message.author,
                avatarUrl: profile.avatarUrl,
                customStatus: profile.customStatus,
                displayName: profile.displayName ?? profile.username,
                status: profile.status,
                username: profile.username,
              },
            }
          : message,
      ),
    })),
  };
}

function patchDMConversationParticipants(
  current: DMConversationsInfiniteData | undefined,
  profile: UserProfileUpdatedPayload,
): DMConversationsInfiniteData | undefined {
  if (!current) {
    return current;
  }

  return {
    ...current,
    pages: current.pages.map((page) => ({
      ...page,
      conversations: page.conversations.map((conversation) => ({
        ...conversation,
        participants: conversation.participants.map((participant) =>
          participant.userId === profile.userId
            ? {
                ...participant,
                avatarUrl: profile.avatarUrl,
                customStatus: profile.customStatus,
                displayName: profile.displayName ?? profile.username,
                presence: {
                  customStatus: profile.customStatus,
                  status: profile.status,
                },
                status: profile.status,
                username: profile.username,
              }
            : participant,
        ),
      })),
    })),
  };
}

function getServerIndexHref(server: WorkspaceServerSummary) {
  return server.defaultChannelId
    ? `/channels/${server.id}/${server.defaultChannelId}`
    : `/channels/${server.id}`;
}

function getWorkspaceFallbackHref(
  servers: WorkspaceServerSummary[],
  excludedServerId?: string | null,
) {
  const nextServer = servers.find((server) => server.id !== excludedServerId) ?? servers[0] ?? null;

  return nextServer ? getServerIndexHref(nextServer) : "/channels/@me";
}

function getActiveVoiceChannelIdForServer(
  serverId: string,
  activeVoiceRoute: { channelId: string | null; serverId: string | null },
) {
  return activeVoiceRoute.serverId === serverId ? activeVoiceRoute.channelId : null;
}

function getServerRestoreChannelId(
  server: WorkspaceServerSummary,
  lastChannelByServerId: Record<string, string>,
  activeVoiceRoute: { channelId: string | null; serverId: string | null },
  detail?: Awaited<ReturnType<typeof fetchWorkspaceServer>> | null,
) {
  const activeVoiceChannelId = getActiveVoiceChannelIdForServer(server.id, activeVoiceRoute);
  if (activeVoiceChannelId) {
    return activeVoiceChannelId;
  }

  if (!detail) {
    return lastChannelByServerId[server.id] ? null : (server.defaultChannelId ?? null);
  }

  const rememberedChannelId = lastChannelByServerId[server.id] ?? null;
  const rememberedChannel = findActiveChannel(server.id, rememberedChannelId, detail);
  if (rememberedChannel?.type === "TEXT") {
    return rememberedChannel.id;
  }

  const defaultChannel = findActiveChannel(server.id, server.defaultChannelId, detail);
  if (defaultChannel?.type === "TEXT") {
    return defaultChannel.id;
  }

  return getFirstTextChannelId(detail);
}

function getServerRestoreHref(
  server: WorkspaceServerSummary,
  lastChannelByServerId: Record<string, string>,
  activeVoiceRoute: { channelId: string | null; serverId: string | null },
  detail?: Awaited<ReturnType<typeof fetchWorkspaceServer>> | null,
) {
  const channelId = getServerRestoreChannelId(
    server,
    lastChannelByServerId,
    activeVoiceRoute,
    detail,
  );
  return channelId ? `/channels/${server.id}/${channelId}` : `/channels/${server.id}`;
}

function getPreferredServerChannelId(
  serverId: string,
  detail: Awaited<ReturnType<typeof fetchWorkspaceServer>> | null | undefined,
  lastChannelByServerId: Record<string, string>,
  activeVoiceRoute: { channelId: string | null; serverId: string | null },
) {
  if (!detail) {
    return null;
  }

  const activeVoiceChannelId = getActiveVoiceChannelIdForServer(serverId, activeVoiceRoute);
  const activeVoiceChannel = findActiveChannel(serverId, activeVoiceChannelId, detail);

  if (activeVoiceChannel?.type === "VOICE") {
    return activeVoiceChannel.id;
  }

  const rememberedChannelId = lastChannelByServerId[serverId] ?? null;
  const rememberedChannel = findActiveChannel(serverId, rememberedChannelId, detail);
  if (rememberedChannel?.type === "TEXT") {
    return rememberedChannel.id;
  }

  const defaultChannel = findActiveChannel(serverId, detail.server.defaultChannelId, detail);
  if (defaultChannel?.type === "TEXT") {
    return defaultChannel.id;
  }

  return getFirstTextChannelId(detail);
}

interface NavigationPanelProps {
  isMobile: boolean;
  activeServerId: string | null;
  activeChannelId: string | null;
  servers: Awaited<ReturnType<typeof fetchWorkspaceServers>>;
  dmUnreadCount: number;
  serversQueryLoading: boolean;
  serverDetailQueryData: Awaited<ReturnType<typeof fetchWorkspaceServer>> | undefined | null;
  serverDetailQueryLoading: boolean;
  currentUser: {
    id: string;
    avatarUrl?: string | null;
    displayName: string;
    status: "ONLINE" | "IDLE" | "DND" | "OFFLINE";
    username: string;
  };
  onNavigate: (href: string) => void;
  onPrefetch: (href: string) => void;
  onOpenCreateServer: () => void;
  onOpenServerContextMenu: (serverId: string, event: React.MouseEvent<HTMLButtonElement>) => void;
  onOpenSettings: () => void;
  onCurrentUserStatusChange: (status: "ONLINE" | "IDLE" | "DND" | "OFFLINE") => void;
  resolveServerHref: (server: WorkspaceServerSummary) => string;
  serverRailIconSize: number;
  serverRailWidth: number;
  isServerRailIconOnly: boolean;
  currentUserId: string;
  onExpandServerRail: () => void;
  onCollapseServerRail: () => void;
  onServerRailIconSizeChange: (size: number) => void;
  onServerRailWidthChange: (width: number) => void;
}

const NavigationPanel = React.memo(
  ({
    isMobile,
    activeServerId,
    activeChannelId,
    servers,
    dmUnreadCount,
    serversQueryLoading,
    serverDetailQueryData,
    serverDetailQueryLoading,
    currentUser,
    onNavigate,
    onPrefetch,
    onOpenCreateServer,
    onOpenServerContextMenu,
    onOpenSettings,
    onCurrentUserStatusChange,
    resolveServerHref,
    serverRailIconSize,
    serverRailWidth,
    isServerRailIconOnly,
    currentUserId,
    onExpandServerRail,
    onCollapseServerRail,
    onServerRailIconSizeChange,
    onServerRailWidthChange,
  }: NavigationPanelProps) => (
    <div
      className={
        isMobile ? "flex h-full min-w-0 flex-1 flex-col" : "hidden h-full min-w-0 flex-col md:flex"
      }
    >
      <div className="flex min-h-0 flex-1">
        <div
          className={
            isMobile
              ? "flex h-full w-[112px] shrink-0 [--server-rail-width:112px]"
              : "flex h-full shrink-0"
          }
        >
          <ServerRail
            activeServerId={activeServerId}
            currentUserId={currentUserId}
            dmUnreadCount={dmUnreadCount}
            iconSize={serverRailIconSize}
            isIconOnly={isServerRailIconOnly}
            loading={serversQueryLoading}
            onNavigate={onNavigate}
            onOpenCreateServer={onOpenCreateServer}
            onOpenServerContextMenu={onOpenServerContextMenu}
            onPrefetch={onPrefetch}
            resolveServerHref={resolveServerHref}
            onSetIconSize={onServerRailIconSizeChange}
            onSetExpanded={onExpandServerRail}
            onSetIconOnly={onCollapseServerRail}
            onSetWidth={onServerRailWidthChange}
            serverRailWidth={serverRailWidth}
            servers={servers}
          />
        </div>
        <div
          className={
            isMobile
              ? "flex min-w-0 max-w-[calc(100vw-112px)] flex-1 overflow-hidden"
              : "flex min-w-0 overflow-hidden"
          }
          style={isMobile ? undefined : { width: `var(--channel-sidebar-width)` }}
        >
          <ChannelSidebar
            activeChannelId={activeChannelId}
            currentUser={currentUser}
            detail={serverDetailQueryData ?? null}
            loading={Boolean(activeServerId) && serverDetailQueryLoading}
            onNavigate={onNavigate}
            onCurrentUserStatusChange={onCurrentUserStatusChange}
            onOpenSettings={onOpenSettings}
            onPrefetch={onPrefetch}
            showUserFooter={false}
          />
        </div>
      </div>
      <div
        className="border-t border-[hsl(var(--border)/0.78)] py-3 pl-3 pr-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:pb-3"
        data-notification-popup-anchor="controls-border"
      >
        <UserProfileFooter
          user={currentUser}
          onOpenAppearanceSettings={onOpenSettings}
          onStatusChange={onCurrentUserStatusChange}
        />
      </div>
    </div>
  ),
);

NavigationPanel.displayName = "NavigationPanel";

function MobileShellControls({
  canGoBack,
  onBack,
  onMenu,
}: {
  canGoBack: boolean;
  onBack: () => void;
  onMenu: () => void;
}) {
  const { t } = useI18n();

  return (
    <div className="flex items-center gap-2 md:hidden">
      {canGoBack ? (
        <button
          aria-label={t("common.back")}
          className="app-panel-soft text-app-foreground inline-flex h-11 w-11 items-center justify-center rounded-2xl border transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
          data-testid="mobile-shell-back-button"
          onClick={onBack}
          type="button"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
      ) : null}
      <MobileDrawerTrigger onClick={onMenu} />
    </div>
  );
}

function getAddMemberErrorKey(error: unknown) {
  if (!(error instanceof WorkspaceClientError)) {
    return "workspace.modal.addMemberError";
  }

  if (error.code === "USER_NOT_FOUND") {
    return "workspace.modal.addMemberErrorNotFound";
  }

  if (error.code === "ALREADY_MEMBER") {
    return "workspace.modal.addMemberErrorAlreadyMember";
  }

  if (error.code === "FORBIDDEN") {
    return "workspace.modal.addMemberErrorForbidden";
  }

  if (error.code === "VALIDATION_ERROR") {
    return "workspace.modal.addMemberErrorValidation";
  }

  return "workspace.modal.addMemberError";
}

export function WizardsShell({ children, currentUser, uploadthingEnabled }: WizardsShellProps) {
  const { t } = useI18n();
  const socket = useSocket();
  const appearanceHydratedFromHook = useAppearanceHydration();
  const params = useParams<{
    channelId?: string;
    serverId?: string;
  }>();
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [addMemberServer, setAddMemberServer] = React.useState<WorkspaceServerSummary | null>(null);
  const [addMemberUsername, setAddMemberUsername] = React.useState("");
  const [addMemberSuccess, setAddMemberSuccess] = React.useState<string | null>(null);
  const [currentUserSnapshot, setCurrentUserSnapshot] = React.useState(currentUser);
  const [currentUserStatus, setCurrentUserStatus] = React.useState(currentUser.status);
  const [isDesktopRuntime, setIsDesktopRuntime] = React.useState(false);
  const [socketConnected, setSocketConnected] = React.useState(socket.connected);
  const [leaveServerCandidate, setLeaveServerCandidate] =
    React.useState<WorkspaceServerSummary | null>(null);
  const {
    appearanceHydrated,
    closeServerContextMenu,
    closeServerSettings,
    channelSidebarWidth,
    forgetServerState,
    lastChannelByServerId,
    mobileSidebarOpen,
    openDeleteServerDialog,
    openInviteModal,
    openServerContextMenu,
    openServerModal,
    openServerSettings,
    persistedActiveArea,
    persistedActiveChannelId,
    persistedActiveServerId,
    serverRailCollapsed,
    serverRailIconSize,
    serverRailWidth,
    serverContextMenu,
    serverSettingsServerId,
    setActiveRoute,
    setServerRailCollapsed,
    setServerRailIconSize,
    setServerRailWidth,
    setMobileSidebarOpen,
    applyPersistedSettings,
  } = useAppStore(
    useShallow((state) => ({
      appearanceHydrated: state.appearanceHydrated,
      closeServerContextMenu: state.closeServerContextMenu,
      closeServerSettings: state.closeServerSettings,
      channelSidebarWidth: state.channelSidebarWidth,
      forgetServerState: state.forgetServerState,
      lastChannelByServerId: state.lastChannelByServerId,
      mobileSidebarOpen: state.mobileSidebarOpen,
      openDeleteServerDialog: state.openDeleteServerDialog,
      openInviteModal: state.openInviteModal,
      openServerContextMenu: state.openServerContextMenu,
      openServerModal: state.openServerModal,
      openServerSettings: state.openServerSettings,
      persistedActiveArea: state.activeArea,
      persistedActiveChannelId: state.activeChannelId,
      persistedActiveServerId: state.activeServerId,
      serverRailCollapsed: state.serverRailCollapsed,
      serverRailIconSize: state.serverRailIconSize,
      serverRailWidth: state.serverRailWidth,
      serverContextMenu: state.serverContextMenu,
      serverSettingsServerId: state.serverSettingsServerId,
      setActiveRoute: state.setActiveRoute,
      setServerRailCollapsed: state.setServerRailCollapsed,
      setServerRailIconSize: state.setServerRailIconSize,
      setServerRailWidth: state.setServerRailWidth,
      setMobileSidebarOpen: state.setMobileSidebarOpen,
      applyPersistedSettings: state.applyPersistedSettings,
    })),
  );
  const { activeVoiceChannelId, activeVoiceServerId } = useVoiceStore(
    useShallow((state) => ({
      activeVoiceChannelId: state.activeChannelId,
      activeVoiceServerId: state.serverId,
    })),
  );
  const activeVoiceRoute = useMemo(
    () => ({
      channelId: activeVoiceChannelId,
      serverId: activeVoiceServerId,
    }),
    [activeVoiceChannelId, activeVoiceServerId],
  );

  const layoutSettingsQuery = useQuery({
    queryKey: settingsQueryKeys.layout,
    queryFn: fetchLayoutSettings,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });
  const layoutSettings = layoutSettingsQuery.data;

  const dmConversationsQuery = useDMConversations(currentUserSnapshot.id);
  const dmConversations = dmConversationsQuery.conversations;

  const visibleCurrentUser = useMemo(
    () => ({
      ...currentUserSnapshot,
      status: currentUserStatus,
    }),
    [currentUserSnapshot, currentUserStatus],
  );
  usePresenceActivity({
    socket,
    status: currentUserStatus,
  });

  useEffect(() => {
    setIsDesktopRuntime(isWhisprDesktopRuntime());
  }, []);

  useEffect(() => {
    const handleConnect = () => setSocketConnected(true);
    const handleDisconnect = () => setSocketConnected(false);

    setSocketConnected(socket.connected);
    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
    };
  }, [socket]);

  useEffect(() => {
    setCurrentUserSnapshot(currentUser);
    setCurrentUserStatus(currentUser.status);
  }, [currentUser]);

  useEffect(() => {
    if (layoutSettings) {
      applyPersistedSettings(layoutSettings);
    }
  }, [layoutSettings, applyPersistedSettings]);

  const rawServerId =
    typeof params.serverId === "string" ? decodeURIComponent(params.serverId) : null;
  const activeServerId = rawServerId === "@me" ? null : rawServerId;
  const activeChannelId = typeof params.channelId === "string" ? params.channelId : null;
  const isChannelsRootRoute = pathname === "/channels";
  const isFriendsRoute =
    pathname === "/channels/@me" || (rawServerId === "@me" && !activeChannelId);
  const isDmRoute = rawServerId === "@me" && Boolean(activeChannelId);
  const isServerIndexRoute = Boolean(activeServerId && !activeChannelId);
  const isServerConversationRoute = Boolean(activeServerId && activeChannelId);
  // Settings routes use their own layout, so this shell only classifies channel surfaces.
  const shellReadinessRoute: ShellReadinessRoute = isDmRoute
    ? "dm-conversation"
    : isFriendsRoute
      ? "dm-list"
      : isServerConversationRoute
        ? "server-channel"
        : isServerIndexRoute
          ? "server-root"
          : "other";
  const isServerRailIconOnly = serverRailCollapsed;
  const displayServerRailWidth = isServerRailIconOnly
    ? ICON_ONLY_SERVER_RAIL_WIDTH
    : serverRailWidth;
  const showMobileBackButton = isDmRoute || isServerConversationRoute;

  useEffect(() => {
    if (!mobileSidebarOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileSidebarOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mobileSidebarOpen, setMobileSidebarOpen]);

  useEffect(() => {
    setMobileSidebarOpen(false);
  }, [pathname, setMobileSidebarOpen]);

  useEffect(() => {
    const refreshWorkspaceServers = () => {
      void queryClient.fetchQuery({
        queryFn: fetchWorkspaceServers,
        queryKey: workspaceQueryKeys.servers,
        staleTime: 0,
      });
    };

    const handleServerUnreadUpdate = (data: {
      mentionCount?: number;
      serverId: string;
      unreadCount: number;
    }) => {
      queryClient.setQueryData<WorkspaceServerSummary[] | undefined>(
        workspaceQueryKeys.servers,
        (current) =>
          applyServerUnreadCount(current, data.serverId, data.unreadCount, data.mentionCount),
      );

      queryClient.setQueryData<WorkspaceServerDetail | undefined>(
        workspaceQueryKeys.server(data.serverId),
        (current) =>
          current
            ? {
                ...current,
                server: {
                  ...current.server,
                  ...(data.mentionCount !== undefined ? { mentionCount: data.mentionCount } : {}),
                  unreadCount: data.unreadCount,
                },
              }
            : current,
      );

      void queryClient.invalidateQueries({
        queryKey: workspaceQueryKeys.server(data.serverId),
      });
    };

    const handleChannelMessagesStale = (data: {
      channelId: string;
      latestMessageId: string;
      serverId: string;
    }) => {
      void queryClient.invalidateQueries({
        exact: true,
        queryKey: getMessagesQueryKey("channel", data.channelId),
      });
    };

    const handleServerSettingsUpdated = (data: { serverId: string }) => {
      refreshWorkspaceServers();
      void queryClient.invalidateQueries({
        queryKey: workspaceQueryKeys.server(data.serverId),
      });

      if (data.serverId === activeServerId) {
        router.refresh();
      }
    };

    const handleServerMembershipAdded = (data: { serverId: string }) => {
      refreshWorkspaceServers();
      void queryClient.invalidateQueries({
        queryKey: workspaceQueryKeys.server(data.serverId),
      });
    };

    const handleNotificationNew = (notification: NotificationSocketPayload) => {
      if (notification.type !== "SERVER_INVITE") {
        return;
      }

      const serverId =
        typeof notification.metadata?.serverId === "string" ? notification.metadata.serverId : null;

      refreshWorkspaceServers();

      if (serverId) {
        void queryClient.invalidateQueries({
          queryKey: workspaceQueryKeys.server(serverId),
        });
      }
    };

    const handlePresenceUpdate = (data: {
      customStatus: string | null;
      status: "ONLINE" | "IDLE" | "DND" | "OFFLINE";
      userId: string;
    }) => {
      if (data.userId === currentUser.id) {
        setCurrentUserStatus(data.status);
      }

      queryClient.setQueriesData<WorkspaceServerDetail | undefined>(
        { queryKey: workspaceQueryKeys.root },
        (current) => {
          if (!current || !("members" in current)) {
            return current;
          }

          return {
            ...current,
            members: current.members.map((member) =>
              member.userId === data.userId
                ? {
                    ...member,
                    customStatus: data.customStatus,
                    status: data.status,
                  }
                : member,
            ),
          };
        },
      );
    };

    const applyUserProfileUpdate = (data: UserProfileUpdatedPayload) => {
      if (data.userId === currentUser.id) {
        setCurrentUserSnapshot((current) => ({
          ...current,
          avatarUrl: data.avatarUrl,
          displayName: data.displayName ?? data.username,
          status: data.status,
          username: data.username,
        }));
        setCurrentUserStatus(data.status);
      }

      queryClient.setQueriesData<WorkspaceServerDetail | undefined>(
        { queryKey: workspaceQueryKeys.root },
        (current) => {
          if (!current || !("members" in current)) {
            return current;
          }

          return {
            ...current,
            members: current.members.map((member) =>
              member.userId === data.userId
                ? {
                    ...member,
                    avatarUrl: data.avatarUrl,
                    customStatus: data.customStatus,
                    displayName: data.displayName ?? data.username,
                    status: data.status,
                    username: data.username,
                  }
                : member,
            ),
          };
        },
      );

      queryClient.setQueriesData<MessagePages | undefined>({ queryKey: ["messages"] }, (current) =>
        patchMessageAuthors(current, data),
      );

      queryClient.setQueryData<DMConversationsInfiniteData | undefined>(
        dmQueryKeys.list,
        (current) => patchDMConversationParticipants(current, data),
      );
    };

    const handleAccountUpdated = (event: Event) => {
      if (!(event instanceof CustomEvent)) {
        return;
      }

      const detail = event.detail as Partial<AccountUpdatedEventPayload> | null;
      if (!detail || detail.id !== currentUser.id) {
        return;
      }

      const nextStatus =
        detail.status === "ONLINE" ||
        detail.status === "IDLE" ||
        detail.status === "DND" ||
        detail.status === "OFFLINE"
          ? detail.status
          : "OFFLINE";

      applyUserProfileUpdate({
        avatarUrl: detail.avatarUrl ?? null,
        customStatus: detail.customStatus ?? null,
        displayName: typeof detail.displayName === "string" ? detail.displayName : null,
        status: nextStatus,
        userId: detail.id,
        username: detail.username ?? currentUserSnapshot.username,
      });
    };

    socket.on("server:unread:update", handleServerUnreadUpdate);
    socket.on("channel:messages:stale", handleChannelMessagesStale);
    socket.on("server:membership:added", handleServerMembershipAdded);
    socket.on("server:settings:updated", handleServerSettingsUpdated);
    socket.on("notification:new", handleNotificationNew);
    socket.on("presence:update", handlePresenceUpdate);
    socket.on("user:profile:updated", applyUserProfileUpdate);
    window.addEventListener("whispr:account-updated", handleAccountUpdated);
    return () => {
      socket.off("server:unread:update", handleServerUnreadUpdate);
      socket.off("channel:messages:stale", handleChannelMessagesStale);
      socket.off("server:membership:added", handleServerMembershipAdded);
      socket.off("server:settings:updated", handleServerSettingsUpdated);
      socket.off("notification:new", handleNotificationNew);
      socket.off("presence:update", handlePresenceUpdate);
      socket.off("user:profile:updated", applyUserProfileUpdate);
      window.removeEventListener("whispr:account-updated", handleAccountUpdated);
    };
  }, [
    activeServerId,
    currentUser.id,
    currentUserSnapshot.username,
    currentUserStatus,
    queryClient,
    router,
    socket,
  ]);

  const cachedServerDetail = activeServerId
    ? queryClient.getQueryData<Awaited<ReturnType<typeof fetchWorkspaceServer>>>(
        workspaceQueryKeys.server(activeServerId),
      )
    : undefined;

  const serversQuery = useQuery({
    queryFn: fetchWorkspaceServers,
    queryKey: workspaceQueryKeys.servers,
    refetchOnWindowFocus: false,
    staleTime: 60_000,
  });

  const serverDetailQuery = useQuery({
    enabled: Boolean(activeServerId),
    queryFn: () => fetchWorkspaceServer(activeServerId!),
    queryKey: activeServerId
      ? workspaceQueryKeys.server(activeServerId)
      : ["workspace", "server", "idle"],
    refetchOnWindowFocus: false,
    staleTime: 30_000,
    ...(cachedServerDetail ? { placeholderData: cachedServerDetail } : {}),
  });

  const leaveMutation = useMutation({
    mutationFn: async (serverId: string) => leaveServerRequest(serverId),
    onSuccess: async (_result, serverId) => {
      setLeaveServerCandidate(null);
      closeServerContextMenu();
      forgetServerState(serverId);
      await queryClient.invalidateQueries({
        queryKey: workspaceQueryKeys.servers,
      });

      if (serverId === activeServerId) {
        router.push("/channels/@me");
      }
    },
  });

  const addMemberMutation = useMutation({
    mutationFn: async () => {
      if (!addMemberServer) {
        throw new Error(t("workspace.modal.addMemberMissingServer"));
      }

      return addServerMemberRequest(addMemberServer.id, addMemberUsername.trim());
    },
    onMutate: () => {
      setAddMemberSuccess(null);
    },
    onSuccess: async (result) => {
      const updatedDetail = result.detail;
      queryClient.setQueryData<WorkspaceServerDetail>(
        workspaceQueryKeys.server(updatedDetail.server.id),
        updatedDetail,
      );
      queryClient.setQueryData<WorkspaceServerSummary[] | undefined>(
        workspaceQueryKeys.servers,
        (current) =>
          current?.map((server) =>
            server.id === updatedDetail.server.id
              ? {
                  ...server,
                  allowFileUploads: updatedDetail.server.allowFileUploads,
                  allowGifs: updatedDetail.server.allowGifs,
                  allowMemberAdds: updatedDetail.server.allowMemberAdds,
                  memberCount: updatedDetail.server.memberCount,
                }
              : server,
          ),
      );
      setAddMemberUsername("");
      setAddMemberSuccess(
        t("workspace.modal.addMemberSuccessDescription", {
          name: result.addedUser.displayName ?? result.addedUser.username,
        }),
      );
      await queryClient.invalidateQueries({ queryKey: workspaceQueryKeys.servers });
      await queryClient.invalidateQueries({
        queryKey: workspaceQueryKeys.server(updatedDetail.server.id),
      });
    },
  });

  const isServersLoading = serversQuery.isLoading;
  const isServersRefreshing = serversQuery.isLoading || serversQuery.isFetching;
  const servers = useMemo<WorkspaceServerSummary[]>(
    () => serversQuery.data ?? [],
    [serversQuery.data],
  );
  const readiness = useShellReadiness({
    activeServerDetailLoading: Boolean(
      activeServerId && serverDetailQuery.isLoading && !serverDetailQuery.data,
    ),
    appearanceHydrated: appearanceHydrated || appearanceHydratedFromHook,
    dmConversationsLoading: dmConversationsQuery.isLoading && !dmConversationsQuery.data,
    layoutSettingsLoaded: layoutSettingsQuery.isSuccess && Boolean(layoutSettings),
    realtimeConnected: socketConnected,
    route: shellReadinessRoute,
    serversLoading: serversQuery.isLoading && !serversQuery.data,
  });
  const removeServerAccess = React.useCallback(
    (serverId: string) => {
      forgetServerState(serverId);
      queryClient.removeQueries({
        queryKey: workspaceQueryKeys.server(serverId),
      });

      const currentServers =
        queryClient.getQueryData<WorkspaceServerSummary[]>(workspaceQueryKeys.servers) ?? servers;
      const nextServers = currentServers.filter((server) => server.id !== serverId);
      queryClient.setQueryData(workspaceQueryKeys.servers, nextServers);

      if (serverId === activeServerId && (isServerConversationRoute || isServerIndexRoute)) {
        router.replace(getWorkspaceFallbackHref(nextServers, serverId));
      }
    },
    [
      activeServerId,
      forgetServerState,
      isServerConversationRoute,
      isServerIndexRoute,
      queryClient,
      router,
      servers,
    ],
  );
  useEffect(() => {
    const handleServerMembershipRemoved = (data: {
      reason: "deleted" | "kicked" | "left";
      serverId: string;
    }) => {
      removeServerAccess(data.serverId);
      void queryClient.invalidateQueries({
        queryKey: workspaceQueryKeys.servers,
      });
    };

    socket.on("server:membership:removed", handleServerMembershipRemoved);
    return () => {
      socket.off("server:membership:removed", handleServerMembershipRemoved);
    };
  }, [queryClient, removeServerAccess, socket]);
  useEffect(() => {
    if (!activeServerId || !(serverDetailQuery.error instanceof WorkspaceClientError)) {
      return;
    }

    if (serverDetailQuery.error.status === 403 || serverDetailQuery.error.status === 404) {
      removeServerAccess(activeServerId);
    }
  }, [activeServerId, removeServerAccess, serverDetailQuery.error]);
  const dmUnreadCount = useMemo(
    () =>
      dmConversations.reduce((total, conversation) => {
        const currentParticipant = conversation.participants.find(
          (participant) => participant.userId === currentUser.id,
        );

        return total + (currentParticipant?.unreadCount ?? 0);
      }, 0),
    [currentUser.id, dmConversations],
  );
  const activeChannel = findActiveChannel(activeServerId, activeChannelId, serverDetailQuery.data);
  const preferredServerChannelId = activeServerId
    ? getPreferredServerChannelId(
        activeServerId,
        serverDetailQuery.data,
        lastChannelByServerId,
        activeVoiceRoute,
      )
    : null;
  const resolveServerHref = React.useCallback(
    (server: WorkspaceServerSummary) => {
      const detail =
        server.id === activeServerId
          ? serverDetailQuery.data
          : queryClient.getQueryData<Awaited<ReturnType<typeof fetchWorkspaceServer>>>(
              workspaceQueryKeys.server(server.id),
            );

      return getServerRestoreHref(server, lastChannelByServerId, activeVoiceRoute, detail);
    },
    [activeServerId, activeVoiceRoute, lastChannelByServerId, queryClient, serverDetailQuery.data],
  );
  const contextServer = servers.find((server) => server.id === serverContextMenu.serverId) ?? null;
  const canAddUserFromContextMenu = Boolean(
    contextServer && (contextServer.accessLevel !== "MEMBER" || contextServer.allowMemberAdds),
  );
  const canManageContextServer = Boolean(contextServer && contextServer.accessLevel !== "MEMBER");
  const canLeaveContextServer = Boolean(contextServer && contextServer.accessLevel !== "OWNER");
  const hasPrimaryContextActions = canAddUserFromContextMenu || canManageContextServer;
  const shellStyle = useMemo(
    () =>
      ({
        "--channel-sidebar-width": `${channelSidebarWidth}px`,
        "--server-rail-icon-size": `${serverRailIconSize}px`,
        "--server-rail-width": `${displayServerRailWidth}px`,
      }) as CSSProperties,
    [channelSidebarWidth, displayServerRailWidth, serverRailIconSize],
  );

  useEffect(() => {
    if (!appearanceHydrated) {
      return;
    }

    if (isChannelsRootRoute) {
      if (isServersLoading) {
        return;
      }

      const persistedServer = persistedActiveServerId
        ? (servers.find((server) => server.id === persistedActiveServerId) ?? null)
        : null;

      if (persistedActiveArea === "server" && persistedActiveServerId) {
        if (!persistedServer) {
          forgetServerState(persistedActiveServerId);
          router.replace(getWorkspaceFallbackHref(servers, persistedActiveServerId));
          return;
        }

        const persistedServerDetail =
          queryClient.getQueryData<Awaited<ReturnType<typeof fetchWorkspaceServer>>>(
            workspaceQueryKeys.server(persistedServer.id),
          ) ?? null;
        const restoredChannelId = getServerRestoreChannelId(
          persistedServer,
          {
            ...lastChannelByServerId,
            ...(persistedActiveChannelId ? { [persistedServer.id]: persistedActiveChannelId } : {}),
          },
          activeVoiceRoute,
          persistedServerDetail,
        );

        router.replace(
          restoredChannelId
            ? `/channels/${persistedActiveServerId}/${restoredChannelId}`
            : `/channels/${persistedActiveServerId}`,
        );
        return;
      }

      if (persistedActiveArea === "dm" && persistedActiveChannelId) {
        router.replace(`/channels/@me/${persistedActiveChannelId}`);
        return;
      }

      if (persistedActiveArea === "friends") {
        router.replace("/channels/@me");
        return;
      }

      router.replace(getWorkspaceFallbackHref(servers));
    }
  }, [
    activeVoiceRoute,
    appearanceHydrated,
    forgetServerState,
    isChannelsRootRoute,
    lastChannelByServerId,
    persistedActiveArea,
    persistedActiveChannelId,
    persistedActiveServerId,
    queryClient,
    router,
    servers,
    isServersLoading,
  ]);

  useEffect(() => {
    if (!appearanceHydrated || !activeServerId || isServersRefreshing) {
      return;
    }

    const hasServerAccess = servers.some((server) => server.id === activeServerId);

    if (!hasServerAccess && (isServerConversationRoute || isServerIndexRoute)) {
      forgetServerState(activeServerId);
      router.replace(getWorkspaceFallbackHref(servers, activeServerId));
    }
  }, [
    activeServerId,
    appearanceHydrated,
    forgetServerState,
    isServerConversationRoute,
    isServerIndexRoute,
    isServersRefreshing,
    router,
    servers,
  ]);

  useEffect(() => {
    if (!appearanceHydrated) {
      return;
    }

    if (isFriendsRoute) {
      setActiveRoute({
        activeArea: "friends",
        activeChannelId: null,
        activeServerId: null,
      });
      return;
    }

    if (isDmRoute && activeChannelId) {
      setActiveRoute({
        activeArea: "dm",
        activeChannelId,
        activeServerId: null,
      });
      return;
    }

    if (isServerConversationRoute && activeServerId && activeChannelId) {
      setActiveRoute({
        activeArea: "server",
        activeChannelId,
        activeServerId,
      });
    }
  }, [
    activeChannelId,
    activeServerId,
    appearanceHydrated,
    isDmRoute,
    isFriendsRoute,
    isServerConversationRoute,
    setActiveRoute,
  ]);

  useEffect(() => {
    if (!activeServerId || !serverDetailQuery.data) {
      return;
    }

    if (isServerIndexRoute && preferredServerChannelId) {
      router.replace(`/channels/${activeServerId}/${preferredServerChannelId}`);
      return;
    }

    if (isServerIndexRoute && !preferredServerChannelId && !serverDetailQuery.isLoading) {
      router.replace(getWorkspaceFallbackHref(servers, activeServerId));
      return;
    }

    if (isServerConversationRoute && !activeChannel && preferredServerChannelId) {
      router.replace(`/channels/${activeServerId}/${preferredServerChannelId}`);
      return;
    }

    if (isServerConversationRoute && !activeChannel && !preferredServerChannelId) {
      router.replace(getWorkspaceFallbackHref(servers, activeServerId));
    }
  }, [
    activeChannel,
    activeServerId,
    isServerConversationRoute,
    isServerIndexRoute,
    preferredServerChannelId,
    router,
    serverDetailQuery.data,
    serverDetailQuery.isLoading,
    servers,
  ]);

  const navigate = (href: string) => {
    setMobileSidebarOpen(false);
    router.push(href);
  };

  const prefetch = (href: string) => {
    router.prefetch(href);
  };

  const openSettings = () => {
    setMobileSidebarOpen(false);
    router.push("/settings");
  };

  const openDeleteServerFromSettings = React.useCallback(
    (serverId: string, serverName: string) => {
      closeServerSettings();
      window.requestAnimationFrame(() => {
        openDeleteServerDialog(serverId, serverName);
      });
    },
    [closeServerSettings, openDeleteServerDialog],
  );

  const handleMobileBack = () => {
    if (isDmRoute) {
      router.push("/channels/@me");
      return;
    }

    if (isServerConversationRoute) {
      setMobileSidebarOpen(true);
    }
  };

  return (
    <div
      className="app-shell whispr-channel-shell flex h-[100dvh] overflow-hidden md:h-screen"
      style={shellStyle}
      suppressHydrationWarning
    >
      {readiness.shouldMountSplash ? (
        <AppStartupScreen
          busy={!readiness.isReady}
          className={`transition-opacity duration-300 ease-out motion-reduce:transition-none ${
            readiness.shouldShowSplash ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
          experience={isDesktopRuntime ? "desktop" : "default"}
          status={readiness.status}
          variant="overlay"
        />
      ) : null}

      <div
        className="hidden h-full shrink-0 md:flex"
        style={{ width: `calc(${displayServerRailWidth}px + ${channelSidebarWidth}px)` }}
        suppressHydrationWarning
      >
        <NavigationPanel
          isMobile={false}
          activeServerId={activeServerId}
          activeChannelId={activeChannelId}
          servers={servers}
          dmUnreadCount={dmUnreadCount}
          serversQueryLoading={serversQuery.isLoading}
          serverDetailQueryData={serverDetailQuery.data}
          serverDetailQueryLoading={serverDetailQuery.isLoading}
          currentUser={visibleCurrentUser}
          currentUserId={currentUser.id}
          onNavigate={navigate}
          onPrefetch={prefetch}
          onOpenCreateServer={() => openServerModal({ mode: "create" })}
          onOpenServerContextMenu={(serverId, event) => {
            event.preventDefault();
            openServerContextMenu(serverId, {
              x: event.clientX,
              y: event.clientY,
            });
          }}
          onOpenSettings={openSettings}
          onCurrentUserStatusChange={setCurrentUserStatus}
          resolveServerHref={resolveServerHref}
          serverRailIconSize={serverRailIconSize}
          serverRailWidth={serverRailWidth}
          isServerRailIconOnly={isServerRailIconOnly}
          onExpandServerRail={() => setServerRailCollapsed(false)}
          onCollapseServerRail={() => setServerRailCollapsed(true)}
          onServerRailIconSizeChange={setServerRailIconSize}
          onServerRailWidthChange={setServerRailWidth}
        />
      </div>

      <AnimatePresence>
        {mobileSidebarOpen ? (
          <motion.div
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-[70] md:hidden"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
          >
            <div
              className="absolute inset-0 bg-[hsl(var(--backdrop)/0.52)] backdrop-blur-sm"
              data-testid="mobile-workspace-drawer-backdrop"
              onClick={() => setMobileSidebarOpen(false)}
            />
            <motion.div
              animate={{ x: 0 }}
              aria-label={t("shell.mobile.workspaceNavigation")}
              aria-modal="true"
              className="app-shell absolute inset-y-0 left-0 flex max-w-[100vw] overflow-hidden rounded-r-[30px] shadow-[0_26px_70px_hsl(var(--shadow-color)/0.18)]"
              data-testid="mobile-workspace-drawer"
              exit={{ x: -24 }}
              initial={{ x: -24 }}
              role="dialog"
              style={{ width: "min(100vw, 28rem)" }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              suppressHydrationWarning
            >
              <NavigationPanel
                isMobile={true}
                activeServerId={activeServerId}
                activeChannelId={activeChannelId}
                servers={servers}
                dmUnreadCount={dmUnreadCount}
                serversQueryLoading={serversQuery.isLoading}
                serverDetailQueryData={serverDetailQuery.data}
                serverDetailQueryLoading={serverDetailQuery.isLoading}
                currentUser={visibleCurrentUser}
                currentUserId={currentUser.id}
                onNavigate={navigate}
                onPrefetch={prefetch}
                onOpenCreateServer={() => openServerModal({ mode: "create" })}
                onOpenServerContextMenu={(serverId, event) => {
                  event.preventDefault();
                  openServerContextMenu(serverId, {
                    x: event.clientX,
                    y: event.clientY,
                  });
                }}
                onOpenSettings={openSettings}
                onCurrentUserStatusChange={setCurrentUserStatus}
                resolveServerHref={resolveServerHref}
                serverRailIconSize={serverRailIconSize}
                serverRailWidth={serverRailWidth}
                isServerRailIconOnly={false}
                onExpandServerRail={() => setServerRailCollapsed(false)}
                onCollapseServerRail={() => setServerRailCollapsed(true)}
                onServerRailIconSizeChange={setServerRailIconSize}
                onServerRailWidthChange={setServerRailWidth}
              />
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <div className="flex min-w-0 flex-1">
        <MainChannelPanel
          channel={activeChannel}
          fallbackTitle={
            activeServerId
              ? t("shell.wizards.chooseChannel")
              : isFriendsRoute
                ? t("friends.sidebar.friends")
                : t("shell.wizards.directMessages")
          }
          icon={!activeServerId ? Users : undefined}
          leading={
            <MobileShellControls
              canGoBack={showMobileBackButton}
              onBack={handleMobileBack}
              onMenu={() => setMobileSidebarOpen(true)}
            />
          }
        >
          {children}
        </MainChannelPanel>
        {activeServerId && serverDetailQuery.data ? (
          <ServerMemberPanel detail={serverDetailQuery.data} />
        ) : null}
      </div>

      <ContextMenu
        onClose={closeServerContextMenu}
        open={serverContextMenu.open}
        position={serverContextMenu}
      >
        {canAddUserFromContextMenu ? (
          <ContextMenuItem
            data-testid="server-context-add-user"
            onClick={() => {
              closeServerContextMenu();
              if (contextServer) {
                setAddMemberServer(contextServer);
                setAddMemberUsername("");
                setAddMemberSuccess(null);
              }
            }}
          >
            {t("shell.context.addUser")}
          </ContextMenuItem>
        ) : null}
        {canAddUserFromContextMenu && canManageContextServer ? <ContextMenuSeparator /> : null}
        {canManageContextServer ? (
          <ContextMenuItem
            data-testid="server-context-invite"
            onClick={() => {
              closeServerContextMenu();
              if (contextServer) {
                navigate(getServerHref(contextServer));
                openInviteModal(contextServer.id);
              }
            }}
          >
            {t("shell.context.invite")}
          </ContextMenuItem>
        ) : null}
        {canManageContextServer ? <ContextMenuSeparator /> : null}
        {canManageContextServer ? (
          <ContextMenuItem
            data-testid="server-context-settings"
            onClick={() => {
              closeServerContextMenu();
              if (contextServer) {
                navigate(getServerHref(contextServer));
                openServerSettings(contextServer.id);
              }
            }}
          >
            {t("shell.context.settings")}
          </ContextMenuItem>
        ) : null}
        {canLeaveContextServer && hasPrimaryContextActions ? <ContextMenuSeparator /> : null}
        {canLeaveContextServer ? (
          <ContextMenuItem
            destructive
            onClick={() => {
              if (!contextServer) {
                return;
              }

              closeServerContextMenu();
              leaveMutation.reset();
              setLeaveServerCandidate(contextServer);
            }}
          >
            {t("shell.context.leaveServer")}
          </ContextMenuItem>
        ) : null}
      </ContextMenu>

      <Modal
        description={t("workspace.modal.addMemberDescription", {
          server: addMemberServer?.name ?? "",
        })}
        onClose={() => {
          setAddMemberServer(null);
          setAddMemberUsername("");
          setAddMemberSuccess(null);
          addMemberMutation.reset();
        }}
        open={Boolean(addMemberServer)}
        title={t("workspace.modal.addMemberTitle")}
      >
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            addMemberMutation.mutate();
          }}
        >
          <div className="space-y-2">
            <label className="text-app-soft text-xs font-semibold uppercase tracking-[0.2em]">
              {t("workspace.modal.addMemberUsername")}
            </label>
            <Input
              autoComplete="off"
              data-testid="add-server-member-input"
              maxLength={32}
              onChange={(event) => {
                setAddMemberUsername(event.target.value);
                if (addMemberSuccess) {
                  setAddMemberSuccess(null);
                }
              }}
              placeholder={t("workspace.modal.addMemberPlaceholder")}
              value={addMemberUsername}
            />
          </div>

          {addMemberSuccess ? (
            <div
              className="app-success rounded-[24px] border p-4"
              data-testid="add-server-member-success"
            >
              <p className="text-app-success text-xs font-semibold uppercase tracking-[0.2em]">
                {t("workspace.modal.addMemberSuccessTitle")}
              </p>
              <p className="text-app-foreground mt-2 text-sm font-medium">{addMemberSuccess}</p>
            </div>
          ) : null}

          {addMemberMutation.error ? (
            <div className="app-danger rounded-[24px] border p-4 text-sm font-medium">
              {t(getAddMemberErrorKey(addMemberMutation.error))}
            </div>
          ) : null}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              className="w-full sm:w-auto"
              onClick={() => {
                setAddMemberServer(null);
                setAddMemberUsername("");
                setAddMemberSuccess(null);
                addMemberMutation.reset();
              }}
              type="button"
              variant="outline"
            >
              {t("common.cancel")}
            </Button>
            <Button
              className="w-full sm:w-auto"
              data-testid="add-server-member-submit"
              disabled={addMemberMutation.isPending || addMemberUsername.trim().length < 2}
              type="submit"
            >
              <UserPlus className="h-4 w-4" />
              {addMemberMutation.isPending
                ? t("workspace.modal.addMemberAdding")
                : t("workspace.modal.addMemberAction")}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        className="max-w-md"
        description={t("shell.context.leaveServerDialogDescription", {
          name: leaveServerCandidate?.name ?? "",
        })}
        onClose={() => {
          setLeaveServerCandidate(null);
          leaveMutation.reset();
        }}
        open={Boolean(leaveServerCandidate)}
        title={t("shell.context.leaveServerDialogTitle")}
      >
        <div className="rounded-[24px] border border-[hsl(var(--danger)/0.22)] bg-[hsl(var(--danger)/0.08)] p-4">
          <p className="text-sm font-medium text-app-foreground">
            {t("shell.context.leaveServerDialogBody", {
              name: leaveServerCandidate?.name ?? "",
            })}
          </p>
        </div>

        {leaveMutation.error ? (
          <div className="app-danger mt-4 rounded-[24px] border p-4 text-sm font-medium">
            {leaveMutation.error instanceof Error
              ? leaveMutation.error.message
              : t("shell.context.leaveServerDialogError")}
          </div>
        ) : null}

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            className="w-full rounded-2xl sm:w-auto"
            disabled={leaveMutation.isPending}
            onClick={() => {
              setLeaveServerCandidate(null);
              leaveMutation.reset();
            }}
            type="button"
            variant="outline"
          >
            {t("common.cancel")}
          </Button>
          <Button
            className="w-full rounded-2xl bg-[hsl(var(--danger))] text-white hover:bg-[hsl(var(--danger)/0.9)] sm:w-auto"
            disabled={leaveMutation.isPending || !leaveServerCandidate}
            onClick={() => {
              if (leaveServerCandidate) {
                leaveMutation.mutate(leaveServerCandidate.id);
              }
            }}
            type="button"
          >
            {leaveMutation.isPending
              ? t("shell.context.leaveServerLeaving")
              : t("shell.context.leaveServer")}
          </Button>
        </div>
      </Modal>

      <WorkspaceModals
        activeServerDetail={serverDetailQuery.data ?? null}
        onNavigate={navigate}
        uploadthingEnabled={uploadthingEnabled}
      />

      <ServerSettingsOverlay
        detail={serverSettingsServerId === activeServerId ? (serverDetailQuery.data ?? null) : null}
        onOpenDeleteServer={openDeleteServerFromSettings}
        open={Boolean(serverSettingsServerId && serverSettingsServerId === activeServerId)}
        uploadthingEnabled={uploadthingEnabled}
      />
    </div>
  );
}
