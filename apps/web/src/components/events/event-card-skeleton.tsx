"use client";

import React from "react";
import type { EventCardSize } from "@wizards/types";

import { EVENT_CARD_MIN_HEIGHT } from "@/components/events/event-card";
import { Skeleton } from "@/components/ui/skeleton";
import { EVENTS_METRICS, pxToRem } from "@/lib/events/metrics";

/**
 * Izgara iskeleti — SPEC §3.5.
 *
 * Yükseklik **gerçek karttan** okunur (`EVENT_CARD_MIN_HEIGHT`, ölçülerin toplamı). Elle
 * yazılmış bir yükseklik bir gün karttan ayrışır ve içerik geldiğinde ızgara sıçrardı; kart
 * ölçüsü değiştiğinde bu dosyanın değişmemesi de aynı sözleşmenin parçası.
 *
 * `minmax` ve `gap` ızgarayla aynı; `--e-min` burada da yazılır çünkü iskelet `EventGrid`in
 * **yerine** çizilir, içinde değil.
 */

const { grid } = EVENTS_METRICS;

export type EventCardSkeletonProps = {
  readonly cardSize?: EventCardSize;
  readonly count?: number;
};

export function EventCardSkeleton({ cardSize = "medium", count = 3 }: EventCardSkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className="grid"
      data-testid="event-card-skeleton"
      style={{
        gap: pxToRem(grid.gap),
        gridTemplateColumns: "repeat(auto-fill,minmax(var(--e-min),1fr))",
        padding: `${pxToRem(grid.scrollPaddingTop)} ${pxToRem(grid.scrollPaddingX)} ${pxToRem(
          grid.scrollPaddingBottom,
        )}`,
        ["--e-min" as string]: pxToRem(
          cardSize === "large" ? grid.minColumnWidthLarge : grid.minColumnWidth,
        ),
      }}
    >
      {Array.from({ length: count }, (_unused, index) => (
        <div
          data-testid="event-card-skeleton-item"
          key={index}
          style={{ minHeight: pxToRem(EVENT_CARD_MIN_HEIGHT) }}
        >
          <Skeleton
            className="h-full w-full"
            style={{ borderRadius: pxToRem(EVENTS_METRICS.card.radius) }}
          />
        </div>
      ))}
    </div>
  );
}
