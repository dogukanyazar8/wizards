"use client";

import React, { useEffect, useRef } from "react";
import {
  resolveAccountTimeZone,
  type EventCardSize,
  type EventDayBucket,
  type EventRsvp,
  type EventTimeFilter,
  type WhisprEvent,
} from "@wizards/types";

import { EventCard } from "@/components/events/event-card";
import { EventDayGroup } from "@/components/events/event-day-group";
import { useAccountPreferenceRuntime } from "@/components/providers/account-preference-provider";
import { useI18n } from "@/components/providers/locale-provider";
import { EVENTS_METRICS, hairline, pxToRem } from "@/lib/events/metrics";
import { EVENT_DAY_BUCKET_KEY, formatEventDayLabel } from "@/lib/events/presentation";

/**
 * Kaydırma alanı, gün grupları ve ızgara — SPEC §3.5, `.dc.html` `:325`–`:390`.
 *
 * **`past` kovası akışta çizilmez** (`SPEC_DEVIATIONS` #5): tip dört kova taşır, ızgara üç grup
 * çizer. Arşivi ancak zaman filtresi ister; o seçiliyken tek bir `Geçmiş` grubu çizilir ve
 * diğer üçü hiç kurulmaz — aynı listede hem arşiv hem bugün göstermek, "geçmiş" filtresinin ne
 * yaptığını belirsiz bırakırdı.
 *
 * **Boş grup render edilmez.** Başlığı çizip altını boş bırakmak, filtrenin bir şeyi
 * süzdüğünü değil verinin eksik geldiğini düşündürürdü.
 *
 * Grup başlığındaki tarih **istemcide** biçimlenir (`presentation.ts`): sunucu sayı ve enum
 * gönderir, cümleyi istemci kurar (00-ortak-baglam §3.1). Aralık grubun kendi uçlarından
 * türetilir — `week` kovasının sonu açıktır, sabit bir pencere yoktur.
 */

const { grid } = EVENTS_METRICS;

/** Akışın grup sırası. `past` burada **yok**; onu yalnız zaman filtresi getirir. */
const FEED_BUCKETS: readonly EventDayBucket[] = ["today", "tomorrow", "week"];
const ARCHIVE_BUCKETS: readonly EventDayBucket[] = ["past"];

export type EventGridProps = {
  /** K11 — `--e-min` bu tercihten gelir; başka hiçbir ölçü değişmez. */
  readonly cardSize?: EventCardSize;
  readonly events: readonly WhisprEvent[];
  /** Ş10 — sonraki sayfa var mı; yoksa gözlemci hiç kurulmaz. */
  readonly hasNextPage?: boolean;
  readonly loadingMore?: boolean;
  readonly now?: Date;
  readonly onLoadMore?: () => void;
  readonly onOpen?: (eventId: string) => void;
  readonly onRsvp?: (eventId: string, rsvp: EventRsvp | null) => void | Promise<void>;
  readonly selectedId?: string | null;
  readonly timeFilter?: EventTimeFilter | null;
};

