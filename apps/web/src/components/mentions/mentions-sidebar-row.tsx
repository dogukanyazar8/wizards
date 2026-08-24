"use client";

import Link from "next/link";
import React from "react";

import { DISPLAY_FONT } from "@/components/home/home-primitives";
import { MENTIONS_METRICS, pxToRem } from "@/lib/mentions/metrics";
import { cn } from "@/lib/utils";

/**
 * Bahsetme rayının iki satır dili — SPEC §3.
 *
 * İkisi de **bağlantıdır**, buton değil. Filtre ve kaynak seçimi URL'de duruyor
 * (`lib/mentions/routes.ts`); bir adresi değiştiren kontrolün gerçek bir `href` taşıması
 * paylaşılabilirliği, orta tık ile yeni sekmeyi ve tarayıcının geri tuşunu bedavaya getirir.
 * `onClick` ile yazılan aynı davranış bunların üçünü de kaybederdi.
 *
 * Seçili satırın zemini `className` üzerinden verilir, `style` ile değil: satır içi bir zemin
 * `hover:` sınıfını her zaman yener ve seçili olmayan satırların hover'ı sessizce ölürdü.
 */

const { sidebar } = MENTIONS_METRICS;

export type MentionsSidebarKindRowProps = {
  /** `null` → sayaç sorgusu düştü; pil hiç çizilmez (SPEC §3: sıfır sayı da çizilmez). */
  count: number | null;
  glyph: string;
  href: string;
  /** `Okunmamış` satırının pili `--danger` + ters metin; diğerleri nötr. */
  pillTone: "danger" | "neutral";
  selected: boolean;
  subtitle: string;
  title: string;
  /** `--primary` / `--info` / `--success` / `--warning` — token adı, renk değil. */
  tone: string;
};

export function MentionsSidebarKindRow({
  count,
  glyph,
  href,
  pillTone,
  selected,
  subtitle,
  title,
  tone,
}: MentionsSidebarKindRowProps) {
  return (
    <Link
      aria-current={selected ? "true" : undefined}
      className={cn(
        "flex items-center transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]",
        selected ? "bg-[hsl(var(--surface-soft))]" : "hover:bg-[hsl(var(--surface-soft)/0.75)]",
      )}
      data-testid="mentions-sidebar-kind-row"
      href={href}
      scroll={false}
      style={{
        borderRadius: pxToRem(sidebar.kindRowRadius),
        gap: pxToRem(sidebar.kindRowGap),
        padding: `${pxToRem(sidebar.kindRowPaddingY)} ${pxToRem(sidebar.kindRowPaddingX)}`,
        transitionDuration: `${sidebar.transitionMs}ms`,
      }}
    >
      <span
        aria-hidden="true"
        className={cn("grid shrink-0 place-items-center", DISPLAY_FONT)}
        style={{
          background: selected ? `hsl(var(${tone})/0.18)` : "hsl(var(--surface-soft))",
          borderRadius: pxToRem(sidebar.kindRowTileRadius),
          color: selected ? `hsl(var(${tone}))` : "hsl(var(--text-muted))",
          fontSize: pxToRem(sidebar.kindRowGlyphFontSize),
          fontWeight: sidebar.kindRowGlyphWeight,
          height: pxToRem(sidebar.kindRowTileSize),
          lineHeight: 1,
          width: pxToRem(sidebar.kindRowTileSize),
        }}
      >
        {glyph}
      </span>
      <span className="min-w-0 flex-1">
        <span
          className="block truncate"
          style={{
            color: selected ? "hsl(var(--foreground))" : "hsl(var(--text-secondary))",
            fontSize: pxToRem(sidebar.kindRowTitleFontSize),
            fontWeight: selected ? 600 : 500,
            lineHeight: sidebar.kindRowTitleLineHeight,
          }}
        >
          {title}
        </span>
        <span
          className="block truncate text-[hsl(var(--text-muted))]"
          style={{
            fontSize: pxToRem(sidebar.kindRowSubtitleFontSize),
            lineHeight: sidebar.kindRowSubtitleLineHeight,
            marginTop: pxToRem(sidebar.kindRowSubtitleMarginTop),
          }}
        >
          {subtitle}
        </span>
      </span>
      {count ? (
        <span
          className={cn(
            "grid shrink-0 place-items-center",
            DISPLAY_FONT,
            pillTone === "danger" ? "text-white" : "text-[hsl(var(--text-muted))]",
          )}
          data-testid="mentions-sidebar-kind-pill"
          style={{
            background: pillTone === "danger" ? "hsl(var(--danger))" : "hsl(var(--surface-soft))",
            borderRadius: pxToRem(sidebar.kindRowPillRadius),
            fontSize: pxToRem(sidebar.kindRowPillFontSize),
            fontWeight: sidebar.kindRowPillWeight,
            height: pxToRem(sidebar.kindRowPillHeight),
            lineHeight: 1,
            minWidth: pxToRem(sidebar.kindRowPillMinWidth),
            padding: `0 ${pxToRem(sidebar.kindRowPillPaddingX)}`,
          }}
        >
          {count}
        </span>
      ) : null}
    </Link>
  );
}

