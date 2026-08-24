"use client";

import React, { useEffect } from "react";
import { Check, X } from "lucide-react";
import type { EventDayBucket, EventReminder } from "@wizards/types";

import { useI18n } from "@/components/providers/locale-provider";
import { eventCalendarIcsHref } from "@/lib/events/client";
import { EVENTS_METRICS, hairline, pxToEm, pxToRem } from "@/lib/events/metrics";
import {
  EVENT_DAY_BUCKET_KEY,
  formatEventClock,
  formatEventDayLabel,
} from "@/lib/events/presentation";

/**
 * RSVP onay şeridi — SPEC §3.4.
 *
 * Alt satırdaki `{n}` **gerçek hatırlatma tercihinden** okunur (K5). Ş3'ün yazma yanıtı hem
 * `event.reminder`ı hem `scheduled` bayrağını taşıyor; `scheduled: false` ise iş kuyruğa hiç
 * yazılmadı (etkinlik seçilen dakikadan yakın, tuzak #8) ve hatırlatma cümlesi **yazılmaz** —
 * gelmeyecek bir bildirimin sözü verilmez.
 *
 * Şerit kuyruğa alınmaz: ikinci bir `Katıl` yanıtı geldiğinde eksen sahibi (`eventsUiReducer`)
 * yeni bir şerit açar ve bu bileşen yeni etkinlikle **yeniden** monte olur; sekiz saniyelik
 * zamanlayıcı da onunla birlikte sıfırlanır.
 */

const { rsvpStrip } = EVENTS_METRICS;

/** SPEC §3.4 — şerit kendiliğinden kapanır. */
export const EVENT_RSVP_STRIP_AUTO_DISMISS_MS = 8_000;

export type EventRsvpStripEvent = {
  readonly dayBucket: EventDayBucket;
  readonly id: string;
  readonly reminder: EventReminder | null;
  readonly startsAt: string;
  readonly title: string;
};

export type EventRsvpStripCopy = {
  /** `Bugün` / `Yarın` sözlükten; diğer günler tarihin kendisi. */
  readonly dayKey: string | null;
  readonly dayText: string | null;
  readonly key: "events.rsvp.bannerSub" | "events.rsvp.bannerSubPlain";
  readonly minutes: number | null;
  readonly time: string;
};

export type EventRsvpStripProps = {
  readonly event: EventRsvpStripEvent;
  readonly onDismiss: () => void;
  /** Ş3'ün yazma yanıtındaki `scheduled`: hatırlatma işi gerçekten kuyruğa yazıldı mı. */
  readonly scheduled: boolean;
  readonly timeZone: string;
};

export function describeEventRsvpStrip(input: {
  readonly event: EventRsvpStripEvent;
  readonly locale: string;
  readonly scheduled: boolean;
  readonly timeZone: string;
}): EventRsvpStripCopy {
  const { event, locale, scheduled, timeZone } = input;
  const reminder = event.reminder;
  const scheduledReminder = scheduled && reminder !== null && reminder.enabled;
  const dayKey =
    event.dayBucket === "today" || event.dayBucket === "tomorrow"
      ? EVENT_DAY_BUCKET_KEY[event.dayBucket]
      : null;

  return {
    dayKey,
    dayText:
      dayKey === null ? formatEventDayLabel(new Date(event.startsAt), timeZone, locale) : null,
    key: scheduledReminder ? "events.rsvp.bannerSub" : "events.rsvp.bannerSubPlain",
    minutes: scheduledReminder ? reminder.minutesBefore : null,
    time: formatEventClock(event.startsAt, timeZone, locale),
  };
}

