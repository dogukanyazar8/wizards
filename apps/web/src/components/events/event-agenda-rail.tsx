"use client";

import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { resolveAccountTimeZone } from "@wizards/types";

import { EventAgendaTimeline } from "@/components/events/event-agenda-timeline";
import { EventGoingRow } from "@/components/events/event-going-row";
import { EVENT_DISPLAY_FONT } from "@/components/events/event-kind-tile";
import { useAccountPreferenceRuntime } from "@/components/providers/account-preference-provider";
import { useI18n } from "@/components/providers/locale-provider";
import { Skeleton } from "@/components/ui/skeleton";
import {
  EVENTS_STALE_TIME_MS,
  eventsQueryKeys,
  fetchEvents,
  type EventsListRequest,
} from "@/lib/events/client";
import { EVENTS_METRICS, hairline, pxToEm, pxToRem } from "@/lib/events/metrics";
import { formatEventDayLabel } from "@/lib/events/presentation";
import { cn } from "@/lib/utils";

/**
 * Sağ ajanda rayı (300) — SPEC §4.
 *
 * **Ray ekranın filtrelerini okumaz.** Gündelik bir özet: bugün ne var, neye katılıyorum.
 * Sonucun aynası olsaydı bir sunucu filtresi açıkken "bugün hiçbir şey yok" derdi ve
 * kullanıcı takvimini kaybettiğini sanırdı. Bu yüzden iki sorgusu da **sabit** girdiyle
 * kuruluyor (`agendaRailQueryInput` / `agendaGoingQueryInput`) ve bileşen hiçbir filtre
 * ekseni prop olarak almıyor — alsaydı bir gün biri onu bağlardı.
 *
 * Anahtarlara `"agenda"` halkası ekleniyor: aynı adresi ana kolonun sonsuz listesi de
 * kullanıyor ve sayfa boyutları farklı (`gridPageSize` ≠ `agendaRows`). Halka olmadan iki
 * tüketici tek önbellek girdisini paylaşır ve biri diğerinin sayfasını çizerdi. Önek
 * (`eventsQueryKeys.lists`) korunuyor, yani Ş4'ün socket yamaları bu girdileri de yamıyor.
 *
 * Panel açıldığında ray **unmount** olur; bu ternary'yi Ş5'in sayfası kurar, ray kendini
 * gizlemez. Sütunun **genişliği ve sol ayırıcısı da** o sarmalayıcının
 * (`events-page.tsx` → `events-right-column`) üzerinde: ray onu ikinci kez çizseydi ayırıcı
 * çift kalınlıkta görünürdü. Ray sarmalayıcıyı doldurur ve yalnız zeminini kendisi verir.
 */

const { agendaRail } = EVENTS_METRICS;

export const EVENTS_AGENDA_QUERY_KEYS = {
  going: [...eventsQueryKeys.list({ tab: "going" }), "agenda"] as const,
  today: [...eventsQueryKeys.list({ tab: "all", time: "today" }), "agenda"] as const,
};

/** Bugünün ajandası — ekranın hiçbir filtresi uygulanmaz. */
export function agendaRailQueryInput(rows: number): EventsListRequest {
  return { limit: rows, tab: "all", time: "today" };
}

/**
 * `Katılacağım` — **bugüne sınırlı değil**. `time` alanı bilerek yok: izleyicinin yarınki
 * katılımı da bu bölümde görünür.
 */
export function agendaGoingQueryInput(rows: number): EventsListRequest {
  return { limit: rows, tab: "going" };
}

/**
 * Girdi `events-page.tsx`in `renderAgendaRail` yuvasıyla **birebir** aynı: satır sayıları
 * yoğunluk tablosundan sayfada bir kez okunuyor, ray ikinci bir ölçek okuyucusu açmıyor.
 */
export type EventAgendaRailProps = {
  readonly goingRows: number;
  readonly onOpenCreate: () => void;
  readonly onOpenDetail: (eventId: string) => void;
  readonly panelId: string | null;
  readonly rows: number;
  readonly viewerCanCreate: boolean;
};

