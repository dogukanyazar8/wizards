"use client";

// TODO(etkinlikler): ortak EventCard'a çıkar
import React, { memo, type CSSProperties } from "react";
import { Clock3 } from "lucide-react";
import type { DiscoverEvent } from "@wizards/types";

import { useI18n } from "@/components/providers/locale-provider";
import type { DiscoverTone } from "@/lib/discover/contracts";
import { DISCOVER_METRICS, hairline, pxToEm, pxToRem } from "@/lib/discover/metrics";

type SupportedLocale = "en" | "tr";
type EventEntityPresentation = {
  readonly glyph: string;
  readonly labels: Readonly<Record<SupportedLocale, string>>;
  readonly tone: DiscoverTone;
};

const EVENT_ENTITY_PRESENTATION: Readonly<
  Record<DiscoverEvent["entityType"], EventEntityPresentation>
> = {
  EXTERNAL: { glyph: "D", labels: { en: "External", tr: "Dış etkinlik" }, tone: "warning" },
  STAGE: { glyph: "S", labels: { en: "Stage", tr: "Sahne" }, tone: "success" },
  VOICE: { glyph: "S", labels: { en: "Voice", tr: "Sesli" }, tone: "primary" },
};

type CalendarParts = {
  readonly day: number;
  readonly month: number;
  readonly year: number;
};

function calendarParts(date: Date, timeZone: string): CalendarParts {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).formatToParts(date);
  let day = 0;
  let month = 0;
  let year = 0;

  for (const part of parts) {
    if (part.type === "day") {
      day = Number(part.value);
    } else if (part.type === "month") {
      month = Number(part.value);
    } else if (part.type === "year") {
      year = Number(part.value);
    }
  }

  return { day, month, year };
}

function calendarDayNumber(date: Date, timeZone: string): number {
  const parts = calendarParts(date, timeZone);
  return Date.UTC(parts.year, parts.month - 1, parts.day) / 86_400_000;
}

function supportedLocale(locale: string): SupportedLocale {
  return locale.toLocaleLowerCase().startsWith("tr") ? "tr" : "en";
}

export function formatDiscoverEventTime({
  locale,
  now,
  scheduledStartAt,
  timeZone,
}: {
  readonly locale: string;
  readonly now: Date;
  readonly scheduledStartAt: string;
  readonly timeZone: string;
}): string {
  const start = new Date(scheduledStartAt);
  if (Number.isNaN(start.getTime())) {
    return "";
  }

  const dayDifference = calendarDayNumber(start, timeZone) - calendarDayNumber(now, timeZone);
  const time = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    timeZone,
  }).format(start);
  const normalizedLocale = supportedLocale(locale);

  if (dayDifference === 0) {
    return `${normalizedLocale === "tr" ? "Bugün" : "Today"} ${time}`;
  }

  if (dayDifference === 1) {
    return `${normalizedLocale === "tr" ? "Yarın" : "Tomorrow"} ${time}`;
  }

  if (dayDifference > 1 && dayDifference <= 7) {
    const weekday = new Intl.DateTimeFormat(locale, { timeZone, weekday: "short" }).format(start);
    return `${weekday} ${time}`;
  }

  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "short",
    timeZone,
  }).format(start);
}

export type DiscoverEventCardProps = {
  readonly event: DiscoverEvent;
  readonly now?: Date;
  readonly onOpen: (event: DiscoverEvent) => void;
  readonly onToggleInterest: (event: DiscoverEvent) => void;
  readonly onViewDetails: (event: DiscoverEvent) => void;
  readonly timeZone?: string;
};

