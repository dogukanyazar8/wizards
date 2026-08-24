"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, UserPlus, Users } from "lucide-react";
import React, { type CSSProperties } from "react";
import { useEffect, useMemo, useSyncExternalStore } from "react";
import type { WorkspaceServerDetail, WorkspaceServerSummary } from "@wizards/types";
import { useParams, usePathname, useRouter } from "next/navigation";
import { Button } from "@wizards/ui";
import { useShallow } from "zustand/react/shallow";
import { AppStartupScreen } from "@/components/app/app-startup-screen";
import { AppNavPanel } from "@/components/shell/app-nav-panel";
import { ChannelSidebar } from "@/components/shell/channel-sidebar";
import { useI18n } from "@/components/providers/locale-provider";
import { AccountPreferenceProvider } from "@/components/providers/account-preference-provider";
import { getInterfaceDensityMetrics } from "@wizards/types";
import { CommandPaletteProvider } from "@/components/command/command-palette-provider";
import { FocusControlsProvider } from "@/components/providers/focus-controls-provider";
import { InAppSettingsOverlay } from "@/components/settings/in-app-settings-overlay";
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
import { getMessagesQueryKey, patchMessageAuthors, type MessagePages } from "@/hooks/use-messages";
import { useAppearanceHydration } from "@/hooks/use-appearance-hydration";
import { useNextEventClock, type NextEventClock } from "@/hooks/use-next-event-clock";
import { useUnreadCounters } from "@/hooks/use-unread-counters";
import { usePresenceActivity } from "@/hooks/use-presence-activity";
import { useBodyScrollLock, useResponsiveLayout } from "@/hooks/use-responsive-layout";
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
import { SERVER_RAIL_WIDTH } from "@/lib/appearance";
import { isWhisprDesktopRuntime } from "@/lib/desktop/runtime";
import { HOME_METRICS, pxToRem } from "@/lib/home/metrics";
import {
  MESSAGES_FRIENDS_ROUTE,
  MESSAGES_ROUTE,
  selectActiveConversationId,
} from "@/lib/messages/routes";
import { selectCommandCenterLayout } from "@/lib/home/layout";
import { selectThirdColumn, type ThirdColumn } from "@/lib/home/third-column";
import { MessagesRailContainer } from "@/components/messages/messages-rail-container";
import { MESSAGES_METRICS } from "@/lib/messages/metrics";
import { MentionsRailContainer } from "@/components/mentions/mentions-rail-container";
import { DiscoverRailContainer } from "@/components/discover/discover-rail-container";
import { MENTIONS_METRICS } from "@/lib/mentions/metrics";
import { selectMessageDensityVariables } from "@/lib/messages/density";
import { RESPONSIVE_SHELL_SIZES } from "@/lib/responsive";
import { cn } from "@/lib/utils";
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

const subscribeToDesktopRuntime = () => () => {};

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

  return nextServer ? getServerIndexHref(nextServer) : "/messages";
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
  mentionUnreadCount: number;
  /** SPEC-ETKINLIKLER §2 — "Etkinlikler" satırının saat ipucu (saat + canlı + hata). */
  nextEventClock: NextEventClock;
  pathname: string;
  /**
   * Mesajlar rayı. Kabuk onu **çizmez**, yalnız üçüncü sütuna yerleştirir: rayın
   * verisi (`useDMConversations`) bir sohbet ekranı bağımlılığıdır ve kabuğun
   * onu her rotada çekmesi gereksiz bir sorgu olurdu.
   */
  messagesRail: React.ReactNode;
  /**
   * Bahsetme rayı. Mesajlar rayıyla aynı gerekçe: kabuk onu **çizmez**, yalnız
   * üçüncü sütuna yerleştirir. Rayın verisi (sayaçlar) bir Bahsedilmeler ekranı
   * bağımlılığıdır ve kabuğun onu her rotada çekmesi gereksiz bir sorgu olurdu.
   */
  mentionsRail: React.ReactNode;
  /** Keşfet rayı; yalnız `/discover` rotasında kurulur. */
  discoverRail: React.ReactNode;
  thirdColumn: ThirdColumn;
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
  currentUserId: string;
  /**
   * `08-faz7` §3 — 960'ın altında nav paneli drawer'a taşınır. Masaüstü genişliğinde bile
   * geçerli: kırılım kabuğun `md:` eşiğinden değil, komuta merkezinin kendi eşiğinden gelir.
   */
  navCollapsed?: boolean;
}

