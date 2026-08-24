"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";

import {
  MentionsSidebar,
  buildMentionSourceRows,
  type MentionSourceInput,
} from "@/components/mentions/mentions-sidebar";
import { useI18n } from "@/components/providers/locale-provider";
import { useToast } from "@/hooks/use-toast";
import { homeQueryKeys } from "@/lib/home/client";
import {
  MENTIONS_STALE_TIME_MS,
  fetchMentionCounts,
  markAllMentionsRead,
  mentionsQueryKeys,
  undoMarkAllMentionsRead,
} from "@/lib/mentions/client";
import { buildMentionsHref, parseMentionsRouteState } from "@/lib/mentions/routes";

/**
 * Bahsetme rayının veri katmanı — SPEC §3.
 *
 * Ray ile akış **bağımsız** yüklenir: kabuk rayı üçüncü sütuna yerleştirir, veriyi bu bileşen
 * çeker. Akış sorgusu askıdayken ray dolu durur, çünkü ikisi ayrı isteklerdir ve rayın filtre
 * satırları listenin gelmesini beklemek zorunda değil.
 *
 * Durum React state'inde değil **URL**'de: filtre, kaynak, arama ve modal adres çubuğundan
 * okunur. Bu bileşenin tek yazdığı yer arama kutusu, ve o da `router.replace` ile — her tuş
 * vuruşu bir geçmiş kaydı olsaydı geri tuşu harf harf geri sarardı.
 */

/**
 * SPEC §3. Tuş başına `router.replace` hem geçmiş yığınını hem de Ş3'ün `ILIKE` sorgusunu
 * çöpe çevirirdi; 250ms yazmayı bitiren eli bekler.
 */
export const MENTIONS_SEARCH_DEBOUNCE_MS = 250;

export type MentionsRailContainerProps = {
  /** Kaynak satırlarının adı ve baş harfi; kabuk bu listeyi zaten çekiyor. */
  servers: readonly MentionSourceInput[];
  /** K9 — gerçek `@username`. */
  username: string;
};

export function MentionsRailContainer({ servers, username }: MentionsRailContainerProps) {
  const { t } = useI18n();
  const { show } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const routeState = useMemo(() => parseMentionsRouteState(searchParams), [searchParams]);

  const countsQuery = useQuery({
    queryFn: () => fetchMentionCounts(routeState.window),
    queryKey: mentionsQueryKeys.counts(routeState.window),
    refetchOnWindowFocus: false,
    staleTime: MENTIONS_STALE_TIME_MS.counts,
  });

  /**
   * Ray rozeti ile gezinme paneli rozeti aynı sayıyı gösterir; ikisi de kendi sorgusundan
   * tazelenir, birinin sonucu diğerine elle kopyalanmaz.
   */
  const refreshCounters = useCallback(
    () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: mentionsQueryKeys.root }),
        queryClient.invalidateQueries({ queryKey: homeQueryKeys.summary }),
      ]),
    [queryClient],
  );

  const undoReadAll = useMutation({
    mutationFn: (undoToken: string) => undoMarkAllMentionsRead(undoToken),
    onSettled: () => void refreshCounters(),
  });

  /**
   * K11: bu uç **yalnız bahsetmeleri** okur; bugünkü genel `markAllNotificationsRead` bu
   * ekranda çağrılmaz. Dönen `undoToken` 10 dakika geçerli ve `Geri al` toast'ı onu taşır —
   * jeton atılsaydı geri alınabilir bir eylem geri alınamaz olurdu.
   */
  const markAll = useMutation({
    mutationFn: markAllMentionsRead,
    onSuccess: async (result) => {
      await refreshCounters();

      if (result.affected === 0) {
        return;
      }

      show({
        ...(result.undoToken
          ? {
              action: {
                label: t("mentions.toast.undo"),
                onAct: () => undoReadAll.mutate(result.undoToken),
              },
            }
          : {}),
        message: t("mentions.toast.readAll", { count: result.affected }),
      });
    },
  });

  const [pendingQuery, setPendingQuery] = useState<string | null>(null);

  useEffect(() => {
    if (pendingQuery === null) {
      return;
    }

    const timer = setTimeout(() => {
      const trimmed = pendingQuery.trim();

      router.replace(
        buildMentionsHref({
          ...routeState,
          // Bağlam paneli tek bir bahsetmeye bağlı; arama o bahsetmeyi listeden
          // çıkarabilir ve dayanağı olmayan bir panel açık kalırdı.
          panel: null,
          query: trimmed.length > 0 ? trimmed : null,
        }),
        { scroll: false },
      );
      setPendingQuery(null);
    }, MENTIONS_SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [pendingQuery, routeState, router]);

  const counts = countsQuery.data ?? null;
  const sources = useMemo(
    () => buildMentionSourceRows(counts, servers, t("mentions.sidebar.dmSource")),
    [counts, servers, t],
  );

  return (
    <MentionsSidebar
      counts={counts}
      countsLoading={countsQuery.isLoading}
      markAllPending={markAll.isPending}
      onMarkAllRead={() => markAll.mutate()}
      onQueryChange={setPendingQuery}
      roleNames={counts?.roleNames ?? []}
      routeState={routeState}
      sources={sources}
      username={username}
    />
  );
}
