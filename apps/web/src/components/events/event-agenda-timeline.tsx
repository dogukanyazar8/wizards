"use client";

import React from "react";
import { EVENT_KIND_TONE, type WhisprEvent } from "@wizards/types";

import { EVENT_DISPLAY_FONT } from "@/components/events/event-kind-tile";
import { useI18n } from "@/components/providers/locale-provider";
import { EVENTS_METRICS, hairline, pxToRem } from "@/lib/events/metrics";
import { formatEventClock } from "@/lib/events/presentation";
import { cn } from "@/lib/utils";

/**
 * Bugünün zaman çizelgesi — SPEC §4.
 *
 * Dikey çizgi **satır başına** çiziliyor: saat metninin altından başlar ve satırın dibine
 * kadar iner (referans HTML `flex:1` + `margin:6px 0`). Tek bir mutlak konumlu çizgi çizmek,
 * satır yükseklikleri içerikten geldiği için ölçek adımlarında kayardı.
 *
 * Çizgi `hairline()` **değil**: hairline istisnası 1 px kenarlar içindir; buradaki 1,5 px
 * tasarımın kendi kalınlığı ve ölçekle büyümesi gerekir (tuzak #10).
 */

const { agendaRail } = EVENTS_METRICS;

export type EventAgendaTimelineProps = {
  readonly events: readonly WhisprEvent[];
  readonly locale: string;
  readonly onOpen: (eventId: string) => void;
  readonly selectedEventId: string | null;
  readonly timeZone: string;
};

export function EventAgendaTimeline({
  events,
  locale,
  onOpen,
  selectedEventId,
  timeZone,
}: EventAgendaTimelineProps) {
  const { t } = useI18n();

  return (
    <div className="flex flex-col" data-testid="event-agenda-timeline">
      {events.map((event) => {
        const selected = event.id === selectedEventId;
        const clock = formatEventClock(event.startsAt, timeZone, locale);
        // Canlı etkinlikte saat kolonu saati değil durumu yazar; renk tek başına anlam
        // taşımasın diye metnin kendisi de değişir.
        const time = event.isLive ? t("events.card.live") : clock;
        const place = t("events.card.place", {
          channel: event.channelLabel || t("events.create.placeNone"),
          server: event.serverName,
        });

        return (
          <div className="flex" key={event.id} style={{ gap: pxToRem(agendaRail.rowGap) }}>
            <div
              className="flex flex-col items-center"
              style={{ flex: "none", width: pxToRem(agendaRail.hourColumnWidth) }}
            >
              <span
                className={cn("block", EVENT_DISPLAY_FONT)}
                style={{
                  color: event.isLive ? "hsl(var(--danger))" : "hsl(var(--text-muted))",
                  fontSize: pxToRem(agendaRail.hourFontSize),
                  fontWeight: agendaRail.hourWeight,
                  lineHeight: 1,
                }}
              >
                {time}
              </span>
              <span
                aria-hidden="true"
                className="block"
                data-testid="event-agenda-rule"
                style={{
                  background: `hsl(var(--border)/${agendaRail.ruleAlpha})`,
                  flex: 1,
                  margin: `${pxToRem(agendaRail.ruleMarginY)} 0`,
                  width: pxToRem(agendaRail.ruleWidth),
                }}
              />
            </div>

            <div
              className="min-w-0 flex-1"
              style={{ paddingBottom: pxToRem(agendaRail.rowPaddingBottom) }}
            >
              <button
                aria-label={t("events.a11y.agendaRow", {
                  source: place,
                  time,
                  title: event.title,
                })}
                className="flex w-full items-stretch text-left transition hover:brightness-[1.06] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
                data-testid="event-agenda-row"
                onClick={() => onOpen(event.id)}
                style={{
                  background: selected
                    ? `hsl(var(--primary)/${agendaRail.selectedSurfaceAlpha})`
                    : "hsl(var(--surface-card))",
                  border: selected
                    ? `${hairline()} solid hsl(var(--primary)/${agendaRail.selectedBorderAlpha})`
                    : `${hairline()} solid hsl(var(--border)/${agendaRail.cardBorderAlpha})`,
                  borderRadius: pxToRem(agendaRail.cardRadius),
                  gap: pxToRem(agendaRail.cardGap),
                  padding: `${pxToRem(agendaRail.cardPaddingY)} ${pxToRem(agendaRail.cardPaddingX)}`,
                }}
                type="button"
              >
                <span
                  aria-hidden="true"
                  className="block"
                  style={{
                    background: `hsl(var(${EVENT_KIND_TONE[event.kind]}))`,
                    borderRadius: pxToRem(agendaRail.cardStripeRadius),
                    flex: "none",
                    width: pxToRem(agendaRail.cardStripeWidth),
                  }}
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
                    {place}
                  </span>
                </span>

                {event.isLive ? (
                  <span
                    aria-hidden="true"
                    className="block"
                    style={{
                      background: "hsl(var(--danger))",
                      borderRadius: "50%",
                      flex: "none",
                      height: pxToRem(agendaRail.liveDotSize),
                      marginTop: pxToRem(agendaRail.liveDotMarginTop),
                      width: pxToRem(agendaRail.liveDotSize),
                    }}
                  />
                ) : null}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
