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
        retry: 2,
        staleTime: 15_000,
      },
    },
  });
}
