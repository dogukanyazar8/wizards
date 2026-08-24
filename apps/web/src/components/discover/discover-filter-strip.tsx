"use client";

import React from "react";
import Link from "next/link";
import { X } from "lucide-react";

import { useI18n } from "@/components/providers/locale-provider";
import { DISCOVER_METRICS, hairline, pxToEm, pxToRem } from "@/lib/discover/metrics";
import {
  DISCOVER_DEFAULT_CATEGORY,
  DISCOVER_DEFAULT_SORT,
  hasActiveDiscoverFilters,
  type DiscoverRouteState,
} from "@/lib/discover/routes";

export type DiscoverFilterStripProps = {
  readonly onClearCategory: () => void;
  readonly onClearQuery: () => void;
  readonly onClearSort: () => void;
  readonly route: DiscoverRouteState;
};

type FilterChip = {
  readonly key: "category" | "q" | "sort";
  readonly label: string;
  readonly onClear: () => void;
};

export function DiscoverFilterStrip({
  onClearCategory,
  onClearQuery,
  onClearSort,
  route,
}: DiscoverFilterStripProps) {
  const { t } = useI18n();
  const metrics = DISCOVER_METRICS.filterStrip;

  if (!hasActiveDiscoverFilters(route)) {
    return null;
  }

  const chips: FilterChip[] = [];
  if (route.category !== DISCOVER_DEFAULT_CATEGORY) {
    chips.push({
      key: "category",
      label: t(`discover.category.${route.category}`),
      onClear: onClearCategory,
    });
  }
  if (route.sort !== DISCOVER_DEFAULT_SORT) {
    chips.push({ key: "sort", label: t(`discover.sort.${route.sort}`), onClear: onClearSort });
  }
  if (route.q.length > 0) {
    chips.push({ key: "q", label: `“${route.q}”`, onClear: onClearQuery });
  }

  return (
    <div
      className="flex flex-wrap items-center bg-[hsl(var(--primary)/0.06)]"
      data-testid="discover-filter-strip"
      style={{
        borderBottom: `${hairline(metrics.borderWidth)} solid hsl(var(--border)/0.45)`,
        gap: pxToRem(metrics.gap),
        padding: `${pxToRem(metrics.paddingY)} ${pxToRem(metrics.paddingX)}`,
      }}
    >
      <span
        className="uppercase text-[hsl(var(--primary))]"
        style={{
          fontFamily: "var(--font-display)",
          fontSize: pxToRem(metrics.labelFontSize),
          fontWeight: metrics.labelWeight,
          letterSpacing: `${metrics.labelLetterSpacing}em`,
          lineHeight: 1,
        }}
      >
        {t("events.filters.label")}
      </span>
      {chips.map((chip) => (
        <button
          aria-label={t("events.filters.remove", { label: chip.label })}
          className="flex items-center bg-[hsl(var(--surface-card))] text-[hsl(var(--foreground))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
          key={chip.key}
          onClick={chip.onClear}
          style={{
            border: `${hairline(metrics.chipBorderWidth)} solid hsl(var(--primary)/0.4)`,
            borderRadius: pxToRem(metrics.chipRadius),
            fontFamily: "var(--font-sans)",
            fontSize: pxToRem(metrics.chipFontSize),
            fontWeight: metrics.chipWeight,
            gap: pxToRem(metrics.chipGap),
            lineHeight: 1,
            padding: `${pxToRem(metrics.chipPaddingY)} ${pxToRem(metrics.chipPaddingRight)} ${pxToRem(metrics.chipPaddingY)} ${pxToRem(metrics.chipPaddingLeft)}`,
          }}
          type="button"
        >
          {chip.label}
          <span
            aria-hidden
            className="grid place-items-center border-0 bg-[hsl(var(--surface-tertiary))] text-[hsl(var(--text-muted))]"
            style={{
              borderRadius: pxToRem(metrics.chipClearRadius),
              height: pxToRem(metrics.chipClearSize),
              width: pxToRem(metrics.chipClearSize),
            }}
          >
            <X aria-hidden size={pxToEm(metrics.chipClearIconSize)} strokeWidth={2.8} />
          </span>
        </button>
      ))}
      <Link
        className="ml-auto text-[hsl(var(--primary))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
        href="/discover"
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: pxToRem(metrics.clearAllFontSize),
          fontWeight: metrics.clearAllWeight,
          lineHeight: 1,
        }}
      >
        {t("discover.empty.clearFilters")}
      </Link>
    </div>
  );
}
