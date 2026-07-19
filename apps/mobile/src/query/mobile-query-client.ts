import { QueryClient } from "@tanstack/react-query";

export function createMobileQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      mutations: {
        retry: 0,
      },
      queries: {
        gcTime: 5 * 60_000,
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
