import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import type {
  MobileAccountSettingsResponse,
  MobileAccountSettingsUpdate,
  MobilePasswordChangeRequest,
} from "@wizards/types";

import type { MobileApiClient } from "../api/mobile-api-client";
import { mobileQueryKeys } from "../query/mobile-query-keys";
import { changeMobilePassword } from "./mobile-account-password-client";
import {
  fetchMobileAccountSettings,
  updateMobileAccountSettings,
} from "./mobile-account-settings-client";

export interface MobileAccountSettingsSnapshot {
  readonly data: MobileAccountSettingsResponse | undefined;
  readonly queryClient: QueryClient;
}

export function getMobileAccountSettingsQueryOptions(client: MobileApiClient, enabled = true) {
  return queryOptions({
    enabled,
    queryFn: () => fetchMobileAccountSettings(client),
    queryKey: mobileQueryKeys.accountSettings(),
    staleTime: 30_000,
  });
}

export function useMobileAccountSettingsQuery(client: MobileApiClient, enabled = true) {
  return useQuery(getMobileAccountSettingsQueryOptions(client, enabled));
}

export function optimisticallyPatchMobileAccountSettings(
  queryClient: QueryClient,
  input: MobileAccountSettingsUpdate,
): MobileAccountSettingsSnapshot {
  const queryKey = mobileQueryKeys.accountSettings();
  const data = queryClient.getQueryData<MobileAccountSettingsResponse>(queryKey);

  queryClient.setQueryData<MobileAccountSettingsResponse>(queryKey, (current) =>
    current
      ? {
          ...current,
          privacy: {
            ...current.privacy,
            ...(input.dmPermission !== undefined ? { dmPermission: input.dmPermission } : {}),
            ...(input.friendRequests !== undefined ? { friendRequests: input.friendRequests } : {}),
          },
        }
      : current,
  );

  return { data, queryClient };
}

export function restoreMobileAccountSettings(snapshot: MobileAccountSettingsSnapshot): void {
  snapshot.queryClient.setQueryData(mobileQueryKeys.accountSettings(), snapshot.data);
}

/**
 * The password endpoint revokes web sessions only, so the caller's mobile session
 * stays valid and no cache beyond the account settings needs to be reset.
 */
export function useMobileChangePasswordMutation(client: MobileApiClient) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: MobilePasswordChangeRequest) => changeMobilePassword(client, input),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: mobileQueryKeys.accountSettings() }),
  });
}

export function useMobileAccountSettingsMutation(client: MobileApiClient) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: MobileAccountSettingsUpdate) => updateMobileAccountSettings(client, input),
    onError: (_error, _input, snapshot: MobileAccountSettingsSnapshot | undefined) => {
      if (snapshot) {
        restoreMobileAccountSettings(snapshot);
      }
    },
    onMutate: async (input): Promise<MobileAccountSettingsSnapshot> => {
      await queryClient.cancelQueries({ queryKey: mobileQueryKeys.accountSettings() });
      return optimisticallyPatchMobileAccountSettings(queryClient, input);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: mobileQueryKeys.accountSettings() }),
    onSuccess: (settings) => {
      queryClient.setQueryData(mobileQueryKeys.accountSettings(), settings);
    },
  });
}
