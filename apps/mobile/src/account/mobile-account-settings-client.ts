import {
  MOBILE_ACCOUNT_SETTINGS_FIELDS_HEADER,
  MOBILE_ACCOUNT_SETTINGS_READ_RECEIPTS_FIELD,
  MobileAccountSettingsResponseSchema,
  MobileAccountSettingsUpdateSchema,
  type MobileAccountSettingsUpdate,
} from "@wizards/types";

import type { MobileApiClient } from "../api/mobile-api-client";

export const MOBILE_ACCOUNT_SETTINGS_HEADERS = {
  [MOBILE_ACCOUNT_SETTINGS_FIELDS_HEADER]: MOBILE_ACCOUNT_SETTINGS_READ_RECEIPTS_FIELD,
};

export const MOBILE_ACCOUNT_VISIBILITY_PREFERENCE_KEYS = Object.freeze({
  presence: "whispr.mobile.privacy-visibility.presence",
  profile: "whispr.mobile.privacy-visibility.profile",
});

export type MobileAccountLocalVisibility = "EVERYONE" | "FRIENDS" | "NOBODY";
export type MobileAccountLocalVisibilityField =
  keyof typeof MOBILE_ACCOUNT_VISIBILITY_PREFERENCE_KEYS;

export interface MobileAccountVisibilityStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

export interface MobileAccountLocalVisibilityPreferences {
  readonly presence: MobileAccountLocalVisibility;
  readonly profile: MobileAccountLocalVisibility;
}

const DEFAULT_LOCAL_VISIBILITY: MobileAccountLocalVisibilityPreferences = Object.freeze({
  presence: "EVERYONE",
  profile: "EVERYONE",
});

function normalizeLocalVisibility(value: string | null): MobileAccountLocalVisibility {
  return value === "FRIENDS" || value === "NOBODY" ? value : "EVERYONE";
}

export async function fetchMobileAccountSettings(client: MobileApiClient) {
  return MobileAccountSettingsResponseSchema.parse(
    await client.requestJson("/api/v1/mobile/account/settings", {
      headers: MOBILE_ACCOUNT_SETTINGS_HEADERS,
    }),
  );
}

export async function updateMobileAccountSettings(
  client: MobileApiClient,
  input: MobileAccountSettingsUpdate,
) {
  const body = MobileAccountSettingsUpdateSchema.parse(input);
  return MobileAccountSettingsResponseSchema.parse(
    await client.requestJson("/api/v1/mobile/account/settings", {
      body,
      headers: MOBILE_ACCOUNT_SETTINGS_HEADERS,
      method: "PATCH",
    }),
  );
}

export async function readMobileAccountVisibilityPreferences(
  storage: MobileAccountVisibilityStorage,
): Promise<MobileAccountLocalVisibilityPreferences> {
  const [presence, profile] = await Promise.all([
    storage.getItem(MOBILE_ACCOUNT_VISIBILITY_PREFERENCE_KEYS.presence),
    storage.getItem(MOBILE_ACCOUNT_VISIBILITY_PREFERENCE_KEYS.profile),
  ]);

  return {
    presence: normalizeLocalVisibility(presence),
    profile: normalizeLocalVisibility(profile),
  };
}

export async function writeMobileAccountVisibilityPreference(
  storage: MobileAccountVisibilityStorage,
  field: MobileAccountLocalVisibilityField,
  value: MobileAccountLocalVisibility,
): Promise<void> {
  await storage.setItem(MOBILE_ACCOUNT_VISIBILITY_PREFERENCE_KEYS[field], value);
}

export async function persistMobileAccountVisibilityPreference(input: {
  readonly current: MobileAccountLocalVisibilityPreferences;
  readonly field: MobileAccountLocalVisibilityField;
  readonly onChange: (value: MobileAccountLocalVisibilityPreferences) => void;
  readonly storage: MobileAccountVisibilityStorage;
  readonly value: MobileAccountLocalVisibility;
}): Promise<void> {
  input.onChange({ ...input.current, [input.field]: input.value });
  try {
    await writeMobileAccountVisibilityPreference(input.storage, input.field, input.value);
  } catch (error) {
    input.onChange(input.current);
    throw error;
  }
}

export function getMobileAccountProfileCompletion(input: {
  readonly avatarUrl: string | null | undefined;
  readonly bio: string | null | undefined;
  readonly customStatus: string | null | undefined;
  readonly displayName: string | null | undefined;
  readonly emailVerified: boolean | null | undefined;
}): number {
  const completed =
    [input.avatarUrl, input.displayName, input.bio, input.customStatus].filter(
      (value) => typeof value === "string" && value.trim().length > 0,
    ).length + (input.emailVerified === true ? 1 : 0);

  return completed * 20;
}

export { DEFAULT_LOCAL_VISIBILITY };
