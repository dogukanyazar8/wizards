"use client";

import Link from "next/link";
import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { Grid2X2, Search, SlidersHorizontal, X } from "lucide-react";
import type { DiscoverCategory, DiscoverCategoryKey } from "@wizards/types";

import { DISPLAY_FONT } from "@/components/home/home-primitives";
import { useI18n } from "@/components/providers/locale-provider";
import {
  DiscoverSidebarCategoryRow,
  DiscoverSidebarSortRow,
} from "@/components/discover/discover-sidebar-row";
import { DISCOVER_CATEGORIES, DISCOVER_SORTS } from "@/lib/discover/contracts";
import { DISCOVER_METRICS, hairline, pxToEm, pxToRem } from "@/lib/discover/metrics";
import {
  buildDiscoverHref,
  parseDiscoverQuery,
  type DiscoverRouteState,
} from "@/lib/discover/routes";
import { cn } from "@/lib/utils";

const { columns, sidebar } = DISCOVER_METRICS;

export type DiscoverSidebarProps = {
  /** `null` = sayaç önbelleği yok/hatalı; satırlar pilsiz kalır. */
  categories: readonly DiscoverCategory[] | null;
  /** Her tuş vuruşu; 250 ms debounce ve URL yazımı container katmanındadır. */
  onQueryChange: (value: string) => void;
  routeState: DiscoverRouteState;
};

function SectionLabel({ children, icon }: { children: React.ReactNode; icon: React.ReactNode }) {
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
          letterSpacing: `${sidebar.sectionLabelLetterSpacing}em`,
          lineHeight: 1,
        }}
      >
        {children}
      </span>
    </div>
  );
}

/**
 * Kategori satırı `lane=servers` ve `cat` değerini **açık** taşır. Genel rota kurucusu
 * varsayılanları kanonik URL'den düşürür; ray bağlantısının kabul sözleşmesi ise iki
 * parametrenin de `href` içinde görünmesini ister.
 */
export function buildDiscoverCategoryHref(
  category: DiscoverCategoryKey,
  routeState: DiscoverRouteState,
): string {
  const canonical = buildDiscoverHref({ category, lane: "servers" }, routeState);
  const [, canonicalSearch = ""] = canonical.split("?", 2);
  const canonicalParams = new URLSearchParams(canonicalSearch);
  const params = new URLSearchParams();

  params.set("lane", "servers");
  params.set("cat", category);
  for (const [name, value] of canonicalParams) {
    if (name !== "lane" && name !== "cat") {
      params.set(name, value);
    }
  }

  return `/discover?${params.toString()}`;
}

export type DiscoverQueryEchoResolution = {
  readonly adoptRouteQuery: boolean;
  readonly pendingLocalQuery: string | null;
};

/** Eski URL yankısı daha yeni yerel taslağı ezemez; eşleşen yankı kilidi bırakır. */
export function resolveDiscoverQueryEcho(
  routeQuery: string,
  pendingLocalQuery: string | null,
): DiscoverQueryEchoResolution {
  if (pendingLocalQuery === null) {
    return { adoptRouteQuery: true, pendingLocalQuery: null };
  }

  return {
    adoptRouteQuery: false,
    pendingLocalQuery:
      parseDiscoverQuery(pendingLocalQuery) === routeQuery ? null : pendingLocalQuery,
  };
}

/**
 * Keşfet dizin rayı (276) — saf sunum. Sorgu ve mutasyon yok; sayaçlar tek prop'tan gelir.
 * `categories === null` satırları gizlemez, yalnızca sayı pillerini kaldırır.
 */
