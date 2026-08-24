"use client";

import Link from "next/link";
import type { DiscoverCategory } from "@wizards/types";
import React from "react";

import { buildDiscoverCategoryHref } from "@/components/discover/discover-sidebar";
import { useI18n } from "@/components/providers/locale-provider";
import { DISCOVER_CATEGORIES } from "@/lib/discover/contracts";
import { hairline, pxToRem } from "@/lib/discover/metrics";
import type { DiscoverRouteState } from "@/lib/discover/routes";

export type DiscoverCategoryStripProps = {
  readonly categories: readonly DiscoverCategory[] | null;
  readonly route: DiscoverRouteState;
};

export function DiscoverCategoryStrip({ categories, route }: DiscoverCategoryStripProps) {
  const { t } = useI18n();
  const counts = new Map(categories?.map((category) => [category.key, category.count]) ?? []);

  return (
    <nav
      aria-label={t("discover.categories")}
      className="items-center overflow-x-auto"
      data-testid="discover-category-strip"
      role="listbox"
      style={{
        borderBottom: `${hairline()} solid hsl(var(--border)/0.45)`,
        gap: pxToRem(7),
        padding: `${pxToRem(9)} ${pxToRem(24)}`,
        scrollbarWidth: "thin",
      }}
    >
      {DISCOVER_CATEGORIES.map((category) => {
        const selected = route.category === category.key;
        const label = t(`discover.category.${category.key}`);
        const count = counts.get(category.key);

        return (
          <Link
            aria-label={count === undefined ? label : `${label}: ${count}`}
            aria-selected={selected}
            className="relative flex shrink-0 items-center whitespace-nowrap before:absolute before:-inset-1 before:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
            data-testid="discover-category-strip-option"
            href={buildDiscoverCategoryHref(category.key, route)}
            key={category.key}
            role="option"
            style={{
              background: selected
                ? `hsl(var(--${category.tone})/0.14)`
                : "hsl(var(--surface-soft))",
              border: `${hairline()} solid ${
                selected ? `hsl(var(--${category.tone})/0.3)` : "hsl(var(--border)/0.6)"
              }`,
              borderRadius: pxToRem(999),
              color: selected ? `hsl(var(--${category.tone}))` : "hsl(var(--text-secondary))",
              fontSize: pxToRem(11.5),
              fontWeight: 600,
              gap: pxToRem(6),
              height: pxToRem(36),
              paddingInline: pxToRem(12),
            }}
          >
            <span aria-hidden>{category.initials}</span>
            <span>{label}</span>
            {count === undefined ? null : <span aria-hidden>{count}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
