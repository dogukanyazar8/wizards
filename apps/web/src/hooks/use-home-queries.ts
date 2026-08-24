"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import { fetchFriends, friendsQueryKeys } from "@/lib/friends/client";
import type { FriendDto } from "@/lib/friends/types";
import {
  HOME_STALE_TIME_MS,
  fetchHomeAwaiting,
  fetchHomeLiveRooms,
  fetchHomeRecent,
  fetchHomeSummary,
  fetchHomeUpcomingEvents,
  homeQueryKeys,
} from "@/lib/home/client";
import { selectHomeDensity, type HomeDensity } from "@/lib/home/density";
import type {
  AppAwaitingResponse,
  AppRecentResponse,
  AppSummaryResponse,
  EventsUpcomingResponse,
  VoiceLiveResponse,
} from "@/lib/home/types";

import { useUiScaleStep } from "./use-ui-scale-step";

/**
 * Ana Sayfa'nın veri katmanı — `05-faz4-anasayfa-izgara-kartlar.md` §5.
 *
 * **Altı ayrı sorgu, tek `Promise.all` yok, tek `Suspense` sınırı yok.** Bir kart geciktiğinde
 * diğerleri beklemez; bir kart hata verdiğinde diğer beşi çalışmaya devam eder. Hata kartın
 * içinde tek satır olarak durur, ekranı düşüren bir error boundary yoktur.
 *
 * Satır sayıları (`limit`) ölçek adımından gelir (§6): adım değişince sorgu anahtarı değişir ve
 * sunucudan **doğru sayıda** satır istenir; istemcide ikinci bir kırpma yapılmaz.
 *
 * Arkadaş listesi tek istisnadır: `GET /api/v1/friends` bir Faz 3 ucu değil, presence'a göre
 * sıralamıyor ve şeridin başlığı zaten toplam sayıyı istiyor. Filtreleme ve kesme şeritte yapılır.
 */

export type HomeCardState<TData> =
  | { readonly status: "error"; readonly retry: () => void }
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly data: TData };

/**
 * Sorgu sonucunu kartın anladığı üç duruma indirger.
 *
 * Elde veri varken hata gelirse kart **veriyi göstermeye devam eder**: bayat bir satır, boş bir
 * karttan iyidir ve tazeleme zaten arka planda yeniden denenir.
 */
export function toHomeCardState<TData>(
  query: Pick<UseQueryResult<TData>, "data" | "isError" | "refetch">,
): HomeCardState<TData> {
  if (query.data !== undefined) {
    return { data: query.data, status: "ready" };
  }

  if (query.isError) {
    return {
      retry: () => {
        void query.refetch();
      },
      status: "error",
    };
  }

  return { status: "loading" };
}

/** Arkadaş listesinin kendi tazelik penceresi; presence zaten soketten yamalanıyor. */
export const HOME_FRIENDS_STALE_TIME_MS = 30_000;

export type HomeQueries = {
  readonly awaiting: HomeCardState<AppAwaitingResponse>;
  readonly density: HomeDensity;
  readonly friends: HomeCardState<FriendDto[]>;
  readonly live: HomeCardState<VoiceLiveResponse>;
  readonly recent: HomeCardState<AppRecentResponse>;
  readonly summary: HomeCardState<AppSummaryResponse>;
  readonly upcoming: HomeCardState<EventsUpcomingResponse>;
};

export function useHomeQueries(): HomeQueries {
  const density = selectHomeDensity(useUiScaleStep());

  const summary = useQuery({
    queryFn: fetchHomeSummary,
    queryKey: homeQueryKeys.summary,
    staleTime: HOME_STALE_TIME_MS.summary,
  });

  const recent = useQuery({
    queryFn: () => fetchHomeRecent(density.recent),
    queryKey: homeQueryKeys.recent(density.recent),
    staleTime: HOME_STALE_TIME_MS.recent,
  });

  const live = useQuery({
    queryFn: () => fetchHomeLiveRooms(density.live),
    queryKey: homeQueryKeys.live(density.live),
    staleTime: HOME_STALE_TIME_MS.live,
  });

  const awaiting = useQuery({
    queryFn: () => fetchHomeAwaiting(density.awaiting),
    queryKey: homeQueryKeys.awaiting(density.awaiting),
    staleTime: HOME_STALE_TIME_MS.awaiting,
  });

  const upcoming = useQuery({
    queryFn: () => fetchHomeUpcomingEvents(density.upcoming),
    queryKey: homeQueryKeys.upcoming(density.upcoming),
    staleTime: HOME_STALE_TIME_MS.upcoming,
  });

  const friends = useQuery({
    queryFn: fetchFriends,
    queryKey: friendsQueryKeys.list,
    staleTime: HOME_FRIENDS_STALE_TIME_MS,
  });

  return {
    awaiting: toHomeCardState(awaiting),
    density,
    friends: toHomeCardState(friends),
    live: toHomeCardState(live),
    recent: toHomeCardState(recent),
    summary: toHomeCardState(summary),
    upcoming: toHomeCardState(upcoming),
  };
}
