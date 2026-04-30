"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, UserPlus, Users } from "lucide-react";
import React, { type CSSProperties } from "react";
import { useEffect, useMemo } from "react";
import type {
  WorkspaceChannel,
  WorkspaceServerDetail,
  WorkspaceServerSummary,
} from "@wizards/types";
import { useParams, usePathname, useRouter } from "next/navigation";
import { Button } from "@wizards/ui";
import { useShallow } from "zustand/react/shallow";
import { ChannelSidebar } from "@/components/shell/channel-sidebar";
import { useI18n } from "@/components/providers/locale-provider";
import { MainChannelPanel } from "@/components/shell/main-channel-panel";
import { MobileDrawerTrigger, ServerRail } from "@/components/shell/server-rail";
import { ServerSettingsOverlay } from "@/components/shell/server-settings-overlay";
import { WorkspaceModals } from "@/components/shell/workspace-modals";
import { ContextMenu, ContextMenuItem, ContextMenuSeparator } from "@/components/ui/context-menu";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { useSocket } from "@/hooks/use-socket";
import { useDMConversations } from "@/hooks/use-dm-conversations";
import { useAppearanceHydration } from "@/hooks/use-appearance-hydration";
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
    ].find((channel) => channel.id === channelId) ?? null
  );
}

function findActiveCategoryName(
  channel: WorkspaceChannel | null,
  detail?: Awaited<ReturnType<typeof fetchWorkspaceServer>> | null,
) {
  if (!channel || !detail) {
    return null;
  }

  return detail.categories.find((category) => category.id === channel.categoryId)?.name ?? null;
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
  const nextServer =
    servers.find((server) => server.id !== excludedServerId) ??
    servers[0] ??
    null;

  return nextServer ? getServerIndexHref(nextServer) : "/channels/@me";
}

