import {
  AccountPreferencesPatchSchema,
  AccountPreferencesSchema,
  type AccountPreferencesPatch,
} from "@wizards/types";

import type { MobileApiClient } from "../api/mobile-api-client";
import { MOBILE_ACCOUNT_VISIBILITY_PREFERENCE_KEYS } from "./mobile-account-settings-client";

const ACCOUNT_PREFERENCES_PATH = "/api/v1/mobile/account/preferences";

export async function fetchMobileAccountPreferences(client: MobileApiClient) {
  return AccountPreferencesSchema.parse(await client.requestJson(ACCOUNT_PREFERENCES_PATH));
}

export async function fetchMobileAccountPreferencesAndClearLegacy(
  client: MobileApiClient,
  storage: { removeItem(key: string): Promise<void> },
) {
  const preferences = await fetchMobileAccountPreferences(client);
  await Promise.allSettled(
    Object.values(MOBILE_ACCOUNT_VISIBILITY_PREFERENCE_KEYS).map((key) => storage.removeItem(key)),
  );
  return preferences;
}

export async function updateMobileAccountPreferences(
  client: MobileApiClient,
  input: AccountPreferencesPatch,
) {
  const body = AccountPreferencesPatchSchema.parse(input);
  return AccountPreferencesSchema.parse(
    await client.requestJson(ACCOUNT_PREFERENCES_PATH, { body, method: "PATCH" }),
  );
}
