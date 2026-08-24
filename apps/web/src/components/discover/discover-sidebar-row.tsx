"use client";

import Link from "next/link";
import React from "react";

import { DISPLAY_FONT } from "@/components/home/home-primitives";
import type { DiscoverTone } from "@/lib/discover/contracts";
import { DISCOVER_METRICS, pxToRem } from "@/lib/discover/metrics";
import { cn } from "@/lib/utils";

const { sidebar } = DISCOVER_METRICS;

function handleListboxKeyDown(event: React.KeyboardEvent<HTMLAnchorElement>) {
  if (event.key === " ") {
    event.preventDefault();
    event.currentTarget.click();
    return;
  }

  if (!["ArrowDown", "ArrowUp", "End", "Home"].includes(event.key)) {
    return;
  }

  const listbox = event.currentTarget.closest('[role="listbox"]');
  const options = listbox
    ? Array.from(listbox.querySelectorAll<HTMLElement>('[role="option"]'))
    : [];
  const currentIndex = options.indexOf(event.currentTarget);

  if (currentIndex < 0 || options.length === 0) {
    return;
  }

  event.preventDefault();
  const nextIndex =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? options.length - 1
        : event.key === "ArrowDown"
          ? (currentIndex + 1) % options.length
          : (currentIndex - 1 + options.length) % options.length;

  options[nextIndex]?.focus();
}

export type DiscoverSidebarCategoryRowProps = {
  accessibleLabel: string;
  count: number | null;
  href: string;
  initials: string;
  label: string;
  selected: boolean;
  tone: DiscoverTone;
};

export function DiscoverSidebarCategoryRow({
  accessibleLabel,
  count,
  href,
  initials,
  label,
  selected,
  tone,
}: DiscoverSidebarCategoryRowProps) {
  const toneVariable = `--${tone}`;

  return (
    <Link
      aria-label={accessibleLabel}
      aria-selected={selected}
      className={cn(
        "flex items-center transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]",
        selected ? "bg-[hsl(var(--surface-soft))]" : "hover:bg-[hsl(var(--surface-soft)/0.75)]",
      )}
      data-testid="discover-category-row"
      href={href}
      onKeyDown={handleListboxKeyDown}
      prefetch={false}
      role="option"
      scroll={false}
      style={{
        borderRadius: pxToRem(sidebar.categoryRowRadius),
        gap: pxToRem(sidebar.categoryRowGap),
        padding: `${pxToRem(sidebar.categoryRowPaddingY)} ${pxToRem(sidebar.categoryRowPaddingX)}`,
        transitionDuration: `${DISCOVER_METRICS.transitions.base}ms`,
      }}
      tabIndex={selected ? 0 : -1}
    >
      <span
        aria-hidden="true"
        className={cn("grid shrink-0 place-items-center", DISPLAY_FONT)}
        style={{
          background: selected ? `hsl(var(${toneVariable})/0.14)` : "hsl(var(--surface-soft))",
          borderRadius: pxToRem(sidebar.categoryTileRadius),
          color: selected ? `hsl(var(${toneVariable}))` : "hsl(var(--text-muted))",
          fontSize: pxToRem(sidebar.categoryTileFontSize),
          fontWeight: sidebar.categoryTileWeight,
          height: pxToRem(sidebar.categoryTileSize),
          lineHeight: 1,
          width: pxToRem(sidebar.categoryTileSize),
        }}
      >
        {initials}
      </span>
      <span
        className="min-w-0 flex-1 truncate"
        style={{
          color: selected ? "hsl(var(--foreground))" : "hsl(var(--text-secondary))",
          fontSize: pxToRem(sidebar.categoryLabelFontSize),
          fontWeight: selected
            ? sidebar.categoryLabelWeightSelected
            : sidebar.categoryLabelWeightIdle,
          lineHeight: sidebar.categoryLabelLineHeight,
        }}
      >
        {label}
      </span>
      {count === null ? null : (
        <span
          aria-hidden="true"
          className={cn("grid shrink-0 place-items-center", DISPLAY_FONT)}
          data-testid="discover-category-pill"
          style={{
            background: selected ? `hsl(var(${toneVariable}))` : "hsl(var(--surface-soft))",
            borderRadius: pxToRem(sidebar.categoryPillRadius),
            color: selected ? "white" : "hsl(var(--text-muted))",
            fontSize: pxToRem(sidebar.categoryPillFontSize),
            fontWeight: sidebar.categoryPillWeight,
            height: pxToRem(sidebar.categoryPillHeight),
            lineHeight: 1,
            minWidth: pxToRem(sidebar.categoryPillMinWidth),
            padding: `0 ${pxToRem(sidebar.categoryPillPaddingX)}`,
          }}
        >
          {count}
        </span>
      )}
    </Link>
  );
}

export type DiscoverSidebarSortRowProps = {
  href: string;
  label: string;
  selected: boolean;
  tone: DiscoverTone;
};

export function DiscoverSidebarSortRow({
  href,
  label,
  selected,
  tone,
}: DiscoverSidebarSortRowProps) {
  return (
    <Link
      aria-label={label}
      aria-selected={selected}
      className={cn(
        "flex items-center transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]",
        selected ? "bg-[hsl(var(--surface-soft))]" : "hover:bg-[hsl(var(--surface-soft)/0.75)]",
      )}
      data-testid="discover-sort-row"
      href={href}
      onKeyDown={handleListboxKeyDown}
      prefetch={false}
      role="option"
      scroll={false}
      style={{
        borderRadius: pxToRem(sidebar.sortRowRadius),
        gap: pxToRem(sidebar.sortRowGap),
        padding: `${pxToRem(sidebar.sortRowPaddingY)} ${pxToRem(sidebar.sortRowPaddingX)}`,
        transitionDuration: `${DISCOVER_METRICS.transitions.base}ms`,
      }}
      tabIndex={selected ? 0 : -1}
    >
      <span
        aria-hidden="true"
        className="shrink-0 rounded-full"
        style={{
          background: `hsl(var(--${tone}))`,
          height: pxToRem(sidebar.sortDotSize),
          margin: `0 ${pxToRem(sidebar.sortDotMarginX)}`,
          width: pxToRem(sidebar.sortDotSize),
        }}
      />
      <span
        className="min-w-0 flex-1 truncate"
        style={{
          color: selected ? "hsl(var(--foreground))" : "hsl(var(--text-secondary))",
          fontSize: pxToRem(sidebar.sortLabelFontSize),
          fontWeight: selected ? sidebar.sortLabelWeightSelected : sidebar.sortLabelWeightIdle,
          lineHeight: sidebar.sortLabelLineHeight,
        }}
      >
        {label}
      </span>
    </Link>
  );
}
