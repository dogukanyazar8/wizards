import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { MobileApiClient } from "../api/mobile-api-client";
import { mobileQueryKeys } from "../query/mobile-query-keys";
import {
  fetchMobileAuthSessions,
  revokeMobileAuthSession,
  revokeOtherMobileAuthSessions,
} from "./mobile-auth-sessions-client";

export function useMobileAuthSessionsQuery(client: MobileApiClient, enabled = true) {
  return useQuery({
    enabled,
    queryFn: () => fetchMobileAuthSessions(client),
    queryKey: mobileQueryKeys.authSessions(),
    staleTime: 30_000,
  });
}

export function useRevokeMobileAuthSessionMutation(client: MobileApiClient) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) => revokeMobileAuthSession(client, sessionId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: mobileQueryKeys.authSessions() }),
  });
}

export function useRevokeOtherMobileAuthSessionsMutation(client: MobileApiClient) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => revokeOtherMobileAuthSessions(client),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: mobileQueryKeys.authSessions() }),
  });
}
