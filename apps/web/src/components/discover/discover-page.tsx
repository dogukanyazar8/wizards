"use client";

import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  DiscoverChannel,
  DiscoverCategory,
  DiscoverEvent,
  DiscoverLane,
  DiscoverPerson,
  DiscoverQuery,
  DiscoverServer,
} from "@wizards/types";

import {
  DiscoverCardSkeleton,
  type DiscoverCardSkeletonProps,
} from "@/components/discover/discover-card-skeleton";
import {
  DiscoverChannelRow,
  type DiscoverChannelRowProps,
} from "@/components/discover/discover-channel-row";
import { DiscoverEmptyState } from "@/components/discover/discover-empty-state";
import { DiscoverErrorState } from "@/components/discover/discover-error-state";
import {
  DiscoverEventCard,
  type DiscoverEventCardProps,
} from "@/components/discover/discover-event-card";
import { DiscoverGrid, type DiscoverGridProps } from "@/components/discover/discover-grid";
import { DiscoverJoinedBanner } from "@/components/discover/discover-joined-banner";
import {
  DiscoverPersonCard,
  type DiscoverPersonCardProps,
} from "@/components/discover/discover-person-card";
import { DiscoverResponsive } from "@/components/discover/discover-responsive";
import {
  DiscoverServerCard,
  type DiscoverServerCardProps,
} from "@/components/discover/discover-server-card";
import { ServerJoinModal } from "@/components/discover/server-join-modal";
import { ServerProfilePanel } from "@/components/discover/server-profile-panel";
import {
  DiscoverFeedHeader,
  type DiscoverCardSize,
  type DiscoverLaneCounts,
} from "@/components/discover/discover-feed-header";
import {
  DiscoverFeatured,
  discoverFeaturedPreviewId,
  shouldShowDiscoverFeatured,
} from "@/components/discover/discover-featured";
import { DiscoverFilterStrip } from "@/components/discover/discover-filter-strip";
import { DiscoverSectionHead } from "@/components/discover/discover-section-head";
import { useI18n } from "@/components/providers/locale-provider";
import { useAuthenticatedAppRuntime } from "@/components/providers/authenticated-app-providers";
import { useToast } from "@/hooks/use-toast";
import { DISCOVER_CARD_SIZE_STORAGE_KEY } from "@/lib/discover/contracts";
import { resolveServerAbbreviation } from "@/lib/servers/server-icon-presentation";
import {
  DISCOVER_STALE_TIME_MS,
  discoverQueryKeys,
  fetchDiscoverChannels,
  fetchDiscoverEvents,
  fetchDiscoverPeople,
  fetchDiscoverProfile,
  fetchDiscoverServers,
  type DiscoverChannelClientPage,
  type DiscoverEventClientPage,
  type DiscoverPersonClientPage,
  type DiscoverServerClientPage,
} from "@/lib/discover/client";
import { hairline, pxToRem } from "@/lib/discover/metrics";
import {
  applyDiscoverMembershipSuccess,
  joinDiscoverServer,
  leaveDiscoverServer,
  resolveDiscoverJoinErrorMessageKey,
} from "@/lib/discover/join-client";
import {
  buildDiscoverHref,
  closeTopDiscoverLayer,
  type DiscoverRouteState,
} from "@/lib/discover/routes";
import { useDiscoverRoute } from "@/lib/discover/use-discover-route";
import { useDiscoverPageSize } from "@/lib/discover/scale";

type DiscoverGridItem = DiscoverServer | DiscoverPerson | DiscoverChannel | DiscoverEvent;
type DiscoverMembershipTarget = Pick<DiscoverServer, "id" | "joined" | "name">;
type DiscoverPanelFocusTarget = HTMLElement | string;
type CardSizeStorage = Pick<Storage, "getItem" | "setItem">;
type CardSizeListener = () => void;

const cardSizeListeners = new Set<CardSizeListener>();
let sessionDiscoverCardSize: DiscoverCardSize = "medium";

export type DiscoverJoinedServer = {
  readonly id: string;
  readonly name: string;
  readonly systemChannelId: string | null;
};

export type DiscoverJoinedBannerState = {
  readonly routeKey: string;
  readonly server: DiscoverJoinedServer | null;
};

