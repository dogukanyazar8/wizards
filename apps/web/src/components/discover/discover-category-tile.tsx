"use client";

import React, { memo, type CSSProperties } from "react";
import type { DiscoverServerCategoryKey } from "@wizards/types";

import { DISCOVER_CATEGORIES, type DiscoverTone } from "@/lib/discover/contracts";
import { pxToRem } from "@/lib/discover/metrics";
import { cn } from "@/lib/utils";

export function getDiscoverCategoryTone(category: DiscoverServerCategoryKey | null): DiscoverTone {
  if (category === null) {
    return "primary";
  }

  return DISCOVER_CATEGORIES.find((entry) => entry.key === category)?.tone ?? "primary";
}

export function getDiscoverCategoryInitials(category: DiscoverServerCategoryKey | null): string {
  if (category === null) {
    return DISCOVER_CATEGORIES[0].initials;
  }

  return DISCOVER_CATEGORIES.find((entry) => entry.key === category)?.initials ?? "??";
}

export type DiscoverCategoryTileProps = {
  readonly category: DiscoverServerCategoryKey | null;
  readonly className?: string;
  readonly fontSize: number;
  readonly initials: string;
  readonly radius: number;
  readonly ringToken?: "surface-card";
  readonly ringWidth?: number;
  readonly size: number;
  readonly style?: CSSProperties;
};

function DiscoverCategoryTileComponent({
  category,
  className,
  fontSize,
  initials,
  radius,
  ringToken,
  ringWidth = 0,
  size,
  style,
}: DiscoverCategoryTileProps) {
  const tone = getDiscoverCategoryTone(category);
  const ring =
    ringToken && ringWidth > 0 ? `0 0 0 ${pxToRem(ringWidth)} hsl(var(--${ringToken}))` : undefined;

  return (
    <span
      aria-hidden="true"
      className={cn("grid shrink-0 place-items-center", className)}
      data-tone={tone}
      style={{
        background: `hsl(var(--${tone})/0.14)`,
        borderRadius: pxToRem(radius),
        boxShadow: ring,
        color: `color-mix(in srgb, hsl(var(--${tone})) 45%, hsl(var(--foreground)))`,
        fontFamily: "var(--font-display)",
        fontSize: pxToRem(fontSize),
        fontWeight: 600,
        height: pxToRem(size),
        lineHeight: 1,
        width: pxToRem(size),
        ...style,
      }}
    >
      {initials}
    </span>
  );
}

export const DiscoverCategoryTile = memo(DiscoverCategoryTileComponent);
