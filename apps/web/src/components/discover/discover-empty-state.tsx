"use client";

import Link from "next/link";
import { Search } from "lucide-react";
import React from "react";

import { useI18n } from "@/components/providers/locale-provider";
import { DISCOVER_METRICS, hairline, pxToRem } from "@/lib/discover/metrics";
import { buildDiscoverHref, type DiscoverRouteState } from "@/lib/discover/routes";

export type DiscoverEmptyStateProps = {
  readonly onJoinServer: () => void;
  readonly route: DiscoverRouteState;
};

function resolveBodyKey(route: DiscoverRouteState): string {
  return `discover.empty.${route.lane}.${route.q.length > 0 ? "query" : "filtered"}`;
}

export function DiscoverEmptyState({ onJoinServer, route }: DiscoverEmptyStateProps) {
  const { t } = useI18n();
  const metrics = DISCOVER_METRICS.emptyState;
  const body = t(resolveBodyKey(route), { query: route.q });

  return (
    <section
      aria-live="polite"
      className="flex min-h-full flex-1 flex-col items-center justify-center text-center"
      data-testid="discover-empty-state"
      role="status"
      style={{ gap: pxToRem(metrics.gap), padding: pxToRem(metrics.padding) }}
    >
      <div
        aria-hidden="true"
        className="grid place-items-center bg-[hsl(var(--primary)/0.13)] text-[hsl(var(--primary))]"
        style={{
          border: `${hairline(metrics.iconBoxBorderWidth)} solid hsl(var(--primary)/0.3)`,
          borderRadius: pxToRem(metrics.iconBoxRadius),
          fontSize: pxToRem(metrics.iconSize),
          height: pxToRem(metrics.iconBoxSize),
          width: pxToRem(metrics.iconBoxSize),
        }}
      >
        <Search style={{ height: "1em", width: "1em" }} strokeWidth={1.8} />
      </div>

      <div style={{ maxWidth: pxToRem(metrics.textMaxWidth) }}>
        <h2
          className="text-[hsl(var(--foreground))]"
          style={{
            fontFamily: "var(--font-display)",
            fontSize: pxToRem(metrics.titleFontSize),
            fontWeight: metrics.titleWeight,
            letterSpacing: `${metrics.titleLetterSpacing}em`,
            lineHeight: metrics.titleLineHeight,
          }}
        >
          {t("discover.empty.title")}
        </h2>
        <p
          className="text-[hsl(var(--text-muted))]"
          style={{
            fontSize: pxToRem(metrics.bodyFontSize),
            lineHeight: metrics.bodyLineHeight,
            marginTop: pxToRem(metrics.bodyMarginTop),
            textWrap: "pretty",
          }}
        >
          {body}
        </p>
      </div>

      <div
        className="flex flex-wrap items-center justify-center"
        style={{ gap: pxToRem(metrics.buttonRowGap) }}
      >
        <Link
          className="grid place-items-center bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
          href="/discover"
          style={{
            borderRadius: pxToRem(metrics.buttonRadius),
            boxShadow: `${pxToRem(metrics.primaryButtonShadow.x)} ${pxToRem(metrics.primaryButtonShadow.y)} ${pxToRem(metrics.primaryButtonShadow.blur)} ${pxToRem(metrics.primaryButtonShadow.spread)} hsl(var(--primary))`,
            fontSize: pxToRem(metrics.buttonFontSize),
            fontWeight: metrics.buttonWeight,
            height: pxToRem(metrics.buttonHeight),
            paddingInline: pxToRem(metrics.buttonPaddingX),
          }}
        >
          {t("discover.empty.clearFilters")}
        </Link>
        <Link
          className="grid place-items-center bg-[hsl(var(--surface-card))] text-[hsl(var(--text-secondary))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
          href={buildDiscoverHref({ modal: "join" }, route)}
          onClick={onJoinServer}
          prefetch={false}
          scroll={false}
          style={{
            border: `${hairline()} solid hsl(var(--border))`,
            borderRadius: pxToRem(metrics.buttonRadius),
            fontSize: pxToRem(metrics.buttonFontSize),
            fontWeight: metrics.buttonWeight,
            height: pxToRem(metrics.buttonHeight),
            paddingInline: pxToRem(metrics.buttonPaddingX),
          }}
        >
          {t("discover.empty.enterCode")}
        </Link>
      </div>
    </section>
  );
}
