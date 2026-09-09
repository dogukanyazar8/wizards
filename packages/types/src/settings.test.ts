import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  LOCKED_NOTIFICATION_TYPE_KEYS,
  NOTIFICATION_TYPE_KEYS,
  NotificationExceptionSchema,
  NotificationPrefsPatchSchema,
  NotificationTypesSchema,
  NotifPanelPrefsSchema,
  NotifQuietHoursSchema,
  SecurityEventSchema,
  UserSettingsSchema,
} from "./settings";

describe("notification types — the lock is a server contract", () => {
  it("reads sixteen rows, the last two always true", () => {
    assert.equal(NOTIFICATION_TYPE_KEYS.length, 14);
    assert.deepEqual([...LOCKED_NOTIFICATION_TYPE_KEYS], ["security", "moderation"]);
    assert.equal(Object.keys(NotificationTypesSchema.shape).length, 16);
  });

  it("refuses a read payload that turns a locked type off", () => {
    const base = Object.fromEntries(NOTIFICATION_TYPE_KEYS.map((key) => [key, true]));

    assert.equal(
      NotificationTypesSchema.safeParse({ ...base, security: true, moderation: true }).success,
      true,
    );
    assert.equal(
      NotificationTypesSchema.safeParse({ ...base, security: false, moderation: true }).success,
      false,
    );
  });

  it("rejects a PATCH that mentions a locked type at all", () => {
    // Tuzak #5. Silently dropping the key would answer 200 for a change that never happened,
    // and the switch would spring back on the next read with no error anywhere.
    assert.equal(NotificationPrefsPatchSchema.safeParse({ types: { dm: false } }).success, true);
    assert.equal(
      NotificationPrefsPatchSchema.safeParse({ types: { security: false } }).success,
      false,
    );
    assert.equal(
      NotificationPrefsPatchSchema.safeParse({ types: { moderation: false } }).success,
      false,
    );
  });

  it("rejects a PATCH of the three read-only branches", () => {
    // `permission` comes from the runtime and `exceptions` is a union over three other tables
    // (K4). Accepting either would promise a write with nowhere to land.
    assert.equal(NotificationPrefsPatchSchema.safeParse({ permission: "granted" }).success, false);
    assert.equal(NotificationPrefsPatchSchema.safeParse({ exceptions: [] }).success, false);
    assert.equal(NotificationPrefsPatchSchema.safeParse({ unknownKey: 1 }).success, false);
  });

  it("accepts a partial patch at every depth", () => {
    const parsed = NotificationPrefsPatchSchema.safeParse({
      sounds: { call: { volume: 40 } },
      quietHours: { enabled: true },
      panel: { count: 3 },
    });

    assert.equal(parsed.success, true);
  });
});

describe("value ranges the screen depends on", () => {
  it("bounds the quiet-hours window to HH:mm", () => {
    const base = {
      enabled: true,
      start: "23:00",
      end: "08:00",
      tz: "Europe/Istanbul",
      allowCalls: true,
    };

    assert.equal(NotifQuietHoursSchema.safeParse(base).success, true);
    assert.equal(NotifQuietHoursSchema.safeParse({ ...base, start: "24:00" }).success, false);
    assert.equal(NotifQuietHoursSchema.safeParse({ ...base, start: "23:00:00" }).success, false);
  });

  it("bounds the panel count to the four the segment offers", () => {
    const base = {
      count: 5,
      autoClose: true,
      durationSec: 10,
      showContent: false,
      showSource: true,
    };

    assert.equal(NotifPanelPrefsSchema.safeParse(base).success, true);
    assert.equal(NotifPanelPrefsSchema.safeParse({ ...base, count: 7 }).success, false);
    assert.equal(NotifPanelPrefsSchema.safeParse({ ...base, durationSec: 45 }).success, false);
  });

  it("types the exception level instead of taking a sentence", () => {
    const base = { id: "s1", scope: "server", name: "Oyun Kulübü Türkiye", mutedUntil: null };

    assert.equal(
      NotificationExceptionSchema.safeParse({ ...base, level: "mentions" }).success,
      true,
    );
    assert.equal(
      NotificationExceptionSchema.safeParse({ ...base, level: "Yalnız bahsetmeler" }).success,
      false,
    );
  });
});

describe("security events never carry an address", () => {
  it("has neither ipHash nor ipAddress on the wire", () => {
    const keys = Object.keys(SecurityEventSchema.shape);

    assert.deepEqual(keys, ["id", "kind", "location", "userAgent", "createdAt"]);
  });
});

describe("UserSettings", () => {
  it("omits the desktop branch rather than sending it empty (K11)", () => {
    assert.equal(UserSettingsSchema.shape.desktop.safeParse(undefined).success, true);
  });

  it("keeps reduceMotion and textToSpeech in one place only (SPEC_DEVIATIONS #4)", () => {
    const media = Object.keys(UserSettingsSchema.shape.appearance.shape.media.shape);
    const a11y = Object.keys(UserSettingsSchema.shape.appearance.shape.a11y.shape);

    assert.ok(!media.includes("reduceMotion"));
    assert.ok(!media.includes("textToSpeech"));
    assert.ok(a11y.includes("reduceMotion"));
    assert.ok(a11y.includes("textToSpeech"));
  });
});
