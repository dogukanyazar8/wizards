"use client";

import React, { type CSSProperties } from "react";
import Link from "next/link";
import { LayoutGrid, Plus } from "lucide-react";
import type { DiscoverLane } from "@wizards/types";

import { useI18n } from "@/components/providers/locale-provider";
import { DISCOVER_LANES } from "@/lib/discover/contracts";
import { DISCOVER_METRICS, hairline, pxToEm, pxToRem } from "@/lib/discover/metrics";
import { buildDiscoverHref, type DiscoverRouteState } from "@/lib/discover/routes";

export type DiscoverCardSize = "medium" | "large";
export type DiscoverLaneCounts = Partial<Record<DiscoverLane, number | null>>;
export type DiscoverFeedHeaderVisibility = {
  readonly iconGroup: boolean;
  readonly laneGroup: boolean;
};
type Translate = (key: string, values?: Record<string, number | string>) => string;

export type DiscoverFeedHeaderProps = {
  readonly cardSize: DiscoverCardSize;
  readonly failedAt: Date | null;
  readonly isEmpty: boolean;
  readonly isError: boolean;
  readonly laneCounts: DiscoverLaneCounts;
  readonly onJoinServer?: () => void;
  readonly onToggleCardSize: () => void;
  readonly resultCount: number | null;
  readonly route: DiscoverRouteState;
  readonly visibility: DiscoverFeedHeaderVisibility;
};

function laneMessageKey(lane: Exclude<DiscoverLane, "servers">): string {
  switch (lane) {
    case "people":
      return "discover.lanes.people";
    case "channels":
      return "discover.lanes.channels";
    case "events":
      return "discover.lanes.events";
  }
}

function categoryMessageKey(category: DiscoverRouteState["category"]): string {
  return `discover.category.${category}`;
}

export function resolveDiscoverFeedTitle(route: DiscoverRouteState, t: Translate): string {
  if (route.q.length > 0) {
    return t("discover.header.searchResults");
  }

  if (route.lane !== "servers") {
    return t(laneMessageKey(route.lane));
  }

  if (route.category !== "all") {
    return t(categoryMessageKey(route.category));
  }

  return t("discover.header.title");
}

export function resolveDiscoverFeedSubtitle(input: {
  readonly failedAt: Date | null;
  readonly isEmpty: boolean;
  readonly isError: boolean;
  readonly locale?: string;
  readonly resultCount: number | null;
  readonly route: DiscoverRouteState;
  readonly t: Translate;
}): string {
  if (input.isError) {
    const failedAt = input.failedAt ?? new Date();
    const time = new Intl.DateTimeFormat(input.locale, {
      hour: "2-digit",
      hourCycle: "h23",
      minute: "2-digit",
    }).format(failedAt);
    return input.t("discover.header.sub.error", { time });
  }

  if (input.isEmpty) {
    return input.t("discover.header.sub.empty");
  }

  const sort = input.t(`discover.header.sortWord.${input.route.sort}`);
  return input.resultCount === null
    ? input.t("discover.header.sub.pending", { sort })
    : input.t("discover.header.sub", { count: input.resultCount, sort });
}

function laneLabel(lane: DiscoverLane, t: Translate): string {
  return t(`discover.lanes.${lane}`);
}