export type ServerProfilePanelSlotProps = {
  readonly currentUserId: string;
  readonly isError: boolean;
  readonly isLoading: boolean;
  readonly isMembershipPending: boolean;
  readonly onJoin: () => void;
  readonly onLeave: () => void;
  readonly onRequestClose: () => void;
  readonly onRetry: () => void;
  readonly panelServerId: string;
  readonly placeholderCategory: DiscoverServer["category"];
  readonly placeholderInitials: string;
  readonly placeholderName: string;
  readonly profile: Awaited<ReturnType<typeof fetchDiscoverProfile>> | undefined;
};

export type ServerJoinModalSlotProps = {
  readonly onRequestClose: () => void;
  readonly onServerJoined: (server: DiscoverJoinedServer) => void;
  readonly serverOptions: readonly DiscoverServer[];
};

export type DiscoverJoinedBannerSlotProps = {
  readonly onDismiss: () => void;
  readonly server: DiscoverJoinedServer;
};

export type DiscoverEmptyStateSlotProps = {
  readonly onJoinServer: () => void;
  readonly route: DiscoverRouteState;
};

export type DiscoverErrorStateSlotProps = {
  readonly error: unknown;
  readonly failedAt: Date;
  readonly isRetrying: boolean;
  readonly onJoinServer: () => void;
  readonly onRetry: () => void;
  readonly route: DiscoverRouteState;
};

export type DiscoverResponsiveSlotProps = {
  readonly categories: readonly DiscoverCategory[] | null;
  readonly onRequestPanelClose: () => void;
  readonly panelServerId: string | null;
  readonly route: DiscoverRouteState;
};

/**
 * Ş6–Ş9 bu yüzeye yalnız kendi bileşenlerinin çizicisini ekler; URL/query orkestrasyonu burada
 * kalır. Adlar doğrudan sahiplenilen dosyalardaki bileşen adlarıdır.
 */
export type DiscoverPageProps = {
  readonly onAddFriend?: DiscoverPersonCardProps["onAddFriend"];
  readonly onOpenChannel?: DiscoverChannelRowProps["onOpen"];
  readonly onOpenEvent?: DiscoverEventCardProps["onOpen"];
  readonly onOpenPerson?: DiscoverPersonCardProps["onOpen"];
  readonly onPreviewChannel?: DiscoverChannelRowProps["onPreview"];
  readonly onToggleEventInterest?: DiscoverEventCardProps["onToggleInterest"];
  readonly onToggleServerJoin?: DiscoverServerCardProps["onToggleJoin"];
  readonly onViewEventDetails?: DiscoverEventCardProps["onViewDetails"];
  readonly renderDiscoverCardSkeleton?: (props: DiscoverCardSkeletonProps) => ReactNode;
  readonly renderDiscoverChannelRow?: (props: DiscoverChannelRowProps) => ReactNode;
  readonly renderDiscoverEmptyState?: (props: DiscoverEmptyStateSlotProps) => ReactNode;
  readonly renderDiscoverErrorState?: (props: DiscoverErrorStateSlotProps) => ReactNode;
  readonly renderDiscoverEventCard?: (props: DiscoverEventCardProps) => ReactNode;
  readonly renderDiscoverGrid?: (props: DiscoverGridProps) => ReactNode;
  readonly renderDiscoverJoinedBanner?: (props: DiscoverJoinedBannerSlotProps) => ReactNode;
  readonly renderDiscoverPersonCard?: (props: DiscoverPersonCardProps) => ReactNode;
  readonly renderDiscoverResponsive?: (props: DiscoverResponsiveSlotProps) => ReactNode;
  readonly renderDiscoverServerCard?: (props: DiscoverServerCardProps) => ReactNode;
  readonly renderServerJoinModal?: (props: ServerJoinModalSlotProps) => ReactNode;
  readonly renderServerProfilePanel?: (props: ServerProfilePanelSlotProps) => ReactNode;
};

function renderDefaultServerProfilePanel(props: ServerProfilePanelSlotProps): ReactNode {
  return <ServerProfilePanel {...props} />;
}

function renderDefaultCardSkeleton(props: DiscoverCardSkeletonProps): ReactNode {
  return <DiscoverCardSkeleton {...props} />;
}

function renderDefaultChannelRow(props: DiscoverChannelRowProps): ReactNode {
  return <DiscoverChannelRow {...props} />;
}

function renderDefaultEventCard(props: DiscoverEventCardProps): ReactNode {
  return <DiscoverEventCard {...props} />;
}

function renderDefaultGrid(props: DiscoverGridProps): ReactNode {
  return <DiscoverGrid {...props} />;
}

function renderDefaultPersonCard(props: DiscoverPersonCardProps): ReactNode {
  return <DiscoverPersonCard {...props} />;
}

