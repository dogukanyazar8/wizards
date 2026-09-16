"use client";

import React, { memo, type CSSProperties } from "react";
import { formatServerProfileCount, type DiscoverServer } from "@wizards/types";

import { Avatar } from "@/components/ui/avatar";
import { getDiscoverCategoryTone } from "@/components/discover/discover-category-tile";
import { useI18n } from "@/components/providers/locale-provider";
import { DISCOVER_METRICS, hairline, pxToRem } from "@/lib/discover/metrics";
import { resolveServerIconPresentation } from "@/lib/servers/server-icon-presentation";
import { getServerIconToneColor } from "@/lib/servers/server-icon-tone";

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
  const presentation = resolveServerIconPresentation({
    name: server.name,
    shortName: server.initials,
    iconColor: server.iconColor,
    iconUrl: server.iconUrl,
  });
  const tone = server.iconColor ?? getDiscoverCategoryTone(server.category);
  const border = resolveBorder(server, selected);
  const titleId = `discover-server-card-title-${server.id}`;
  const memberCount = formatServerProfileCount(server.memberCount, locale);
  const onlineCount = formatServerProfileCount(server.onlineCount, locale);
  const articleStyle: CSSProperties & { "--card-border": string } = {
    "--card-border": border.color,
    background: "hsl(var(--surface-card))",
    borderWidth: hairline(metrics.borderWidth),
    borderStyle: "solid",
    borderRadius: pxToRem(metrics.radius),
    contentVisibility: "auto",
    fontFamily: "var(--font-sans)",
    transitionDuration: `${DISCOVER_METRICS.transitions.hover}ms`,
  };

  return (
    <article
      aria-labelledby={titleId}
      // globals.css has an unlayered universal border color; keep state/hover colors local.
      className="group relative flex min-w-0 cursor-pointer flex-col overflow-hidden border-[var(--card-border)]! shadow-sm shadow-[hsl(var(--shadow-color)/0.12)] transition-[border-color,transform,box-shadow] hover:-translate-y-0.5 hover:border-[hsl(var(--primary)/0.45)]! hover:shadow-md motion-reduce:transition-none motion-reduce:hover:translate-y-0"
      data-border-state={border.state}
      data-category={server.category}
      data-testid="discover-server-card"
      style={articleStyle}
    >
      <div
        aria-hidden="true"
        style={{
          background: getServerIconToneColor(tone),
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
        <span
          aria-hidden="true"
          className="shrink-0"
          data-testid="discover-server-card-icon"
          style={{
            // An opaque backing prevents the banner edge from showing through the tint.
            background: "hsl(var(--surface-card))",
            borderRadius: pxToRem(metrics.tileRadius),
          }}
        >
          {presentation.kind === "image" ? (
            <Avatar
              alt=""
              fallback=""
              className="bg-[hsl(var(--surface-soft)/0.7)]"
              src={presentation.imageUrl}
              style={{
                borderRadius: pxToRem(metrics.tileRadius),
                height: pxToRem(metrics.tileSize),
                width: pxToRem(metrics.tileSize),
              }}
            />
          ) : (
            <span
              className="grid place-items-center uppercase"
              data-tone={tone}
              style={{
                background: getServerIconToneColor(tone, 0.14),
                borderRadius: pxToRem(metrics.tileRadius),
                color: `color-mix(in srgb, ${getServerIconToneColor(tone)} 45%, hsl(var(--foreground)))`,
                fontFamily: "var(--font-display), sans-serif",
                fontSize: pxToRem(metrics.tileFontSize),
                fontWeight: 600,
                height: pxToRem(metrics.tileSize),
                lineHeight: 1,
                width: pxToRem(metrics.tileSize),
              }}
            >
              {presentation.label}
            </span>
          )}
        </span>
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
            title={server.name}
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
        className="flex flex-1 flex-col"
        style={{
          paddingInline: pxToRem(metrics.bodyPaddingX),
          paddingTop: pxToRem(metrics.bodyPaddingTop),
          paddingBottom: pxToRem(metrics.actionRowMarginTop),
        }}
      >
        <div
          className="flex flex-wrap items-center text-[hsl(var(--text-muted))]"
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

        {server.description.trim() ? (
          <p
            className="m-0 line-clamp-3 break-words text-pretty text-[hsl(var(--text-secondary))]"
            style={{
              fontSize: pxToRem(metrics.descFontSize),
              lineHeight: metrics.descLineHeight,
              marginTop: pxToRem(metrics.descMarginTop),
            }}
          >
            {server.description}
          </p>
        ) : null}

        {server.tags.length > 0 ? (
          <div
            className="flex flex-wrap"
            data-testid="discover-server-card-tags"
            style={{ gap: pxToRem(metrics.tagRowGap), marginTop: pxToRem(metrics.tagRowMarginTop) }}
          >
            {server.tags.map((tag) => (
              <span
                className="max-w-full truncate bg-[hsl(var(--surface-soft))] text-[hsl(var(--text-muted))]"
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
          padding: `${pxToRem(metrics.actionRowPaddingTop)} ${pxToRem(metrics.actionRowPaddingX)} ${pxToRem(metrics.actionRowPaddingBottom)}`,
        }}
      >
        <button
          aria-pressed={server.joined}
          className="flex flex-1 items-center justify-center transition-colors hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
          onClick={() => onToggleJoin(server)}
          style={{
            background: server.joined ? "hsl(var(--success)/0.16)" : "hsl(var(--primary))",
            border: `${hairline(metrics.joinButtonBorderWidth)} solid ${
              server.joined ? "hsl(var(--success)/0.45)" : "hsl(var(--primary))"
            }`,
            borderRadius: pxToRem(metrics.joinButtonRadius),
            color: server.joined ? "var(--success-readable)" : "hsl(var(--primary-foreground))",
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
