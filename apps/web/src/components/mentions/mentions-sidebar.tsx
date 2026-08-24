"use client";

import Link from "next/link";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { AtSign, Bell, CheckCheck, Search } from "lucide-react";
import type { MentionCounts } from "@wizards/types";

import { DISPLAY_FONT } from "@/components/home/home-primitives";
import {
  MentionsSidebarKindRow,
  MentionsSidebarSourceRow,
} from "@/components/mentions/mentions-sidebar-row";
import { useI18n } from "@/components/providers/locale-provider";
import { Skeleton } from "@/components/ui/skeleton";
import { getServerAccentStyle, getServerInitial } from "@/lib/home/server-identity";
import {
  MENTION_KIND_GLYPH,
  MENTION_KIND_TONE,
  MENTION_SIDEBAR_KIND_ROWS,
  readMentionKindRowCount,
  type MentionSidebarKindRowId,
} from "@/lib/mentions/contracts";
import { MENTIONS_METRICS, hairline, pxToEm, pxToRem } from "@/lib/mentions/metrics";
import {
  MENTIONS_DM_SOURCE,
  buildMentionsHref,
  toggleMentionFilter,
  toggleMentionSource,
  type MentionsRouteState,
} from "@/lib/mentions/routes";
import { cn } from "@/lib/utils";

/**
 * Bahsetme rayı (276) — SPEC §3.
 *
 * Ray **saf sunumdur**: hiçbir sorgu açmaz, hiçbir mutasyon çağırmaz. Sayılar tek bir
 * `MentionCounts` nesnesinden gelir; ray başlığındaki rozet, `Okunmamış` satırının pili ve
 * başlıktaki `Okunmamış` sekmesi aynı sayıyı göstermek zorunda ve ikinci bir toplama yazmak
 * onları er geç ayrıştırırdı.
 *
 * `counts === null` bir hata durumudur, boş bir ekran değil: satırlar pilsiz çizilir. Sayaç
 * ucu düştüğünde kullanıcının rayı kaybetmesi için sebep yok — filtreler hâlâ çalışır.
 *
 * Rayın altında kullanıcı barı **yoktur** (SPEC §0): bar gezinme panelinin ayağındadır,
 * burada tekrarlanması iki kez odaklanılabilen bir ayar düğmesi demek olurdu.
 */

const { shell, sidebar } = MENTIONS_METRICS;

/** SPEC §3 tablosu. `unread` bir bahsetme türü değil, bir durum — tonu `--warning`. */
const KIND_ROW_TONE: Readonly<Record<MentionSidebarKindRowId, string>> = {
  me: MENTION_KIND_TONE.me,
  role: MENTION_KIND_TONE.role,
  thread: MENTION_KIND_TONE.thread,
  unread: MENTION_KIND_TONE.everyone,
};

/** Ray alt metninde en çok bu kadar rol adı yazılır; kalanı `+{n}` olur. */
const MAX_VISIBLE_ROLE_NAMES = 3;

export type MentionSourceInput = {
  id: string;
  name: string;
  shortName: string | null;
};

export type MentionSourceRow = {
  count: number;
  id: string;
  initial: string;
  kind: "dm" | "server";
  name: string;
  tile: { background: string; color: string };
};

/**
 * Kaynak satırları — SPEC §3.
 *
 * Pencerede en az bir bahsetmesi olan **her** kaynak listelenir; sunucular sayıya göre azalan,
 * `Direkt mesajlar` her zaman en sonda. Eşitlikte ad kırar: aynı veri iki yüklemede iki farklı
 * sıra verirse kullanıcı listeyi gözüyle takip edemez.
 *
 * Adı bilinmeyen kimlik **atlanır**. Sayaç, kullanıcının ayrıldığı bir sunucunun kimliğini bir
 * süre daha taşıyabilir; ekrana bir uuid yazmak o satırı okunamaz yapardı.
 */
