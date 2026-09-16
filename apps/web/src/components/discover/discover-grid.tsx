"use client";

import React, { memo, type CSSProperties, type ReactNode } from "react";
import type { DiscoverLane } from "@wizards/types";

import { ScreenInfiniteSentinel } from "@/components/screens/screen-infinite-sentinel";
import { useI18n } from "@/components/providers/locale-provider";
import { DISCOVER_METRICS, pxToRem } from "@/lib/discover/metrics";

export type DiscoverCardSize = "large" | "medium";

export type DiscoverGridProps = {
  readonly cardSize: DiscoverCardSize;
  readonly children: ReactNode;
  readonly hasMore?: boolean;
  readonly lane: DiscoverLane;
  readonly loadingMore?: boolean;
  readonly onLoadMore?: () => void;
  readonly panelOpen?: boolean;
};

function DiscoverGridComponent({
  cardSize,
  children,
  hasMore = false,
  lane,
  loadingMore = false,
  onLoadMore,
}: DiscoverGridProps) {
  const { t } = useI18n();
  const metrics = DISCOVER_METRICS.serverCard;
  const cardMin = cardSize === "large" ? metrics.gridMinLarge : metrics.gridMin;
  const layoutStyle: CSSProperties & Record<"--discover-card-min", string> = {
    "--discover-card-min": pxToRem(cardMin),
    display: lane === "channels" ? "flex" : "grid",
    flexDirection: lane === "channels" ? "column" : undefined,
    gap: pxToRem(lane === "channels" ? DISCOVER_METRICS.channelRow.listGap : metrics.gridGap),
    gridTemplateColumns:
      lane === "channels"
        ? undefined
        : "repeat(auto-fill, minmax(min(100%, var(--discover-card-min)), 1fr))",
  };
  const paginated = lane !== "people" && onLoadMore !== undefined;

  return (
    <div data-testid="discover-grid">
      <div
        aria-label={t(`discover.lanes.${lane}`)}
        data-layout={lane === "channels" ? "list" : "grid"}
        data-lane={lane}
        style={layoutStyle}
      >
        {children}
      </div>
      {paginated ? (
        <ScreenInfiniteSentinel hasMore={hasMore} loading={loadingMore} onLoadMore={onLoadMore} />
      ) : null}
    </div>
  );
}

export const DiscoverGrid = memo(DiscoverGridComponent);
