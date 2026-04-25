"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import type { CSSProperties } from "react";
import { useEffect } from "react";
import type { WorkspaceChannel } from "@wizards/types";
import { useParams, useRouter } from "next/navigation";
import { useShallow } from "zustand/react/shallow";
import { AppearanceSettingsModal } from "@/components/shell/appearance-settings-modal";
import { ChannelSidebar } from "@/components/shell/channel-sidebar";
import { MainChannelPanel } from "@/components/shell/main-channel-panel";
import { MobileDrawerTrigger, ServerRail } from "@/components/shell/server-rail";
import { ServerSettingsOverlay } from "@/components/shell/server-settings-overlay";
import { ThemeSwitcher } from "@/components/theme/theme-switcher";
import { WorkspaceModals } from "@/components/shell/workspace-modals";
import { ContextMenu, ContextMenuItem } from "@/components/ui/context-menu";
import { useAppStore } from "@/lib/store";
import {
  fetchWorkspaceServer,
  fetchWorkspaceServers,
  getServerHref,
  leaveServerRequest,
  workspaceQueryKeys,
} from "@/lib/workspace/client";

type WizardsShellProps = {
  children?: React.ReactNode;
  currentUser: {
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
    [...detail.ungroupedChannels, ...detail.categories.flatMap((category) => category.channels)].find(
      (channel) => channel.id === channelId,
    ) ?? null
  );
}

function findActiveCategoryName(channel: WorkspaceChannel | null, detail?: Awaited<ReturnType<typeof fetchWorkspaceServer>> | null) {
  if (!channel || !detail) {
    return null;
  }

  return detail.categories.find((category) => category.id === channel.categoryId)?.name ?? null;
}