export function buildMentionSourceRows(
  counts: MentionCounts | null,
  servers: readonly MentionSourceInput[],
  dmLabel: string,
): MentionSourceRow[] {
  if (!counts) {
    return [];
  }

  const byId = new Map(servers.map((server) => [server.id, server]));
  const rows: MentionSourceRow[] = [];

  for (const [id, count] of Object.entries(counts.bySource)) {
    if (count <= 0 || id === MENTIONS_DM_SOURCE) {
      continue;
    }

    const server = byId.get(id);
    if (!server) {
      continue;
    }

    rows.push({
      count,
      id,
      initial: getServerInitial(server),
      kind: "server",
      name: server.name,
      tile: getServerAccentStyle(id, "rail"),
    });
  }

  rows.sort((left, right) =>
    left.count === right.count ? left.name.localeCompare(right.name) : right.count - left.count,
  );

  const dmCount = counts.bySource[MENTIONS_DM_SOURCE] ?? 0;
  if (dmCount > 0) {
    rows.push({
      count: dmCount,
      id: MENTIONS_DM_SOURCE,
      initial: "DM",
      kind: "dm",
      name: dmLabel,
      tile: { background: "hsl(var(--surface-tertiary))", color: "hsl(var(--text-secondary))" },
    });
  }

  return rows;
}

export type MentionsSidebarProps = {
  /** `null` → sayaç sorgusu düştü; satırlar pilsiz çizilir. */
  counts: MentionCounts | null;
  countsLoading: boolean;
  markAllPending: boolean;
  onMarkAllRead: () => void;
  /** Her tuş vuruşunda çağrılır; gecikmeyi çağıran uygular (`MENTIONS_SEARCH_DEBOUNCE_MS`). */
  onQueryChange: (value: string) => void;
  /** Kullanıcının **bahsedilebilir** rollerinin adları, `@` olmadan. */
  roleNames: readonly string[];
  routeState: MentionsRouteState;
  sources: readonly MentionSourceRow[];
  /** K9 — gerçek `@username`; görünen addan ikinci bir takı türetilmez. */
  username: string;
};

function SectionLabel({
  children,
  icon,
  trailing,
}: {
  children: React.ReactNode;
  icon?: React.ReactNode;
  trailing?: React.ReactNode;
}) {
  return (
    <div
      className="flex items-center text-[hsl(var(--text-muted))]"
      style={{
        gap: pxToRem(sidebar.sectionLabelGap),
        padding: `0 ${pxToRem(sidebar.sectionLabelPaddingX)} ${pxToRem(
          sidebar.sectionLabelPaddingBottom,
        )}`,
      }}
    >
      {icon}
      <span
        className={cn("uppercase", DISPLAY_FONT)}
        style={{
          fontSize: pxToRem(sidebar.sectionLabelFontSize),
          fontWeight: sidebar.sectionLabelWeight,
          letterSpacing: `${sidebar.sectionLabelTracking}em`,
          lineHeight: 1,
        }}
      >
        {children}
      </span>
      {trailing ? <span className="ml-auto">{trailing}</span> : null}
    </div>
  );
}

