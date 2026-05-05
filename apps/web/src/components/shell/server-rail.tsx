"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent } from "react";
import { createPortal } from "react-dom";
import { motion, Reorder } from "framer-motion";
import {
  MessageCircleMore,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  RotateCcw,
  SlidersHorizontal,
} from "lucide-react";
import type { WorkspaceServerSummary } from "@wizards/types";
import { useI18n } from "@/components/providers/locale-provider";
import { ContextMenu, ContextMenuItem, ContextMenuSeparator } from "@/components/ui/context-menu";
import { getServerHref } from "@/lib/workspace/client";
import { ServerRailSkeleton } from "@/components/shell/shell-skeletons";
import { ServerIcon } from "@/components/shell/server-icon";
import {
  EXPANDED_MIN_SERVER_RAIL_WIDTH,
  MAX_SERVER_RAIL_ICON_SIZE,
  MAX_SERVER_RAIL_WIDTH,
  MIN_SERVER_RAIL_ICON_SIZE,
  SERVER_RAIL_ICON_SIZE_STEP,
  SERVER_RAIL_WIDTH_STEP,
} from "@/lib/appearance";
import { cn } from "@/lib/utils";

const SERVER_RAIL_ORDER_STORAGE_KEY = "wizards.serverRail.order.v1";