function renderDefaultServerCard(props: DiscoverServerCardProps): ReactNode {
  return <DiscoverServerCard {...props} />;
}

function renderDefaultEmptyState(props: DiscoverEmptyStateSlotProps): ReactNode {
  return <DiscoverEmptyState {...props} />;
}

function renderDefaultErrorState(props: DiscoverErrorStateSlotProps): ReactNode {
  return <DiscoverErrorState {...props} />;
}

function renderDefaultResponsive(props: DiscoverResponsiveSlotProps): ReactNode {
  return <DiscoverResponsive {...props} />;
}

export function discoverLaneQueryEnablement(lane: DiscoverLane) {
  return {
    channels: lane === "channels",
    events: lane === "events",
    people: lane === "people",
    servers: lane === "servers",
  };
}

export function discoverPanelVisibility(isPanelOpen: boolean) {
  const visible = !isPanelOpen;
  return { featured: visible, iconGroup: visible, laneGroup: visible };
}

type DiscoverPanelServerSource = Pick<DiscoverServer, "category" | "id" | "initials" | "name">;
type DiscoverPanelChannelSource = Pick<
  DiscoverChannel,
  "serverCategory" | "serverId" | "serverName"
>;

export function resolveDiscoverPanelPlaceholder(
  panelServerId: string | null,
  servers: readonly DiscoverPanelServerSource[],
  featured: DiscoverPanelServerSource | null,
  channels: readonly DiscoverPanelChannelSource[],
) {
  if (panelServerId === null) {
    return null;
  }

  const server =
    servers.find((item) => item.id === panelServerId) ??
    (featured?.id === panelServerId ? featured : null);
  if (server) {
    return {
      category: server.category,
      initials: server.initials,
      name: server.name,
    };
  }

  const channel = channels.find((item) => item.serverId === panelServerId);
  return channel
    ? {
        category: channel.serverCategory,
        initials: resolveServerAbbreviation(channel.serverName, null),
        name: channel.serverName,
      }
    : null;
}

export function closeDiscoverLayerHref(route: DiscoverRouteState): string | null {
  const next = closeTopDiscoverLayer(route);
  return next === route ? null : buildDiscoverHref(next);
}

export function discoverClosedLayer(
  previous: DiscoverRouteState,
  current: DiscoverRouteState,
): "modal" | "panel" | null {
  if (previous.modal !== null && current.modal === null) {
    return "modal";
  }
  if (previous.panelServerId !== null && current.panelServerId === null) {
    return "panel";
  }
  return null;
}

export function discoverJoinedBannerRouteKey(route: DiscoverRouteState): string {
  return buildDiscoverHref({ ...route, modal: null });
}

export function reconcileDiscoverJoinedBanner(
  state: DiscoverJoinedBannerState,
  routeKey: string,
): DiscoverJoinedBannerState {
  return state.routeKey === routeKey ? state : { routeKey, server: null };
}

export function clearDiscoverJoinedBannerForServer(
  state: DiscoverJoinedBannerState,
  serverId: string,
): DiscoverJoinedBannerState {
  return state.server?.id === serverId ? { ...state, server: null } : state;
}

export function handleDiscoverEscape(
  route: DiscoverRouteState,
  replaceHref: (href: string) => void,
): boolean {
  const href = closeDiscoverLayerHref(route);
  if (href === null) {
    return false;
  }
  replaceHref(href);
  return true;
}

export function readDiscoverCardSize(storage: CardSizeStorage | null): DiscoverCardSize {
  if (storage === null) {
    return "medium";
  }

  try {
    return storage.getItem(DISCOVER_CARD_SIZE_STORAGE_KEY) === "large" ? "large" : "medium";
  } catch {
    return "medium";
  }
}

export function writeDiscoverCardSize(
  storage: CardSizeStorage | null,
  value: DiscoverCardSize,
): void {
  if (storage === null) {
    return;
  }

  try {
    storage.setItem(DISCOVER_CARD_SIZE_STORAGE_KEY, value);
  } catch {
    // Depolama güvenlik/politika nedeniyle kapalıysa görünüm tercihi yalnız bu oturumda kalır.
  }
}

function readClientDiscoverCardSize(): DiscoverCardSize {
  try {
    sessionDiscoverCardSize = readDiscoverCardSize(window.localStorage);
  } catch {
    // Bazı gizlilik politikaları localStorage getter'ını bile engeller; oturum tercihi sürer.
  }

  return sessionDiscoverCardSize;
}