const NavigationPanel = React.memo(
  ({
    isMobile,
    activeServerId,
    activeChannelId,
    servers,
    dmUnreadCount,
    mentionUnreadCount,
    nextEventClock,
    pathname,
    messagesRail,
    mentionsRail,
    discoverRail,
    thirdColumn,
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
    currentUserId,
    navCollapsed = false,
  }: NavigationPanelProps) => (
    <div
      className={cn(
        isMobile
          ? "flex h-full min-w-0 flex-1 flex-col bg-[hsl(var(--background))]"
          : navCollapsed
            ? "hidden"
            : "hidden h-full min-w-0 flex-col md:flex",
      )}
    >
      <div className="flex min-h-0 flex-1">
        <div
          className={
            isMobile
              ? "flex h-full w-[var(--server-rail-width)] shrink-0"
              : "flex h-full shrink-0 overflow-hidden"
          }
        >
          <ServerRail
            activeServerId={activeServerId}
            currentUserId={currentUserId}
            loading={serversQueryLoading}
            onNavigate={onNavigate}
            onOpenCreateServer={onOpenCreateServer}
            onOpenServerContextMenu={onOpenServerContextMenu}
            onPrefetch={onPrefetch}
            resolveServerHref={resolveServerHref}
            servers={servers}
          />
        </div>
        {/*
          Mesajlar karar #2: gezinme paneli **her rotada** durur. Ana Sayfa
          paketinin karar #8'i ("2. sütun rota başına değişir") tersine döndü;
          rotaya göre değişen şey artık panelin sağındaki üçüncü sütun.
        */}
        <div
          className={cn(
            isMobile
              ? "flex min-w-0 max-w-[calc(100vw-var(--server-rail-width))] flex-1 overflow-hidden"
              : "flex min-w-0 overflow-hidden",
          )}
          style={isMobile ? undefined : { width: `var(--nav-panel-width)` }}
        >
          <AppNavPanel
            activeServerId={activeServerId}
            currentUser={currentUser}
            dmUnreadCount={dmUnreadCount}
            mentionUnreadCount={mentionUnreadCount}
            nextEventClock={nextEventClock}
            onCurrentUserStatusChange={onCurrentUserStatusChange}
            onOpenCreateServer={onOpenCreateServer}
            onOpenSettings={onOpenSettings}
            onPrefetch={onPrefetch}
            pathname={pathname}
            resolveServerHref={resolveServerHref}
            servers={servers}
          />
        </div>

        {thirdColumn === null ? null : (
          <div
            className={cn(
              "flex min-w-0 overflow-hidden",
              // Sohbet rayı kendi zeminini ve kenarını çizer (SPEC §3); kanal
              // listesi eski kabuğun degrade zeminini korur.
              thirdColumn === "channels" &&
                "border-r border-[hsl(var(--border)/0.48)] bg-[linear-gradient(180deg,hsl(var(--surface-card)/0.64),hsl(var(--surface-soft)/0.22))]",
            )}
            style={isMobile ? undefined : { width: `var(--third-column-width)` }}
          >
            {thirdColumn === "messages" ? (
              messagesRail
            ) : thirdColumn === "mentions" ? (
              mentionsRail
            ) : thirdColumn === "discover" ? (
              discoverRail
            ) : (
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
            )}
          </div>
        )}
      </div>
    </div>
  ),
);

NavigationPanel.displayName = "NavigationPanel";

