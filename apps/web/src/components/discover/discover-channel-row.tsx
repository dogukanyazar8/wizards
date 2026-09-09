"use client";

import React, { memo, type CSSProperties } from "react";
import { Hash } from "lucide-react";
import type { DiscoverChannel, DiscoverChannelActivityLabel } from "@wizards/types";

import {
  DiscoverCategoryTile,
  getDiscoverCategoryInitials,
  getDiscoverCategoryTone,
} from "@/components/discover/discover-category-tile";
import { useI18n } from "@/components/providers/locale-provider";
import type { DiscoverTone } from "@/lib/discover/contracts";
import { DISCOVER_METRICS, hairline, pxToEm, pxToRem } from "@/lib/discover/metrics";

const ACTIVITY_TONES: Readonly<Record<DiscoverChannelActivityLabel, DiscoverTone>> = {
  busy: "primary",
  live: "danger",
  new: "warning",
  official: "primary",
  open: "success",
  weekly: "info",
};

const DAILY_MESSAGE_LABELS: Readonly<Record<"en" | "tr", string>> = {
  en: "messages/day",
  tr: "mesaj/gün",
};

export type DiscoverChannelRowProps = {
  readonly channel: DiscoverChannel;
  readonly onOpen: (channel: DiscoverChannel) => void;
  readonly onPreview: (channel: DiscoverChannel) => void;
};

function DiscoverChannelRowComponent({ channel, onOpen, onPreview }: DiscoverChannelRowProps) {
  const { locale, t } = useI18n();
  const metrics = DISCOVER_METRICS.channelRow;
  const categoryTone = getDiscoverCategoryTone(channel.serverCategory);
  const activityTone = ACTIVITY_TONES[channel.activityLabel];
  const titleId = `discover-channel-row-title-${channel.id}`;
  const contextId = `discover-channel-row-context-${channel.id}`;
  const contextDetail = `${new Intl.NumberFormat(locale).format(channel.dailyMessageCount)} ${
    DAILY_MESSAGE_LABELS[locale]
  }`;
  const articleStyle: CSSProperties = {
    background: "hsl(var(--surface-card)/0.6)",
    border: `${hairline(metrics.borderWidth)} solid hsl(var(--border)/0.6)`,
    borderRadius: pxToRem(metrics.radius),
    contentVisibility: "auto",
    fontFamily: "var(--font-sans)",
    gap: pxToRem(metrics.gap),
    padding: `${pxToRem(metrics.paddingY)} ${pxToRem(metrics.paddingX)}`,
    transition: `border-color ${DISCOVER_METRICS.transitions.hover}ms, background ${DISCOVER_METRICS.transitions.hover}ms`,
  };

  return (
    <article
      aria-describedby={contextId}
      aria-labelledby={titleId}
      className="relative flex cursor-pointer items-center hover:border-[hsl(var(--primary)/0.4)] hover:bg-[hsl(var(--surface-card))]"
      data-testid="discover-channel-row"
      style={articleStyle}
    >
      <span
        aria-hidden="true"
        className="grid shrink-0 place-items-center"
        data-tone={categoryTone}
        style={{
          background: `hsl(var(--${categoryTone})/0.14)`,
          borderRadius: pxToRem(metrics.tileRadius),
          color: `hsl(var(--${categoryTone}))`,
          height: pxToRem(metrics.tileSize),
          width: pxToRem(metrics.tileSize),
        }}
      >
        <Hash
          style={{
            height: pxToEm(metrics.tileIconSize, metrics.tileSize),
            width: pxToEm(metrics.tileIconSize, metrics.tileSize),
          }}
        />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center" style={{ gap: pxToRem(metrics.nameRowGap) }}>
          <button
            className="min-w-0 truncate text-left after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-[hsl(var(--ring))] focus-visible:after:ring-offset-2 focus-visible:after:ring-offset-[hsl(var(--surface-card))]"
            data-testid="discover-channel-row-open"
            id={titleId}
            onClick={() => onOpen(channel)}
            style={{
              color: "hsl(var(--foreground))",
              fontFamily: "var(--font-display)",
              fontSize: pxToRem(metrics.nameFontSize),
              fontWeight: metrics.nameWeight,
              lineHeight: metrics.nameLineHeight,
            }}
            type="button"
          >
            #{channel.name.replace(/^#/u, "")}
          </button>
          <span
            className="shrink-0"
            data-tone={activityTone}
            style={{
              background: `hsl(var(--${activityTone})/0.14)`,
              borderRadius: pxToRem(metrics.activityPillRadius),
              color: `hsl(var(--${activityTone}))`,
              fontSize: pxToRem(metrics.activityPillFontSize),
              fontWeight: metrics.activityPillWeight,
              lineHeight: 1,
              padding: `${pxToRem(metrics.activityPillPaddingY)} ${pxToRem(
                metrics.activityPillPaddingX,
              )}`,
            }}
          >
            {t(`discover.channel.activity.${channel.activityLabel}`)}
          </span>
        </div>
        <div
          className="flex min-w-0 items-center"
          id={contextId}
          style={{
            gap: pxToRem(metrics.contextRowGap),
            marginTop: pxToRem(metrics.contextRowMarginTop),
          }}
        >
          <DiscoverCategoryTile
            category={channel.serverCategory}
            fontSize={metrics.contextTileFontSize}
            initials={getDiscoverCategoryInitials(channel.serverCategory)}
            radius={metrics.contextTileRadius}
            size={metrics.contextTileSize}
          />
          <span
            className="min-w-0 flex-1 truncate text-[hsl(var(--text-muted))]"
            style={{
              fontSize: pxToRem(metrics.contextFontSize),
              fontWeight: metrics.contextWeight,
              lineHeight: metrics.contextLineHeight,
            }}
          >
            {t("discover.channel.context", {
              detail: contextDetail,
              server: channel.serverName,
            })}
          </span>
        </div>
      </div>

      <div
        className="relative z-10 flex shrink-0 items-center"
        style={{ gap: pxToRem(metrics.trailingGap) }}
      >
        <div aria-hidden="true" className="flex">
          {channel.memberPreview.map((member, index) => (
            <span
              className="inline-grid place-items-center rounded-full bg-[hsl(var(--surface-soft))] text-[hsl(var(--text-secondary))]"
              key={member.id}
              style={{
                boxShadow: `0 0 0 ${pxToRem(metrics.avatarStackRingWidth)} hsl(var(--surface-card))`,
                fontFamily: "var(--font-display)",
                fontSize: pxToRem(8),
                fontWeight: 600,
                height: pxToRem(metrics.avatarStackSize),
                marginLeft: index === 0 ? 0 : pxToRem(metrics.avatarStackOverlap),
                width: pxToRem(metrics.avatarStackSize),
              }}
            >
              {member.initials}
            </span>
          ))}
        </div>
        <button
          className="shrink-0 border-[hsl(var(--border)/0.7)] bg-transparent text-[hsl(var(--text-secondary))] hover:bg-[var(--surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
          onClick={() => onPreview(channel)}
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
    </article>
  );
}

export const DiscoverChannelRow = memo(DiscoverChannelRowComponent);
