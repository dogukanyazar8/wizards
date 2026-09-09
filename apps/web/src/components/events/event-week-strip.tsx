"use client";

import Link from "next/link";
import React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { EVENT_KIND_TONE, type EventWeekDay } from "@wizards/types";

import { useI18n } from "@/components/providers/locale-provider";
import { EVENTS_METRICS, hairline, pxToRem } from "@/lib/events/metrics";
import { formatEventDayLabel } from "@/lib/events/presentation";
import { buildEventsHref, toggleEventTimeFilter, type EventsRouteState } from "@/lib/events/routes";
import {
  eventWeekDayNumber,
  eventWeekdayKey,
  resolveEventWeek,
  shiftEventWeek,
  weekDays,
  weekMonthLabel,
} from "@/lib/events/week";

/**
 * Hafta şeridi — SPEC §3.2.
 *
 * **Saf sunum**: sorgu açmaz, mutasyon çağırmaz, `Date.now()` okumaz. Kova kararı sunucunun
 * (tuzak #7); burada yalnız gelen yedi kutu çizilir. Bugünün hangi kutu olduğu da sunucudan
 * gelir — `todayDate` yalnız yanıt gelmeden çizilen ilk boyada kullanılan yedektir.
 *
 * Kutular `<button>` değil `<Link>`: filtre adres çubuğunda duruyor ve gerçek bir `href`
 * paylaşılabilir adresi, orta tıkla yeni sekmeyi ve geri tuşunu bedavaya getiriyor. Yazım
 * **`replace`**: hafta ve zaman birer filtre ve her ok tıklaması geçmiş yığınına bir giriş
 * eklerse geri tuşu ekrandan çıkmaz (PROMPT §4). Panel ve modal `push` ile yazılır ve o karar
 * `events-page.tsx`'te durur.
 *
 * `data-nav` bir kanıt işareti: Next `<Link replace>` bayrağını çıktı işaretlemesine
 * yansıtmıyor ve testin "filtre yazımı geçmişi büyütmüyor" iddiasını doğrulayacak başka bir
 * tutamağı olmuyor.
 */

const { weekStrip } = EVENTS_METRICS;

/** Şeridin bütün metni display ailesinden (SPEC §3.2). */
const DISPLAY_FONT = "var(--font-display), sans-serif";

export type EventWeekStripProps = {
  /** Sunucunun `week` bloğu; boş gelirse şerit yine yedi boş kutu çizer. */
  readonly days: readonly EventWeekDay[];
  readonly locale: string;
  readonly routeState: EventsRouteState;
  /** İzleyicinin takvimindeki bugün (`YYYY-MM-DD`); yalnız `days` boşken kullanılır. */
  readonly todayDate: string;
  /** Görünen haftanın pazartesisi. */
  readonly weekStart: string;
};

/**
 * Gün kutusunun adresi.
 *
 * Referans HTML'in `go` işleyicisi bugün için `time: 'today'`, diğer günler için `time: null`
 * yazıyor ve otorite odur: `EventTimeFilter` Dalga 0'da dört değerle donduruldu
 * (`today/week/month/past`) ve gün başına bir değeri yok. Aynı güne ikinci tık filtreyi
 * kaldırır (`toggleEventTimeFilter`).
 */
export function eventWeekDayHref(routeState: EventsRouteState, day: EventWeekDay): string {
  return buildEventsHref(routeState, {
    createOpen: false,
    // Yeni süzgeç, panelin dayandığı etkinliği listeden çıkarabilir; dayanağı olmayan bir
    // kolon açık kalmasın diye panel de düşer (`mentions-feed-header.tsx` ile aynı karar).
    panel: null,
    time: day.isToday ? toggleEventTimeFilter(routeState.time, "today") : null,
  });
}