function getPreferredServerChannelId(
  serverId: string,
  detail: Awaited<ReturnType<typeof fetchWorkspaceServer>> | null | undefined,
  lastChannelByServerId: Record<string, string>,
) {
  if (!detail) {
    return null;
  }

  const rememberedChannelId = lastChannelByServerId[serverId] ?? null;
  const rememberedChannel = findActiveChannel(serverId, rememberedChannelId, detail);

  return rememberedChannel?.id ?? detail.server.defaultChannelId ?? null;
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
  }: NavigationPanelProps) => (
    <>
      <div className={isMobile ? "flex h-full w-[72px] shrink-0 [--server-rail-width:72px]" : "hidden md:flex"}>
        <ServerRail
          activeServerId={activeServerId}
          dmUnreadCount={dmUnreadCount}
          loading={serversQueryLoading}
          onNavigate={onNavigate}
          onOpenCreateServer={onOpenCreateServer}
          onOpenServerContextMenu={onOpenServerContextMenu}
          onPrefetch={onPrefetch}
          servers={servers}
        />
      </div>
      <div
        className={isMobile ? "flex min-w-0 max-w-[calc(100vw-72px)] flex-1 overflow-hidden" : "hidden md:flex"}
        style={isMobile ? undefined : { width: `var(--channel-sidebar-width)` }}
      >
        <ChannelSidebar
          activeChannelId={activeChannelId}
          currentUser={currentUser}
          detail={serverDetailQueryData ?? null}
          loading={Boolean(activeServerId) && serverDetailQueryLoading}
          onNavigate={onNavigate}
          onOpenSettings={onOpenSettings}
          onPrefetch={onPrefetch}
        />
      </div>
    </>
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
  useAppearanceHydration();
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
  const [leaveServerCandidate, setLeaveServerCandidate] =
    React.useState<WorkspaceServerSummary | null>(null);
  const {
    appearanceHydrated,
    closeServerContextMenu,
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
    serverRailWidth,
    serverContextMenu,
    serverSettingsServerId,
    setActiveRoute,
    setMobileSidebarOpen,
    applyPersistedSettings,
  } = useAppStore(
    useShallow((state) => ({
      appearanceHydrated: state.appearanceHydrated,
      closeServerContextMenu: state.closeServerContextMenu,
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
      serverRailWidth: state.serverRailWidth,
      serverContextMenu: state.serverContextMenu,
      serverSettingsServerId: state.serverSettingsServerId,
      setActiveRoute: state.setActiveRoute,
      setMobileSidebarOpen: state.setMobileSidebarOpen,
      applyPersistedSettings: state.applyPersistedSettings,
    })),
  );

  const { data: layoutSettings } = useQuery({
    queryKey: settingsQueryKeys.layout,
    queryFn: fetchLayoutSettings,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  const { conversations: dmConversations } = useDMConversations(currentUser.id);

  useEffect(() => {
    if (layoutSettings) {
      applyPersistedSettings(layoutSettings);
    }
  }, [layoutSettings, applyPersistedSettings]);

  const rawServerId = typeof params.serverId === "string" ? decodeURIComponent(params.serverId) : null;
  const activeServerId = rawServerId === "@me" ? null : rawServerId;
  const activeChannelId = typeof params.channelId === "string" ? params.channelId : null;
  const isChannelsRootRoute = pathname === "/channels";
  const isFriendsRoute = pathname === "/channels/@me" || (rawServerId === "@me" && !activeChannelId);
  const isDmRoute = rawServerId === "@me" && Boolean(activeChannelId);
  const isServerIndexRoute = Boolean(activeServerId && !activeChannelId);
  const isServerConversationRoute = Boolean(activeServerId && activeChannelId);
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
    const handleServerUnreadUpdate = (data: { serverId: string; unreadCount: number }) => {
      queryClient.setQueryData<WorkspaceServerSummary[] | undefined>(
        workspaceQueryKeys.servers,
        (current) => applyServerUnreadCount(current, data.serverId, data.unreadCount),
      );

      queryClient.setQueryData<WorkspaceServerDetail | undefined>(
        workspaceQueryKeys.server(data.serverId),
        (current) =>
          current
            ? {
                ...current,
                server: {
                  ...current.server,
                  unreadCount: data.unreadCount,
                },
              }
            : current,
      );
    };

    const handleServerSettingsUpdated = (data: { serverId: string }) => {
      void queryClient.invalidateQueries({
        queryKey: workspaceQueryKeys.servers,
      });
      void queryClient.invalidateQueries({
        queryKey: workspaceQueryKeys.server(data.serverId),
      });

      if (data.serverId === activeServerId) {
        router.refresh();
      }
    };

    socket.on("server:unread:update", handleServerUnreadUpdate);
    socket.on("server:settings:updated", handleServerSettingsUpdated);
    return () => {
      socket.off("server:unread:update", handleServerUnreadUpdate);
      socket.off("server:settings:updated", handleServerSettingsUpdated);
    };
  }, [activeServerId, queryClient, router, socket]);

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
  const servers = useMemo<WorkspaceServerSummary[]>(
    () => serversQuery.data ?? [],
    [serversQuery.data],
  );
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
  const activeCategoryName = findActiveCategoryName(activeChannel, serverDetailQuery.data);
  const preferredServerChannelId = activeServerId
    ? getPreferredServerChannelId(activeServerId, serverDetailQuery.data, lastChannelByServerId)
    : null;
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
        "--server-rail-width": `${serverRailWidth}px`,
      }) as CSSProperties,
    [channelSidebarWidth, serverRailWidth],
  );

  useEffect(() => {
    if (!appearanceHydrated) {
      return;
    }

    if (isChannelsRootRoute) {
      if (isServersLoading) {
        return;
      }

      const persistedServer =
        persistedActiveServerId
          ? servers.find((server) => server.id === persistedActiveServerId) ?? null
          : null;

      if (persistedActiveArea === "server" && persistedActiveServerId) {
        if (!persistedServer) {
          forgetServerState(persistedActiveServerId);
          router.replace(getWorkspaceFallbackHref(servers, persistedActiveServerId));
          return;
        }

        const restoredChannelId =
          lastChannelByServerId[persistedActiveServerId] ??
          persistedActiveChannelId ??
          persistedServer.defaultChannelId;

        router.replace(
          restoredChannelId
            ? `/channels/${persistedActiveServerId}/${restoredChannelId}`
            : getServerIndexHref(persistedServer),
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
    appearanceHydrated,
    forgetServerState,
    isChannelsRootRoute,
    lastChannelByServerId,
    persistedActiveArea,
    persistedActiveChannelId,
    persistedActiveServerId,
    router,
    servers,
    isServersLoading,
  ]);

  useEffect(() => {
    if (!appearanceHydrated || !activeServerId || isServersLoading) {
      return;
    }

    const hasServerAccess = servers.some((server) => server.id === activeServerId);

    if (
      !hasServerAccess &&
      (isServerConversationRoute || isServerIndexRoute)
    ) {
      forgetServerState(activeServerId);
      router.replace(getWorkspaceFallbackHref(servers, activeServerId));
    }
  }, [
    activeServerId,
    appearanceHydrated,
    forgetServerState,
    isServerConversationRoute,
    isServerIndexRoute,
    isServersLoading,
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
      className="app-shell flex h-[100dvh] overflow-hidden md:h-screen"
      style={shellStyle}
      suppressHydrationWarning
    >
      <div
        className="hidden h-full shrink-0 md:flex"
        style={{ width: `calc(${serverRailWidth}px + ${channelSidebarWidth}px)` }}
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
          currentUser={currentUser}
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
              className="absolute inset-0 bg-[hsl(var(--backdrop)/0.6)]"
              onClick={() => setMobileSidebarOpen(false)}
            />
            <motion.div
              animate={{ x: 0 }}
              aria-label={t("shell.mobile.workspaceNavigation")}
              aria-modal="true"
              className="app-shell absolute inset-y-0 left-0 flex max-w-[100vw] overflow-hidden shadow-[0_26px_70px_hsl(var(--shadow-color)/0.18)]"
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
                currentUser={currentUser}
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
              />
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <MainChannelPanel
        categoryName={activeCategoryName}
        channel={activeChannel}
        contextLabel={!activeServerId ? t("friends.header.context") : undefined}
        detailLabel={!activeServerId ? t("friends.header.detail") : undefined}
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

      <ContextMenu
        onClose={closeServerContextMenu}
        open={serverContextMenu.open}
        position={serverContextMenu}
      >
        {canAddUserFromContextMenu ? (
          <ContextMenuItem
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
            <div className="app-success rounded-[24px] border p-4">
              <p className="text-app-success text-xs font-semibold uppercase tracking-[0.2em]">
                {t("workspace.modal.addMemberSuccessTitle")}
              </p>
              <p className="text-app-foreground mt-2 text-sm font-medium">
                {addMemberSuccess}
              </p>
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
        onOpenDeleteServer={openDeleteServerDialog}
        open={Boolean(serverSettingsServerId && serverSettingsServerId === activeServerId)}
        uploadthingEnabled={uploadthingEnabled}
      />
    </div>
  );
}