const ellipsis: CSSProperties = {
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

export function DiscoverFeedHeader({
  cardSize,
  failedAt,
  isEmpty,
  isError,
  laneCounts,
  onJoinServer,
  onToggleCardSize,
  resultCount,
  route,
  visibility,
}: DiscoverFeedHeaderProps) {
  const { locale, t } = useI18n();
  const metrics = DISCOVER_METRICS.feedHeader;
  const title = resolveDiscoverFeedTitle(route, t);
  const subtitle = resolveDiscoverFeedSubtitle({
    failedAt,
    isEmpty,
    isError,
    locale,
    resultCount,
    route,
    t,
  });

  return (
    <header
      className="flex flex-nowrap items-center bg-[hsl(var(--surface-base))]"
      data-testid="discover-feed-header"
      style={{
        borderBottom: `${hairline(metrics.borderWidth)} solid hsl(var(--border)/0.45)`,
        gap: pxToRem(metrics.gap),
        padding: `${pxToRem(metrics.paddingY)} ${pxToRem(metrics.paddingX)}`,
      }}
    >
      <div style={{ flex: `1 1 ${pxToRem(metrics.titleBlockFlexBasis)}`, minWidth: 0 }}>
        <h1
          style={{
            ...ellipsis,
            color: "hsl(var(--foreground))",
            fontFamily: "var(--font-display)",
            fontSize: pxToRem(metrics.titleFontSize),
            fontWeight: metrics.titleWeight,
            letterSpacing: `${metrics.titleLetterSpacing}em`,
            lineHeight: metrics.titleLineHeight,
          }}
        >
          {title}
        </h1>
        <p
          style={{
            ...ellipsis,
            color: "hsl(var(--text-muted))",
            fontFamily: "var(--font-sans)",
            fontSize: pxToRem(metrics.subFontSize),
            fontWeight: metrics.subWeight,
            lineHeight: metrics.subLineHeight,
            marginTop: pxToRem(metrics.subMarginTop),
          }}
        >
          {subtitle}
        </p>
      </div>

      {visibility.laneGroup ? (
        <nav
          aria-label={t("discover.title")}
          className="flex flex-none bg-[hsl(var(--surface-secondary))]"
          data-testid="discover-lane-group"
          role="tablist"
          style={{
            border: `${hairline(metrics.laneGroupBorderWidth)} solid hsl(var(--border)/0.55)`,
            borderRadius: pxToRem(metrics.laneGroupRadius),
            gap: pxToRem(metrics.laneGroupGap),
            padding: pxToRem(metrics.laneGroupPadding),
          }}
        >
          {DISCOVER_LANES.map((lane) => {
            const selected = lane === route.lane;
            const count = laneCounts[lane];
            const label = laneLabel(lane, t);
            return (
              <Link
                aria-controls="discover-lane-panel"
                aria-label={count === null || count === undefined ? label : `${label}: ${count}`}
                aria-selected={selected}
                href={buildDiscoverHref({ lane }, route)}
                id={`discover-lane-tab-${lane}`}
                key={lane}
                role="tab"
                className="flex items-center whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
                style={{
                  background: selected ? "hsl(var(--primary))" : "transparent",
                  borderRadius: pxToRem(metrics.laneTabRadius),
                  color: selected ? "hsl(var(--primary-foreground))" : "hsl(var(--text-secondary))",
                  fontFamily: "var(--font-sans)",
                  fontSize: pxToRem(metrics.laneTabFontSize),
                  fontWeight: metrics.laneTabWeight,
                  gap: pxToRem(metrics.laneTabGap),
                  height: pxToRem(metrics.laneTabHeight),
                  lineHeight: 1,
                  paddingInline: pxToRem(metrics.laneTabPaddingX),
                }}
              >
                {label}
                {count !== null && count !== undefined ? (
                  <span
                    aria-hidden
                    data-testid={`discover-lane-count-${lane}`}
                    style={{
                      alignItems: "center",
                      background: selected
                        ? "color-mix(in srgb, hsl(var(--primary)) 68%, hsl(var(--shadow-color)))"
                        : "hsl(var(--surface-soft))",
                      borderRadius: pxToRem(metrics.laneCountRadius),
                      color: selected ? "hsl(var(--primary-foreground))" : "hsl(var(--text-muted))",
                      display: "inline-flex",
                      fontFamily: "var(--font-display)",
                      fontSize: pxToRem(metrics.laneCountFontSize),
                      fontWeight: metrics.laneCountWeight,
                      height: pxToRem(metrics.laneCountHeight),
                      justifyContent: "center",
                      lineHeight: 1,
                      minWidth: pxToRem(metrics.laneCountMinWidth),
                      paddingInline: pxToRem(metrics.laneCountPaddingX),
                    }}
                  >
                    {count}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>
      ) : null}

      {visibility.iconGroup ? (
        <div
          className="flex flex-none items-center text-[hsl(var(--text-muted))]"
          data-testid="discover-icon-group"
          style={{ gap: pxToRem(metrics.iconGroupGap) }}
        >
          <Link
            aria-label={t("discover.header.joinServer")}
            href={buildDiscoverHref({ modal: "join" }, route)}
            {...(onJoinServer ? { onClick: onJoinServer } : {})}
            className="relative grid place-items-center transition-[filter] before:absolute before:-inset-1.5 before:content-[''] hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
            style={{
              background: "hsl(var(--primary))",
              borderRadius: pxToRem(metrics.iconButtonRadius),
              boxShadow: `${pxToRem(metrics.joinButtonShadow.x)} ${pxToRem(metrics.joinButtonShadow.y)} ${pxToRem(metrics.joinButtonShadow.blur)} ${pxToRem(metrics.joinButtonShadow.spread)} hsl(var(--primary))`,
              color: "hsl(var(--primary-foreground))",
              height: pxToRem(metrics.iconButtonSize),
              width: pxToRem(metrics.iconButtonSize),
            }}
          >
            <Plus aria-hidden size={pxToEm(metrics.joinIconSize)} strokeWidth={2.3} />
          </Link>
          <button
            aria-label={t("discover.header.cardSize")}
            aria-pressed={cardSize === "large"}
            className="relative grid place-items-center border-0 bg-transparent transition-colors before:absolute before:-inset-1.5 before:content-[''] hover:bg-[hsl(var(--surface-soft))] hover:text-[hsl(var(--foreground))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
            onClick={onToggleCardSize}
            style={{
              borderRadius: pxToRem(metrics.iconButtonRadius),
              height: pxToRem(metrics.iconButtonSize),
              width: pxToRem(metrics.iconButtonSize),
            }}
            type="button"
          >
            <LayoutGrid aria-hidden size={pxToEm(metrics.cardSizeIconSize)} strokeWidth={1.9} />
          </button>
        </div>
      ) : null}
    </header>
  );
}