export function EventWeekStrip({
  days,
  locale,
  routeState,
  todayDate,
  weekStart,
}: EventWeekStripProps) {
  const { t } = useI18n();

  const boxes = resolveEventWeek(weekStart, days, todayDate);
  const label = weekMonthLabel(weekDays(weekStart), locale);

  const arrowStyle = {
    border: `${hairline()} solid hsl(var(--border)/${weekStrip.arrowBorderAlpha})`,
    borderRadius: pxToRem(weekStrip.arrowRadius),
    height: pxToRem(weekStrip.arrowSize),
    width: pxToRem(weekStrip.arrowSize),
  } as const;

  const arrowIconStyle = {
    height: pxToRem(weekStrip.arrowIconSize),
    width: pxToRem(weekStrip.arrowIconSize),
  } as const;

  const arrowHref = (steps: number) =>
    buildEventsHref(routeState, {
      createOpen: false,
      panel: null,
      weekStart: shiftEventWeek(weekStart, steps),
    });

  return (
    <div
      aria-label={t("events.a11y.weekStrip")}
      className="flex items-center"
      data-testid="events-week-strip"
      role="group"
      style={{
        background: `hsl(var(--surface-panel)/${weekStrip.surfaceAlpha})`,
        borderBottom: `${hairline()} solid hsl(var(--border)/${weekStrip.borderBottomAlpha})`,
        gap: pxToRem(weekStrip.gap),
        padding: `${pxToRem(weekStrip.paddingY)} ${pxToRem(weekStrip.paddingX)}`,
      }}
    >
      <div className="flex flex-none items-center" style={{ gap: pxToRem(weekStrip.navGroupGap) }}>
        <Link
          aria-label={t("events.week.previous")}
          className="grid place-items-center text-[hsl(var(--text-muted))] transition-colors hover:bg-[var(--surface-hover)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
          data-nav="push"
          data-testid="events-week-previous"
          href={arrowHref(-1)}
          scroll={false}
          style={arrowStyle}
          title={t("events.week.previous")}
        >
          <ChevronLeft aria-hidden="true" style={arrowIconStyle} />
        </Link>

        <span
          className="text-center text-[hsl(var(--foreground))]"
          data-testid="events-week-label"
          style={{
            fontFamily: DISPLAY_FONT,
            fontSize: pxToRem(weekStrip.monthLabelFontSize),
            fontWeight: weekStrip.monthLabelWeight,
            letterSpacing: "-0.02em",
            lineHeight: 1,
            minWidth: pxToRem(weekStrip.monthLabelMinWidth),
          }}
        >
          {label.kind === "single"
            ? label.text
            : t("events.week.monthSpan", { from: label.from, to: label.to, year: label.year })}
        </span>

        <Link
          aria-label={t("events.week.next")}
          className="grid place-items-center text-[hsl(var(--text-muted))] transition-colors hover:bg-[var(--surface-hover)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
          data-nav="push"
          data-testid="events-week-next"
          href={arrowHref(1)}
          scroll={false}
          style={arrowStyle}
          title={t("events.week.next")}
        >
          <ChevronRight aria-hidden="true" style={arrowIconStyle} />
        </Link>
      </div>

      <div
        className="grid min-w-0 flex-1"
        style={{
          gap: pxToRem(weekStrip.gridGap),
          gridTemplateColumns: `repeat(${weekStrip.gridColumns}, minmax(0, 1fr))`,
        }}
      >
        {boxes.map((box) => (
          <Link
            aria-current={box.isToday ? "date" : undefined}
            // Renk tek başına anlam taşımaz: nokta satırı `aria-hidden`, sayı burada metin.
            aria-label={`${formatEventDayLabel(box.date, "UTC", locale)}, ${t("events.sub.count", {
              count: box.count,
            })}`}
            className="flex flex-col items-center bg-[var(--event-week-day-bg)] transition-colors hover:bg-[var(--surface-hover)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
            data-nav="replace"
            data-testid={`events-week-day-${box.date}`}
            href={eventWeekDayHref(routeState, box)}
            key={box.date}
            replace
            scroll={false}
            style={{
              // Dinlenme zemini **değişkenle** iniyor: satır içi bir `background`
              // `hover:bg-*` kuralını her zaman yener ve vurgu sessizce ölürdü.
              ["--event-week-day-bg" as string]: box.isToday
                ? `hsl(var(--primary)/${weekStrip.todaySurfaceAlpha})`
                : "transparent",
              border: `${hairline()} solid ${
                box.isToday
                  ? `hsl(var(--primary)/${weekStrip.todayBorderAlpha})`
                  : `hsl(var(--border)/${weekStrip.dayBorderAlpha})`
              }`,
              borderRadius: pxToRem(weekStrip.dayRadius),
              gap: pxToRem(weekStrip.dayGap),
              padding: `${pxToRem(weekStrip.dayPaddingTop)} ${pxToRem(
                weekStrip.dayPaddingX,
              )} ${pxToRem(weekStrip.dayPaddingBottom)}`,
            }}
          >
            <span
              aria-hidden="true"
              style={{
                // Ş10 — bugünün metni `--primary-readable`: ham `--primary`, kendi %14'lük
                // zemini üstünde 2,52:1 kalıyor ve axe'in `color-contrast` kuralını
                // serious seviyede düşürüyordu. Ton aynı aile, okunurluk WCAG AA.
                color: box.isToday ? "var(--primary-readable)" : "hsl(var(--text-muted))",
                fontFamily: DISPLAY_FONT,
                fontSize: pxToRem(weekStrip.dowFontSize),
                fontWeight: weekStrip.dowWeight,
                letterSpacing: `${weekStrip.dowLetterSpacing}em`,
                lineHeight: 1,
                textTransform: "uppercase",
              }}
            >
              {t(eventWeekdayKey(box.date))}
            </span>
            <span
              aria-hidden="true"
              style={{
                color: box.isToday ? "var(--primary-readable)" : "hsl(var(--foreground))",
                fontFamily: DISPLAY_FONT,
                fontSize: pxToRem(weekStrip.numFontSize),
                fontWeight: weekStrip.numWeight,
                lineHeight: 1,
              }}
            >
              {eventWeekDayNumber(box.date)}
            </span>
            <span
              aria-hidden="true"
              className="flex items-center"
              data-testid="events-week-dot-row"
              style={{ gap: pxToRem(weekStrip.dotGap), height: pxToRem(weekStrip.dotRowHeight) }}
            >
              {box.kinds.slice(0, weekStrip.maxDots).map((kind, index) => (
                <span
                  data-testid="events-week-dot"
                  key={`${kind}-${index}`}
                  style={{
                    background: `hsl(var(${EVENT_KIND_TONE[kind]}))`,
                    borderRadius: "50%",
                    height: pxToRem(weekStrip.dotSize),
                    width: pxToRem(weekStrip.dotSize),
                  }}
                />
              ))}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
