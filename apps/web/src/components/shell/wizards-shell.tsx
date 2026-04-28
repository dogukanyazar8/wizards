"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { Users } from "lucide-react";
import React, { type CSSProperties } from "react";
import { useEffect, useMemo } from "react";
import type {
  WorkspaceChannel,
  WorkspaceServerDetail,
  WorkspaceServerSummary,
} from "@wizards/types";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useShallow } from "zustand/react/shallow";
import { ChannelSidebar } from "@/components/shell/channel-sidebar";
import { useI18n } from "@/components/providers/locale-provider";
import { MainChannelPanel } from "@/components/shell/main-channel-panel";
import { MobileDrawerTrigger, ServerRail } from "@/components/shell/server-rail";
import { ServerSettingsOverlay } from "@/components/shell/server-settings-overlay";
import { WorkspaceModals } from "@/components/shell/workspace-modals";
import { ContextMenu, ContextMenuItem } from "@/components/ui/context-menu";
import { useSocket } from "@/hooks/use-socket";
import { useAppearanceHydration } from "@/hooks/use-appearance-hydration";
import { useAppStore } from "@/lib/store";
import {
  applyServerUnreadCount,
  fetchWorkspaceServer,
  fetchWorkspaceServers,
  getServerHref,
  leaveServerRequest,
  workspaceQueryKeys,
} from "@/lib/workspace/client";
import { fetchLayoutSettings, settingsQueryKeys } from "@/lib/settings/client";

type WizardsShellProps = {
  children?: React.ReactNode;
  currentUser: {
    id: string;
    avatarUrl?: string | null;
    displayName: string;
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
  serversQueryLoading: boolean;
  serverDetailQueryData: Awaited<ReturnType<typeof fetchWorkspaceServer>> | undefined | null;
  serverDetailQueryLoading: boolean;
  currentUser: {
    id: string;
    avatarUrl?: string | null;
    displayName: string;
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
      <div className={isMobile ? "flex h-full w-[72px] shrink-0" : "hidden md:flex"}>
        <ServerRail
          activeServerId={activeServerId}
          loading={serversQueryLoading}
          onNavigate={onNavigate}
          onOpenCreateServer={onOpenCreateServer}
          onOpenServerContextMenu={onOpenServerContextMenu}
          onPrefetch={onPrefetch}
          servers={servers}
        />
      </div>
      <div
        className={isMobile ? "flex min-w-0 flex-1" : "hidden md:flex"}
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

    socket.on("server:unread:update", handleServerUnreadUpdate);
    return () => {
      socket.off("server:unread:update", handleServerUnreadUpdate);
    };
  }, [queryClient, socket]);

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

  const isServersLoading = serversQuery.isLoading;
  const servers = useMemo<WorkspaceServerSummary[]>(
    () => serversQuery.data ?? [],
    [serversQuery.data],
  );
  const activeChannel = findActiveChannel(activeServerId, activeChannelId, serverDetailQuery.data);
  const activeCategoryName = findActiveCategoryName(activeChannel, serverDetailQuery.data);
  const preferredServerChannelId = activeServerId
    ? getPreferredServerChannelId(activeServerId, serverDetailQuery.data, lastChannelByServerId)
    : null;
  const contextServer = servers.find((server) => server.id === serverContextMenu.serverId) ?? null;
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

  return (
    <div
      className="app-shell flex h-screen overflow-hidden"
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
              className="app-shell absolute inset-y-0 left-0 flex shadow-[0_26px_70px_hsl(var(--shadow-color)/0.18)]"
              exit={{ x: -24 }}
              initial={{ x: -24 }}
              style={{ width: `calc(${serverRailWidth}px + ${channelSidebarWidth}px)` }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              suppressHydrationWarning
            >
              <NavigationPanel
                isMobile={true}
                activeServerId={activeServerId}
                activeChannelId={activeChannelId}
                servers={servers}
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
        leading={<MobileDrawerTrigger onClick={() => setMobileSidebarOpen(true)} />}
      >
        {children}
      </MainChannelPanel>

      <ContextMenu
        onClose={closeServerContextMenu}
        open={serverContextMenu.open}
        position={serverContextMenu}
      >
        {contextServer?.accessLevel !== "MEMBER" ? (
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
        {contextServer?.accessLevel !== "MEMBER" ? (
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
        {contextServer && contextServer.accessLevel !== "OWNER" ? (
          <ContextMenuItem
            destructive
            onClick={() => {
              if (
                window.confirm(t("shell.context.leaveServerConfirm", { name: contextServer.name }))
              ) {
                leaveMutation.mutate(contextServer.id);
              }
            }}
          >
            {t("shell.context.leaveServer")}
          </ContextMenuItem>
        ) : null}
        {contextServer?.accessLevel === "OWNER" ? (
          <ContextMenuItem
            destructive
            onClick={() => {
              closeServerContextMenu();
              openDeleteServerDialog(contextServer.id, contextServer.name);
            }}
          >
            {t("shell.context.deleteServer")}
          </ContextMenuItem>
        ) : null}
      </ContextMenu>

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
