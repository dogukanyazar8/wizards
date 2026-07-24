import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { QueryClient } from "@tanstack/react-query";

import type { MobileApiClient } from "../src/api/mobile-api-client";
import { mobileQueryKeys } from "../src/query/mobile-query-keys";
import {
  fetchMobileAccountSettings,
  getMobileAccountProfileCompletion,
  MOBILE_ACCOUNT_VISIBILITY_PREFERENCE_KEYS,
  persistMobileAccountVisibilityPreference,
  readMobileAccountVisibilityPreferences,
  updateMobileAccountSettings,
  writeMobileAccountVisibilityPreference,
} from "../src/account/mobile-account-settings-client";
import {
  optimisticallyPatchMobileAccountSettings,
  restoreMobileAccountSettings,
} from "../src/account/mobile-account-settings-query";

const accountSettings = {
  account: {
    bannerColor: null,
    bannerOffsetX: null,
    bannerOffsetY: null,
    bannerUrl: null,
    bio: "Building Whispr",
    customStatus: null,
    customStatusEmoji: null,
    customStatusExpiresAt: null,
    email: "ada@example.com",
    emailVerified: true,
    nextUsernameChangeAt: null,
    pronouns: null,
    twoFactorEnabled: false,
  },
  privacy: {
    dmPermission: "FRIENDS" as const,
    friendRequests: "MUTUAL_SERVERS" as const,
  },
};

function client(handler: (path: string, options?: unknown) => unknown): MobileApiClient {
  return {
    requestJson: async <TResponse>(path: string, options?: unknown) =>
      handler(path, options) as TResponse,
  };
}

describe("mobile account settings client", () => {
  it("loads and updates strict authenticated account settings", async () => {
    const calls: Array<[string, unknown]> = [];
    const api = client((path, options) => {
      calls.push([path, options]);
      return accountSettings;
    });

    assert.deepEqual(await fetchMobileAccountSettings(api), accountSettings);
    assert.deepEqual(
      await updateMobileAccountSettings(api, { friendRequests: "MUTUAL_FRIENDS" }),
      accountSettings,
    );
    assert.equal(calls[0]?.[0], "/api/v1/mobile/account/settings");
    assert.deepEqual(calls[1], [
      "/api/v1/mobile/account/settings",
      { body: { friendRequests: "MUTUAL_FRIENDS" }, method: "PATCH" },
    ]);

    await assert.rejects(() =>
      fetchMobileAccountSettings(client(() => ({ ...accountSettings, accessToken: "secret" }))),
    );
  });

  it("optimistically patches only requested privacy fields and restores them on failure", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(mobileQueryKeys.accountSettings(), accountSettings);

    const snapshot = optimisticallyPatchMobileAccountSettings(queryClient, {
      dmPermission: "NOBODY",
    });

    assert.deepEqual(queryClient.getQueryData(mobileQueryKeys.accountSettings()), {
      ...accountSettings,
      privacy: { ...accountSettings.privacy, dmPermission: "NOBODY" },
    });
    restoreMobileAccountSettings(snapshot);
    assert.deepEqual(queryClient.getQueryData(mobileQueryKeys.accountSettings()), accountSettings);
  });

  it("persists local visibility under stable whispr keys and fails closed on invalid values", async () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: async (key: string) => values.get(key) ?? null,
      setItem: async (key: string, value: string) => {
        values.set(key, value);
      },
    };

    assert.deepEqual(MOBILE_ACCOUNT_VISIBILITY_PREFERENCE_KEYS, {
      presence: "whispr.mobile.privacy-visibility.presence",
      profile: "whispr.mobile.privacy-visibility.profile",
    });
    await writeMobileAccountVisibilityPreference(storage, "profile", "FRIENDS");
    values.set(MOBILE_ACCOUNT_VISIBILITY_PREFERENCE_KEYS.presence, "unsupported");

    assert.deepEqual(await readMobileAccountVisibilityPreferences(storage), {
      presence: "EVERYONE",
      profile: "FRIENDS",
    });
  });

  it("rolls a local preference back when persistence fails", async () => {
    const changes: unknown[] = [];
    const current = { presence: "EVERYONE" as const, profile: "FRIENDS" as const };

    await assert.rejects(() =>
      persistMobileAccountVisibilityPreference({
        current,
        field: "profile",
        onChange: (value) => changes.push(value),
        storage: {
          getItem: async () => null,
          setItem: async () => {
            throw new Error("storage unavailable");
          },
        },
        value: "NOBODY",
      }),
    );
    assert.deepEqual(changes, [{ presence: "EVERYONE", profile: "NOBODY" }, current]);
  });

  it("calculates completion from the five real profile fields", () => {
    assert.equal(
      getMobileAccountProfileCompletion({
        avatarUrl: "https://cdn.example.com/avatar.png",
        bio: "Building Whispr",
        customStatus: null,
        displayName: "Ada",
        emailVerified: false,
      }),
      60,
    );
  });
});
