"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { MouseEvent } from "react";
import { createPortal } from "react-dom";
import { motion, Reorder } from "framer-motion";
import { MessagesSquare, Plus, RotateCcw } from "lucide-react";
import type { WorkspaceServerSummary } from "@wizards/types";
import { BrandLogo } from "@/components/brand/brand-logo";
import { useI18n } from "@/components/providers/locale-provider";
import { ContextMenu, ContextMenuItem, ContextMenuSeparator } from "@/components/ui/context-menu";
import { ServerRailSkeleton } from "@/components/shell/shell-skeletons";
import { ServerIcon } from "@/components/shell/server-icon";
import {
  ServerRailDownloadButton,
  ServerRailReportButton,
} from "@/components/shell/server-rail-support-buttons";
import { hairline, HOME_METRICS, pxToRem } from "@/lib/home/metrics";
import { isNewServer, markServerSeen, readSeenServers } from "@/lib/discover/new-server-badge";
import { resolveServerAbbreviation } from "@/lib/servers/server-icon-presentation";
import { useAppStore } from "@/lib/store";

const { rail } = HOME_METRICS;

/** SPEC §2.1 — 22×1 ayırıcı, dikey margin 9. */
function RailDivider() {
  return (
    <span
      aria-hidden="true"
      className="block shrink-0 bg-[hsl(var(--border)/0.9)]"
      style={{
        height: hairline(rail.dividerHeight),
        margin: `${pxToRem(rail.dividerMarginY)} 0`,
        width: pxToRem(rail.dividerWidth),
      }}
    />
  );
}

const SERVER_RAIL_ORDER_STORAGE_KEY = "wizards.serverRail.order.v1";
const SERVER_RAIL_ORDER_CHANGE_EVENT = "wizards:server-rail-order-change";

type ServerRailProps = {
  activeServerId: string | null;
  currentUserId: string;
  loading: boolean;
  onNavigate: (href: string) => void;
  onOpenCreateServer: () => void;
  onOpenServerContextMenu: (serverId: string, event: MouseEvent<HTMLButtonElement>) => void;
  onPrefetch?: (href: string) => void;
  resolveServerHref: (server: WorkspaceServerSummary) => string;
  servers: WorkspaceServerSummary[];
};

function getServerShortLabel(server: WorkspaceServerSummary) {
  return resolveServerAbbreviation(server.name, server.shortName);
}

function joinTooltipHints(values: string[]) {
  return values.filter(Boolean).join(" • ");
}

function parseStoredServerOrder(rawValue: string | null) {
  if (!rawValue) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawValue);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return Array.from(
      new Set(parsed.filter((value): value is string => typeof value === "string")),
    );
  } catch {
    return [];
  }
}

function getServerRailOrderStorageKey(userId: string) {
  return `${SERVER_RAIL_ORDER_STORAGE_KEY}:${userId}`;
}

function writeStoredServerOrder(storageKey: string, order: string[]) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(storageKey, JSON.stringify(order));
  window.dispatchEvent(new CustomEvent(SERVER_RAIL_ORDER_CHANGE_EVENT, { detail: storageKey }));
}

function clearStoredServerOrder(storageKey: string) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(storageKey);
  window.dispatchEvent(new CustomEvent(SERVER_RAIL_ORDER_CHANGE_EVENT, { detail: storageKey }));
}

function subscribeToStoredServerOrder(storageKey: string, onStoreChange: () => void) {
  const handleStorageChange = (event: StorageEvent) => {
    if (event.key === storageKey && event.storageArea === window.localStorage) {
      onStoreChange();
    }
  };
  const handleLocalChange = (event: Event) => {
    if (event instanceof CustomEvent && event.detail === storageKey) {
      onStoreChange();
    }
  };

  window.addEventListener("storage", handleStorageChange);
  window.addEventListener(SERVER_RAIL_ORDER_CHANGE_EVENT, handleLocalChange);
  return () => {
    window.removeEventListener("storage", handleStorageChange);
    window.removeEventListener(SERVER_RAIL_ORDER_CHANGE_EVENT, handleLocalChange);
  };
}

function mergeServerOrder(order: string[], servers: WorkspaceServerSummary[]) {
  const serverIds = new Set(servers.map((server) => server.id));
  const orderedIds = order.filter((serverId) => serverIds.has(serverId));
  const orderedIdSet = new Set(orderedIds);
  const appendedIds = servers
    .map((server) => server.id)
    .filter((serverId) => !orderedIdSet.has(serverId));

  return [...orderedIds, ...appendedIds];
}

