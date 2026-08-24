"use client";

import React, { memo, type CSSProperties, type ReactNode } from "react";
import type { DiscoverLane } from "@wizards/types";

import { useI18n } from "@/components/providers/locale-provider";
import { Skeleton } from "@/components/ui/skeleton";
import { DISCOVER_METRICS, hairline, pxToRem } from "@/lib/discover/metrics";

const SKELETON_COUNT = 6;
const LOADING_LABELS: Readonly<Record<"en" | "tr", string>> = {
  en: "Loading",
  tr: "Yükleniyor",
};

function SkeletonLine({ height, width }: { readonly height: number; readonly width: string }) {
  return <Skeleton style={{ borderRadius: pxToRem(height / 2), height: pxToRem(height), width }} />;
}

function ServerSkeleton() {
  const metrics = DISCOVER_METRICS.serverCard;

  return (
    <div
      className="overflow-hidden bg-[hsl(var(--surface-card)/0.6)]"
      style={{
        border: `${hairline(metrics.borderWidth)} solid hsl(var(--border)/0.6)`,
        borderRadius: pxToRem(metrics.radius),
      }}
    >
      <Skeleton style={{ borderRadius: 0, height: pxToRem(metrics.bandHeight) }} />
      <div
        className="flex items-end"
        style={{
          gap: pxToRem(metrics.tileRowGap),
          marginTop: pxToRem(metrics.tileMarginTop),
          paddingInline: pxToRem(metrics.tileRowPaddingX),
        }}
      >
        <Skeleton
          style={{
            borderRadius: pxToRem(metrics.tileRadius),
            height: pxToRem(metrics.tileSize),
            width: pxToRem(metrics.tileSize),
          }}
        />
        <SkeletonLine height={metrics.nameFontSize} width="58%" />
      </div>
      <div
        className="flex flex-col"
        style={{
          gap: pxToRem(metrics.descMarginTop),
          padding: `${pxToRem(metrics.bodyPaddingTop)} ${pxToRem(metrics.bodyPaddingX)} ${pxToRem(
            metrics.actionRowPaddingBottom,
          )}`,
        }}
      >
        <SkeletonLine height={metrics.metaFontSize} width="44%" />
        <SkeletonLine height={metrics.descFontSize} width="92%" />
        <SkeletonLine height={metrics.descFontSize} width="68%" />
      </div>
    </div>
  );
}

function PersonSkeleton() {
  const metrics = DISCOVER_METRICS.personCard;

  return (
    <div
      className="flex bg-[hsl(var(--surface-card)/0.6)]"
      style={{
        border: `${hairline(metrics.borderWidth)} solid hsl(var(--border)/0.6)`,
        borderRadius: pxToRem(metrics.radius),
        gap: pxToRem(metrics.headGap),
        padding: `${pxToRem(metrics.paddingTop)} ${pxToRem(metrics.paddingX)} ${pxToRem(
          metrics.paddingBottom,
        )}`,
      }}
    >
      <Skeleton
        className="shrink-0 rounded-full"
        style={{ height: pxToRem(metrics.avatarSize), width: pxToRem(metrics.avatarSize) }}
      />
      <div
        className="flex min-w-0 flex-1 flex-col"
        style={{ gap: pxToRem(metrics.handleMarginTop) }}
      >
        <SkeletonLine height={metrics.nameFontSize} width="62%" />
        <SkeletonLine height={metrics.handleFontSize} width="42%" />
      </div>
    </div>
  );
}