export function EventRsvpStrip({ event, onDismiss, scheduled, timeZone }: EventRsvpStripProps) {
  const { locale, t } = useI18n();
  const copy = describeEventRsvpStrip({ event, locale, scheduled, timeZone });
  const day = copy.dayKey ? t(copy.dayKey) : (copy.dayText ?? "");

  useEffect(() => {
    const timer = setTimeout(onDismiss, EVENT_RSVP_STRIP_AUTO_DISMISS_MS);

    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div
      aria-live="polite"
      className="flex items-center motion-safe:transition-opacity"
      data-testid="events-rsvp-strip"
      role="status"
      style={{
        background: `hsl(var(--success)/${rsvpStrip.surfaceAlpha})`,
        border: `${hairline()} solid hsl(var(--success)/${rsvpStrip.borderAlpha})`,
        borderRadius: pxToRem(rsvpStrip.radius),
        gap: pxToRem(rsvpStrip.gap),
        margin: `${pxToRem(rsvpStrip.marginTop)} ${pxToRem(rsvpStrip.marginX)} 0`,
        padding: `${pxToRem(rsvpStrip.paddingY)} ${pxToRem(rsvpStrip.paddingX)}`,
      }}
    >
      <span
        aria-hidden="true"
        className="grid shrink-0 place-items-center"
        style={{
          background: `hsl(var(--success)/${rsvpStrip.iconSurfaceAlpha})`,
          borderRadius: pxToRem(rsvpStrip.iconRadius),
          color: "hsl(var(--success))",
          height: pxToRem(rsvpStrip.iconSize),
          width: pxToRem(rsvpStrip.iconSize),
        }}
      >
        <Check
          style={{
            height: pxToEm(rsvpStrip.iconGlyphSize),
            width: pxToEm(rsvpStrip.iconGlyphSize),
          }}
        />
      </span>

      <div className="min-w-0 flex-1">
        <div
          style={{
            color: "hsl(var(--foreground))",
            fontSize: pxToRem(rsvpStrip.titleFontSize),
            fontWeight: rsvpStrip.titleWeight,
            lineHeight: rsvpStrip.titleLineHeight,
          }}
        >
          {t("events.rsvp.bannerTitle", { title: event.title })}
        </div>
        <div
          style={{
            color: "hsl(var(--text-muted))",
            fontSize: pxToRem(rsvpStrip.subFontSize),
            marginTop: pxToRem(rsvpStrip.subMarginTop),
          }}
        >
          {t(copy.key, {
            day,
            time: copy.time,
            ...(copy.minutes === null ? {} : { minutes: copy.minutes }),
          })}
        </div>
      </div>

      {/*
       * `fetch` değil bağlantı: dosyayı tarayıcının indirme yoluna bırakmak,
       * `Content-Disposition`daki dosya adının korunmasının tek yolu (K7).
       */}
      <a
        className="grid shrink-0 place-items-center focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] motion-safe:transition-colors"
        data-testid="events-rsvp-strip-ics"
        download
        href={eventCalendarIcsHref(event.id)}
        style={{
          background: "hsl(var(--surface-card))",
          border: `${hairline()} solid hsl(var(--border))`,
          borderRadius: pxToRem(rsvpStrip.actionRadius),
          color: "hsl(var(--text-secondary))",
          fontSize: pxToRem(rsvpStrip.actionFontSize),
          fontWeight: rsvpStrip.actionWeight,
          height: pxToRem(rsvpStrip.actionHeight),
          lineHeight: 1,
          padding: `0 ${pxToRem(rsvpStrip.actionPaddingX)}`,
        }}
      >
        {t("events.rsvp.addToCalendar")}
      </a>

      <button
        aria-label={t("events.rsvp.dismiss")}
        className="grid shrink-0 place-items-center focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] motion-safe:transition-colors"
        data-testid="events-rsvp-strip-dismiss"
        onClick={onDismiss}
        style={{
          borderRadius: pxToRem(rsvpStrip.closeRadius),
          color: "hsl(var(--text-muted))",
          height: pxToRem(rsvpStrip.closeSize),
          width: pxToRem(rsvpStrip.closeSize),
        }}
        type="button"
      >
        <X
          aria-hidden="true"
          style={{
            height: pxToEm(rsvpStrip.closeIconSize),
            width: pxToEm(rsvpStrip.closeIconSize),
          }}
        />
      </button>
    </div>
  );
}
