import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DEFAULT_MOBILE_NOTIFICATION_PREFERENCES,
  MOBILE_QUIET_HOURS_TIME_OPTIONS,
  MOBILE_SERVER_NOTIFICATION_MODES,
  formatMobileQuietHoursRange,
  loadMobileNotificationPreferences,
  normalizeMobileNotificationPreferences,
  saveMobileNotificationPreferences,
  type MobileNotificationPreferenceStorage,
} from "../src/notifications/mobile-notification-preferences";

function createMemoryStorage(seed?: Record<string, string>): {
  storage: MobileNotificationPreferenceStorage;
  values: Map<string, string>;
} {
  const values = new Map<string, string>(Object.entries(seed ?? {}));
  return {
    storage: {
      async getItemAsync(key) {
        return values.get(key) ?? null;
      },
      async setItemAsync(key, value) {
        values.set(key, value);
      },
    },
    values,
  };
}

describe("mobile notification preferences", () => {
  it("exposes the three server routing modes and a full half-hour grid", () => {
    assert.deepEqual([...MOBILE_SERVER_NOTIFICATION_MODES], ["all", "mentions", "none"]);
    assert.equal(MOBILE_QUIET_HOURS_TIME_OPTIONS.length, 48);
    assert.equal(MOBILE_QUIET_HOURS_TIME_OPTIONS[0], "00:00");
    assert.equal(MOBILE_QUIET_HOURS_TIME_OPTIONS.at(-1), "23:30");
  });

  it("falls back to defaults for malformed or partial input", () => {
    assert.deepEqual(normalizeMobileNotificationPreferences(null), DEFAULT_MOBILE_NOTIFICATION_PREFERENCES);
    assert.deepEqual(
      normalizeMobileNotificationPreferences("nonsense"),
      DEFAULT_MOBILE_NOTIFICATION_PREFERENCES,
    );

    const partial = normalizeMobileNotificationPreferences({
      allowNotifications: false,
      serverMessages: "bogus",
      quietHoursStart: "24:99",
      vibration: "yes",
    });
    assert.equal(partial.allowNotifications, false);
    assert.equal(partial.serverMessages, DEFAULT_MOBILE_NOTIFICATION_PREFERENCES.serverMessages);
    assert.equal(partial.quietHoursStart, DEFAULT_MOBILE_NOTIFICATION_PREFERENCES.quietHoursStart);
    assert.equal(partial.vibration, DEFAULT_MOBILE_NOTIFICATION_PREFERENCES.vibration);
  });

  it("keeps a valid overnight quiet-hours window", () => {
    const prefs = normalizeMobileNotificationPreferences({
      quietHoursStart: "22:30",
      quietHoursEnd: "07:00",
    });
    assert.equal(prefs.quietHoursStart, "22:30");
    assert.equal(prefs.quietHoursEnd, "07:00");
    assert.equal(formatMobileQuietHoursRange(prefs.quietHoursStart, prefs.quietHoursEnd), "22:30 – 07:00");
  });

  it("round-trips saved preferences through storage", async () => {
    const { storage } = createMemoryStorage();
    const next = { ...DEFAULT_MOBILE_NOTIFICATION_PREFERENCES, serverMessages: "all" as const, calls: false };
    await saveMobileNotificationPreferences(storage, next);
    assert.deepEqual(await loadMobileNotificationPreferences(storage), next);
  });

  it("loads defaults when storage is empty", async () => {
    const { storage } = createMemoryStorage();
    assert.deepEqual(
      await loadMobileNotificationPreferences(storage),
      DEFAULT_MOBILE_NOTIFICATION_PREFERENCES,
    );
  });
});
