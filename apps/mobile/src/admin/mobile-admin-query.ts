import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  MobileAdminCaseClaimResponse,
  MobileAdminCaseDismissResponse,
  MobileAdminCaseEscalateResponse,
} from "@wizards/types";

import type { MobileApiClient } from "../api/mobile-api-client";
import { mobileQueryKeys } from "../query/mobile-query-keys";
import {
  claimMobileAdminCase,
  dismissMobileAdminCase,
  escalateMobileAdminCase,
  fetchMobileAdminCase,
  fetchMobileAdminCases,
} from "./mobile-admin-client";

/**
 * The queue is short-lived data: another moderator claiming a case changes what
 * this screen should offer, so it refetches on focus rather than trusting a
 * cached page. Offline, the cache is still what the screen renders — it is only
 * the action buttons that go dead.
 */
export function useMobileAdminCasesQuery(client: MobileApiClient, enabled: boolean) {
  return useQuery({
    enabled,
    queryFn: () => fetchMobileAdminCases(client),
    queryKey: mobileQueryKeys.adminCases(),
    staleTime: 15_000,
  });
}

export function useMobileAdminCaseQuery(
  client: MobileApiClient,
  caseId: string | null,
  enabled: boolean,
) {
  return useQuery({
    enabled: enabled && caseId !== null,
    queryFn: () => fetchMobileAdminCase(client, caseId ?? ""),
    queryKey: mobileQueryKeys.adminCase(caseId ?? ""),
    staleTime: 15_000,
  });
}

/**
 * Every action invalidates both the case file and the queue behind it. There is
 * no optimistic write here on purpose: a claim can lose the race to another
 * moderator, and showing "senin" before the server agreed would be a lie the
 * next refetch has to take back.
 */
function useMobileAdminCaseInvalidation(caseId: string) {
  const queryClient = useQueryClient();

  return async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: mobileQueryKeys.adminCase(caseId) }),
      queryClient.invalidateQueries({ queryKey: mobileQueryKeys.adminCases() }),
    ]);
  };
}

export function useMobileAdminClaimMutation(client: MobileApiClient, caseId: string) {
  const invalidate = useMobileAdminCaseInvalidation(caseId);

  return useMutation<MobileAdminCaseClaimResponse, Error, void>({
    mutationFn: () => claimMobileAdminCase(client, caseId),
    onSuccess: invalidate,
  });
}

export function useMobileAdminDismissMutation(client: MobileApiClient, caseId: string) {
  const invalidate = useMobileAdminCaseInvalidation(caseId);

  return useMutation<MobileAdminCaseDismissResponse, Error, string>({
    mutationFn: (resolution) => dismissMobileAdminCase(client, caseId, resolution),
    onSuccess: invalidate,
  });
}

export function useMobileAdminEscalateMutation(client: MobileApiClient, caseId: string) {
  const invalidate = useMobileAdminCaseInvalidation(caseId);

  return useMutation<MobileAdminCaseEscalateResponse, Error, string | undefined>({
    mutationFn: (note) => escalateMobileAdminCase(client, caseId, note),
    onSuccess: invalidate,
  });
}
