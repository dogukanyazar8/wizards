import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_MOBILE_LOCALE,
  MOBILE_LOCALE_OPTIONS,
  MOBILE_LOCALE_STORAGE_KEY,
  activeMobileCopy,
  loadMobileLocalePreference,
  normalizeMobileLocale,
  saveMobileLocalePreference,
  setActiveMobileLocale,
  type MobileLocalePreferenceStorage,
} from "../src/locale/mobile-locale-preferences";

function createMemoryStorage(
  initialValue: string | null = null,
): MobileLocalePreferenceStorage & { value: string | null } {
  return {
    value: initialValue,
    async getItemAsync(key) {
      assert.equal(key, MOBILE_LOCALE_STORAGE_KEY);
      return this.value;
    },
    async setItemAsync(key, value) {
      assert.equal(key, MOBILE_LOCALE_STORAGE_KEY);
      this.value = value;
    },
  };
}

describe("mobile locale preferences", () => {
  it("normalizes mobile locale values fail-closed to Turkish", () => {
    assert.equal(DEFAULT_MOBILE_LOCALE, "tr");
    assert.deepEqual(MOBILE_LOCALE_OPTIONS.map((option) => option.id), ["tr", "en"]);
    assert.equal(normalizeMobileLocale("tr"), "tr");
    assert.equal(normalizeMobileLocale("en"), "en");
    assert.equal(normalizeMobileLocale("de"), "tr");
    assert.equal(normalizeMobileLocale(undefined), "tr");
  });

  it("loads and saves the mobile language preference without exposing session data", async () => {
    const storage = createMemoryStorage("en");

    assert.equal(await loadMobileLocalePreference(storage), "en");
    await saveMobileLocalePreference(storage, "tr");

    assert.equal(storage.value, "tr");
    assert.equal(await loadMobileLocalePreference(createMemoryStorage("unsafe")), "tr");
  });

  it("drives the active mobile copy from the selected locale", () => {
    setActiveMobileLocale("en");
    assert.equal(activeMobileCopy.settingsTitle, "Settings");

    setActiveMobileLocale("tr");
    assert.equal(activeMobileCopy.settingsTitle, "Ayarlar");
  });
});