type ServerRailProps = {
  activeServerId: string | null;
  currentUserId: string;
  dmUnreadCount?: number;
  iconSize: number;
  isIconOnly?: boolean;
  loading: boolean;
  onNavigate: (href: string) => void;
  onOpenCreateServer: () => void;
  onOpenServerContextMenu: (serverId: string, event: MouseEvent<HTMLButtonElement>) => void;
  onPrefetch?: (href: string) => void;
  onSetIconSize: (size: number) => void;
  onSetExpanded?: () => void;
  onSetIconOnly?: () => void;
  onSetWidth: (width: number) => void;
  serverRailWidth: number;
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

function RailTuningControl({
  label,
  max,
  min,
  onChange,
  step,
  value,
}: {
  label: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  step: number;
  value: number;
}) {
  return (
    <label className="block rounded-2xl border border-[hsl(var(--border)/0.58)] bg-[hsl(var(--surface-soft)/0.36)] p-3">
      <span className="mb-2 flex items-center justify-between gap-3">
        <span className="text-xs font-semibold text-app-foreground">{label}</span>
        <span className="rounded-full border border-[hsl(var(--border)/0.58)] bg-[hsl(var(--surface-card)/0.68)] px-2 py-0.5 text-[11px] font-bold text-app-muted">
          {value}px
        </span>
      </span>
      <input
        className="accent-[hsl(var(--primary))] h-2 w-full cursor-pointer"
        max={max}
        min={min}
        onChange={(event) => onChange(Number(event.target.value))}
        step={step}
        type="range"
        value={value}
      />
      <span className="mt-1 flex justify-between text-[10px] font-semibold uppercase tracking-[0.12em] text-app-soft">
        <span>{min}px</span>
        <span>{max}px</span>
      </span>
    </label>
  );
}

export function ServerRail({
  activeServerId,
  currentUserId,
  dmUnreadCount = 0,
  iconSize,
  isIconOnly = false,
  loading,
  onNavigate,
  onOpenCreateServer,
  onOpenServerContextMenu,
  onPrefetch,
  onSetIconSize,
  onSetExpanded,
  onSetIconOnly,
  onSetWidth,
  serverRailWidth,
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
    setRailContextMenu((current) =>
      current.open ? { open: false, x: 0, y: 0 } : current,
    );
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
      <aside
        className="app-rail h-full w-[var(--server-rail-width)] shrink-0 border-r border-[hsl(var(--border)/0.72)] bg-[linear-gradient(180deg,hsl(var(--surface-card)/0.9),hsl(var(--surface-soft)/0.34))] backdrop-blur-xl"
        data-testid="server-rail"
      >
        <ServerRailSkeleton />
      </aside>
    );
  }

  return (
    <aside
      className={cn(
        "app-rail flex h-full w-[var(--server-rail-width)] shrink-0 flex-col border-r border-[hsl(var(--border)/0.72)] bg-[linear-gradient(180deg,hsl(var(--surface-card)/0.74),hsl(var(--surface-soft)/0.34))] pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur-xl",
        isIconOnly ? "px-2 pb-3" : "px-3 pb-4",
      )}
      data-testid="server-rail"
      onContextMenu={handleRailContextMenu}
    >
      <div
        className={cn(
          "w-full shrink-0 rounded-[30px] border border-[hsl(var(--border)/0.62)] bg-[hsl(var(--surface-card)/0.66)] shadow-[0_22px_54px_hsl(var(--shadow-color)/0.08)]",
          isIconOnly ? "p-2" : "p-2.5",
        )}
        data-server-rail-item
      >
        <ServerIcon
          active={!activeServerId}
          badgeCount={dmUnreadCount}
          fallback="DM"
          iconSize={iconSize}
          label={t("shell.serverRail.directMessages")}
          labelPreview="DM"
          onClick={() => onNavigate("/channels/@me")}
          showLabel={!isIconOnly}
          testId="server-rail-dm"
          {...(onPrefetch ? { onPrefetch: () => onPrefetch("/channels/@me") } : {})}
        />
      </div>

      <div className="mt-4 flex min-h-0 w-full flex-1 flex-col">
        {!isIconOnly ? (
          <div className="mb-3 flex items-center justify-between px-2">
            <span className="text-[9px] font-bold uppercase tracking-[0.22em] text-[hsl(var(--muted-foreground))]">
              {t("shell.serverRail.servers")}
            </span>
            <span className="rounded-full border border-[hsl(var(--border)/0.58)] bg-[hsl(var(--surface-soft)/0.4)] px-2 py-0.5 text-[10px] font-semibold text-app-muted">
              {servers.length}
            </span>
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto pr-0.5">
          <Reorder.Group
            axis="y"
            className={cn(
              "m-0 flex w-full list-none flex-col p-0",
              isIconOnly ? "items-center gap-2" : "gap-2.5",
            )}
            onReorder={persistServerOrder}
            values={orderedServerIds}
          >
            {orderedServers.map((server) => (
              <Reorder.Item
                className="relative list-none"
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
                  iconSize={iconSize}
                  iconUrl={server.iconUrl}
                  label={server.name}
                  labelPreview={getServerShortLabel(server)}
                  onClick={() => {
                    if (recentlyDraggedServerIdRef.current === server.id) {
                      return;
                    }

                    onNavigate(getServerHref(server));
                  }}
                  onContextMenu={(event) => onOpenServerContextMenu(server.id, event)}
                  reorderable={orderedServers.length > 1}
                  showLabel={!isIconOnly}
                  testId={`server-rail-server-${server.id}`}
                  {...(onPrefetch ? { onPrefetch: () => onPrefetch(getServerHref(server)) } : {})}
                />
              </Reorder.Item>
            ))}
          </Reorder.Group>

          <div className={orderedServers.length > 0 ? "mt-3" : ""} data-server-rail-item>
            <motion.button
              ref={addBtnRef}
              aria-label={t("shell.serverRail.createServer")}
              className={cn(
                "group relative flex shrink-0 items-center justify-center border border-[hsl(var(--success)/0.28)] bg-[linear-gradient(180deg,hsl(var(--success)/0.15),hsl(var(--success)/0.06))] text-left text-[hsl(var(--success))] shadow-[inset_0_1px_0_hsl(var(--background)/0.24),0_14px_30px_hsl(var(--success)/0.08)] outline-none transition hover:border-[hsl(var(--success)/0.42)] hover:bg-[hsl(var(--success)/0.14)] focus-visible:ring-2 focus-visible:ring-[hsl(var(--success)/0.55)]",
                isIconOnly
                  ? "mx-auto rounded-[22px] p-0"
                  : "h-14 w-full gap-2 rounded-[22px] px-2.5",
              )}
              onBlur={() => setAddTooltipPos(null)}
              onClick={onOpenCreateServer}
              onFocus={showAddTooltip}
              onMouseEnter={showAddTooltip}
              onMouseLeave={() => setAddTooltipPos(null)}
              data-testid="create-server-button"
              type="button"
              whileHover={{ scale: 1.018, x: 1 }}
              whileTap={{ scale: 0.985 }}
              {...(isIconOnly
                ? {
                    style: {
                      height: iconSize + 8,
                      width: iconSize + 8,
                    },
                  }
                : {})}
            >
              <span
                className={cn(
                  "flex shrink-0 items-center justify-center rounded-[17px] border border-[hsl(var(--success)/0.28)] bg-[hsl(var(--success)/0.14)]",
                  isIconOnly ? "" : "h-10 w-10",
                )}
                style={
                  isIconOnly
                    ? {
                        height: iconSize,
                        width: iconSize,
                      }
                    : undefined
                }
              >
                <Plus className="h-5 w-5" />
              </span>
              {!isIconOnly ? (
                <span className="min-w-0 flex-1 truncate text-[11px] font-semibold uppercase tracking-[0.08em]">
                  {t("shell.serverRail.createShort")}
                </span>
              ) : null}
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
        {onSetIconOnly && onSetExpanded ? (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem
              className="gap-2"
              onClick={() => {
                closeRailContextMenu();
                if (isIconOnly) {
                  onSetExpanded();
                  return;
                }

                onSetIconOnly();
              }}
            >
              {isIconOnly ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
              {isIconOnly
                ? t("shell.serverRail.expand")
                : t("shell.serverRail.collapse")}
            </ContextMenuItem>
            <ContextMenuSeparator />
            <div className="w-60 space-y-3 px-2 py-2">
              <div className="flex items-center gap-2 px-1">
                <span className="flex h-8 w-8 items-center justify-center rounded-2xl border border-[hsl(var(--border)/0.58)] bg-[hsl(var(--primary)/0.1)] text-[hsl(var(--primary))]">
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-app-foreground">
                    {t("shell.serverRail.customize")}
                  </p>
                  <p className="truncate text-[11px] text-app-muted">
                    {t("shell.serverRail.customizeHint")}
                  </p>
                </div>
              </div>
              <RailTuningControl
                label={t("shell.serverRail.width")}
                max={MAX_SERVER_RAIL_WIDTH}
                min={EXPANDED_MIN_SERVER_RAIL_WIDTH}
                onChange={(nextValue) => {
                  onSetExpanded();
                  onSetWidth(nextValue);
                }}
                step={SERVER_RAIL_WIDTH_STEP}
                value={serverRailWidth}
              />
              <RailTuningControl
                label={t("shell.serverRail.iconSize")}
                max={MAX_SERVER_RAIL_ICON_SIZE}
                min={MIN_SERVER_RAIL_ICON_SIZE}
                onChange={onSetIconSize}
                step={SERVER_RAIL_ICON_SIZE_STEP}
                value={iconSize}
              />
            </div>
          </>
        ) : null}
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