export type MentionsSidebarSourceRowProps = {
  count: number | null;
  href: string;
  /** Tile'ın tek/iki harfi: sunucu baş harfi ya da `DM`. */
  initial: string;
  name: string;
  /** DM satırının tile'ı yuvarlaktır (SPEC §3). */
  round: boolean;
  selected: boolean;
  tile: { background: string; color: string };
};

export function MentionsSidebarSourceRow({
  count,
  href,
  initial,
  name,
  round,
  selected,
  tile,
}: MentionsSidebarSourceRowProps) {
  return (
    <Link
      aria-current={selected ? "true" : undefined}
      className={cn(
        "flex items-center transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]",
        selected ? "bg-[hsl(var(--surface-soft))]" : "hover:bg-[hsl(var(--surface-soft)/0.75)]",
      )}
      data-testid="mentions-sidebar-source-row"
      href={href}
      scroll={false}
      style={{
        borderRadius: pxToRem(sidebar.sourceRowRadius),
        gap: pxToRem(sidebar.sourceRowGap),
        padding: `${pxToRem(sidebar.sourceRowPaddingY)} ${pxToRem(sidebar.sourceRowPaddingX)}`,
        transitionDuration: `${sidebar.transitionMs}ms`,
      }}
    >
      <span
        aria-hidden="true"
        className={cn("grid shrink-0 place-items-center", DISPLAY_FONT)}
        style={{
          background: tile.background,
          borderRadius: round
            ? sidebar.sourceRowTileRadiusDm
            : pxToRem(sidebar.sourceRowTileRadius),
          color: tile.color,
          fontSize: pxToRem(sidebar.sourceRowTileFontSize),
          fontWeight: 600,
          height: pxToRem(sidebar.sourceRowTileSize),
          lineHeight: 1,
          width: pxToRem(sidebar.sourceRowTileSize),
        }}
      >
        {initial}
      </span>
      <span
        className="min-w-0 flex-1 truncate"
        style={{
          color: selected ? "hsl(var(--foreground))" : "hsl(var(--text-secondary))",
          fontSize: pxToRem(sidebar.sourceRowNameFontSize),
          fontWeight: selected ? 600 : 500,
          lineHeight: sidebar.sourceRowNameLineHeight,
        }}
      >
        {name}
      </span>
      {count ? (
        <span
          className={cn("shrink-0 text-[hsl(var(--text-muted))]", DISPLAY_FONT)}
          data-testid="mentions-sidebar-source-count"
          style={{
            fontSize: pxToRem(sidebar.sourceRowCountFontSize),
            fontWeight: 600,
            lineHeight: 1,
          }}
        >
          {count}
        </span>
      ) : null}
    </Link>
  );
}
