"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent } from "react";
import { createPortal } from "react-dom";
import { motion, Reorder } from "framer-motion";
import { MessageCircleMore, Plus, RotateCcw } from "lucide-react";
import Image from "next/image";
import type { WorkspaceServerSummary } from "@wizards/types";
import { useI18n } from "@/components/providers/locale-provider";
import { ContextMenu, ContextMenuItem, ContextMenuSeparator } from "@/components/ui/context-menu";
import { ServerRailSkeleton } from "@/components/shell/shell-skeletons";
import { ServerIcon } from "@/components/shell/server-icon";
import { COMPACT_SERVER_RAIL_ICON_SIZE, COMPACT_SERVER_RAIL_TOUCH_SIZE } from "@/lib/appearance";

const SERVER_RAIL_ORDER_STORAGE_KEY = "wizards.serverRail.order.v1";

type ServerRailProps = {
  activeServerId: string | null;
  currentUserId: string;
  dmUnreadCount?: number;
  loading: boolean;
  onNavigate: (href: string) => void;
  onOpenCreateServer: () => void;
  onOpenServerContextMenu: (serverId: string, event: MouseEvent<HTMLButtonElement>) => void;
  onPrefetch?: (href: string) => void;
  resolveServerHref: (server: WorkspaceServerSummary) => string;
  servers: WorkspaceServerSummary[];
};

function getPreviewLabel(value: string) {
  const normalized = value.trim().replace(/\s+/g, " ");
  const preview = Array.from(normalized).slice(0, 4).join("");
  return preview || "----";
}

function getServerShortLabel(server: WorkspaceServerSummary) {
  return server.shortName ?? getPreviewLabel(server.name);
}

function getCompactCountLabel(count: number) {
  return count > 99 ? "99+" : String(count);
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

function readStoredServerOrder(storageKey: string) {
  if (typeof window === "undefined") {
    return [];
  }

  return parseStoredServerOrder(window.localStorage.getItem(storageKey));
}

function writeStoredServerOrder(storageKey: string, order: string[]) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(storageKey, JSON.stringify(order));
}

