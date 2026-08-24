"use client";

import { useCallback, useSyncExternalStore } from "react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { resolveAccountTimeZone, type EventCounts, type EventsListResponse } from "@wizards/types";

import { useAccountPreferenceRuntime } from "@/components/providers/account-preference-provider";
import { useI18n } from "@/components/providers/locale-provider";
import {
  EVENTS_COUNTS_STALE_TIME_MS,
  eventsQueryKeys,
  fetchEventCounts,
} from "@/lib/events/client";
import { formatEventClock } from "@/lib/home/presentation";

/**
 * Gezinme panelindeki "Etkinlikler" satırının sağındaki saat ipucu — SPEC-ETKINLIKLER §2.
 *
 * Kaynak, ekrandaki etkinlik verisiyle **aynı**: `GET /api/v1/events` yanıtının `counts`
 * bloğu. İki farklı kaynak, iki farklı "sıradaki etkinlik" demekti.
 *
 * Tuzak #4 — kabuk her rotada çiziliyor:
 * - `/events` açıkken sayfa zaten tam listeyi çekmiş oluyor; ipucu o yanıtın `counts` bloğunu
 *   **yeniden kullanır** ve ikinci istek çıkmaz.
 * - Başka rotalarda tam listeyi çekmek israf; hafif anahtar (`?limit=0`) yalnız sayaçları
 *   getirir.
 *
 * Ana Sayfa'nın "Sıradaki" kartı `homeQueryKeys.upcoming` anahtarında **kalır** ve kendi
 * ucunu kullanmaya devam eder; kabuk artık o anahtarı paylaşmıyor.
 */
export type NextEventClock = {
  /** Biçimlenmiş saat; yaklaşan etkinlik yoksa `null`. */
  readonly clock: string | null;
  /** Sorgu hata durumundaysa `true` → ipucu **render edilmez** (SPEC §2). */
  readonly hidden: boolean;
  /** O an canlı etkinlik var → ipucundan önce 6 px `--danger` nokta. */
  readonly live: boolean;
};

function readCountsFromCache(value: unknown): EventCounts | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const paged = value as { pages?: readonly EventsListResponse[] };

  if (Array.isArray(paged.pages)) {
    return paged.pages[0]?.counts ?? null;
  }

  return (value as EventsListResponse).counts ?? null;
}

/**
 * Açık olan ilk liste sorgusunun sayaç bloğu. Sayaçlar **filtresiz** (tuzak #3), yani hangi
 * sekmenin açık olduğu fark etmez: hepsi aynı sayıları taşır.
 */
export function selectCachedEventCounts(queryClient: QueryClient): EventCounts | null {
  for (const [, value] of queryClient.getQueriesData({ queryKey: eventsQueryKeys.lists })) {
    const counts = readCountsFromCache(value);

    if (counts) {
      return counts;
    }
  }

  return null;
}

/**
 * Hafif sayaç sorgusunun seçenekleri. Elde açık bir liste varsa sorgu **kapalıdır** —
 * `enabled: false` ile `fetch` hiç kurulmaz, ikinci istek çıkmaz.
 */
export function nextEventCountsQueryOptions(cached: EventCounts | null) {
  return {
    enabled: cached === null,
    queryFn: ({ signal }: { signal?: AbortSignal }) => fetchEventCounts(signal),
    queryKey: [...eventsQueryKeys.counts],
    staleTime: EVENTS_COUNTS_STALE_TIME_MS,
  };
}

export function selectNextEventClock(input: {
  readonly counts: EventCounts | null | undefined;
  readonly isError: boolean;
  readonly locale: string;
  readonly timeZone?: string;
}): NextEventClock {
  // Hata varken elde bayat bir sayaç olsa bile ipucu çizilmez: yanlış bir saat, saatsiz bir
  // satırdan daha kötüdür.
  if (input.isError) {
    return { clock: null, hidden: true, live: false };
  }

  const counts = input.counts ?? null;
  const startsAt = counts?.nextStartsAt ?? null;

  return {
    clock: startsAt ? formatEventClock(startsAt, input.locale, input.timeZone) : null,
    hidden: false,
    live: counts?.liveNow ?? false,
  };
}

export function useNextEventClock(): NextEventClock {
  const { locale } = useI18n();
  const { preferences } = useAccountPreferenceRuntime();
  const queryClient = useQueryClient();

  /**
   * Cache okuması aboneliktir: socket yaması (`use-events-realtime`) sayaçları yazdığında
   * ipucu da oynamalı. `useQuery` ile okunsaydı bu satır kendi anahtarını çekmeye kalkardı.
   */
  const subscribe = useCallback(
    (onStoreChange: () => void) => queryClient.getQueryCache().subscribe(onStoreChange),
    [queryClient],
  );
  const cached = useSyncExternalStore(
    subscribe,
    () => selectCachedEventCounts(queryClient),
    () => null,
  );

  const countsQuery = useQuery(nextEventCountsQueryOptions(cached));

  return selectNextEventClock({
    counts: cached ?? countsQuery.data ?? null,
    isError: countsQuery.isError,
    locale,
    timeZone: resolveAccountTimeZone(preferences.timeZone),
  });
}
