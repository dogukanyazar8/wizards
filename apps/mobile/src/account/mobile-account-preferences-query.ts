import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import type { AccountPreferences, AccountPreferencesPatch } from "@wizards/types";

import type { MobileApiClient } from "../api/mobile-api-client";
import { mobileQueryKeys } from "../query/mobile-query-keys";
import {
  fetchMobileAccountPreferencesAndClearLegacy,
  updateMobileAccountPreferences,
} from "./mobile-account-preferences-client";

interface MobileAccountPreferencesSnapshot {
  readonly data: AccountPreferences | undefined;
  readonly queryClient: QueryClient;
}

export function getMobileAccountPreferencesQueryOptions(client: MobileApiClient, enabled = true) {
  return queryOptions({
    enabled,
    queryFn: () => fetchMobileAccountPreferencesAndClearLegacy(client, AsyncStorage),
    queryKey: mobileQueryKeys.accountPreferences(),
    staleTime: 30_000,
  });
}

export function useMobileAccountPreferencesQuery(client: MobileApiClient, enabled = true) {
  return useQuery(getMobileAccountPreferencesQueryOptions(client, enabled));
}

export function useMobileAccountPreferencesMutation(client: MobileApiClient) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: AccountPreferencesPatch) => updateMobileAccountPreferences(client, input),
    onError: (_error, _input, snapshot: MobileAccountPreferencesSnapshot | undefined) => {
      if (snapshot) {
        snapshot.queryClient.setQueryData(mobileQueryKeys.accountPreferences(), snapshot.data);
      }
    },
    onMutate: async (input): Promise<MobileAccountPreferencesSnapshot> => {
      await queryClient.cancelQueries({ queryKey: mobileQueryKeys.accountPreferences() });
      const data = queryClient.getQueryData<AccountPreferences>(
        mobileQueryKeys.accountPreferences(),
      );
      queryClient.setQueryData<AccountPreferences | undefined>(
        mobileQueryKeys.accountPreferences(),
        (current) =>
          current
            ? {
                ...current,
                ...(input.dateFormat !== undefined ? { dateFormat: input.dateFormat } : {}),
                ...(input.interfaceDensity !== undefined
                  ? { interfaceDensity: input.interfaceDensity }
                  : {}),
                ...(input.presenceVisibility !== undefined
                  ? { presenceVisibility: input.presenceVisibility }
                  : {}),
                ...(input.profileVisibility !== undefined
                  ? { profileVisibility: input.profileVisibility }
                  : {}),
                ...(input.timeFormat !== undefined ? { timeFormat: input.timeFormat } : {}),
                ...(input.timeZone !== undefined ? { timeZone: input.timeZone } : {}),
              }
            : current,
      );
      return { data, queryClient };
    },
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: mobileQueryKeys.accountPreferences() }),
    onSuccess: (preferences) => {
      queryClient.setQueryData(mobileQueryKeys.accountPreferences(), preferences);
    },
  });
}
