import { QueryClient } from "@tanstack/react-query";
import { MOBILE_MEMORY_QUERY_GC_TIME_MS } from "./mobile-query-cache-policy";

export function createMobileQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      mutations: {
        retry: 0,
      },
      queries: {
        /**
         * Half an hour, not a day.
         *
         * The day belongs to the five persisted roots, which pin it themselves —
         * a payload that survives the process is worthless if memory drops it
         * minutes later. Everything else, message streams included, had been
         * inheriting that day by default: a device measured 499MB PSS and 269MB
         * swap after one automation run, and every conversation the reader had
         * opened was still resident with every page it had ever paged in.
         */
        gcTime: MOBILE_MEMORY_QUERY_GC_TIME_MS,
        refetchOnReconnect: true,
        /**
         * A resume refreshes the screen the reader came back to, not the cache.
         *
         * Focus-driven refetching marked every stale query with an observer, and
         * the app comes back to a tree full of them. The provider invalidates the
         * active chat, its server and bootstrap instead; see `mobile-resume-refresh`.
         */
        refetchOnWindowFocus: false,
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