export function EventGrid({
  cardSize = "medium",
  events,
  hasNextPage = false,
  loadingMore = false,
  now,
  onLoadMore,
  onOpen,
  onRsvp,
  selectedId = null,
  timeFilter = null,
}: EventGridProps) {
  const { locale, t } = useI18n();
  const { preferences } = useAccountPreferenceRuntime();
  const timeZone = resolveAccountTimeZone(preferences.timeZone);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  /**
   * Ş10 — sonsuz kaydırma. `scroll` dinleyicisi değil `IntersectionObserver`: kaydırma olayı
   * saniyede onlarca kez atar ve her birinde ölçü almak ana iş parçacığını meşgul eder.
   *
   * Kök **kaydırma kabı**, görünüm alanı değil (`root: scrollRef.current`). Kök verilmezse
   * hedef önce her kırpma kutusuna kırpılır ve `rootMargin` yalnız en dıştaki dikdörtgeni
   * büyütür; sentinel ızgaranın içinde 200 px yukarıdayken görünür sayılmaz.
   *
   * Bağımlılıklar **ilkel** (tuzak #12): `onLoadMore` sayfanın `useCallback`'i ve o da ilkel
   * bağımlılıklar taşıyor. `events.length` listeye sayfa eklendiğinde gözlemciyi bir kez
   * yeniden kuruyor — sentinel hâlâ görünürdeyse bir sonraki sayfa da isteniyor.
   */
  useEffect(() => {
    const node = sentinelRef.current;

    if (!node || !hasNextPage || !onLoadMore) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          onLoadMore();
        }
      },
      { root: scrollRef.current, rootMargin: "200px" },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [events.length, hasNextPage, onLoadMore]);

  const buckets = timeFilter === "past" ? ARCHIVE_BUCKETS : FEED_BUCKETS;
  const groups = buckets
    .map((bucket) => ({
      bucket,
      items: events
        .filter((item) => item.dayBucket === bucket)
        .sort((left, right) => left.startsAt.localeCompare(right.startsAt)),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <div
      className="flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto"
      data-testid="event-grid"
      ref={scrollRef}
      style={{
        gap: pxToRem(grid.scrollGap),
        padding: `${pxToRem(grid.scrollPaddingTop)} ${pxToRem(grid.scrollPaddingX)} ${pxToRem(
          grid.scrollPaddingBottom,
        )}`,
        // Tek değişken, tek yer: kart boyutu ikonu bunu oynatır, ızgaralar mirasla okur.
        ["--e-min" as string]: pxToRem(
          cardSize === "large" ? grid.minColumnWidthLarge : grid.minColumnWidth,
        ),
      }}
    >
      {groups.map((group) => (
        <EventDayGroup
          count={group.items.length}
          date={formatGroupDate(group.items, timeZone, locale, t)}
          key={group.bucket}
          label={t(EVENT_DAY_BUCKET_KEY[group.bucket])}
        >
          {group.items.map((item) => (
            <EventCard
              event={item}
              key={item.id}
              {...(now ? { now } : {})}
              onOpen={() => onOpen?.(item.id)}
              onRsvp={(rsvp) => onRsvp?.(item.id, rsvp)}
              selected={selectedId === item.id}
            />
          ))}
        </EventDayGroup>
      ))}

      {/*
        Sentinel alt notun **üstünde**: alt not ızgaranın son öğesi ve gözlemci ona takılsaydı
        sonraki sayfa ancak arşiv cümlesi ekrana girdiğinde istenirdi. Yükleme metni yokken
        yükseklik de yok — sabit bir kutu son kartın altına boşluk yazardı.
      */}
      <div
        aria-live="polite"
        data-testid="event-grid-sentinel"
        ref={sentinelRef}
        role="status"
        style={{
          fontSize: pxToRem(grid.footerFontSize),
          minHeight: loadingMore ? pxToRem(grid.footerPaddingTop) : 0,
          textAlign: "center",
        }}
      >
        {loadingMore ? t("events.grid.loadingMore") : ""}
      </div>

      <div
        className="flex items-center justify-center text-[hsl(var(--text-muted))]"
        data-testid="event-grid-footer"
        style={{
          fontSize: pxToRem(grid.footerFontSize),
          gap: pxToRem(grid.footerGap),
          paddingTop: pxToRem(grid.footerPaddingTop),
        }}
      >
        <span
          aria-hidden="true"
          className="flex-1"
          style={{
            background: `hsl(var(--border)/${grid.footerRuleAlpha})`,
            height: hairline(),
          }}
        />
        {t("events.grid.footer")}
        <span
          aria-hidden="true"
          className="flex-1"
          style={{
            background: `hsl(var(--border)/${grid.footerRuleAlpha})`,
            height: hairline(),
          }}
        />
      </div>
    </div>
  );
}

/**
 * `27 Ağustos` ya da `29 Ağustos – 2 Eylül`.
 *
 * Uçlar grubun kendi verisinden okunur; `week` kovası "yarından sonrası"dır ve sonu yoktur.
 * Sabit bir pencere yazılsaydı hafta şeridi ileri sarıldığında başlık yalan söylerdi.
 */
function formatGroupDate(
  items: readonly WhisprEvent[],
  timeZone: string,
  locale: string,
  t: (key: string, values?: Record<string, string | number>) => string,
): string {
  const first = items[0];
  const last = items[items.length - 1];

  if (!first || !last) {
    return "";
  }

  const from = formatEventDayLabel(new Date(first.startsAt), timeZone, locale);
  const to = formatEventDayLabel(new Date(last.startsAt), timeZone, locale);

  return from === to ? from : t("events.grid.dateRange", { from, to });
}
