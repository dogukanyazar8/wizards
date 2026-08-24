"use client";

import type { DiscoverLane } from "@wizards/types";

import { useI18n } from "@/components/providers/locale-provider";
import { DISCOVER_METRICS, hairline, pxToRem } from "@/lib/discover/metrics";
import type { DiscoverRouteState } from "@/lib/discover/routes";

export type DiscoverSectionHeadProps = {
  readonly count: number | null;
  readonly lane: DiscoverLane;
  readonly route: DiscoverRouteState;
};

export function DiscoverSectionHead({ count, lane, route }: DiscoverSectionHeadProps) {
  const { t } = useI18n();
  const metrics = DISCOVER_METRICS.sectionHead;
  const label = t(`discover.section.${lane}`);
  let note: string;

  if (lane === "servers") {
    note = route.q
      ? t("discover.section.servers.note.search", { q: route.q })
      : route.category !== "all"
        ? t("discover.section.servers.note.category", {
            category: t(`discover.category.${route.category}`),
          })
        : t("discover.section.servers.note.popular");
  } else {
    note = t(`discover.section.${lane}.note`);
  }

  return (
    <div
      className="flex items-center"
      data-testid="discover-section-head"
      style={{
        gap: pxToRem(metrics.gap),
        padding: `${pxToRem(metrics.paddingTop)} ${pxToRem(metrics.paddingX)} ${pxToRem(metrics.paddingBottom)}`,
      }}
    >
      <h2
        className="whitespace-nowrap uppercase text-[hsl(var(--text-muted))]"
        style={{
          fontFamily: "var(--font-display)",
          fontSize: pxToRem(metrics.labelFontSize),
          fontWeight: metrics.labelWeight,
          letterSpacing: `${metrics.labelLetterSpacing}em`,
          lineHeight: 1,
        }}
      >
        {label}
      </h2>
      {count !== null ? (
        <span
          className="text-[hsl(var(--text-muted))]"
          style={{
            fontFamily: "var(--font-display)",
            fontSize: pxToRem(metrics.countFontSize),
            fontWeight: metrics.countWeight,
            lineHeight: 1,
          }}
        >
          {count}
        </span>
      ) : null}
      <span
        className="truncate whitespace-nowrap text-[hsl(var(--text-muted))]"
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: pxToRem(metrics.noteFontSize),
          fontWeight: metrics.noteWeight,
          lineHeight: 1,
        }}
      >
        {note}
      </span>
      <span
        aria-hidden
        className="flex-1 bg-[hsl(var(--border)/0.5)]"
        style={{ height: hairline(metrics.hairlineHeight) }}
      />
    </div>
  );
}
