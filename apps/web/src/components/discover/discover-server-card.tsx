"use client";

import React, { memo, type CSSProperties } from "react";
import { formatServerProfileCount, type DiscoverServer } from "@wizards/types";

import {
  DiscoverCategoryTile,
  getDiscoverCategoryTone,
} from "@/components/discover/discover-category-tile";
import { useI18n } from "@/components/providers/locale-provider";
import { DISCOVER_METRICS, hairline, pxToRem } from "@/lib/discover/metrics";

export type DiscoverServerCardProps = {
  readonly onOpen: (server: DiscoverServer) => void;
  readonly onPreview: (server: DiscoverServer) => void;
  readonly onToggleJoin: (server: DiscoverServer) => void;
  readonly selected?: boolean;
  readonly server: DiscoverServer;
};

type BorderState = "default" | "joined" | "selected";

function resolveBorder(
  server: DiscoverServer,
  selected: boolean,
): {
  color: string;
  state: BorderState;
} {
  if (selected) {
    return { color: "hsl(var(--primary)/0.5)", state: "selected" };
  }

  if (server.joined) {
    return { color: "hsl(var(--success)/0.4)", state: "joined" };
  }

  return { color: "hsl(var(--border)/0.6)", state: "default" };
}

function DiscoverServerCardComponent({
  onOpen,
  onPreview,
  onToggleJoin,
  selected = false,
  server,
}: DiscoverServerCardProps) {
  const { locale, t } = useI18n();
  const metrics = DISCOVER_METRICS.serverCard;
  const tone = getDiscoverCategoryTone(server.category);
  const border = resolveBorder(server, selected);
  const titleId = `discover-server-card-title-${server.id}`;
  const memberCount = formatServerProfileCount(server.memberCount, locale);
  const onlineCount = formatServerProfileCount(server.onlineCount, locale);
  const articleStyle: CSSProperties = {
    background: server.joined ? "hsl(var(--surface-card))" : "hsl(var(--surface-card)/0.6)",
    border: `${hairline(metrics.borderWidth)} solid ${border.color}`,
    borderRadius: pxToRem(metrics.radius),
    contentVisibility: "auto",
    fontFamily: "var(--font-sans)",
    transition: `border-color ${DISCOVER_METRICS.transitions.hover}ms, transform ${DISCOVER_METRICS.transitions.hover}ms`,
  };

  return (
    <article
      aria-labelledby={titleId}
      className="group relative flex cursor-pointer flex-col overflow-hidden hover:-translate-y-0.5 hover:border-[hsl(var(--primary)/0.45)] motion-reduce:hover:translate-y-0"
      data-border-state={border.state}
      data-category={server.category}
      data-testid="discover-server-card"
      style={articleStyle}
    >
      <div
        aria-hidden="true"
        style={{
          background: `linear-gradient(120deg, hsl(var(--${tone})/0.3) 0%, hsl(var(--${tone})/0.1) 100%)`,
          height: pxToRem(metrics.bandHeight),
        }}
      />

      <div
        className="flex items-end"
        style={{
          gap: pxToRem(metrics.tileRowGap),
          marginTop: pxToRem(metrics.tileMarginTop),
          paddingInline: pxToRem(metrics.tileRowPaddingX),
        }}
      >
        <DiscoverCategoryTile
          category={server.category}
          fontSize={metrics.tileFontSize}
          iconColor={server.iconColor}
          iconUrl={server.iconUrl}
          initials={server.initials}
          radius={metrics.tileRadius}
          ringToken="surface-card"
          ringWidth={metrics.tileRingWidth}
          size={metrics.tileSize}
        />
        <div
          className="flex min-w-0 flex-1 items-center"
          style={{
            gap: pxToRem(metrics.nameGap),
            paddingBottom: pxToRem(metrics.namePaddingBottom),
          }}
        >
          <button
            className="min-w-0 flex-1 truncate text-left after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-[hsl(var(--ring))] focus-visible:after:ring-offset-2 focus-visible:after:ring-offset-[hsl(var(--surface-card))]"
            data-testid="discover-server-card-open"
            id={titleId}
            onClick={() => onOpen(server)}
            style={{
              color: "hsl(var(--foreground))",
              fontFamily: "var(--font-display)",
              fontSize: pxToRem(metrics.nameFontSize),
              fontWeight: metrics.nameWeight,
              letterSpacing: `${metrics.nameLetterSpacing}em`,
              lineHeight: metrics.nameLineHeight,
            }}
            type="button"
          >
            {server.name}
          </button>
        </div>
      </div>

      <div
        style={{
          paddingInline: pxToRem(metrics.bodyPaddingX),
          paddingTop: pxToRem(metrics.bodyPaddingTop),
        }}
      >
        <div
          className="flex items-center text-[hsl(var(--text-muted))]"
          style={{
            fontSize: pxToRem(metrics.metaFontSize),
            fontWeight: metrics.metaWeight,
            gap: pxToRem(metrics.metaGap),
            lineHeight: 1,
          }}
        >
          <span
            className="flex items-center text-[var(--success-readable)]"
            style={{ gap: pxToRem(metrics.metaOnlineGap) }}
          >
            <span
              aria-hidden="true"
              className="rounded-full bg-[hsl(var(--success))]"
              style={{ height: pxToRem(metrics.metaDotSize), width: pxToRem(metrics.metaDotSize) }}
            />
            {t("discover.card.online", { count: onlineCount })}
          </span>
          <span
            aria-hidden="true"
            className="rounded-full bg-[hsl(var(--border))]"
            style={{
              height: pxToRem(metrics.metaSeparatorSize),
              width: pxToRem(metrics.metaSeparatorSize),
            }}
          />
          <span>{t("discover.card.members", { count: memberCount })}</span>
        </div>

        <p
          className="m-0 text-pretty text-[hsl(var(--text-secondary))]"
          style={{
            fontSize: pxToRem(metrics.descFontSize),
            lineHeight: metrics.descLineHeight,
            marginTop: pxToRem(metrics.descMarginTop),
          }}
        >
          {server.description}
        </p>

        {server.tags.length > 0 ? (
          <div
            className="flex flex-wrap"
            data-testid="discover-server-card-tags"
            style={{ gap: pxToRem(metrics.tagRowGap), marginTop: pxToRem(metrics.tagRowMarginTop) }}
          >
            {server.tags.map((tag) => (
              <span
                className="whitespace-nowrap bg-[hsl(var(--surface-soft))] text-[hsl(var(--text-muted))]"
                key={tag}
                style={{
                  borderRadius: pxToRem(metrics.tagRadius),
                  fontSize: pxToRem(metrics.tagFontSize),
                  fontWeight: metrics.tagWeight,
                  lineHeight: 1,
                  padding: `${pxToRem(metrics.tagPaddingY)} ${pxToRem(metrics.tagPaddingX)}`,
                }}
              >
                {tag}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      <div
        className="relative z-10 mt-auto flex items-center bg-[hsl(var(--surface-soft)/0.35)]"
        style={{
          borderTop: `${hairline(metrics.actionRowBorderWidth)} solid hsl(var(--border)/0.5)`,
          gap: pxToRem(metrics.actionRowGap),
          marginTop: pxToRem(metrics.actionRowMarginTop),
          padding: `${pxToRem(metrics.actionRowPaddingTop)} ${pxToRem(metrics.actionRowPaddingX)} ${pxToRem(metrics.actionRowPaddingBottom)}`,
        }}
      >
        <button
          aria-pressed={server.joined}
          className="flex flex-1 items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
          onClick={() => onToggleJoin(server)}
          style={{
            background: server.joined ? "hsl(var(--success)/0.16)" : "hsl(var(--primary))",
            border: `${hairline(metrics.joinButtonBorderWidth)} solid ${
              server.joined ? "hsl(var(--success)/0.45)" : "hsl(var(--primary))"
            }`,
            borderRadius: pxToRem(metrics.joinButtonRadius),
            color: server.joined
              ? "hsl(var(--success-readable))"
              : "hsl(var(--primary-foreground))",
            fontSize: pxToRem(metrics.joinButtonFontSize),
            fontWeight: metrics.joinButtonWeight,
            height: pxToRem(metrics.joinButtonHeight),
            lineHeight: 1,
          }}
          type="button"
        >
          {t(server.joined ? "discover.card.joined" : "discover.card.join")}
        </button>
        <button
          className="shrink-0 border-[hsl(var(--border)/0.7)] bg-transparent text-[hsl(var(--text-secondary))] hover:bg-[var(--surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
          onClick={() => onPreview(server)}
          style={{
            borderRadius: pxToRem(metrics.previewButtonRadius),
            borderStyle: "solid",
            borderWidth: hairline(),
            fontSize: pxToRem(metrics.previewButtonFontSize),
            fontWeight: metrics.previewButtonWeight,
            height: pxToRem(metrics.previewButtonHeight),
            lineHeight: 1,
            paddingInline: pxToRem(metrics.previewButtonPaddingX),
          }}
          type="button"
        >
          {t("discover.card.preview")}
        </button>
      </div>

      {selected ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-0 bg-[hsl(var(--primary))]"
          data-testid="discover-server-card-selected-stripe"
          style={{
            borderRadius: `0 ${pxToRem(metrics.selectedStripeRadiusEnd)} ${pxToRem(
              metrics.selectedStripeRadiusEnd,
            )} 0`,
            bottom: pxToRem(metrics.selectedStripeInset),
            top: pxToRem(metrics.selectedStripeInset),
            width: pxToRem(metrics.selectedStripeWidth),
          }}
        />
      ) : null}
    </article>
  );
}

export const DiscoverServerCard = memo(DiscoverServerCardComponent);
