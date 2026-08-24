"use client";

import React, { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useQueryClient, type InfiniteData } from "@tanstack/react-query";
import type { DiscoverCategory, DiscoverQuery } from "@wizards/types";
import { useRouter, useSearchParams } from "next/navigation";

import { DiscoverSidebar } from "@/components/discover/discover-sidebar";
import { discoverQueryKeys, type DiscoverServerClientPage } from "@/lib/discover/client";
import { DISCOVER_METRICS } from "@/lib/discover/metrics";
import { useDiscoverPageSize } from "@/lib/discover/scale";
import {
  buildDiscoverHref,
  parseDiscoverRoute,
  type DiscoverRouteState,
} from "@/lib/discover/routes";

/** `useInfiniteQuery` zarfından rayı besleyen tek kategori nesnesini okur. */
export function readDiscoverCachedCategories(
  cached: InfiniteData<DiscoverServerClientPage> | undefined,
): readonly DiscoverCategory[] | null {
  return cached?.pages[0]?.categories ?? null;
}

/** URL, Keşfet durumunun tek kaynağıdır; tanınmayan değerler ayrıştırıcıda düşer. */
export function useDiscoverRouteState(): DiscoverRouteState {
  const searchParams = useSearchParams();
  return useMemo(() => parseDiscoverRoute(searchParams), [searchParams]);
}

function toServerQuery(routeState: DiscoverRouteState): DiscoverQuery {
  const query: DiscoverQuery = {
    category: routeState.category,
    lane: "servers",
    sort: routeState.sort,
  };

  return routeState.q.length > 0 ? { ...query, q: routeState.q } : query;
}

/**
 * Keşfet rayını kabuğa bağlar. Yeni sorgu açmaz: mevcut sunucu sayfasını
 * `getQueryData` ile okur, cache bildirimine abone olur. Izgara geç bitse bile sayaçlar
 * sonradan belirir; ikinci HTTP isteği oluşmaz.
 */
export function DiscoverRailContainer() {
  const queryClient = useQueryClient();
  const routeState = useDiscoverRouteState();
  const router = useRouter();
  const pageSize = useDiscoverPageSize();
  const query = useMemo(() => toServerQuery(routeState), [routeState]);
  const queryKey = useMemo(() => discoverQueryKeys.servers(query, pageSize), [pageSize, query]);

  const subscribe = useCallback(
    (notify: () => void) => queryClient.getQueryCache().subscribe(notify),
    [queryClient],
  );
  const getSnapshot = useCallback(
    () => queryClient.getQueryData<InfiniteData<DiscoverServerClientPage>>(queryKey),
    [queryClient, queryKey],
  );
  const cached = useSyncExternalStore(subscribe, getSnapshot, () => undefined);
  const categories = readDiscoverCachedCategories(cached);
  const [pendingQuery, setPendingQuery] = useState<string | null>(null);

  useEffect(() => {
    if (pendingQuery === null) {
      return;
    }

    const timer = setTimeout(() => {
      router.replace(buildDiscoverHref({ q: pendingQuery }, routeState), { scroll: false });
      setPendingQuery(null);
    }, DISCOVER_METRICS.transitions.searchDebounce);

    return () => clearTimeout(timer);
  }, [pendingQuery, routeState, router]);

  return (
    <DiscoverSidebar
      categories={categories}
      onQueryChange={setPendingQuery}
      routeState={routeState}
    />
  );
}