function areStringArraysEqual(left: string[], right: string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function isServerRailItemTarget(target: EventTarget | null) {
  return target instanceof HTMLElement && target.closest("[data-server-rail-item]") !== null;
}

export function ServerRail({
  activeServerId,
  currentUserId,
  loading,
  onNavigate,
  onOpenCreateServer,
  onOpenServerContextMenu,
  onPrefetch,
  resolveServerHref,
  servers,
}: ServerRailProps) {
  const { t } = useI18n();
  // Ray, iki pencereyi kabuğun prop zincirinden geçirmeden açar: pencerelerin
  // durumu zaten global ve `WorkspaceModals` onu aynı yerden okuyor.
  const openSupportModal = useAppStore((state) => state.openSupportModal);
  const seenServers = readSeenServers();
  const addBtnRef = useRef<HTMLButtonElement>(null);
  const recentlyDraggedServerIdRef = useRef<string | null>(null);
  const [addTooltipPos, setAddTooltipPos] = useState<{ top: number; left: number } | null>(null);
  const [draggingServerId, setDraggingServerId] = useState<string | null>(null);
  const [railContextMenu, setRailContextMenu] = useState({
    open: false,
    x: 0,
    y: 0,
  });

  useEffect(() => {
    if (activeServerId) markServerSeen(activeServerId);
  }, [activeServerId]);
  const orderStorageKey = useMemo(
    () => getServerRailOrderStorageKey(currentUserId),
    [currentUserId],
  );
  const subscribeToOrder = useCallback(
    (onStoreChange: () => void) => subscribeToStoredServerOrder(orderStorageKey, onStoreChange),
    [orderStorageKey],
  );
  const storedServerOrder = useSyncExternalStore(
    subscribeToOrder,
    () => window.localStorage.getItem(orderStorageKey) ?? "",
    () => "",
  );
  const serverOrder = useMemo(
    () => parseStoredServerOrder(storedServerOrder || null),
    [storedServerOrder],
  );

  useEffect(() => {
    if (loading || serverOrder.length === 0) {
      return;
    }

    const normalizedOrder = mergeServerOrder(serverOrder, servers);
    if (areStringArraysEqual(normalizedOrder, serverOrder)) {
      return;
    }

    writeStoredServerOrder(orderStorageKey, normalizedOrder);
  }, [loading, orderStorageKey, serverOrder, servers]);

  const orderedServers = useMemo(() => {
    const orderedIds = mergeServerOrder(serverOrder, servers);
    const serversById = new Map(servers.map((server) => [server.id, server]));

    return orderedIds
      .map((serverId) => serversById.get(serverId))
      .filter((server): server is WorkspaceServerSummary => Boolean(server));
  }, [serverOrder, servers]);

  const orderedServerIds = useMemo(
    () => orderedServers.map((server) => server.id),
    [orderedServers],
  );

  const persistServerOrder = useCallback(
    (nextOrder: string[]) => {
      const normalizedOrder = mergeServerOrder(nextOrder, servers);
      writeStoredServerOrder(orderStorageKey, normalizedOrder);
    },
    [orderStorageKey, servers],
  );

  const resetServerOrder = useCallback(() => {
    clearStoredServerOrder(orderStorageKey);
  }, [orderStorageKey]);

  const closeRailContextMenu = useCallback(() => {
    setRailContextMenu((current) => (current.open ? { open: false, x: 0, y: 0 } : current));
  }, []);

  const handleRailContextMenu = (event: MouseEvent<HTMLElement>) => {
    if (isServerRailItemTarget(event.target)) {
      return;
    }

    event.preventDefault();
    setRailContextMenu({
      open: true,
      x: event.clientX,
      y: event.clientY,
    });
  };

  const showAddTooltip = () => {
    if (!addBtnRef.current) return;
    const rect = addBtnRef.current.getBoundingClientRect();
    setAddTooltipPos({ top: rect.top + rect.height / 2, left: rect.right + 12 });
  };
  if (loading) {
    return (
      <nav
        aria-label={t("shell.serverRail.servers")}
        className="h-full w-[var(--server-rail-width)] shrink-0 bg-[hsl(var(--surface-rail))]"
        data-testid="server-rail"
        style={{ borderRight: `${hairline()} solid hsl(var(--border) / 0.4)` }}
      >
        <ServerRailSkeleton />
      </nav>
    );
  }

  return (
    <nav
      aria-label={t("shell.serverRail.servers")}
      className="flex h-full w-[var(--server-rail-width)] shrink-0 flex-col items-center bg-[hsl(var(--surface-rail))]"
      data-testid="server-rail"
      onContextMenu={handleRailContextMenu}
      style={{
        borderRight: `${hairline()} solid hsl(var(--border) / 0.4)`,
        gap: pxToRem(rail.gap),
        paddingBottom: `max(${pxToRem(rail.paddingBottom)}, env(safe-area-inset-bottom))`,
        paddingTop: `max(${pxToRem(rail.paddingTop)}, env(safe-area-inset-top))`,
      }}
    >
      <div
        className="flex shrink-0 items-center justify-center"
        data-server-rail-item
        style={{ height: pxToRem(rail.brandBox), width: pxToRem(rail.brandBox) }}
        title="Whispr"
      >
        <BrandLogo
          className="[&_.whispr-logo-icon]:h-10 [&_.whispr-logo-icon]:w-10 [&_.whispr-logo-icon]:rounded-[14px] [&_.whispr-logo-icon]:shadow-[0_11px_24px_hsl(var(--primary)/0.17)] [&_.whispr-logo-wordmark]:hidden"
          interactive={false}
        />
      </div>
      <RailDivider />

      {/* Liste doğal yükseklikte durur, yalnız yer kalmayınca küçülüp kaydırır (`flex: 0 1 auto`).
          `flex-1` verilseydi ekle butonu tasarımdaki yerinden rayın en altına itilirdi. */}
      <div className="flex w-full min-h-0 shrink flex-col items-center">
        <div className="min-h-0 w-full overflow-y-auto overflow-x-hidden">
          <Reorder.Group
            axis="y"
            className="m-0 flex w-full list-none flex-col items-center p-0"
            style={{ gap: pxToRem(rail.gap) }}
            onReorder={persistServerOrder}
            values={orderedServerIds}
          >
            {orderedServers.map((server) => {
              const serverHref = resolveServerHref(server);
              // TODO(api): workspace sunucu özeti `joinedAt` taşımıyor; şimdilik yalnız ziyaret.
              const isNew =
                server.id !== activeServerId && isNewServer(server.id, null, 0, seenServers);
              const tooltipHint = joinTooltipHints([
                server.mentionCount > 0
                  ? t("shell.channelItem.mentionCount", { count: server.mentionCount })
                  : "",
                server.unreadCount > 0
                  ? t("shell.channelItem.unreadCount", { count: server.unreadCount })
                  : "",
              ]);

              return (
                <Reorder.Item
                  className="relative w-full list-none"
                  data-server-rail-item
                  key={server.id}
                  onDragEnd={() => {
                    setDraggingServerId(null);
                    recentlyDraggedServerIdRef.current = server.id;
                    window.setTimeout(() => {
                      if (recentlyDraggedServerIdRef.current === server.id) {
                        recentlyDraggedServerIdRef.current = null;
                      }
                    }, 120);
                  }}
                  onDragStart={() => setDraggingServerId(server.id)}
                  value={server.id}
                  whileDrag={{
                    scale: 1.04,
                    zIndex: 20,
                  }}
                >
                  <ServerIcon
                    active={server.id === activeServerId}
                    badgeCount={server.unreadCount}
                    className={`${draggingServerId === server.id ? "cursor-grabbing" : "cursor-pointer"}${
                      isNew
                        ? " bg-[hsl(var(--warning)/0.2)] ring-[1.5px] ring-[hsl(var(--warning)/0.5)] shadow-[0_0.375rem_1rem_-0.625rem_hsl(var(--warning))] [&>span]:!bg-[hsl(var(--warning)/0.2)] [&>span]:!text-[hsl(var(--warning))]"
                        : ""
                    }`}
                    fallback={server.name}
                    iconColor={server.iconColor}
                    iconUrl={isNew ? null : server.iconUrl}
                    label={server.name}
                    labelPreview={getServerShortLabel(server)}
                    mentionCount={server.mentionCount}
                    onClick={() => {
                      if (recentlyDraggedServerIdRef.current === server.id) {
                        return;
                      }

                      onNavigate(serverHref);
                    }}
                    onContextMenu={(event) => onOpenServerContextMenu(server.id, event)}
                    reorderable={orderedServers.length > 1}
                    testId={`server-rail-server-${server.id}`}
                    tooltipHint={tooltipHint || undefined}
                    {...(onPrefetch ? { onPrefetch: () => onPrefetch(serverHref) } : {})}
                  />
                </Reorder.Item>
              );
            })}
          </Reorder.Group>
        </div>
      </div>

      <RailDivider />

      {/* SPEC §2.1 madde 5 — sunucu ekle: 44×44, `--primary/0.16` zemin, 1.5px `--primary/0.45`. */}
      <motion.button
        ref={addBtnRef}
        aria-label={t("shell.serverRail.createServer")}
        className="group relative mx-auto grid shrink-0 place-items-center text-[hsl(var(--primary))] outline-hidden transition-colors hover:bg-[hsl(var(--primary)/0.26)] focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)] focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(var(--background)/0.72)]"
        data-server-rail-item
        data-testid="create-server-button"
        onBlur={() => setAddTooltipPos(null)}
        onClick={onOpenCreateServer}
        onFocus={showAddTooltip}
        onMouseEnter={showAddTooltip}
        onMouseLeave={() => setAddTooltipPos(null)}
        style={{
          background: "hsl(var(--primary) / 0.16)",
          border: `${pxToRem(rail.addButtonBorderWidth)} solid hsl(var(--primary) / 0.45)`,
          borderRadius: pxToRem(rail.addButtonRadius),
          boxShadow: `0 ${pxToRem(HOME_METRICS.shadow.railAddButton.offsetY)} ${pxToRem(
            HOME_METRICS.shadow.railAddButton.blur,
          )} ${pxToRem(HOME_METRICS.shadow.railAddButton.spread)} hsl(var(--primary))`,
          height: pxToRem(rail.addButtonSize),
          width: pxToRem(rail.addButtonSize),
        }}
        type="button"
        whileHover={{ y: -HOME_METRICS.motion.hoverLift }}
        whileTap={{ scale: 0.985 }}
      >
        <Plus
          strokeWidth={rail.addButtonIconStrokeWidth}
          style={{
            height: pxToRem(rail.addButtonIconSize),
            width: pxToRem(rail.addButtonIconSize),
          }}
        />
      </motion.button>

      {/* SPEC-INDIRME §0 — alt blok rayın dibine yapışır. Liste `flex: 0 1 auto`
          kaldığı için "sunucu ekle" tasarımdaki yerinde durur; dibe inen yalnız
          bu blok. */}
      <div
        className="flex w-full shrink-0 flex-col items-center"
        data-testid="server-rail-support"
        style={{ marginTop: "auto" }}
      >
        <ServerRailDownloadButton
          label={t("shell.serverRail.downloadApp")}
          onClick={() => openSupportModal("download")}
        />
        <RailDivider />
        <ServerRailReportButton
          label={t("shell.serverRail.reportProblem")}
          onClick={() => openSupportModal("report")}
        />
      </div>

      {addTooltipPos !== null &&
        typeof document !== "undefined" &&
        createPortal(
          <span
            className="app-tooltip pointer-events-none fixed z-[60] -translate-y-1/2 rounded-xl border px-2.5 py-1 text-xs shadow-[0_12px_26px_hsl(var(--shadow-color)/0.12)]"
            style={{ top: addTooltipPos.top, left: addTooltipPos.left }}
          >
            {t("shell.serverRail.createServer")}
          </span>,
          document.body,
        )}

      <ContextMenu
        onClose={closeRailContextMenu}
        open={railContextMenu.open}
        position={railContextMenu}
      >
        <ContextMenuItem
          className="gap-2"
          onClick={() => {
            closeRailContextMenu();
            onOpenCreateServer();
          }}
        >
          <Plus className="h-4 w-4" />
          {t("shell.serverRail.createServer")}
        </ContextMenuItem>
        <ContextMenuItem
          className="gap-2"
          onClick={() => {
            closeRailContextMenu();
            resetServerOrder();
          }}
        >
          <RotateCcw className="h-4 w-4" />
          {t("shell.serverRail.resetOrder")}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          onClick={() => {
            closeRailContextMenu();
            onNavigate("/messages");
          }}
        >
          {t("shell.serverRail.directMessages")}
        </ContextMenuItem>
      </ContextMenu>
    </nav>
  );
}

/**
 * Drawer tetikleyicisi. Görünürlük **kabuğun** kararıdır (`MobileShellControls` sarmalayıcısı);
 * `08-faz7` §3'ten sonra buton mobil dışında da görünebiliyor (960'ın altında nav paneli
 * drawer'a taşınıyor), o yüzden `md:hidden` burada değil, sarmalayıcıda duruyor.
 */
export function MobileDrawerTrigger({ onClick }: { onClick: () => void }) {
  const { t } = useI18n();

  return (
    <button
      aria-label={t("shell.mobile.openWorkspaceNavigation")}
      className="app-panel-soft text-app-foreground inline-flex h-11 w-11 items-center justify-center rounded-2xl border transition hover:opacity-90 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
      data-testid="mobile-workspace-drawer-button"
      onClick={onClick}
      type="button"
    >
      <MessagesSquare className="h-4 w-4" />
    </button>
  );
}