function ChannelSkeleton() {
  const metrics = DISCOVER_METRICS.channelRow;

  return (
    <div
      className="flex items-center bg-[hsl(var(--surface-card)/0.6)]"
      style={{
        border: `${hairline(metrics.borderWidth)} solid hsl(var(--border)/0.6)`,
        borderRadius: pxToRem(metrics.radius),
        gap: pxToRem(metrics.gap),
        padding: `${pxToRem(metrics.paddingY)} ${pxToRem(metrics.paddingX)}`,
      }}
    >
      <Skeleton
        className="shrink-0"
        style={{
          borderRadius: pxToRem(metrics.tileRadius),
          height: pxToRem(metrics.tileSize),
          width: pxToRem(metrics.tileSize),
        }}
      />
      <div
        className="flex min-w-0 flex-1 flex-col"
        style={{ gap: pxToRem(metrics.contextRowMarginTop) }}
      >
        <SkeletonLine height={metrics.nameFontSize} width="52%" />
        <SkeletonLine height={metrics.contextFontSize} width="72%" />
      </div>
      <Skeleton
        className="shrink-0"
        style={{
          borderRadius: pxToRem(metrics.previewButtonRadius),
          height: pxToRem(metrics.previewButtonHeight),
          width: pxToRem(metrics.previewButtonPaddingX * 4),
        }}
      />
    </div>
  );
}

function EventSkeleton() {
  const metrics = DISCOVER_METRICS.eventCard;

  return (
    <div
      className="flex bg-[hsl(var(--surface-card)/0.6)]"
      style={{
        border: `${hairline(metrics.borderWidth)} solid hsl(var(--border)/0.6)`,
        borderRadius: pxToRem(metrics.radius),
        gap: pxToRem(metrics.headGap),
        padding: `${pxToRem(metrics.headPaddingTop)} ${pxToRem(metrics.headPaddingX)}`,
      }}
    >
      <Skeleton
        className="shrink-0"
        style={{
          borderRadius: pxToRem(metrics.tileRadius),
          height: pxToRem(metrics.tileSize),
          width: pxToRem(metrics.tileSize),
        }}
      />
      <div className="flex min-w-0 flex-1 flex-col" style={{ gap: pxToRem(metrics.metaGap) }}>
        <SkeletonLine height={metrics.kindPillFontSize} width="28%" />
        <SkeletonLine height={metrics.titleFontSize} width="84%" />
        <SkeletonLine height={metrics.whereFontSize} width="66%" />
      </div>
    </div>
  );
}

function skeletonForLane(lane: DiscoverLane): ReactNode {
  if (lane === "people") {
    return <PersonSkeleton />;
  }

  if (lane === "channels") {
    return <ChannelSkeleton />;
  }

  if (lane === "events") {
    return <EventSkeleton />;
  }

  return <ServerSkeleton />;
}

export type DiscoverCardSkeletonProps = {
  readonly lane: DiscoverLane;
  readonly loadingLabel?: string;
};

function DiscoverCardSkeletonComponent({ lane, loadingLabel }: DiscoverCardSkeletonProps) {
  const { locale } = useI18n();
  const style: CSSProperties & Record<"--discover-card-min", string> = {
    "--discover-card-min": pxToRem(DISCOVER_METRICS.serverCard.gridMin),
    display: lane === "channels" ? "flex" : "grid",
    flexDirection: lane === "channels" ? "column" : undefined,
    gap: pxToRem(
      lane === "channels"
        ? DISCOVER_METRICS.channelRow.listGap
        : DISCOVER_METRICS.serverCard.gridGap,
    ),
    gridTemplateColumns:
      lane === "channels" ? undefined : "repeat(auto-fill, minmax(var(--discover-card-min), 1fr))",
  };
  const announcement = loadingLabel ?? LOADING_LABELS[locale];

  return (
    <div aria-busy="true" data-lane={lane} data-testid="discover-card-skeleton" style={style}>
      <span aria-live="polite" className="sr-only" role="status">
        {announcement}
      </span>
      {Array.from({ length: SKELETON_COUNT }, (_, index) => (
        <div data-testid="discover-skeleton-card" key={index}>
          {skeletonForLane(lane)}
        </div>
      ))}
    </div>
  );
}

export const DiscoverCardSkeleton = memo(DiscoverCardSkeletonComponent);
