"use client";

import React, { useEffect, type CSSProperties } from "react";
import Link from "next/link";
import { AtSign, Calendar, Compass, Home, MessageSquare, Plus } from "lucide-react";
import type { WorkspaceServerSummary } from "@wizards/types";
import { FOOTER_WRAPPER_STYLE, UserProfileFooter } from "@/components/shell/channel-sidebar";
import { useI18n } from "@/components/providers/locale-provider";
import { HomeCountBadge } from "@/components/home/home-primitives";
import { getServerIconToneColor } from "@/lib/servers/server-icon-tone";
import { resolveServerIconPresentation } from "@/lib/servers/server-icon-presentation";
import { EVENTS_METRICS } from "@/lib/events/metrics";
import { hairline, HOME_METRICS, HOME_TYPE_SCALE, pxToEm, pxToRem } from "@/lib/home/metrics";
import { isNewServer, markServerSeen, readSeenServers } from "@/lib/discover/new-server-badge";
import { cn } from "@/lib/utils";
import type { NextEventClock } from "@/hooks/use-next-event-clock";

/**
 * Global navigasyon paneli — SPEC-ANA-SAYFA §2.2, `03-faz2-kabuk-nav-paneli.md` §2.
 *
 * Kabuğun 2. sütunu rotaya göre değişir (`selectSecondaryColumn`); bu bileşen "nav" dalında
 * çizilir. Ölçülerin tamamı `HOME_METRICS.panel`'den okunur, JSX'te çıplak sayı yoktur.
 */
type PresenceStatus = "ONLINE" | "IDLE" | "DND" | "OFFLINE";

const { panel } = HOME_METRICS;
/** SPEC-ETKINLIKLER §2 — `Etkinlikler` satırının saat ipucu; kabuğun tek dokunulan yeri. */
const { navHint } = EVENTS_METRICS;

/** SPEC §1: display ailesi token üzerinden gelir, bileşen içine font adı yazılmaz. */
const DISPLAY_FONT = "[font-family:var(--font-display),sans-serif]";

const NAV_ROW_FONT_SIZE = HOME_TYPE_SCALE.navRow.size;

/** Sunucu satırının rozeti nav satırınınkinden küçüktür (SPEC §2.2). */
const SERVER_BADGE_METRICS = {
  fontSize: panel.serverBadgeFontSize,
  height: panel.serverBadgeHeight,
  minWidth: panel.serverBadgeMinWidth,
  paddingX: panel.serverBadgePaddingX,
  radius: panel.serverBadgeRadius,
};

type NavRowId = "discover" | "events" | "home" | "mentions" | "messages";

type NavRow = {
  href: string;
  icon: typeof Home;
  id: NavRowId;
  labelKey: string;
};

/**
 * `/mentions` ve `/events` rotaları Faz 6'da yazılacak. Satırlar gerçek hedefine bağlanır: en
 * yakın mevcut yüzeye bağlamak iki satırı aynı rotaya götürür, `aria-current` yalan söyler ve
 * Faz 6'da geri alınacak ikinci bir sapma bırakırdı (§2.2'nin verdiği iki seçenekten birincisi).
 */
const NAV_ROWS: readonly NavRow[] = [
  { href: "/home", icon: Home, id: "home", labelKey: "shell.appNav.home" },
  { href: "/messages", icon: MessageSquare, id: "messages", labelKey: "shell.appNav.messages" },
  { href: "/mentions", icon: AtSign, id: "mentions", labelKey: "shell.appNav.mentions" },
  { href: "/events", icon: Calendar, id: "events", labelKey: "shell.appNav.events" },
  { href: "/discover", icon: Compass, id: "discover", labelKey: "shell.appNav.discover" },
];

/** Satır kendi yolunda ve altındaki her yolda aktiftir. */
export function isNavRowActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export type ServerRowTrailing =
  { count: number; kind: "badge" } | { count: number; kind: "online" } | null;

/**
 * SPEC §2.4: sunucu satırının sağında **ya** yeşil nokta + çevrimiçi sayısı **ya** okunmamış
 * rozeti durur — ikisi birden asla. Kural saf fonksiyonda; JSX yalnız sonucu çizer.
 */
export function selectServerRowTrailing(server: {
  onlineCount: number | null;
  unreadCount: number;
}): ServerRowTrailing {
  if (server.unreadCount > 0) {
    return { count: server.unreadCount, kind: "badge" };
  }

  if (server.onlineCount !== null && server.onlineCount > 0) {
    return { count: server.onlineCount, kind: "online" };
  }

  return null;
}