function DiscoverEventCardComponent({
  event,
  now = new Date(),
  onOpen,
  onToggleInterest,
  onViewDetails,
  timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone,
}: DiscoverEventCardProps) {
  const { locale, t } = useI18n();
  const metrics = DISCOVER_METRICS.eventCard;
  const entity = EVENT_ENTITY_PRESENTATION[event.entityType];
  const titleId = `discover-event-card-title-${event.id}`;
  const dateLabel = formatDiscoverEventTime({
    locale,
    now,
    scheduledStartAt: event.scheduledStartAt,
    timeZone,
  });
  const articleStyle: CSSProperties = {
    background: "hsl(var(--surface-card)/0.6)",
    border: `${hairline(metrics.borderWidth)} solid hsl(var(--border)/0.6)`,
    borderRadius: pxToRem(metrics.radius),
    contentVisibility: "auto",
    fontFamily: "var(--font-sans)",
    transition: `border-color ${DISCOVER_METRICS.transitions.hover}ms, transform ${DISCOVER_METRICS.transitions.hover}ms`,
  };

  return (
    <article
      aria-labelledby={titleId}
      className="relative flex cursor-pointer flex-col overflow-hidden hover:-translate-y-0.5 hover:border-[hsl(var(--primary)/0.45)] motion-reduce:hover:translate-y-0"
      data-testid="discover-event-card"
      style={articleStyle}
    >
      <div
        className="flex items-start"
        style={{
          gap: pxToRem(metrics.headGap),
          padding: `${pxToRem(metrics.headPaddingTop)} ${pxToRem(metrics.headPaddingX)} 0`,
        }}
      >
        <span
          aria-hidden="true"
          className="grid shrink-0 place-items-center"
          data-tone={entity.tone}
          style={{
            background: `hsl(var(--${entity.tone})/0.14)`,
            borderRadius: pxToRem(metrics.tileRadius),
            color: `hsl(var(--${entity.tone}))`,
            fontFamily: "var(--font-display)",
            fontSize: pxToRem(metrics.tileFontSize),
            fontWeight: metrics.tileWeight,
            height: pxToRem(metrics.tileSize),
            lineHeight: 1,
            width: pxToRem(metrics.tileSize),
          }}
        >
          {entity.glyph}
        </span>
        <div className="min-w-0 flex-1">
          <span
            data-tone={entity.tone}
            style={{
              background: `hsl(var(--${entity.tone})/0.14)`,
              borderRadius: pxToRem(metrics.kindPillRadius),
              color: `hsl(var(--${entity.tone}))`,
              fontSize: pxToRem(metrics.kindPillFontSize),
              fontWeight: metrics.kindPillWeight,
              lineHeight: 1,
              padding: `${pxToRem(metrics.kindPillPaddingY)} ${pxToRem(metrics.kindPillPaddingX)}`,
            }}
          >
            {entity.labels[supportedLocale(locale)]}
          </span>
          <button
            className="block w-full text-pretty text-left after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-[hsl(var(--ring))] focus-visible:after:ring-offset-2 focus-visible:after:ring-offset-[hsl(var(--surface-card))]"
            data-testid="discover-event-card-open"
            id={titleId}
            onClick={() => onOpen(event)}
            style={{
              color: "hsl(var(--foreground))",
              fontFamily: "var(--font-display)",
              fontSize: pxToRem(metrics.titleFontSize),
              fontWeight: metrics.titleWeight,
              letterSpacing: `${metrics.titleLetterSpacing}em`,
              lineHeight: metrics.titleLineHeight,
              marginTop: pxToRem(metrics.titleMarginTop),
            }}
            type="button"
          >
            {event.name}
          </button>
        </div>
      </div>

      <div
        className="flex flex-col"
        style={{
          gap: pxToRem(metrics.metaGap),
          padding: `${pxToRem(metrics.metaPaddingTop)} ${pxToRem(metrics.metaPaddingX)} 0`,
        }}
      >
        <div
          className="flex items-center text-[hsl(var(--foreground))]"
          style={{
            fontSize: pxToRem(metrics.whenFontSize),
            fontWeight: metrics.whenWeight,
            gap: pxToRem(metrics.whenGap),
            lineHeight: metrics.whenLineHeight,
          }}
        >
          <Clock3
            aria-hidden="true"
            className="shrink-0 text-[hsl(var(--text-muted))]"
            style={{
              height: pxToEm(metrics.whenIconSize, metrics.whenFontSize),
              width: pxToEm(metrics.whenIconSize, metrics.whenFontSize),
            }}
          />
          <span>{dateLabel}</span>
          {event.durationLabel ? (
            <span
              className="text-[hsl(var(--text-muted))]"
              data-testid="discover-event-duration"
              style={{ fontWeight: 500 }}
            >
              {event.durationLabel}
            </span>
          ) : null}
        </div>
        <div
          className="truncate text-[hsl(var(--text-secondary))]"
          style={{
            fontSize: pxToRem(metrics.whereFontSize),
            fontWeight: metrics.whereWeight,
            lineHeight: metrics.whereLineHeight,
          }}
        >
          {event.locationLabel}
        </div>
        <div
          className="text-[hsl(var(--text-muted))]"
          style={{
            fontSize: pxToRem(metrics.interestedFontSize),
            fontWeight: metrics.interestedWeight,
            lineHeight: metrics.interestedLineHeight,
          }}
        >
          {t("discover.event.interestedCount", { count: event.interestedCount })}
        </div>
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
          aria-pressed={event.interested}
          className="flex-1 border-[hsl(var(--primary)/0.4)] bg-[hsl(var(--primary)/0.12)] text-[hsl(var(--primary))] hover:bg-[hsl(var(--primary)/0.2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
          onClick={() => onToggleInterest(event)}
          style={{
            borderRadius: pxToRem(metrics.interestButtonRadius),
            borderStyle: "solid",
            borderWidth: hairline(metrics.interestButtonBorderWidth),
            fontSize: pxToRem(metrics.interestButtonFontSize),
            fontWeight: metrics.interestButtonWeight,
            height: pxToRem(metrics.interestButtonHeight),
            lineHeight: 1,
          }}
          type="button"
        >
          {t("discover.event.interested")}
        </button>
        <button
          className="shrink-0 border-[hsl(var(--border)/0.7)] bg-transparent text-[hsl(var(--text-secondary))] hover:bg-[var(--surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
          onClick={() => onViewDetails(event)}
          style={{
            borderRadius: pxToRem(metrics.detailButtonRadius),
            borderStyle: "solid",
            borderWidth: hairline(),
            fontSize: pxToRem(metrics.detailButtonFontSize),
            fontWeight: metrics.detailButtonWeight,
            height: pxToRem(metrics.detailButtonHeight),
            lineHeight: 1,
            paddingInline: pxToRem(metrics.detailButtonPaddingX),
          }}
          type="button"
        >
          {t("discover.event.detail")}
        </button>
      </div>
    </article>
  );
}

export const DiscoverEventCard = memo(DiscoverEventCardComponent);