export function DiscoverSidebar({ categories, onQueryChange, routeState }: DiscoverSidebarProps) {
  const { t } = useI18n();
  const searchId = useId();
  const [draft, setDraft] = useState(routeState.q);
  const lastRouteQuery = useRef(routeState.q);
  const pendingLocalQuery = useRef<string | null>(null);

  useEffect(() => {
    if (routeState.q !== lastRouteQuery.current) {
      lastRouteQuery.current = routeState.q;
      const resolution = resolveDiscoverQueryEcho(routeState.q, pendingLocalQuery.current);
      pendingLocalQuery.current = resolution.pendingLocalQuery;
      if (resolution.adoptRouteQuery) {
        setDraft(routeState.q);
      }
    }
  }, [routeState.q]);

  const counts = useMemo(
    () =>
      categories === null
        ? null
        : new Map(categories.map((category) => [category.key, category.count])),
    [categories],
  );
  const total = counts?.get("all") ?? null;

  return (
    <section
      aria-label={t("discover.title")}
      className="flex h-full min-h-0 flex-col bg-[hsl(var(--surface-panel))]"
      data-discover-surface=""
      data-testid="discover-sidebar"
      style={{
        borderRight: `${hairline()} solid hsl(var(--border)/0.4)`,
        width: pxToRem(columns.directory),
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
            letterSpacing: `${sidebar.titleLetterSpacing}em`,
            lineHeight: sidebar.titleLineHeight,
          }}
        >
          {t("discover.title")}
        </h2>
        {total === null ? null : (
          <span
            aria-hidden="true"
            className={cn(
              "grid place-items-center bg-[hsl(var(--surface-soft))] text-[hsl(var(--text-muted))]",
              DISPLAY_FONT,
            )}
            data-testid="discover-sidebar-total"
            style={{
              borderRadius: pxToRem(sidebar.totalPillRadius),
              fontSize: pxToRem(sidebar.totalPillFontSize),
              fontWeight: sidebar.totalPillWeight,
              height: pxToRem(sidebar.totalPillHeight),
              lineHeight: 1,
              minWidth: pxToRem(sidebar.totalPillMinWidth),
              padding: `0 ${pxToRem(sidebar.totalPillPaddingX)}`,
            }}
          >
            {total}
          </span>
        )}
      </header>

      <div
        style={{
          padding: `0 ${pxToRem(sidebar.searchPaddingX)} ${pxToRem(sidebar.searchPaddingBottom)}`,
        }}
      >
        <label className="sr-only" htmlFor={searchId}>
          {t("discover.search.placeholder")}
        </label>
        <div
          className="flex items-center border-[hsl(var(--border)/0.6)] bg-[hsl(var(--surface-soft)/0.7)] focus-within:border-[hsl(var(--primary)/0.5)]"
          style={{
            borderRadius: pxToRem(sidebar.searchRadius),
            borderStyle: "solid",
            borderWidth: hairline(),
            gap: pxToRem(sidebar.searchGap),
            height: pxToRem(sidebar.searchHeight),
            padding: `0 ${pxToRem(sidebar.searchPaddingInline)}`,
            transition: `border-color ${DISCOVER_METRICS.transitions.searchBorder}ms`,
          }}
        >
          <Search
            aria-hidden="true"
            className="shrink-0 text-[hsl(var(--text-muted))]"
            style={{
              height: pxToEm(sidebar.searchIconSize, sidebar.searchFontSize),
              width: pxToEm(sidebar.searchIconSize, sidebar.searchFontSize),
            }}
          />
          <input
            className="min-w-0 flex-1 bg-transparent text-[hsl(var(--foreground))] outline-hidden placeholder:text-[hsl(var(--text-muted))] focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
            data-testid="discover-search"
            id={searchId}
            onChange={(event) => {
              const nextQuery = event.target.value;
              pendingLocalQuery.current =
                parseDiscoverQuery(nextQuery) === routeState.q ? null : nextQuery;
              setDraft(nextQuery);
              onQueryChange(nextQuery);
            }}
            placeholder={t("discover.search.placeholder")}
            style={{ fontSize: pxToRem(sidebar.searchFontSize) }}
            type="search"
            value={draft}
          />
          {draft.length === 0 ? null : (
            <button
              aria-label={t("discover.search.clear")}
              className="relative grid shrink-0 place-items-center bg-[hsl(var(--surface-tertiary))] text-[hsl(var(--text-muted))] transition-colors before:absolute before:-inset-3 before:content-[''] hover:text-[hsl(var(--foreground))] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
              data-testid="discover-search-clear"
              onClick={() => {
                pendingLocalQuery.current = routeState.q.length === 0 ? null : "";
                setDraft("");
                onQueryChange("");
              }}
              style={{
                borderRadius: pxToRem(sidebar.searchClearRadius),
                height: pxToRem(sidebar.searchClearSize),
                width: pxToRem(sidebar.searchClearSize),
              }}
              type="button"
            >
              <X
                aria-hidden="true"
                style={{
                  height: pxToEm(sidebar.searchClearIconSize, sidebar.searchFontSize),
                  width: pxToEm(sidebar.searchClearIconSize, sidebar.searchFontSize),
                }}
              />
            </button>
          )}
        </div>
      </div>

      <SectionLabel
        icon={
          <Grid2X2
            aria-hidden="true"
            className="shrink-0"
            style={{
              height: pxToEm(sidebar.sectionLabelIconSize, sidebar.sectionLabelFontSize),
              width: pxToEm(sidebar.sectionLabelIconSize, sidebar.sectionLabelFontSize),
            }}
          />
        }
      >
        {t("discover.categories")}
      </SectionLabel>

      <div
        aria-label={t("discover.categories")}
        className="flex flex-col"
        role="listbox"
        style={{ gap: pxToRem(sidebar.listGap), padding: `0 ${pxToRem(sidebar.listPaddingX)}` }}
      >
        {DISCOVER_CATEGORIES.map((category) => {
          const label = t(`discover.category.${category.key}`);
          const count = counts?.get(category.key) ?? null;

          return (
            <DiscoverSidebarCategoryRow
              accessibleLabel={count === null ? label : `${label}, ${count} ${t("common.server")}`}
              count={count}
              href={buildDiscoverCategoryHref(category.key, routeState)}
              initials={category.initials}
              key={category.key}
              label={label}
              selected={routeState.category === category.key}
              tone={category.tone}
            />
          );
        })}
      </div>

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
        icon={
          <SlidersHorizontal
            aria-hidden="true"
            className="shrink-0"
            style={{
              height: pxToEm(sidebar.sectionLabelIconSize, sidebar.sectionLabelFontSize),
              width: pxToEm(sidebar.sectionLabelIconSize, sidebar.sectionLabelFontSize),
            }}
          />
        }
      >
        {t("discover.sort")}
      </SectionLabel>

      <div
        aria-label={t("discover.sort")}
        className="flex flex-col"
        role="listbox"
        style={{ gap: pxToRem(sidebar.listGap), padding: `0 ${pxToRem(sidebar.listPaddingX)}` }}
      >
        {DISCOVER_SORTS.map((sort) => (
          <DiscoverSidebarSortRow
            href={buildDiscoverHref({ sort: sort.key }, routeState)}
            key={sort.key}
            label={t(`discover.sort.${sort.key}`)}
            selected={routeState.sort === sort.key}
            tone={sort.tone}
          />
        ))}
      </div>

      <footer
        className="mt-auto"
        style={{
          borderTop: `${hairline()} solid hsl(var(--border)/0.5)`,
          padding: `${pxToRem(sidebar.inviteCardPaddingY)} ${pxToRem(sidebar.inviteCardPaddingX)}`,
        }}
      >
        <p
          className="text-[hsl(var(--foreground))]"
          style={{
            fontSize: pxToRem(sidebar.inviteTitleFontSize),
            fontWeight: sidebar.inviteTitleWeight,
            lineHeight: sidebar.inviteTitleLineHeight,
          }}
        >
          {t("discover.invite.title")}
        </p>
        <p
          className="text-[hsl(var(--text-muted))]"
          style={{
            fontSize: pxToRem(sidebar.inviteBodyFontSize),
            lineHeight: sidebar.inviteBodyLineHeight,
            marginTop: pxToRem(sidebar.inviteBodyMarginTop),
          }}
        >
          {t("discover.invite.body")}
        </p>
        <Link
          className="flex w-full items-center justify-center border-[hsl(var(--border))] bg-[hsl(var(--surface-card))] text-[hsl(var(--text-secondary))] transition-colors hover:bg-[hsl(var(--surface-soft))] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
          href={buildDiscoverHref({ modal: "join" }, routeState)}
          prefetch={false}
          scroll={false}
          style={{
            borderRadius: pxToRem(sidebar.inviteButtonRadius),
            borderStyle: "solid",
            borderWidth: hairline(),
            fontSize: pxToRem(sidebar.inviteButtonFontSize),
            fontWeight: sidebar.inviteButtonWeight,
            height: pxToRem(sidebar.inviteButtonHeight),
            marginTop: pxToRem(sidebar.inviteButtonMarginTop),
          }}
        >
          {t("discover.invite.cta")}
        </Link>
      </footer>
    </section>
  );
}