function ServerInitial({ server }: { server: WorkspaceServerSummary }) {
  const presentation = resolveServerIconPresentation({
    iconColor: server.iconColor,
    iconUrl: server.iconUrl,
    name: server.name,
    shortName: server.shortName,
  });

  return (
    <span
      aria-hidden="true"
      className={cn(DISPLAY_FONT, "grid shrink-0 place-items-center uppercase")}
      style={{
        background:
          presentation.kind === "image"
            ? `center / cover no-repeat url(${JSON.stringify(presentation.imageUrl)})`
            : getServerIconToneColor(presentation.tone, 0.18),
        borderRadius: pxToRem(panel.serverIconRadius),
        color:
          presentation.kind === "fallback"
            ? getServerIconToneColor(presentation.tone)
            : "transparent",
        fontSize: pxToRem(panel.serverIconFontSize),
        fontWeight: 600,
        height: pxToRem(panel.serverIconSize),
        lineHeight: 1,
        width: pxToRem(panel.serverIconSize),
      }}
    >
      {presentation.kind === "fallback" ? presentation.label : ""}
    </span>
  );
}

export type AppNavPanelProps = {
  activeServerId: string | null;
  currentUser: {
    id: string;
    avatarUrl?: string | null;
    displayName: string;
    status: PresenceStatus;
    username: string;
  };
  dmUnreadCount: number;
  mentionUnreadCount: number;
  /**
   * SPEC-ETKINLIKLER §2 — sıradaki etkinliğin saati, canlı bayrağı ve hata durumu.
   * `hidden` ya da saatsizken ipucu hiç çizilmez.
   */
  nextEventClock: NextEventClock;
  onCurrentUserStatusChange: (status: PresenceStatus) => void;
  onOpenCreateServer: () => void;
  onOpenSettings: () => void;
  onPrefetch: (href: string) => void;
  pathname: string;
  resolveServerHref: (server: WorkspaceServerSummary) => string;
  servers: WorkspaceServerSummary[];
};