function readServerDiscoverCardSize(): DiscoverCardSize {
  return "medium";
}

function subscribeDiscoverCardSize(listener: CardSizeListener): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === DISCOVER_CARD_SIZE_STORAGE_KEY) {
      listener();
    }
  };

  cardSizeListeners.add(listener);
  window.addEventListener("storage", onStorage);
  return () => {
    cardSizeListeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function announceDiscoverCardSizeChange(): void {
  cardSizeListeners.forEach((listener) => listener());
}

function restoreDiscoverTriggerFocus(target: DiscoverPanelFocusTarget | null): void {
  if (target === null) {
    return;
  }

  window.requestAnimationFrame(() => {
    const element = typeof target === "string" ? document.getElementById(target) : target;
    if (element?.isConnected) {
      element.focus();
    }
  });
}

function flattenPages<Item>(
  data: { readonly pages: readonly { items: readonly Item[] }[] } | undefined,
) {
  return data?.pages.flatMap((page) => page.items) ?? [];
}

export function readDiscoverPageTotal<Item>(
  data:
    | {
        readonly pages: readonly {
          readonly items: readonly Item[];
          readonly totalCount?: number | undefined;
        }[];
      }
    | undefined,
  useLoadedCount = false,
): number | null {
  if (!data) {
    return null;
  }

  return (
    data.pages[0]?.totalCount ??
    (useLoadedCount ? data.pages.reduce((sum, page) => sum + page.items.length, 0) : null)
  );
}

// TODO(Ş6): Ş6 renderer'ı bağlanınca bu basit yer tutucu kaldırılır.
function DiscoverGridPlaceholder({ cardSize, children, lane }: DiscoverGridProps) {
  const min = cardSize === "large" ? 330 : 262;
  return (
    <div
      data-testid="discover-grid-placeholder"
      style={{
        display: "grid",
        gap: pxToRem(lane === "channels" ? 8 : 12),
        gridTemplateColumns:
          lane === "channels" ? "1fr" : `repeat(auto-fill,minmax(${pxToRem(min)},1fr))`,
      }}
    >
      {children}
    </div>
  );
}

// TODO(Ş6): Kart renderer'ları bağlanana dek veri yerini ve ölçüsünü korur.
function DiscoverCardPlaceholder({
  id,
  lane,
}: {
  readonly id: string;
  readonly lane: DiscoverLane;
}) {
  return (
    <div
      aria-hidden
      className="bg-[hsl(var(--surface-card)/0.6)]"
      data-placeholder-id={id}
      style={{
        border: "max(1px, 0.0625rem) solid hsl(var(--border)/0.6)",
        borderRadius: pxToRem(lane === "channels" ? 16 : 18),
        minHeight: pxToRem(lane === "channels" ? 64 : 154),
      }}
    />
  );
}

export function DiscoverPage({
  onAddFriend,
  onOpenChannel,
  onOpenEvent,
  onOpenPerson,
  onPreviewChannel,
  onToggleEventInterest,
  onToggleServerJoin,
  onViewEventDetails,
  renderDiscoverCardSkeleton = renderDefaultCardSkeleton,
  renderDiscoverChannelRow = renderDefaultChannelRow,
  renderDiscoverEmptyState = renderDefaultEmptyState,
  renderDiscoverErrorState = renderDefaultErrorState,
  renderDiscoverEventCard = renderDefaultEventCard,
  renderDiscoverGrid = renderDefaultGrid,
  renderDiscoverJoinedBanner,
  renderDiscoverPersonCard = renderDefaultPersonCard,
  renderDiscoverResponsive = renderDefaultResponsive,
  renderDiscoverServerCard = renderDefaultServerCard,
  renderServerJoinModal,
  renderServerProfilePanel = renderDefaultServerProfilePanel,
}: DiscoverPageProps = {}) {
  const { t } = useI18n();
  const { currentUser } = useAuthenticatedAppRuntime();
  const { show } = useToast();
  const { push, replaceHref, route } = useDiscoverRoute();
  const queryClient = useQueryClient();
  const pageSize = useDiscoverPageSize();
  const cardSize = useSyncExternalStore(
    subscribeDiscoverCardSize,
    readClientDiscoverCardSize,
    readServerDiscoverCardSize,
  );
  const joinedBannerRouteKey = discoverJoinedBannerRouteKey(route);
  const [joinedBanner, setJoinedBanner] = useState<DiscoverJoinedBannerState>({
    routeKey: joinedBannerRouteKey,
    server: null,
  });
  const [modalTrigger, setModalTrigger] = useState<HTMLElement | null>(null);
  const [panelTrigger, setPanelTrigger] = useState<DiscoverPanelFocusTarget | null>(null);
  const previousLayerRouteRef = useRef(route);
  const enabled = discoverLaneQueryEnablement(route.lane);
  const isPanelOpen = route.panelServerId !== null;
  const visibility = discoverPanelVisibility(isPanelOpen);
  const reconciledJoinedBanner = reconcileDiscoverJoinedBanner(joinedBanner, joinedBannerRouteKey);
  if (reconciledJoinedBanner !== joinedBanner) {
    setJoinedBanner(reconciledJoinedBanner);
  }
  const visibleJoinedBanner =
    reconciledJoinedBanner.routeKey === joinedBannerRouteKey ? reconciledJoinedBanner.server : null;
  const showJoinedServer = (server: DiscoverJoinedServer) => {
    setJoinedBanner({ routeKey: joinedBannerRouteKey, server });
  };
  const membershipMutation = useMutation({
    mutationFn: async (server: DiscoverMembershipTarget) => {
      if (server.joined) {
        await leaveDiscoverServer(server.id);
        return { joined: false, name: server.name, serverId: server.id };
      }

      const joinedServerResult = await joinDiscoverServer(server.id);
      return { joined: true, ...joinedServerResult };
    },
    onSuccess: async (result) => {
      await applyDiscoverMembershipSuccess(queryClient, result.serverId, result.joined);
      if (result.joined) {
        showJoinedServer({ id: result.serverId, name: result.name, systemChannelId: null });
      } else {
        setJoinedBanner((current) => clearDiscoverJoinedBannerForServer(current, result.serverId));
      }
    },
    onError: (error) => {
      const messageKey = resolveDiscoverJoinErrorMessageKey(error);
      show({ message: t(`${messageKey}.description`), tone: "danger" });
    },
  });
  const requestMembership = (server: DiscoverMembershipTarget) => {
    if (!membershipMutation.isPending) {
      membershipMutation.mutate(server);
    }
  };
  const toggleServerMembership: DiscoverServerCardProps["onToggleJoin"] =
    onToggleServerJoin ??
    ((server) => requestMembership({ id: server.id, joined: server.joined, name: server.name }));

  const captureModalTrigger = () => {
    setModalTrigger(document.activeElement instanceof HTMLElement ? document.activeElement : null);
  };
  const capturePanelTrigger = () => {
    setPanelTrigger(document.activeElement instanceof HTMLElement ? document.activeElement : null);
  };
  const captureFeaturedPanelTrigger = (serverId: string) => {
    setPanelTrigger(discoverFeaturedPreviewId(serverId));
  };
  const openJoinModal = () => {
    captureModalTrigger();
    push({ modal: "join" });
  };
  const openServerPanel = (serverId: string) => {
    capturePanelTrigger();
    push({ panelServerId: serverId });
  };
  const closeJoinModal = () => {
    push({ modal: null });
  };
  const closeServerPanel = () => {
    push({ panelServerId: null });
  };

  useEffect(() => {
    const closedLayer = discoverClosedLayer(previousLayerRouteRef.current, route);
    previousLayerRouteRef.current = route;
    if (closedLayer === "modal") {
      restoreDiscoverTriggerFocus(modalTrigger);
    } else if (closedLayer === "panel") {
      restoreDiscoverTriggerFocus(panelTrigger);
    }
  }, [modalTrigger, panelTrigger, route]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }

      if (!handleDiscoverEscape(route, replaceHref)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [replaceHref, route]);

  const serverQueryInput = useMemo<DiscoverQuery>(
    () => ({
      category: route.category,
      lane: "servers",
      ...(route.q ? { q: route.q } : {}),
      sort: route.sort,
    }),
    [route.category, route.q, route.sort],
  );

  const serversQuery = useInfiniteQuery({
    enabled: enabled.servers,
    getNextPageParam: (page: DiscoverServerClientPage) => page.nextCursor ?? undefined,
    initialPageParam: null,
    queryFn: ({ pageParam }) => fetchDiscoverServers(serverQueryInput, pageParam, pageSize),
    queryKey: discoverQueryKeys.servers(serverQueryInput, pageSize),
    staleTime: DISCOVER_STALE_TIME_MS.servers,
  });
  const peopleQuery = useInfiniteQuery({
    enabled: enabled.people,
    getNextPageParam: (page: DiscoverPersonClientPage) => page.nextCursor ?? undefined,
    initialPageParam: null,
    queryFn: () => fetchDiscoverPeople(route.q),
    queryKey: discoverQueryKeys.people(route.q),
    staleTime: DISCOVER_STALE_TIME_MS.people,
  });
  const channelsQuery = useInfiniteQuery({
    enabled: enabled.channels,
    getNextPageParam: (page: DiscoverChannelClientPage) => page.nextCursor ?? undefined,
    initialPageParam: null,
    queryFn: ({ pageParam }) => fetchDiscoverChannels(route.q, pageParam, pageSize),
    queryKey: discoverQueryKeys.channels(route.q, pageSize),
    staleTime: DISCOVER_STALE_TIME_MS.channels,
  });
  const eventsQuery = useInfiniteQuery({
    enabled: enabled.events,
    getNextPageParam: (page: DiscoverEventClientPage) => page.nextCursor ?? undefined,
    initialPageParam: null,
    queryFn: ({ pageParam }) => fetchDiscoverEvents(route.q, pageParam, pageSize),
    queryKey: discoverQueryKeys.events(route.q, pageSize),
    staleTime: DISCOVER_STALE_TIME_MS.events,
  });
  const profileQuery = useQuery({
    enabled: route.panelServerId !== null,
    queryFn: () => fetchDiscoverProfile(route.panelServerId ?? ""),
    queryKey: discoverQueryKeys.profile(route.panelServerId ?? ""),
    staleTime: DISCOVER_STALE_TIME_MS.profile,
  });

  const serverItems = flattenPages(serversQuery.data);
  const peopleItems = flattenPages(peopleQuery.data);
  const channelItems = flattenPages(channelsQuery.data);
  const eventItems = flattenPages(eventsQuery.data);
  const laneCounts: DiscoverLaneCounts = {
    channels: readDiscoverPageTotal(channelsQuery.data),
    events: readDiscoverPageTotal(eventsQuery.data),
    people: readDiscoverPageTotal(peopleQuery.data, true),
    servers: readDiscoverPageTotal(serversQuery.data),
  };

  let activeItems: readonly DiscoverGridItem[];
  let resultCount: number | null;
  let isLoading: boolean;
  let isError: boolean;
  let isRetrying: boolean;
  let activeError: unknown;
  let errorUpdatedAt: number;
  let hasNextPage: boolean;
  let isFetchingNextPage: boolean;
  let loadMore: () => void;
  let retry: () => void;

  switch (route.lane) {
    case "servers":
      activeItems = serverItems;
      resultCount = laneCounts.servers ?? null;
      isLoading = serversQuery.isPending;
      isError = serversQuery.isError;
      isRetrying = serversQuery.isFetching;
      activeError = serversQuery.error;
      errorUpdatedAt = serversQuery.errorUpdatedAt;
      hasNextPage = serversQuery.hasNextPage;
      isFetchingNextPage = serversQuery.isFetchingNextPage;
      loadMore = () => void serversQuery.fetchNextPage();
      retry = () => void serversQuery.refetch();
      break;
    case "people":
      activeItems = peopleItems;
      resultCount = laneCounts.people ?? null;
      isLoading = peopleQuery.isPending;
      isError = peopleQuery.isError;
      isRetrying = peopleQuery.isFetching;
      activeError = peopleQuery.error;
      errorUpdatedAt = peopleQuery.errorUpdatedAt;
      hasNextPage = false;
      isFetchingNextPage = false;
      loadMore = () => undefined;
      retry = () => void peopleQuery.refetch();
      break;
    case "channels":
      activeItems = channelItems;
      resultCount = laneCounts.channels ?? null;
      isLoading = channelsQuery.isPending;
      isError = channelsQuery.isError;
      isRetrying = channelsQuery.isFetching;
      activeError = channelsQuery.error;
      errorUpdatedAt = channelsQuery.errorUpdatedAt;
      hasNextPage = channelsQuery.hasNextPage;
      isFetchingNextPage = channelsQuery.isFetchingNextPage;
      loadMore = () => void channelsQuery.fetchNextPage();
      retry = () => void channelsQuery.refetch();
      break;
    case "events":
      activeItems = eventItems;
      resultCount = laneCounts.events ?? null;
      isLoading = eventsQuery.isPending;
      isError = eventsQuery.isError;
      isRetrying = eventsQuery.isFetching;
      activeError = eventsQuery.error;
      errorUpdatedAt = eventsQuery.errorUpdatedAt;
      hasNextPage = eventsQuery.hasNextPage;
      isFetchingNextPage = eventsQuery.isFetchingNextPage;
      loadMore = () => void eventsQuery.fetchNextPage();
      retry = () => void eventsQuery.refetch();
      break;
  }

  const failedAt = errorUpdatedAt > 0 ? new Date(errorUpdatedAt) : null;
  const isEmpty = !isLoading && !isError && activeItems.length === 0;
  const featured = serversQuery.data?.pages[0]?.featured ?? null;
  const showFeatured = visibility.featured && shouldShowDiscoverFeatured(route, featured);

  let gridChildren: ReactNode;
  if (isLoading) {
    gridChildren = Array.from({ length: 6 }, (_, index) => (
      <DiscoverCardPlaceholder id={`loading-${index}`} key={index} lane={route.lane} />
    ));
  } else {
    switch (route.lane) {
      case "servers":
        gridChildren = serverItems.map((server) => (
          <React.Fragment key={server.id}>
            {renderDiscoverServerCard ? (
              renderDiscoverServerCard({
                onOpen: (item) => openServerPanel(item.id),
                onPreview: (item) => openServerPanel(item.id),
                onToggleJoin: toggleServerMembership,
                selected: route.panelServerId === server.id,
                server,
              })
            ) : (
              <DiscoverCardPlaceholder id={server.id} lane={route.lane} />
            )}
          </React.Fragment>
        ));
        break;
      case "people":
        gridChildren = peopleItems.map((person) => (
          <React.Fragment key={person.id}>
            {renderDiscoverPersonCard ? (
              renderDiscoverPersonCard({
                onAddFriend: (item) => onAddFriend?.(item),
                onOpen: (item) => onOpenPerson?.(item),
                onOpenProfile: (item) => onOpenPerson?.(item),
                person,
              })
            ) : (
              <DiscoverCardPlaceholder id={person.id} lane={route.lane} />
            )}
          </React.Fragment>
        ));
        break;
      case "channels":
        gridChildren = channelItems.map((channel) => (
          <React.Fragment key={channel.id}>
            {renderDiscoverChannelRow ? (
              renderDiscoverChannelRow({
                channel,
                onOpen: (item) =>
                  onOpenChannel ? onOpenChannel(item) : openServerPanel(item.serverId),
                onPreview: (item) =>
                  onPreviewChannel
                    ? onPreviewChannel(item)
                    : onOpenChannel
                      ? onOpenChannel(item)
                      : openServerPanel(item.serverId),
              })
            ) : (
              <DiscoverCardPlaceholder id={channel.id} lane={route.lane} />
            )}
          </React.Fragment>
        ));
        break;
      case "events":
        gridChildren = eventItems.map((event) => (
          <React.Fragment key={event.id}>
            {renderDiscoverEventCard ? (
              renderDiscoverEventCard({
                event,
                onOpen: (item) => onOpenEvent?.(item),
                onToggleInterest: (item) => onToggleEventInterest?.(item),
                onViewDetails: (item) => (onViewEventDetails ?? onOpenEvent)?.(item),
              })
            ) : (
              <DiscoverCardPlaceholder id={event.id} lane={route.lane} />
            )}
          </React.Fragment>
        ));
        break;
    }
  }

  const gridProps: DiscoverGridProps = {
    cardSize,
    children: gridChildren,
    hasMore: hasNextPage,
    lane: route.lane,
    loadingMore: isFetchingNextPage,
    panelOpen: route.panelServerId !== null,
    ...(route.lane === "people" ? {} : { onLoadMore: loadMore }),
  };

  const toggleCardSize = () => {
    const next = cardSize === "medium" ? "large" : "medium";
    sessionDiscoverCardSize = next;
    try {
      writeDiscoverCardSize(window.localStorage, next);
    } catch {
      // localStorage getter'ı engelliyse module-scoped oturum tercihi kullanılmaya devam eder.
    }
    announceDiscoverCardSizeChange();
  };
  const panelServerId = route.panelServerId;
  const panelPlaceholder = resolveDiscoverPanelPlaceholder(
    panelServerId,
    serverItems,
    featured,
    channelItems,
  );

  return (
    <div
      className="flex min-h-0 min-w-0 flex-1"
      data-discover-surface=""
      data-testid="discover-page"
    >
      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-[hsl(var(--surface-base))]">
        <DiscoverFeedHeader
          cardSize={cardSize}
          failedAt={failedAt}
          isEmpty={isEmpty}
          isError={isError}
          laneCounts={laneCounts}
          onJoinServer={captureModalTrigger}
          onToggleCardSize={toggleCardSize}
          resultCount={resultCount}
          route={route}
          visibility={visibility}
        />
        {renderDiscoverResponsive({
          categories: serversQuery.data?.pages[0]?.categories ?? null,
          onRequestPanelClose: closeServerPanel,
          panelServerId: route.panelServerId,
          route,
        })}
        <DiscoverFilterStrip
          onClearCategory={() => push({ category: "all" })}
          onClearQuery={() => push({ q: "" })}
          onClearSort={() => push({ sort: "popular" })}
          route={route}
        />

        {visibleJoinedBanner
          ? (renderDiscoverJoinedBanner ?? ((props) => <DiscoverJoinedBanner {...props} />))({
              onDismiss: () => setJoinedBanner({ routeKey: joinedBannerRouteKey, server: null }),
              server: visibleJoinedBanner,
            })
          : null}

        <main
          className="flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto"
          aria-label={visibility.laneGroup ? undefined : t(`discover.lanes.${route.lane}`)}
          aria-labelledby={visibility.laneGroup ? `discover-lane-tab-${route.lane}` : undefined}
          id="discover-lane-panel"
          role="tabpanel"
          style={{
            padding: isError || isEmpty ? 0 : `${pxToRem(16)} ${pxToRem(24)} ${pxToRem(20)}`,
          }}
        >
          {isError && failedAt && renderDiscoverErrorState ? (
            renderDiscoverErrorState({
              error: activeError,
              failedAt,
              isRetrying,
              onJoinServer: openJoinModal,
              onRetry: retry,
              route,
            })
          ) : isEmpty && renderDiscoverEmptyState ? (
            renderDiscoverEmptyState({ onJoinServer: openJoinModal, route })
          ) : (
            <>
              {showFeatured && featured ? (
                <DiscoverFeatured
                  onJoin={(server) => toggleServerMembership(server)}
                  onPreview={() => captureFeaturedPanelTrigger(featured.id)}
                  previewHref={buildDiscoverHref({ panelServerId: featured.id }, route)}
                  server={featured}
                />
              ) : null}

              <DiscoverSectionHead count={resultCount} lane={route.lane} route={route} />

              {isLoading && renderDiscoverCardSkeleton ? (
                renderDiscoverCardSkeleton({ lane: route.lane })
              ) : renderDiscoverGrid ? (
                renderDiscoverGrid(gridProps)
              ) : (
                <DiscoverGridPlaceholder {...gridProps} />
              )}

              <div
                className="flex items-center justify-center text-[hsl(var(--text-muted))]"
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: pxToRem(12),
                  gap: pxToRem(9),
                  paddingTop: pxToRem(20),
                }}
              >
                <span
                  aria-hidden
                  className="flex-1 bg-[hsl(var(--border)/0.4)]"
                  style={{ height: hairline() }}
                />
                <span>
                  {t(
                    route.lane === "servers"
                      ? "discover.footnote.servers"
                      : "discover.footnote.other",
                  )}
                </span>
                <span
                  aria-hidden
                  className="flex-1 bg-[hsl(var(--border)/0.4)]"
                  style={{ height: hairline() }}
                />
              </div>
            </>
          )}
        </main>
      </div>

      {panelServerId && renderServerProfilePanel
        ? renderServerProfilePanel({
            currentUserId: currentUser.id,
            isError: profileQuery.isError,
            isLoading: profileQuery.isPending,
            isMembershipPending: membershipMutation.isPending,
            onJoin: () =>
              requestMembership({
                id: panelServerId,
                joined: false,
                name: profileQuery.data?.name ?? "",
              }),
            onLeave: () =>
              requestMembership({
                id: panelServerId,
                joined: true,
                name: profileQuery.data?.name ?? "",
              }),
            onRequestClose: closeServerPanel,
            onRetry: () => void profileQuery.refetch(),
            panelServerId,
            placeholderCategory: panelPlaceholder?.category ?? null,
            placeholderInitials: panelPlaceholder?.initials ?? "??",
            placeholderName: panelPlaceholder?.name ?? t("discover.profile.label"),
            profile: profileQuery.data,
          })
        : null}

      {route.modal === "join"
        ? (renderServerJoinModal ?? ((props) => <ServerJoinModal {...props} />))({
            onRequestClose: closeJoinModal,
            onServerJoined: showJoinedServer,
            serverOptions: serverItems.filter((server) => !server.joined).slice(0, 3),
          })
        : null}
    </div>
  );
}
