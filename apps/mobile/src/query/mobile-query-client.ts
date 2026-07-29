import { QueryClient } from "@tanstack/react-query";
import { MOBILE_QUERY_CACHE_MAX_AGE_MS } from "./mobile-query-cache-policy";

export function createMobileQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      mutations: {
        retry: 0,
      },
      queries: {
        // Matches the persisted cache max-age: a query that outlives the process
        // is worthless if the in-memory cache garbage-collects it minutes later.
        gcTime: MOBILE_QUERY_CACHE_MAX_AGE_MS,
        refetchOnReconnect: true,
        // One retry recovers transient blips without stacking exponential
        // backoff (retry:2 delayed a hard failure ~3s before the error/skeleton
        // exit on a slow UAT backend). Cap the single retry delay at 2s.
        retry: 1,
        retryDelay: (attempt) => Math.min(1_000 * 2 ** attempt, 2_000),
        staleTime: 15_000,
      },
    },
  });
}