function SidebarSkeleton({ rowCount }: { rowCount: number }) {
  return (
    <div
      className="flex flex-col"
      style={{ gap: pxToRem(sidebar.listGap), padding: `0 ${pxToRem(sidebar.listPaddingX)}` }}
    >
      {Array.from({ length: rowCount }, (_unused, index) => (
        <div
          className="flex items-center"
          key={index}
          style={{
            gap: pxToRem(sidebar.kindRowGap),
            padding: `${pxToRem(sidebar.kindRowPaddingY)} ${pxToRem(sidebar.kindRowPaddingX)}`,
          }}
        >
          <Skeleton
            className="shrink-0"
            style={{
              borderRadius: pxToRem(sidebar.kindRowTileRadius),
              height: pxToRem(sidebar.kindRowTileSize),
              width: pxToRem(sidebar.kindRowTileSize),
            }}
          />
          <div className="min-w-0 flex-1">
            <Skeleton style={{ height: pxToRem(sidebar.kindRowTitleFontSize), width: "58%" }} />
            <Skeleton
              style={{
                height: pxToRem(sidebar.kindRowSubtitleFontSize),
                marginTop: pxToRem(sidebar.kindRowSubtitleMarginTop),
                width: "80%",
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export function MentionsSidebar({
  counts,
  countsLoading,
  markAllPending,
  onMarkAllRead,
  onQueryChange,
  roleNames,
  routeState,
  sources,
  username,
}: MentionsSidebarProps) {
  const { t } = useI18n();
  const [draft, setDraft] = useState(routeState.query ?? "");
  // Adres çubuğu dışarıdan değişebilir (geri tuşu, paylaşılan bağlantı). Kutunun kendi
  // taslağı o zaman bayat kalır; yalnız **adres değiştiğinde** eşitlenir, her render'da değil —
  // aksi halde kullanıcının yazdığı harf debounce penceresinde geri alınırdı.
  const lastRouteQuery = useRef(routeState.query ?? "");

  useEffect(() => {
    const next = routeState.query ?? "";

    if (next !== lastRouteQuery.current) {
      lastRouteQuery.current = next;
      setDraft(next);
    }
  }, [routeState.query]);

  const unread = counts?.unread ?? 0;
  const sourceCount = sources.length;

  const roleSubtitle = useMemo(() => {
    if (roleNames.length === 0) {
      return t("mentions.kind.role.subtitleEmpty");
    }

    const visible = roleNames.slice(0, MAX_VISIBLE_ROLE_NAMES).map((name) => `@${name}`);
    const hidden = roleNames.length - visible.length;

    if (hidden > 0) {
      visible.push(t("mentions.kind.role.more", { count: hidden }));
    }

    return t("mentions.kind.role.subtitle", { roles: visible.join(" · ") });
  }, [roleNames, t]);

  const kindSubtitles: Readonly<Record<MentionSidebarKindRowId, string>> = {
    me: t("mentions.kind.me.subtitle", { username }),
    role: roleSubtitle,
    thread: t("mentions.kind.thread.subtitle"),
    unread: t("mentions.kind.unread.subtitle"),
  };

  /**
   * Ray satırı adresi. `panel` ve `modal` bilerek **düşer**: bağlam paneli tek bir bahsetmeye
   * bağlıdır ve yeni süzgeç o bahsetmeyi listeden çıkarabilir; panelin dayanağı olmayan bir
   * kolonu açık bırakmak kullanıcıya kaybolmuş bir kart gösterirdi.
   */
  const rowHref = (next: Partial<MentionsRouteState>) =>
    buildMentionsHref({
      filter: routeState.filter,
      grouping: routeState.grouping,
      query: routeState.query,
      source: routeState.source,
      window: routeState.window,
      ...next,
    });

  const settingsHref = buildMentionsHref({
    ...routeState,
    settingsOpen: !routeState.settingsOpen,
  });

  return (
    <section
      aria-label={t("mentions.sidebar.title")}
      className="flex h-full min-h-0 flex-col bg-[hsl(var(--surface-panel))]"
      data-testid="mentions-sidebar"
      style={{
        borderRight: `${hairline()} solid hsl(var(--border)/0.4)`,
        width: pxToRem(shell.railWidth),
      }}
    >
      <header
        className="flex items-center justify-between"
        style={{
          padding: `${pxToRem(sidebar.headerPaddingTop)} ${pxToRem(
            sidebar.headerPaddingX,
          )} ${pxToRem(sidebar.headerPaddingBottom)}`,
        }}
      >
        <h2
          className={cn("text-[hsl(var(--foreground))]", DISPLAY_FONT)}
          style={{
            fontSize: pxToRem(sidebar.titleFontSize),
            fontWeight: sidebar.titleWeight,
            letterSpacing: "-0.02em",
            lineHeight: sidebar.titleLineHeight,
          }}
        >
          {t("mentions.sidebar.title")}
        </h2>
        {unread > 0 ? (
          <span
            className={cn(
              "grid place-items-center bg-[hsl(var(--danger))] text-white",
              DISPLAY_FONT,
            )}
            style={{
              borderRadius: pxToRem(sidebar.badgeRadius),
              fontSize: pxToRem(sidebar.badgeFontSize),
              fontWeight: sidebar.badgeWeight,
              height: pxToRem(sidebar.badgeHeight),
              lineHeight: 1,
              minWidth: pxToRem(sidebar.badgeMinWidth),
              padding: `0 ${pxToRem(sidebar.badgePaddingX)}`,
            }}
            data-testid="mentions-sidebar-unread-total"
          >
            <span aria-hidden="true">{unread}</span>
            <span className="sr-only">
              {t("mentions.sidebar.unreadBadgeLabel", { count: unread })}
            </span>
          </span>
        ) : null}
      </header>

      <div
        className="flex"
        style={{
          gap: pxToRem(sidebar.actionRowGap),
          padding: `0 ${pxToRem(sidebar.actionRowPaddingX)} ${pxToRem(
            sidebar.actionRowPaddingBottom,
          )}`,
        }}
      >
        <button
          className="flex flex-1 items-center justify-center bg-[hsl(var(--primary))] text-white transition-[filter] hover:brightness-[1.08] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] disabled:cursor-not-allowed disabled:opacity-60"
          onClick={onMarkAllRead}
          style={{
            borderRadius: pxToRem(sidebar.markAllRadius),
            transitionDuration: `${sidebar.transitionMs}ms`,
            boxShadow: `${pxToRem(sidebar.markAllShadow.x)} ${pxToRem(
              sidebar.markAllShadow.y,
            )} ${pxToRem(sidebar.markAllShadow.blur)} ${pxToRem(
              sidebar.markAllShadow.spread,
            )} hsl(var(--primary))`,
            fontSize: pxToRem(sidebar.markAllFontSize),
            fontWeight: sidebar.markAllWeight,
            gap: pxToRem(sidebar.markAllGap),
            height: pxToRem(sidebar.markAllHeight),
          }}
          type="button"
          data-testid="mentions-sidebar-mark-all"
          disabled={markAllPending || unread === 0}
        >
          <CheckCheck
            aria-hidden="true"
            style={{
              height: pxToEm(sidebar.markAllIconSize, sidebar.markAllFontSize),
              width: pxToEm(sidebar.markAllIconSize, sidebar.markAllFontSize),
            }}
          />
          {t("mentions.sidebar.markAllRead")}
        </button>
        <Link
          aria-expanded={routeState.settingsOpen}
          aria-label={t("mentions.sidebar.notificationSettings")}
          className={cn(
            "grid shrink-0 place-items-center transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]",
            // Kapalıyken zemin ve mürekkep **sınıftan** gelir: satır içi bir `background`
            // `hover:` kuralını her zaman yener ve butonun hover'ı sessizce ölürdü.
            routeState.settingsOpen
              ? undefined
              : "text-[hsl(var(--text-muted))] hover:bg-[hsl(var(--surface-soft))] hover:text-[hsl(var(--foreground))]",
          )}
          data-testid="mentions-sidebar-settings"
          href={settingsHref}
          scroll={false}
          style={{
            ...(routeState.settingsOpen
              ? { background: "hsl(var(--primary)/0.15)", color: "hsl(var(--primary))" }
              : {}),
            border: `${hairline()} solid hsl(var(--border))`,
            borderRadius: pxToRem(sidebar.bellRadius),
            height: pxToRem(sidebar.bellSize),
            transitionDuration: `${sidebar.transitionMs}ms`,
            width: pxToRem(sidebar.bellSize),
          }}
        >
          <Bell
            aria-hidden="true"
            style={{
              height: pxToRem(sidebar.bellIconSize),
              width: pxToRem(sidebar.bellIconSize),
            }}
          />
        </Link>
      </div>

      <div
        style={{
          padding: `0 ${pxToRem(sidebar.searchPaddingX)} ${pxToRem(sidebar.searchPaddingBottom)}`,
        }}
      >
        <label
          className="flex items-center bg-[hsl(var(--surface-soft)/0.7)]"
          style={{
            border: `${hairline()} solid hsl(var(--border)/0.5)`,
            borderRadius: pxToRem(sidebar.searchRadius),
            gap: pxToRem(sidebar.searchGap),
            height: pxToRem(sidebar.searchHeight),
            padding: `0 ${pxToRem(sidebar.searchInnerPaddingX)}`,
          }}
        >
          <Search
            aria-hidden="true"
            className="shrink-0 text-[hsl(var(--text-muted))]"
            style={{
              height: pxToRem(sidebar.searchIconSize),
              width: pxToRem(sidebar.searchIconSize),
            }}
          />
          <input
            aria-label={t("mentions.sidebar.searchPlaceholder")}
            className="min-w-0 flex-1 bg-transparent text-[hsl(var(--foreground))] outline-hidden placeholder:text-[hsl(var(--text-muted))]"
            data-testid="mentions-sidebar-search"
            onChange={(event) => {
              setDraft(event.target.value);
              onQueryChange(event.target.value);
            }}
            placeholder={t("mentions.sidebar.searchPlaceholder")}
            style={{ fontSize: pxToRem(sidebar.searchFontSize) }}
            type="search"
            value={draft}
          />
        </label>
      </div>

      <SectionLabel
        icon={
          <AtSign
            aria-hidden="true"
            className="shrink-0"
            style={{
              height: pxToRem(sidebar.sectionLabelIconSize),
              width: pxToRem(sidebar.sectionLabelIconSize),
            }}
          />
        }
      >
        {t("mentions.sidebar.byKind")}
      </SectionLabel>

      {countsLoading ? (
        <div data-testid="mentions-sidebar-skeleton">
          <span className="sr-only">{t("mentions.sidebar.loading")}</span>
          <SidebarSkeleton rowCount={MENTION_SIDEBAR_KIND_ROWS.length} />
        </div>
      ) : (
        <div
          className="flex flex-col"
          style={{ gap: pxToRem(sidebar.listGap), padding: `0 ${pxToRem(sidebar.listPaddingX)}` }}
        >
          {MENTION_SIDEBAR_KIND_ROWS.map((row) => (
            <MentionsSidebarKindRow
              count={counts ? readMentionKindRowCount(counts, row.id) : null}
              glyph={MENTION_KIND_GLYPH[row.id]}
              href={rowHref({ filter: toggleMentionFilter(routeState.filter, row.filter) })}
              key={row.id}
              pillTone={row.id === "unread" ? "danger" : "neutral"}
              selected={routeState.filter === row.filter}
              subtitle={kindSubtitles[row.id]}
              title={t(`mentions.kind.${row.id}.title`)}
              tone={KIND_ROW_TONE[row.id]}
            />
          ))}
        </div>
      )}

      <div
        aria-hidden="true"
        style={{
          background: "hsl(var(--border)/0.5)",
          height: hairline(),
          margin: `${pxToRem(sidebar.dividerMarginTop)} ${pxToRem(
            sidebar.dividerMarginX,
          )} ${pxToRem(sidebar.dividerMarginBottom)}`,
        }}
      />

      <SectionLabel
        trailing={
          <span
            className={cn("text-[hsl(var(--text-muted)/0.8)]", DISPLAY_FONT)}
            style={{
              fontSize: pxToRem(sidebar.sectionCountFontSize),
              fontWeight: sidebar.sectionLabelWeight,
              lineHeight: 1,
            }}
            data-testid="mentions-sidebar-source-total"
          >
            {sourceCount}
          </span>
        }
      >
        {t("mentions.sidebar.bySource")}
      </SectionLabel>

      {/* 30 sunuculu kullanıcıda tür satırları yerinde kalsın diye kaydırma **yalnız** burada. */}
      <div
        className="flex min-h-0 flex-1 flex-col overflow-y-auto"
        style={{
          gap: pxToRem(sidebar.listGap),
          padding: `0 ${pxToRem(sidebar.listPaddingX)} ${pxToRem(sidebar.dividerMarginBottom)}`,
        }}
      >
        {countsLoading
          ? null
          : sources.map((source) => (
              <MentionsSidebarSourceRow
                count={source.count}
                href={rowHref({ source: toggleMentionSource(routeState.source, source.id) })}
                initial={source.initial}
                key={source.id}
                name={source.name}
                round={source.kind === "dm"}
                selected={routeState.source === source.id}
                tile={source.tile}
              />
            ))}
      </div>
    </section>
  );
}
