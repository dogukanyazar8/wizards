import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";

import {
  MOBILE_ABOUT_DEFAULT_PREFERENCES,
  MOBILE_ABOUT_PREFERENCE_KEYS,
  readMobileAboutPreferences,
  writeMobileAboutPreference,
  type MobileAboutPreferenceStorage,
} from "../src/about/mobile-about-preferences";

function createStorage(values: Record<string, string> = {}) {
  const store = new Map(Object.entries(values));
  const multiGet = mock.fn(async (keys: readonly string[]) =>
    keys.map((key) => [key, store.get(key) ?? null] as const),
  );
  const removeItem = mock.fn(async (key: string) => {
    store.delete(key);
  });
  const setItem = mock.fn(async (key: string, value: string) => {
    store.set(key, value);
  });

  return { multiGet, removeItem, setItem, storage: { multiGet, removeItem, setItem }, store };
}

describe("about preferences", () => {
  it("keeps PROMPT.md §5's key names", () => {
    assert.deepEqual(MOBILE_ABOUT_PREFERENCE_KEYS, {
      autoUpdate: "whispr.settings.autoUpdate",
      betaConsentAt: "whispr.settings.betaConsentAt",
      channel: "whispr.settings.channel",
      rateSnoozedUntil: "whispr.rate.snoozedUntil",
      rateSubmittedVersion: "whispr.rate.submittedVersion",
      releaseNotify: "whispr.settings.releaseNotify",
      seenVersion: "whispr.about.seenVersion",
      skippedVersion: "whispr.update.skippedVersion",
    });
  });

  it("reads all eight keys in a single bridge round trip", async () => {
    const harness = createStorage({
      "whispr.about.seenVersion": "0.8.15",
      "whispr.settings.autoUpdate": "false",
      "whispr.settings.channel": "beta",
      "whispr.settings.releaseNotify": "true",
    });

    const preferences = await readMobileAboutPreferences(harness.storage);

    assert.equal(harness.multiGet.mock.callCount(), 1, "eight getItem calls would be eight trips");
    assert.equal(harness.multiGet.mock.calls[0]?.arguments[0]?.length, 8);
    assert.equal(preferences.autoUpdate, false);
    assert.equal(preferences.channel, "beta");
    assert.equal(preferences.releaseNotify, true);
    assert.equal(preferences.seenVersion, "0.8.15");
  });

  it("defaults automatic updates on and release notifications off", async () => {
    const preferences = await readMobileAboutPreferences(createStorage().storage);

    assert.deepEqual(preferences, MOBILE_ABOUT_DEFAULT_PREFERENCES);
    assert.equal(preferences.autoUpdate, true);
    assert.equal(preferences.releaseNotify, false);
  });

  it("falls back to the default when a stored value is corrupt", async () => {
    const preferences = await readMobileAboutPreferences(
      createStorage({
        "whispr.about.seenVersion": "   ",
        "whispr.rate.snoozedUntil": "yesterday",
        "whispr.settings.autoUpdate": "yes-please",
        "whispr.settings.channel": "nightly",
        "whispr.settings.releaseNotify": "enabled",
      }).storage,
    );

    assert.equal(preferences.autoUpdate, true);
    assert.equal(preferences.channel, null);
    assert.equal(preferences.releaseNotify, false);
    assert.equal(preferences.seenVersion, null);
    // A timestamp that will not parse must not be read as "snoozed forever".
    assert.equal(preferences.rateSnoozedUntil, null);
  });

  it("survives a storage that throws instead of blocking the screen", async () => {
    const storage: MobileAboutPreferenceStorage = {
      multiGet: async () => {
        throw new Error("storage unavailable");
      },
      removeItem: async () => undefined,
      setItem: async () => undefined,
    };

    assert.deepEqual(await readMobileAboutPreferences(storage), MOBILE_ABOUT_DEFAULT_PREFERENCES);
  });

  it("writes booleans as text and clears a key rather than storing null", async () => {
    const harness = createStorage();

    await writeMobileAboutPreference(harness.storage, "autoUpdate", false);
    await writeMobileAboutPreference(harness.storage, "releaseNotify", true);
    await writeMobileAboutPreference(harness.storage, "seenVersion", "0.8.15");
    await writeMobileAboutPreference(harness.storage, "skippedVersion", null);

    assert.deepEqual(harness.setItem.mock.calls[0]?.arguments, [
      "whispr.settings.autoUpdate",
      "false",
    ]);
    assert.deepEqual(harness.setItem.mock.calls[1]?.arguments, [
      "whispr.settings.releaseNotify",
      "true",
    ]);
    assert.deepEqual(harness.setItem.mock.calls[2]?.arguments, [
      "whispr.about.seenVersion",
      "0.8.15",
    ]);
    assert.deepEqual(harness.removeItem.mock.calls[0]?.arguments, ["whispr.update.skippedVersion"]);
    assert.equal(harness.store.has("whispr.update.skippedVersion"), false);
  });
});