function clearStoredServerOrder(storageKey: string) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(storageKey);
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
  dmUnreadCount = 0,
  loading,
  onNavigate,
  onOpenCreateServer,
  onOpenServerContextMenu,
  onPrefetch,
  resolveServerHref,
  servers,
}: ServerRailProps) {
  const { t } = useI18n();
  const addBtnRef = useRef<HTMLButtonElement>(null);
  const recentlyDraggedServerIdRef = useRef<string | null>(null);
  const [addTooltipPos, setAddTooltipPos] = useState<{ top: number; left: number } | null>(null);
  const [draggingServerId, setDraggingServerId] = useState<string | null>(null);
  const [railContextMenu, setRailContextMenu] = useState({
    open: false,
    x: 0,
    y: 0,
  });
  const [serverOrder, setServerOrder] = useState<string[]>([]);
  const orderStorageKey = useMemo(
    () => getServerRailOrderStorageKey(currentUserId),
    [currentUserId],
  );

  useEffect(() => {
    setServerOrder(readStoredServerOrder(orderStorageKey));
  }, [orderStorageKey]);

  useEffect(() => {
    if (loading || serverOrder.length === 0) {
      return;
    }

    const normalizedOrder = mergeServerOrder(serverOrder, servers);
    if (areStringArraysEqual(normalizedOrder, serverOrder)) {
      return;
    }

    setServerOrder(normalizedOrder);
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
  const serverCountLabel = getCompactCountLabel(servers.length);

  const persistServerOrder = useCallback(
    (nextOrder: string[]) => {
      const normalizedOrder = mergeServerOrder(nextOrder, servers);
      setServerOrder(normalizedOrder);
      writeStoredServerOrder(orderStorageKey, normalizedOrder);
    },
    [orderStorageKey, servers],
  );

  const resetServerOrder = useCallback(() => {
    setServerOrder([]);
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
  const dmTooltipHint =
    dmUnreadCount > 0
      ? t("shell.channelItem.unreadCount", { count: dmUnreadCount })
      : undefined;

  if (loading) {
    return (
      <aside
        className="app-rail h-full w-[var(--server-rail-width)] shrink-0 bg-[linear-gradient(180deg,hsl(var(--surface-card)/0.9),hsl(var(--surface-soft)/0.34))] backdrop-blur-xl"
        data-testid="server-rail"
      >
        <ServerRailSkeleton />
      </aside>
    );
  }

  return (
    <aside
      className="app-rail flex h-full w-[var(--server-rail-width)] shrink-0 flex-col items-center bg-[linear-gradient(180deg,hsl(var(--surface-card)/0.58),hsl(var(--surface-soft)/0.2))] px-2 pb-3 pt-[max(0.625rem,env(safe-area-inset-top))] backdrop-blur-xl"
      data-testid="server-rail"
      onContextMenu={handleRailContextMenu}
    >
      <div
        aria-label="Whispr"
        className="relative mb-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-[18px] bg-[hsl(var(--surface-card)/0.58)] ring-1 ring-[hsl(var(--border)/0.42)]"
        data-server-rail-item
        role="img"
        title="Whispr"
      >
        <Image
          alt=""
          aria-hidden="true"
          className="rounded-[13px]"
          height={30}
          priority={false}
          src="/app-icons/whispr.png"
          width={30}
        />
        <span
          aria-label={t("shell.serverRail.servers")}
          className="absolute -bottom-1 right-0 flex h-4 min-w-4 items-center justify-center rounded-full border border-[hsl(var(--background)/0.58)] bg-[hsl(var(--primary))] px-1 text-[9px] font-black leading-none text-[hsl(var(--primary-foreground))] shadow-[0_8px_18px_hsl(var(--primary)/0.24)]"
          title={t("shell.serverRail.servers")}
        >
          {serverCountLabel}
        </span>
      </div>
      <div className="flex w-full shrink-0 flex-col items-center gap-1.5" data-server-rail-item>
        <ServerIcon
          active={!activeServerId}
          badgeCount={dmUnreadCount}
          fallback="DM"
          iconSize={COMPACT_SERVER_RAIL_ICON_SIZE}
          label={t("shell.serverRail.directMessages")}
          labelPreview="DM"
          onClick={() => onNavigate("/channels/@me")}
          testId="server-rail-dm"
          tooltipHint={dmTooltipHint}
          {...(onPrefetch ? { onPrefetch: () => onPrefetch("/channels/@me") } : {})}
        />
        <div className="h-px w-7 rounded-full bg-[hsl(var(--border)/0.5)]" aria-hidden="true" />
      </div>

      <div className="mt-2 flex min-h-0 w-full flex-1 flex-col items-center">
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-0.5">
          <Reorder.Group
            axis="y"
            className="m-0 flex w-full list-none flex-col items-center gap-1.5 p-0"
            onReorder={persistServerOrder}
            values={orderedServerIds}
          >
            {orderedServers.map((server) => {
              const serverHref = resolveServerHref(server);
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
                    className={draggingServerId === server.id ? "cursor-grabbing" : "cursor-grab"}
                    fallback={server.name}
                    iconSize={COMPACT_SERVER_RAIL_ICON_SIZE}
                    iconUrl={server.iconUrl}
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

          <div className={orderedServers.length > 0 ? "mt-2" : ""} data-server-rail-item>
            <motion.button
              ref={addBtnRef}
              aria-label={t("shell.serverRail.createServer")}
              className="group relative mx-auto flex shrink-0 items-center justify-center rounded-[18px] text-left text-[hsl(var(--primary))] outline-none transition hover:bg-[hsl(var(--primary)/0.1)] focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)] focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(var(--background)/0.72)]"
              onBlur={() => setAddTooltipPos(null)}
              onClick={onOpenCreateServer}
              onFocus={showAddTooltip}
              onMouseEnter={showAddTooltip}
              onMouseLeave={() => setAddTooltipPos(null)}
              data-testid="create-server-button"
              type="button"
              whileHover={{ scale: 1.035, y: -1 }}
              whileTap={{ scale: 0.985 }}
              style={{
                height: COMPACT_SERVER_RAIL_TOUCH_SIZE,
                width: COMPACT_SERVER_RAIL_TOUCH_SIZE,
              }}
            >
              <span
                className="flex shrink-0 items-center justify-center rounded-[16px] bg-[hsl(var(--primary)/0.12)] ring-1 ring-[hsl(var(--primary)/0.18)]"
                style={{
                  height: COMPACT_SERVER_RAIL_ICON_SIZE,
                  width: COMPACT_SERVER_RAIL_ICON_SIZE,
                }}
              >
                <Plus className="h-4 w-4" />
              </span>
            </motion.button>
          </div>
        </div>
      </div>

      {addTooltipPos !== null &&
        typeof document !== "undefined" &&
        createPortal(
          <span
            className="app-tooltip pointer-events-none fixed z-[60] -translate-y-1/2 rounded-xl border px-2.5 py-1 text-xs shadow-[0_12px_26px_hsl(var(--shadow-color)/0.12)]"
            style={{ top: addTooltipPos.top, left: addTooltipPos.left }}
          >
            {t("shell.serverRail.addServer")}
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
            onNavigate("/channels/@me");
          }}
        >
          {t("shell.serverRail.directMessages")}
        </ContextMenuItem>
      </ContextMenu>
    </aside>
  );
}

export function MobileDrawerTrigger({ onClick }: { onClick: () => void }) {
  const { t } = useI18n();

  return (
    <button
      aria-label={t("shell.mobile.openWorkspaceNavigation")}
      className="app-panel-soft text-app-foreground inline-flex h-11 w-11 items-center justify-center rounded-2xl border transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] md:hidden"
      data-testid="mobile-workspace-drawer-button"
      onClick={onClick}
      type="button"
    >
      <MessageCircleMore className="h-4 w-4" />
    </button>
  );
}
