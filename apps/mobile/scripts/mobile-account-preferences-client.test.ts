import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { MobileApiClient } from "../src/api/mobile-api-client";
import {
  fetchMobileAccountPreferences,
  fetchMobileAccountPreferencesAndClearLegacy,
  updateMobileAccountPreferences,
} from "../src/account/mobile-account-preferences-client";

const preferences = {
  dateFormat: "LOCALE" as const,
  interfaceDensity: "COMFORTABLE" as const,
  presenceVisibility: "EVERYONE" as const,
  profileVisibility: "EVERYONE" as const,
  timeFormat: "LOCALE" as const,
  timeZone: "AUTO" as const,
};

function client(handler: (path: string, options?: unknown) => unknown): MobileApiClient {
  return {
    requestJson: async <TResponse>(path: string, options?: unknown) =>
      handler(path, options) as TResponse,
  };
}

describe("mobile account preferences client", () => {
  it("loads and updates the strict preference endpoint", async () => {
    const calls: Array<[string, unknown]> = [];
    const api = client((path, options) => {
      calls.push([path, options]);
      return preferences;
    });

    assert.deepEqual(await fetchMobileAccountPreferences(api), preferences);
    assert.deepEqual(
      await updateMobileAccountPreferences(api, { interfaceDensity: "COMPACT" }),
      preferences,
    );
    assert.deepEqual(calls, [
      ["/api/v1/mobile/account/preferences", undefined],
      [
        "/api/v1/mobile/account/preferences",
        { body: { interfaceDensity: "COMPACT" }, method: "PATCH" },
      ],
    ]);
  });

  it("rejects empty updates before making a request", async () => {
    let calls = 0;
    await assert.rejects(() =>
      updateMobileAccountPreferences(
        client(() => {
          calls += 1;
          return preferences;
        }),
        {},
      ),
    );
    assert.equal(calls, 0);
  });

  it("rejects malformed responses and preserves request failures", async () => {
    await assert.rejects(() =>
      fetchMobileAccountPreferences(client(() => ({ ...preferences, secret: "leak" }))),
    );
    const failure = new Error("network unavailable");
    await assert.rejects(
      () => fetchMobileAccountPreferences(client(() => Promise.reject(failure))),
      failure,
    );
  });

  it("clears legacy visibility only after a canonical server read succeeds", async () => {
    const removed: string[] = [];
    const storage = { removeItem: async (key: string) => void removed.push(key) };

    assert.deepEqual(
      await fetchMobileAccountPreferencesAndClearLegacy(
        client(() => preferences),
        storage,
      ),
      preferences,
    );
    assert.deepEqual(removed.sort(), [
      "whispr.mobile.privacy-visibility.presence",
      "whispr.mobile.privacy-visibility.profile",
    ]);

    removed.length = 0;
    await assert.rejects(() =>
      fetchMobileAccountPreferencesAndClearLegacy(
        client(() => Promise.reject(new Error("offline"))),
        storage,
      ),
    );
    assert.deepEqual(removed, []);
  });
});