export function EventAgendaRail({
  goingRows,
  onOpenCreate,
  onOpenDetail,
  panelId,
  rows,
  viewerCanCreate,
}: EventAgendaRailProps) {
  const { locale, t } = useI18n();
  const { preferences } = useAccountPreferenceRuntime();
  const timeZone = resolveAccountTimeZone(preferences.timeZone);

  const todayQuery = useQuery({
    queryFn: () => fetchEvents(agendaRailQueryInput(rows)),
    queryKey: [...EVENTS_AGENDA_QUERY_KEYS.today],
    staleTime: EVENTS_STALE_TIME_MS.list,
  });

  const goingQuery = useQuery({
    queryFn: () => fetchEvents(agendaGoingQueryInput(goingRows)),
    queryKey: [...EVENTS_AGENDA_QUERY_KEYS.going],
    staleTime: EVENTS_STALE_TIME_MS.list,
  });

  /**
   * Başlıktaki tarih izleyicinin bugünü. Sunucu ile istemci aynı bölgeyi (hesap tercihi)
   * kullandığı için ilk boya ile hidrasyon aynı günü yazar; `useMemo` yalnız her render'da
   * yeni bir `Date` üretilmesini önler.
   */
  const today = useMemo(() => new Date(), []);

  const todayEvents = (todayQuery.data?.items ?? []).slice(0, rows);
  const goingEvents = (goingQuery.data?.items ?? []).slice(0, goingRows);
  const goingCount = goingQuery.data?.counts.going ?? 0;

  return (
    <aside
      aria-label={t("events.a11y.agendaRail")}
      className="flex h-full min-h-0 w-full flex-col overflow-hidden"
      data-testid="event-agenda-rail"
      style={{ background: "hsl(var(--surface-panel))" }}
    >
      <header
        className="flex items-center"
        style={{
          borderBottom: `${hairline()} solid hsl(var(--border)/${agendaRail.headerBorderAlpha})`,
          gap: pxToRem(agendaRail.headerGap),
          padding: `${pxToRem(agendaRail.headerPaddingTop)} ${pxToRem(
            agendaRail.headerPaddingX,
          )} ${pxToRem(agendaRail.headerPaddingBottom)}`,
        }}
      >
        <div className="min-w-0">
          <h2
            className={cn("text-[hsl(var(--foreground))]", EVENT_DISPLAY_FONT)}
            style={{
              fontSize: pxToRem(agendaRail.titleFontSize),
              fontWeight: agendaRail.titleWeight,
              lineHeight: agendaRail.titleLineHeight,
            }}
          >
            {t("events.agenda.title")}
          </h2>
          <p
            className="text-[hsl(var(--text-muted))]"
            style={{
              fontSize: pxToRem(agendaRail.subFontSize),
              fontWeight: agendaRail.subWeight,
              lineHeight: 1,
              marginTop: pxToRem(agendaRail.subMarginTop),
            }}
          >
            {t("events.agenda.sub", {
              count: todayEvents.length,
              date: formatEventDayLabel(today, timeZone, locale),
              live: todayEvents.filter((event) => event.isLive).length,
            })}
          </p>
        </div>
      </header>

      <div
        className="flex min-h-0 flex-1 flex-col overflow-y-auto"
        data-testid="event-agenda-body"
        style={{
          padding: `${pxToRem(agendaRail.bodyPaddingY)} ${pxToRem(agendaRail.bodyPaddingX)}`,
        }}
      >
        {todayQuery.isPending ? (
          <AgendaSkeleton rows={rows} />
        ) : todayEvents.length === 0 ? (
          <p
            className="text-[hsl(var(--text-muted))]"
            data-testid="event-agenda-empty"
            style={{ fontSize: pxToRem(agendaRail.cardSubFontSize) }}
          >
            {t(todayQuery.isError ? "events.error.title" : "events.calendar.emptyDay")}
          </p>
        ) : (
          <EventAgendaTimeline
            events={todayEvents}
            locale={locale}
            onOpen={onOpenDetail}
            selectedEventId={panelId}
            timeZone={timeZone}
          />
        )}

        <div
          aria-hidden="true"
          style={{
            background: `hsl(var(--border)/${agendaRail.dividerAlpha})`,
            height: hairline(),
            margin: `${pxToRem(agendaRail.dividerMarginTop)} 0 ${pxToRem(
              agendaRail.dividerMarginBottom,
            )}`,
          }}
        />

        <div
          className="flex items-center"
          style={{
            gap: pxToRem(agendaRail.goingHeaderGap),
            paddingBottom: pxToRem(agendaRail.goingHeaderPaddingBottom),
          }}
        >
          <span
            className={cn("uppercase text-[hsl(var(--text-muted))]", EVENT_DISPLAY_FONT)}
            style={{
              fontSize: pxToRem(agendaRail.goingLabelFontSize),
              fontWeight: agendaRail.goingLabelWeight,
              letterSpacing: `${agendaRail.goingLabelLetterSpacing}em`,
              lineHeight: 1,
            }}
          >
            {t("events.agenda.goingLabel")}
          </span>
          <span
            className={cn("text-[hsl(var(--text-muted)/0.75)]", EVENT_DISPLAY_FONT)}
            data-testid="event-agenda-going-count"
            style={{
              fontSize: pxToRem(agendaRail.goingLabelFontSize),
              fontWeight: agendaRail.goingLabelWeight,
              lineHeight: 1,
            }}
          >
            {goingCount}
          </span>
        </div>

        <div className="flex flex-col" style={{ gap: pxToRem(agendaRail.goingListGap) }}>
          {goingEvents.map((event) => (
            <EventGoingRow
              event={event}
              key={event.id}
              locale={locale}
              onOpen={onOpenDetail}
              timeZone={timeZone}
            />
          ))}
        </div>
      </div>

      {viewerCanCreate ? (
        <div
          data-testid="event-agenda-footer"
          style={{
            borderTop: `${hairline()} solid hsl(var(--border)/${agendaRail.footerBorderAlpha})`,
            padding: `${pxToRem(agendaRail.footerPaddingY)} ${pxToRem(agendaRail.footerPaddingX)}`,
          }}
        >
          <button
            className="flex w-full items-center justify-center bg-[hsl(var(--surface-card))] text-[hsl(var(--text-secondary))] transition hover:bg-[var(--surface-hover)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
            data-testid="event-agenda-create"
            onClick={onOpenCreate}
            style={{
              border: `${hairline()} solid hsl(var(--border))`,
              borderRadius: pxToRem(agendaRail.footerButtonRadius),
              fontSize: pxToRem(agendaRail.footerButtonFontSize),
              fontWeight: agendaRail.footerButtonWeight,
              gap: pxToRem(agendaRail.footerButtonGap),
              height: pxToRem(agendaRail.footerButtonHeight),
              lineHeight: 1,
            }}
            type="button"
          >
            <Plus
              aria-hidden="true"
              size={pxToEm(agendaRail.footerButtonIconSize, agendaRail.footerButtonFontSize)}
              strokeWidth={2.2}
            />
            {t("events.agenda.create")}
          </button>
        </div>
      ) : null}
    </aside>
  );
}

function AgendaSkeleton({ rows }: { readonly rows: number }) {
  return (
    <div className="flex flex-col" data-testid="event-agenda-skeleton">
      {Array.from({ length: rows }, (_, index) => (
        <div className="flex" key={index} style={{ gap: pxToRem(agendaRail.rowGap) }}>
          <Skeleton
            style={{
              flex: "none",
              height: pxToRem(agendaRail.hourFontSize),
              width: pxToRem(agendaRail.hourColumnWidth),
            }}
          />
          <Skeleton
            style={{
              flex: 1,
              height: pxToRem(agendaRail.goingTileSize + agendaRail.cardPaddingY),
              marginBottom: pxToRem(agendaRail.rowPaddingBottom),
            }}
          />
        </div>
      ))}
    </div>
  );
}