export function WizardsShell({ children, currentUser, uploadthingEnabled }: WizardsShellProps) {
  const params = useParams<{
    channelId?: string;
    serverId?: string;
  }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const {
    closeServerContextMenu,
    channelSidebarWidth,
    mobileSidebarOpen,
    openDeleteServerDialog,
    openInviteModal,
    openAppearanceModal,
    openServerContextMenu,
    openServerModal,
    openServerSettings,
    serverRailWidth,
    serverContextMenu,
    serverSettingsServerId,
    setActiveRoute,
    setMobileSidebarOpen,
  } = useAppStore(
    useShallow((state) => ({
      closeServerContextMenu: state.closeServerContextMenu,
      channelSidebarWidth: state.channelSidebarWidth,
      mobileSidebarOpen: state.mobileSidebarOpen,
      openDeleteServerDialog: state.openDeleteServerDialog,
      openAppearanceModal: state.openAppearanceModal,
      openInviteModal: state.openInviteModal,
      openServerContextMenu: state.openServerContextMenu,
      openServerModal: state.openServerModal,
      openServerSettings: state.openServerSettings,
      serverRailWidth: state.serverRailWidth,
      serverContextMenu: state.serverContextMenu,
      serverSettingsServerId: state.serverSettingsServerId,
      setActiveRoute: state.setActiveRoute,
      setMobileSidebarOpen: state.setMobileSidebarOpen,
    })),
  );

  const activeServerId = typeof params.serverId === "string" ? params.serverId : null;
  const activeChannelId = typeof params.channelId === "string" ? params.channelId : null;

  useEffect(() => {
    setActiveRoute(activeServerId, activeChannelId);
  }, [activeChannelId, activeServerId, setActiveRoute]);

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
    queryKey: activeServerId ? workspaceQueryKeys.server(activeServerId) : ["workspace", "server", "idle"],
    refetchOnWindowFocus: false,
    staleTime: 30_000,
    ...(cachedServerDetail ? { placeholderData: cachedServerDetail } : {}),
  });

  const leaveMutation = useMutation({
    mutationFn: async (serverId: string) => leaveServerRequest(serverId),
    onSuccess: async (_result, serverId) => {
      closeServerContextMenu();
      await queryClient.invalidateQueries({
        queryKey: workspaceQueryKeys.servers,
      });

      if (serverId === activeServerId) {
        router.push("/channels");
      }
    },
  });

  const servers = serversQuery.data ?? [];
  const activeChannel = findActiveChannel(activeServerId, activeChannelId, serverDetailQuery.data);
  const activeCategoryName = findActiveCategoryName(activeChannel, serverDetailQuery.data);
  const contextServer =
    servers.find((server) => server.id === serverContextMenu.serverId) ?? null;
  const shellStyle = {
    "--channel-sidebar-width": `${channelSidebarWidth}px`,
    "--server-rail-width": `${serverRailWidth}px`,
  } as CSSProperties;

  useEffect(() => {
    if (
      activeServerId &&
      serverDetailQuery.data?.server.defaultChannelId &&
      (!activeChannelId || !activeChannel)
    ) {
      router.replace(`/channels/${activeServerId}/${serverDetailQuery.data.server.defaultChannelId}`);
    }
  }, [activeChannel, activeChannelId, activeServerId, router, serverDetailQuery.data?.server.defaultChannelId]);

  const navigate = (href: string) => {
    setMobileSidebarOpen(false);
    router.push(href);
  };

  const prefetch = (href: string) => {
    router.prefetch(href);
  };

  const renderNavigation = (isMobile = false) => (
    <>
      <div className={isMobile ? "flex h-full w-[72px] shrink-0" : "hidden md:flex"}>
        <ServerRail
          activeServerId={activeServerId}
          loading={serversQuery.isLoading}
          onNavigate={navigate}
          onOpenCreateServer={() => openServerModal({ mode: "create" })}
          onOpenServerContextMenu={(serverId, event) => {
            event.preventDefault();
            openServerContextMenu(serverId, {
              x: event.clientX,
              y: event.clientY,
            });
          }}
          onPrefetch={prefetch}
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
          detail={serverDetailQuery.data ?? null}
          loading={Boolean(activeServerId) && serverDetailQuery.isLoading}
          onNavigate={navigate}
          onOpenAppearanceSettings={openAppearanceModal}
          onPrefetch={prefetch}
        />
      </div>
    </>
  );

  return (
    <div className="app-shell flex h-screen overflow-hidden" style={shellStyle} suppressHydrationWarning>
      <div
        className="hidden h-full shrink-0 md:flex"
        style={{ width: `calc(${serverRailWidth}px + ${channelSidebarWidth}px)` }}
      >
        {renderNavigation()}
      </div>

      <AnimatePresence>
        {mobileSidebarOpen ? (
          <motion.div
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-[70] md:hidden"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
          >
            <div className="absolute inset-0 bg-black/60" onClick={() => setMobileSidebarOpen(false)} />
            <motion.div
              animate={{ x: 0 }}
              className="app-shell absolute inset-y-0 left-0 flex shadow-2xl shadow-black/20"
              exit={{ x: -24 }}
              initial={{ x: -24 }}
              style={{ width: `calc(${serverRailWidth}px + ${channelSidebarWidth}px)` }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              suppressHydrationWarning
            >
              {renderNavigation(true)}
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <MainChannelPanel
        categoryName={activeCategoryName}
        channel={activeChannel}
        fallbackTitle={activeServerId ? "Choose a channel" : "Your Direct Messages"}
        leading={<MobileDrawerTrigger onClick={() => setMobileSidebarOpen(true)} />}
        trailing={<ThemeSwitcher onOpenAppearanceSettings={openAppearanceModal} />}
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
            Settings
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
            Invite
          </ContextMenuItem>
        ) : null}
        {contextServer && contextServer.accessLevel !== "OWNER" ? (
          <ContextMenuItem
            destructive
            onClick={() => {
              if (window.confirm(`Leave ${contextServer.name}?`)) {
                leaveMutation.mutate(contextServer.id);
              }
            }}
          >
            Leave Server
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
            Delete Server
          </ContextMenuItem>
        ) : null}
      </ContextMenu>

      <WorkspaceModals
        activeServerDetail={serverDetailQuery.data ?? null}
        onNavigate={navigate}
        uploadthingEnabled={uploadthingEnabled}
      />
      <AppearanceSettingsModal />

      <ServerSettingsOverlay
        detail={serverSettingsServerId === activeServerId ? serverDetailQuery.data ?? null : null}
        onOpenDeleteServer={openDeleteServerDialog}
        open={Boolean(serverSettingsServerId && serverSettingsServerId === activeServerId)}
        uploadthingEnabled={uploadthingEnabled}
      />
    </div>
  );
}