function MobileShellControls({
  canGoBack,
  navCollapsed,
  onBack,
  onMenu,
}: {
  canGoBack: boolean;
  /** §3 — 960'ın altında nav paneli drawer'da; tetikleyici masaüstü genişliğinde de görünür. */
  navCollapsed: boolean;
  onBack: () => void;
  onMenu: () => void;
}) {
  const { t } = useI18n();
  const visibility = navCollapsed ? "flex items-center" : "flex items-center md:hidden";

  if (canGoBack) {
    return (
      <div className={visibility}>
        <button
          aria-label={t("common.back")}
          className="app-panel-soft text-app-foreground inline-flex h-11 w-11 items-center justify-center rounded-2xl border transition hover:opacity-90 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
          data-testid="mobile-shell-back-button"
          onClick={onBack}
          type="button"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className={visibility}>
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
  const { locale, t } = useI18n();
  const socket = useSocket();
  const appearanceHydratedFromHook = useAppearanceHydration();
  const params = useParams<{
    channelId?: string;
    serverId?: string;
  }>();
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const responsiveLayout = useResponsiveLayout();
  const [addMemberServer, setAddMemberServer] = React.useState<WorkspaceServerSummary | null>(null);
  const [addMemberUsername, setAddMemberUsername] = React.useState("");
  const [addMemberSuccess, setAddMemberSuccess] = React.useState<string | null>(null);
  const [currentUserSnapshot, setCurrentUserSnapshot] = React.useState(currentUser);
  const [currentUserStatus, setCurrentUserStatus] = React.useState(currentUser.status);
  const isDesktopRuntime = useSyncExternalStore(
    subscribeToDesktopRuntime,
    isWhisprDesktopRuntime,
    () => false,
  );
  const subscribeToSocketConnection = React.useCallback(
    (onStoreChange: () => void) => {
      socket.on("connect", onStoreChange);
      socket.on("disconnect", onStoreChange);
      return () => {
        socket.off("connect", onStoreChange);
        socket.off("disconnect", onStoreChange);
      };
    },
    [socket],
  );
  const socketConnected = useSyncExternalStore(
    subscribeToSocketConnection,
    () => socket.connected,
    () => false,
  );
  const [leaveServerCandidate, setLeaveServerCandidate] =
    React.useState<WorkspaceServerSummary | null>(null);
  const [settingsOverlayOpen, setSettingsOverlayOpen] = React.useState(false);
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
    serverContextMenu,
    serverSettingsServerId,
    setActiveRoute,
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
      serverContextMenu: state.serverContextMenu,
      serverSettingsServerId: state.serverSettingsServerId,
      setActiveRoute: state.setActiveRoute,
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
    if (layoutSettings) {
      applyPersistedSettings(layoutSettings);
    }
  }, [layoutSettings, applyPersistedSettings]);

  const rawServerId =
    typeof params.serverId === "string" ? decodeURIComponent(params.serverId) : null;
  // `@me` artık bir sunucu kimliği değil: eski yol sunucu tarafında yönleniyor ve
  // kabuğa hiç ulaşmıyor. Yine de savunma olarak dışlanıyor — yönlendirme
  // atlanan bir yol, burada sahte bir sunucu olarak görünürdü.
  const activeServerId = rawServerId === "@me" ? null : rawServerId;
  const activeChannelId = typeof params.channelId === "string" ? params.channelId : null;
  const activeConversationId = selectActiveConversationId(pathname);
  const isChannelsRootRoute = pathname === MESSAGES_ROUTE;
  const isFriendsRoute = pathname === MESSAGES_FRIENDS_ROUTE || pathname === MESSAGES_ROUTE;
  const isDmRoute = activeConversationId !== null;
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
  // Kabuk sütunları rem: ölçek adımı yükselince içerideki rem tabanlı ikon ve metinlerle birlikte
  // büyürler. px bırakılsaydı kap sabit kalır, içerik büyür ve ayak satırı kırpılırdı (SPEC §8.2.1).
  const displayServerRailWidth = pxToRem(SERVER_RAIL_WIDTH);
  // Faz 2 §3, Mesajlar karar #2: 3. sütun rotadan seçilir; tek seçici, kopyalanmış
  // kabuk yok. Gezinme paneli artık her rotada ve sabit genişlikte.
  const thirdColumn = selectThirdColumn(pathname);
  const navPanelWidth = pxToRem(HOME_METRICS.panel.width);
  /**
   * Üçüncü sütunun genişliği. Sohbet rayı SPEC §3'ün 276'sında sabit; kanal
   * listesi kullanıcının ayarlayabildiği genişliğini korur.
   */
  const thirdColumnWidth =
    thirdColumn === "messages"
      ? pxToRem(MESSAGES_METRICS.layout.railWidth)
      : thirdColumn === "mentions"
        ? // SPEC-BAHSEDILMELER §1 — bahsetme rayı da 276; iki ray aynı sayıda
          // olsa bile sözlükler ayrı, çünkü biri diğerinin ölçüsünü sürükleyemez.
          pxToRem(MENTIONS_METRICS.shell.railWidth)
        : thirdColumn === "discover"
          ? pxToRem(276)
          : pxToRem(channelSidebarWidth);
  const showMobileBackButton = isDmRoute || isServerConversationRoute;
  /**
   * `08-faz7` §3 — nav paneli 960'ın altında drawer'a taşınır.
   *
   * Kural artık üçüncü sütunu **olmayan** rotalara ve Mesajlar'a ait
   * (SPEC-MESAJLAR PROMPT §7: "<960px sohbet rayı drawer'a taşınır"). Sunucu
   * rotaları kabuğun kendi `md:` eşiğinde (768) kalır: onların kanal listesi bu
   * pakette değişmedi ve eşiği kaydırmak, bu paketin dokunmadığı bir ekranı
   * 768–960 arasında sessizce yeniden düzenlerdi.
   */
  const navCollapsed =
    thirdColumn !== "channels" &&
    selectCommandCenterLayout(responsiveLayout.viewportWidth) === "narrow" &&
    !responsiveLayout.shouldMountWorkspaceDrawer;
  const shouldShowMobileWorkspaceDrawer =
    mobileSidebarOpen && (responsiveLayout.shouldMountWorkspaceDrawer || navCollapsed);
  useBodyScrollLock(shouldShowMobileWorkspaceDrawer || settingsOverlayOpen);

  useEffect(() => {
    if (!shouldShowMobileWorkspaceDrawer) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileSidebarOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [setMobileSidebarOpen, shouldShowMobileWorkspaceDrawer]);

  /**
   * Drawer kapanınca focus **tetikleyiciye** döner (`00-ortak-baglam` §5.3). Drawer bir
   * portal değil ama koşullu bir ağaç: kapanınca içindeki odaklı öğe DOM'dan düşer ve focus
   * belgenin başına kaçar; klavye kullanıcısı sekme turuna baştan başlamak zorunda kalırdı.
   */
  useEffect(() => {
    if (!shouldShowMobileWorkspaceDrawer) {
      return;
    }

    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    return () => {
      if (trigger?.isConnected) {
        trigger.focus();
      }
    };
  }, [shouldShowMobileWorkspaceDrawer]);

  useEffect(() => {
    if (mobileSidebarOpen && !responsiveLayout.shouldMountWorkspaceDrawer && !navCollapsed) {
      setMobileSidebarOpen(false);
    }
  }, [
    mobileSidebarOpen,
    navCollapsed,
    responsiveLayout.shouldMountWorkspaceDrawer,
    setMobileSidebarOpen,
  ]);

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
      const queryKey = getMessagesQueryKey("channel", data.channelId);
      const cached = queryClient.getQueryData<MessagePages>(queryKey);

      // The event names the message it is reporting, so a list that already
      // holds it is not stale. Without this check an open channel refetched
      // every page it had loaded to recover a message it already had.
      const hasLatestMessage = cached?.pages.some((page) =>
        page.messages.some((message) => message.id === data.latestMessageId),
      );

      if (hasLatestMessage) {
        return;
      }

      void queryClient.invalidateQueries({ exact: true, queryKey });
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
        router.push("/messages");
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
      reason: "banned" | "deleted" | "kicked" | "left";
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
  // Faz 2 §4: DM ve bahsedilme sayaçları tek kaynaktan; Ana Sayfa (Faz 4) aynı hook'u çağırır.
  const unreadCounters = useUnreadCounters({
    conversations: dmConversations,
    currentUserId: currentUser.id,
  });
  // SPEC-ETKINLIKLER §2 ipucu; sayaçlar `/events` açıkken listeden, değilken hafif uçtan gelir.
  const nextEventClock = useNextEventClock();
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
  const interfaceDensity = layoutSettings?.interfaceDensity ?? "COMFORTABLE";
  const densityMetrics = getInterfaceDensityMetrics(interfaceDensity);
  const messageDensity = selectMessageDensityVariables(interfaceDensity);
  const shellStyle = useMemo(
    () =>
      ({
        // `getInterfaceDensityMetrics` tasarım pikseli döndürür (mobil de aynı sayıları okur);
        // web tarafı ölçek adımıyla büyüsün diye rem'e çevirir (SPEC §8.2.1).
        "--density-control-min-height": pxToRem(densityMetrics.controlMinHeight),
        // Mesajlar §1: satır iç boşluğu ve mesaj arası, yoğunluk tercihinden
        // türer. İkinci bir yoğunluk kaynağı yok.
        "--m-gap": pxToRem(messageDensity.rowGap),
        "--m-pad": pxToRem(messageDensity.rowPaddingY),
        // `--act`: 1 satır eylemleri hep görünür, 0 yalnız hover **ve** klavye odağı.
        "--act": messageDensity.rowActionsAlwaysVisible ? "1" : "0",
        "--density-row-gap": pxToRem(densityMetrics.rowGap),
        "--density-section-gap": pxToRem(densityMetrics.sectionGap),
        "--density-vertical-padding": pxToRem(densityMetrics.verticalPadding),
        "--nav-panel-width": navPanelWidth,
        "--server-rail-width": displayServerRailWidth,
        "--third-column-width": thirdColumnWidth,
      }) as CSSProperties,
    [densityMetrics, displayServerRailWidth, messageDensity, navPanelWidth, thirdColumnWidth],
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
        router.replace(`/messages/${persistedActiveChannelId}`);
        return;
      }

      if (persistedActiveArea === "friends") {
        router.replace("/messages");
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

  // `NavigationPanel`/`AppNavPanel` `React.memo`; her render'da yeni kimlik alan bir geri çağırım
  // memo'yu işe yaramaz hale getirirdi (Faz 2 §3).
  const navigate = React.useCallback(
    (href: string) => {
      setMobileSidebarOpen(false);
      router.push(href);
    },
    [router, setMobileSidebarOpen],
  );

  /**
   * Ray yalnız Mesajlar rotalarında monte edilir: bileşen kendi sorgusunu açıyor
   * ve Ana Sayfa'da hiç okunmayacak bir listeyi çekmesi için sebep yok.
   */
  const messagesRail =
    thirdColumn === "messages" ? (
      <MessagesRailContainer currentUserId={currentUser.id} onNavigate={navigate} />
    ) : null;

  /**
   * Ray yalnız Bahsedilmeler rotasında monte edilir. Kaynak satırlarının adı ve
   * baş harfi kabuğun **zaten** çektiği sunucu listesinden gelir; ikinci bir
   * `/api/v1/servers` isteği açmak aynı veriyi iki kez getirmek olurdu.
   */
  const mentionsRail =
    thirdColumn === "mentions" ? (
      <MentionsRailContainer servers={servers} username={currentUser.username} />
    ) : null;

  const discoverRail = thirdColumn === "discover" ? <DiscoverRailContainer /> : null;

  const prefetch = React.useCallback(
    (href: string) => {
      router.prefetch(href);
    },
    [router],
  );

  const openSettings = React.useCallback(() => {
    setMobileSidebarOpen(false);
    setSettingsOverlayOpen(true);
  }, [setMobileSidebarOpen, setSettingsOverlayOpen]);

  const openCreateServer = React.useCallback(() => {
    openServerModal({ mode: "create" });
  }, [openServerModal]);

  const handleOpenServerContextMenu = React.useCallback(
    (serverId: string, event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      openServerContextMenu(serverId, { x: event.clientX, y: event.clientY });
    },
    [openServerContextMenu],
  );

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
      router.push("/messages");
      return;
    }

    if (isServerConversationRoute) {
      setMobileSidebarOpen(true);
    }
  };

  return (
    <AccountPreferenceProvider locale={locale} preferences={layoutSettings ?? null}>
      {/*
        Faz 5 §3.3 ve §5.1: odak katmanı ile komut paleti kabuğun içinde, çünkü
        ikisini de hem `children` (Ana Sayfa) hem de navigasyon panelinin kullanıcı
        ayağı okuyor. Daha yukarıya taşımak ikisini de rota kabuğu olmayan
        yüzeylere (giriş ekranları) yayardı.
      */}
      <FocusControlsProvider>
        <CommandPaletteProvider onOpenCreateServer={openCreateServer} onOpenSettings={openSettings}>
          <div
            className={cn(
              "app-shell whispr-channel-shell flex h-[100dvh] overflow-hidden p-0 md:h-screen md:p-3",
              thirdColumn === "messages" && "messages-reference-surface",
            )}
            data-interface-density={interfaceDensity.toLowerCase()}
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
              // §3 — 960'ın altında sütun hiç yer kaplamaz; ana alan tam genişliğe yayılır.
              className={cn("hidden h-full shrink-0", navCollapsed ? "" : "md:flex")}
              // Drawer açıkken arka plan `inert`: focus overlay'in dışına kaçamaz (§2.4).
              inert={shouldShowMobileWorkspaceDrawer}
              style={
                navCollapsed
                  ? undefined
                  : {
                      width:
                        thirdColumn === null
                          ? `calc(${displayServerRailWidth} + ${navPanelWidth})`
                          : `calc(${displayServerRailWidth} + ${navPanelWidth} + ${thirdColumnWidth})`,
                    }
              }
              suppressHydrationWarning
            >
              <NavigationPanel
                isMobile={false}
                activeServerId={activeServerId}
                activeChannelId={activeChannelId}
                servers={servers}
                dmUnreadCount={unreadCounters.dm}
                mentionUnreadCount={unreadCounters.mentions}
                navCollapsed={navCollapsed}
                nextEventClock={nextEventClock}
                pathname={pathname}
                messagesRail={messagesRail}
                mentionsRail={mentionsRail}
                discoverRail={discoverRail}
                thirdColumn={thirdColumn}
                serversQueryLoading={serversQuery.isLoading}
                serverDetailQueryData={serverDetailQuery.data}
                serverDetailQueryLoading={serverDetailQuery.isLoading}
                currentUser={visibleCurrentUser}
                currentUserId={currentUser.id}
                onNavigate={navigate}
                onPrefetch={prefetch}
                onOpenCreateServer={openCreateServer}
                onOpenServerContextMenu={handleOpenServerContextMenu}
                onOpenSettings={openSettings}
                onCurrentUserStatusChange={setCurrentUserStatus}
                resolveServerHref={resolveServerHref}
              />
            </div>

            <AnimatePresence>
              {shouldShowMobileWorkspaceDrawer ? (
                <motion.div
                  animate={{ opacity: 1 }}
                  className={cn("fixed inset-0 z-[70]", navCollapsed ? "" : "md:hidden")}
                  exit={{ opacity: 0 }}
                  initial={{ opacity: 0 }}
                >
                  <div
                    className="absolute inset-0 bg-[hsl(var(--backdrop)/0.52)] backdrop-blur-xs"
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
                    style={{ width: RESPONSIVE_SHELL_SIZES.mobileWorkspaceDrawerWidth }}
                    transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                    suppressHydrationWarning
                  >
                    <NavigationPanel
                      isMobile={true}
                      activeServerId={activeServerId}
                      activeChannelId={activeChannelId}
                      servers={servers}
                      dmUnreadCount={unreadCounters.dm}
                      mentionUnreadCount={unreadCounters.mentions}
                      nextEventClock={nextEventClock}
                      pathname={pathname}
                      messagesRail={messagesRail}
                      mentionsRail={mentionsRail}
                      discoverRail={discoverRail}
                      thirdColumn={thirdColumn}
                      serversQueryLoading={serversQuery.isLoading}
                      serverDetailQueryData={serverDetailQuery.data}
                      serverDetailQueryLoading={serverDetailQuery.isLoading}
                      currentUser={visibleCurrentUser}
                      currentUserId={currentUser.id}
                      onNavigate={navigate}
                      onPrefetch={prefetch}
                      onOpenCreateServer={openCreateServer}
                      onOpenServerContextMenu={handleOpenServerContextMenu}
                      onOpenSettings={openSettings}
                      onCurrentUserStatusChange={setCurrentUserStatus}
                      resolveServerHref={resolveServerHref}
                    />
                  </motion.div>
                </motion.div>
              ) : null}
            </AnimatePresence>

            <div className="flex min-w-0 flex-1 md:gap-0" inert={shouldShowMobileWorkspaceDrawer}>
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
                leadingAlwaysVisible={navCollapsed}
                leading={
                  <MobileShellControls
                    canGoBack={showMobileBackButton}
                    navCollapsed={navCollapsed}
                    onBack={handleMobileBack}
                    onMenu={() => setMobileSidebarOpen(true)}
                  />
                }
              >
                {children}
              </MainChannelPanel>
              {responsiveLayout.shouldMountDesktopSupportPanel &&
              activeServerId &&
              serverDetailQuery.data ? (
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
              {canAddUserFromContextMenu && canManageContextServer ? (
                <ContextMenuSeparator />
              ) : null}
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
              detail={
                serverSettingsServerId === activeServerId ? (serverDetailQuery.data ?? null) : null
              }
              onOpenDeleteServer={openDeleteServerFromSettings}
              open={Boolean(serverSettingsServerId && serverSettingsServerId === activeServerId)}
              uploadthingEnabled={uploadthingEnabled}
            />

            <InAppSettingsOverlay
              onClose={() => setSettingsOverlayOpen(false)}
              open={settingsOverlayOpen}
            />
          </div>
        </CommandPaletteProvider>
      </FocusControlsProvider>
    </AccountPreferenceProvider>
  );
}
