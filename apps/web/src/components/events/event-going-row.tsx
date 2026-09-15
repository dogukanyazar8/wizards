"use client";

import React from "react";
import { ChevronRight } from "lucide-react";
import type { WhisprEvent } from "@wizards/types";

import { EventKindTile } from "@/components/events/event-kind-tile";
import { useI18n } from "@/components/providers/locale-provider";
import { EVENTS_METRICS, hairline, pxToEm, pxToRem } from "@/lib/events/metrics";
import {
  EVENT_DAY_BUCKET_KEY,
  formatEventClock,
  zonedWeekdayIndex,
} from "@/lib/events/presentation";

/**
 * `Katılacağım` satırı — SPEC §4 sağ ray alt bölümü.
 *
 * Kapsam **bugüne sınırlı değil**: izleyicinin `going` yanıtı verdiği bütün yaklaşan
 * etkinlikler burada. Bu yüzden alt satır saatin yanına **günü** de yazar; yalnız saat yazan
 * bir satır, üç gün sonraki bir etkinliği bugünkü sanılır hâle getirirdi.
 */

const { agendaRail } = EVENTS_METRICS;

/** Kısa gün adları pazartesiden başlar — `zonedWeekdayIndex` ile aynı sıra. */
const SHORT_WEEKDAY_KEYS = [
  "events.week.dow.mon",
  "events.week.dow.tue",
  "events.week.dow.wed",
  "events.week.dow.thu",
  "events.week.dow.fri",
  "events.week.dow.sat",
  "events.week.dow.sun",
] as const;

export type EventGoingRowProps = {
  readonly event: WhisprEvent;
  readonly locale: string;
  readonly onOpen: (eventId: string) => void;
  readonly timeZone: string;
};

export function EventGoingRow({ event, locale, onOpen, timeZone }: EventGoingRowProps) {
  const { t } = useI18n();

  const clock = formatEventClock(event.startsAt, timeZone, locale);
  /**
   * `Bu hafta` kovasında saat tek başına hangi günü anlattığını söylemez; kısa gün adı
   * (`Çar 11:00`) onu tamamlar. `Bugün` ve `Yarın` kovaları zaten günün kendisini yazıyor.
   */
  const time =
    event.dayBucket === "week"
      ? `${t(SHORT_WEEKDAY_KEYS[zonedWeekdayIndex(event.startsAt, timeZone)] ?? SHORT_WEEKDAY_KEYS[0])} ${clock}`
      : clock;
  const when = t("events.agenda.goingWhen", {
    day: t(EVENT_DAY_BUCKET_KEY[event.dayBucket]),
    time,
  });
  const place = t("events.card.place", {
    channel: event.channelLabel || t("events.create.placeNone"),
    server: event.serverName,
  });

  return (
    <button
      aria-label={t("events.a11y.agendaRow", { source: place, time: when, title: event.title })}
      className="flex w-full items-center bg-[hsl(var(--surface-card))] text-left transition hover:bg-[var(--surface-hover)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
      data-testid="event-agenda-going-row"
      onClick={() => onOpen(event.id)}
      style={{
        border: `${hairline()} solid hsl(var(--border)/${agendaRail.goingRowBorderAlpha})`,
        borderRadius: pxToRem(agendaRail.goingRowRadius),
        gap: pxToRem(agendaRail.goingRowGap),
        padding: `${pxToRem(agendaRail.goingRowPaddingY)} ${pxToRem(agendaRail.goingRowPaddingX)}`,
      }}
      type="button"
    >
      {/* Tür karesi Ş6'nın paylaşılan bileşeni; ölçüler bu şeridin sözlük bloğundan gelir. */}
      <EventKindTile
        fontSize={agendaRail.goingTileFontSize}
        kind={event.kind}
        radius={agendaRail.goingTileRadius}
        size={agendaRail.goingTileSize}
      />

      <span className="min-w-0 flex-1">
        <span
          className="block truncate text-[hsl(var(--foreground))]"
          style={{
            fontSize: pxToRem(agendaRail.cardTitleFontSize),
            fontWeight: agendaRail.cardTitleWeight,
            lineHeight: agendaRail.cardSubLineHeight,
          }}
        >
          {event.title}
        </span>
        <span
          className="block truncate text-[hsl(var(--text-muted))]"
          style={{
            fontSize: pxToRem(agendaRail.cardSubFontSize),
            lineHeight: agendaRail.cardSubLineHeight,
            marginTop: pxToRem(agendaRail.cardSubMarginTop),
          }}
        >
          {when}
        </span>
      </span>

      <ChevronRight
        aria-hidden="true"
        size={pxToEm(agendaRail.goingChevronSize)}
        strokeWidth={2.2}
        style={{ color: "hsl(var(--text-muted))", flex: "none" }}
      />
    </button>
  );
}