function AppNavPanelComponent({
  activeServerId,
  currentUser,
  dmUnreadCount,
  mentionUnreadCount,
  nextEventClock,
  onCurrentUserStatusChange,
  onOpenCreateServer,
  onOpenSettings,
  onPrefetch,
  pathname,
  resolveServerHref,
  servers,
}: AppNavPanelProps) {
  const { t } = useI18n();
  const seenServers = readSeenServers();

  useEffect(() => {
    if (activeServerId) markServerSeen(activeServerId);
  }, [activeServerId]);

  const rowStyle = (active: boolean): CSSProperties => ({
    borderRadius: pxToRem(panel.rowRadius),
    fontSize: pxToRem(NAV_ROW_FONT_SIZE),
    fontWeight: active ? HOME_TYPE_SCALE.navRow.activeWeight : HOME_TYPE_SCALE.navRow.weight,
    gap: pxToRem(panel.rowGap),
    lineHeight: HOME_TYPE_SCALE.navRow.lineHeight,
    padding: `${pxToRem(panel.rowPaddingY)} ${pxToRem(panel.rowPaddingX)}`,
  });

  const iconStyle: CSSProperties = {
    height: pxToEm(panel.iconSize, NAV_ROW_FONT_SIZE),
    width: pxToEm(panel.iconSize, NAV_ROW_FONT_SIZE),
  };

  return (
    <nav
      aria-label={t("shell.appNav.label")}
      className="flex h-full w-full min-w-0 flex-col bg-[hsl(var(--surface-panel))]"
      data-shortcut-region="navigation"
      data-testid="app-nav-panel"
      style={{ borderRight: `${hairline()} solid hsl(var(--border) / 0.4)` }}
      tabIndex={-1}
    >
      <div
        className="flex items-center justify-between"
        style={{
          padding: `${pxToRem(panel.headerPaddingTop)} ${pxToRem(panel.headerPaddingX)} ${pxToRem(
            panel.headerPaddingBottom,
          )}`,
        }}
      >
        {/* Ürün adı sabittir, i18n anahtarına taşınmaz (§2.1). */}
        <span
          className={cn(DISPLAY_FONT, "text-[hsl(var(--foreground))]")}
          style={{
            fontSize: pxToRem(HOME_TYPE_SCALE.panelLogotype.size),
            fontWeight: HOME_TYPE_SCALE.panelLogotype.weight,
            letterSpacing: HOME_TYPE_SCALE.panelLogotype.tracking,
            lineHeight: HOME_TYPE_SCALE.panelLogotype.lineHeight,
          }}
        >
          Whispr
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain">
        <ul
          className="m-0 flex list-none flex-col p-0"
          style={{
            gap: pxToRem(panel.navGap),
            padding: `0 ${pxToRem(panel.navPaddingX)}`,
          }}
        >
          {NAV_ROWS.map((row) => {
            const active = isNavRowActive(pathname, row.href);
            const RowIcon = row.icon;
            // SPEC-ETKINLIKLER §2 — yalnız `events` satırının ipucu; hata durumunda çizilmez.
            const eventsClock =
              row.id === "events" && !nextEventClock.hidden ? nextEventClock.clock : null;

            return (
              <li key={row.id}>
                <Link
                  aria-current={active ? "page" : undefined}
                  aria-label={
                    eventsClock
                      ? t(nextEventClock.live ? "events.a11y.navHintLive" : "events.a11y.navHint", {
                          label: t(row.labelKey),
                          time: eventsClock,
                        })
                      : undefined
                  }
                  className={cn(
                    "flex items-center outline-hidden transition-colors focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]",
                    active
                      ? "bg-[hsl(var(--primary)/0.13)] text-[var(--primary-readable)]"
                      : "text-[hsl(var(--text-secondary))] hover:bg-[var(--surface-hover)] hover:text-[hsl(var(--foreground))]",
                  )}
                  data-testid={`app-nav-${row.id}`}
                  href={row.href}
                  onFocus={() => onPrefetch(row.href)}
                  onMouseEnter={() => onPrefetch(row.href)}
                  style={rowStyle(active)}
                >
                  <RowIcon
                    aria-hidden="true"
                    strokeWidth={panel.iconStrokeWidth}
                    style={iconStyle}
                  />
                  {t(row.labelKey)}
                  {row.id === "messages" && dmUnreadCount > 0 ? (
                    <HomeCountBadge
                      className="ml-auto"
                      count={dmUnreadCount}
                      label={t("shell.channelItem.unreadCount", { count: dmUnreadCount })}
                      tone="primary"
                    />
                  ) : null}
                  {row.id === "mentions" && mentionUnreadCount > 0 ? (
                    <HomeCountBadge
                      className="ml-auto"
                      count={mentionUnreadCount}
                      label={t("shell.appNav.mentionUnreadCount", { count: mentionUnreadCount })}
                      tone="danger"
                    />
                  ) : null}
                  {/* SPEC-ETKINLIKLER §2: "Etkinlikler" satırının sağındaki saat ipucu. */}
                  {eventsClock ? (
                    <span
                      className={cn(
                        DISPLAY_FONT,
                        "ml-auto flex items-center",
                        active ? undefined : "text-[hsl(var(--text-muted))]",
                      )}
                      data-testid="app-nav-next-event"
                      style={{
                        fontSize: pxToRem(navHint.fontSize),
                        fontWeight: navHint.weight,
                        gap: pxToRem(navHint.gap),
                        lineHeight: 1,
                      }}
                    >
                      {/* Nokta salt görsel: canlı bilgisi satırın `aria-label`ında metin olarak. */}
                      {nextEventClock.live ? (
                        <span
                          aria-hidden="true"
                          className="shrink-0 rounded-full bg-[hsl(var(--danger))]"
                          style={{
                            height: pxToRem(navHint.liveDotSize),
                            width: pxToRem(navHint.liveDotSize),
                          }}
                        />
                      ) : null}
                      {eventsClock}
                    </span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>

        <div
          aria-hidden="true"
          className="bg-[hsl(var(--border)/0.5)]"
          style={{
            height: hairline(panel.dividerHeight),
            margin: `${pxToRem(panel.dividerMarginTop)} ${pxToRem(panel.dividerMarginX)} ${pxToRem(
              panel.dividerMarginBottom,
            )}`,
          }}
        />

        <div
          className="flex items-center justify-between"
          style={{
            padding: `0 ${pxToRem(panel.sectionPaddingX)} ${pxToRem(panel.sectionPaddingBottom)}`,
          }}
        >
          <span
            className={cn(
              DISPLAY_FONT,
              "whitespace-nowrap uppercase text-[hsl(var(--text-muted))]",
            )}
            id="app-nav-server-section"
            style={{
              fontSize: pxToRem(HOME_TYPE_SCALE.sectionLabel.size),
              fontWeight: HOME_TYPE_SCALE.sectionLabel.weight,
              letterSpacing: HOME_TYPE_SCALE.sectionLabel.tracking,
              lineHeight: HOME_TYPE_SCALE.sectionLabel.lineHeight,
            }}
          >
            {t("shell.appNav.myServers")}
          </span>
          <button
            aria-label={t("shell.serverRail.createServer")}
            className="inline-flex items-center justify-center rounded-full text-[hsl(var(--text-muted))] outline-hidden transition-colors hover:text-[hsl(var(--foreground))] focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
            data-testid="app-nav-create-server"
            onClick={onOpenCreateServer}
            type="button"
          >
            <Plus
              aria-hidden="true"
              strokeWidth={panel.sectionAddIconStrokeWidth}
              style={{
                height: pxToRem(panel.sectionAddIconSize),
                width: pxToRem(panel.sectionAddIconSize),
              }}
            />
          </button>
        </div>

        <ul
          aria-labelledby="app-nav-server-section"
          className="m-0 flex list-none flex-col p-0"
          style={{
            gap: pxToRem(panel.serverListGap),
            padding: `0 ${pxToRem(panel.serverListPaddingX)}`,
          }}
        >
          {servers.map((server) => {
            const href = resolveServerHref(server);
            const hasUnread = server.unreadCount > 0;
            const active = server.id === activeServerId;
            // TODO(api): workspace sunucu özeti `joinedAt` taşımıyor; şimdilik yalnız ziyaret.
            const isNew = !active && isNewServer(server.id, null, 0, seenServers);
            // TODO(sunucular): sunucu başına çevrimiçi sayısı hiçbir Faz 3 ucunda yok
            // (04 §2.1 tablosunda da yok). `null` kalıyor; satırın sağında yalnız
            // okunmamış rozeti çıkabilir.
            const trailing = selectServerRowTrailing({
              onlineCount: null,
              unreadCount: server.unreadCount,
            });

            return (
              <li key={server.id}>
                <Link
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center outline-hidden transition-colors hover:bg-[hsl(var(--surface-soft)/0.7)] focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]",
                    active && "bg-[hsl(var(--surface-soft)/0.6)]",
                    isNew && "bg-[hsl(var(--warning)/0.1)]",
                    hasUnread
                      ? "text-[hsl(var(--foreground))]"
                      : "text-[hsl(var(--text-secondary))]",
                  )}
                  data-testid={`app-nav-server-${server.id}`}
                  href={href}
                  onFocus={() => onPrefetch(href)}
                  onMouseEnter={() => onPrefetch(href)}
                  style={{
                    border: isNew ? `${hairline()} solid hsl(var(--warning)/0.35)` : undefined,
                    borderRadius: pxToRem(panel.serverRowRadius),
                    fontSize: pxToRem(panel.serverNameFontSize),
                    fontWeight: hasUnread || isNew ? 600 : 500,
                    gap: pxToRem(panel.serverRowGap),
                    lineHeight: 1,
                    padding: `${pxToRem(panel.serverRowPaddingY)} ${pxToRem(
                      panel.serverRowPaddingX,
                    )}`,
                  }}
                >
                  <ServerInitial server={server} />
                  <span className="min-w-0 flex-1 truncate">{server.name}</span>
                  {isNew ? (
                    <span
                      className={cn(
                        DISPLAY_FONT,
                        "shrink-0 bg-[hsl(var(--warning)/0.2)] text-[hsl(var(--warning))]",
                      )}
                      data-testid={`app-nav-server-new-${server.id}`}
                      style={{
                        borderRadius: pxToRem(6),
                        fontSize: pxToRem(9.5),
                        fontWeight: 600,
                        lineHeight: 1,
                        padding: `${pxToRem(2)} ${pxToRem(6)}`,
                      }}
                    >
                      {t("discover.new")}
                    </span>
                  ) : null}
                  {trailing?.kind === "online" ? (
                    <span
                      className="ml-auto flex items-center text-[var(--success-readable)]"
                      data-testid={`app-nav-server-online-${server.id}`}
                      style={{
                        fontSize: pxToRem(panel.serverOnlineFontSize),
                        fontWeight: 500,
                        gap: pxToRem(panel.serverOnlineGap),
                        lineHeight: 1,
                      }}
                    >
                      <span
                        aria-hidden="true"
                        className="rounded-full bg-[hsl(var(--success))]"
                        style={{
                          height: pxToRem(panel.serverOnlineDotSize),
                          width: pxToRem(panel.serverOnlineDotSize),
                        }}
                      />
                      {trailing.count}
                    </span>
                  ) : null}
                  {trailing?.kind === "badge" ? (
                    <HomeCountBadge
                      count={trailing.count}
                      label={t("shell.channelItem.unreadCount", { count: trailing.count })}
                      metrics={SERVER_BADGE_METRICS}
                      tone="danger"
                    />
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Ayak kaydırma alanının dışında: uzun sunucu listesinde yukarı kaçmaz (§7 tuzağı). */}
      <div
        className="mt-auto flex items-center"
        data-notification-popup-anchor="controls-border"
        style={FOOTER_WRAPPER_STYLE}
      >
        <UserProfileFooter
          user={currentUser}
          onOpenAppearanceSettings={onOpenSettings}
          onStatusChange={onCurrentUserStatusChange}
        />
      </div>
    </nav>
  );
}

export const AppNavPanel = React.memo(AppNavPanelComponent);

AppNavPanel.displayName = "AppNavPanel";
