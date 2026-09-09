import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { PrismaClient } from "@wizards/db";
import { LOCKED_NOTIFICATION_TYPE_KEYS } from "@wizards/types";

import { ApiError } from "@/lib/api";
import {
  getMentionSettings,
  updateMentionSettings,
} from "@/lib/notifications/mention-settings-service";
import {
  NOTIFICATION_PREFS_ROW_DEFAULTS,
  assertNoLockedTypes,
  buildNotificationPrefsWriteData,
  deriveModernNotificationColumns,
  patchNotificationPrefs,
  readNotificationPrefs,
  toNotificationPrefs,
  type NotificationPrefsRow,
} from "@/lib/notifications/prefs-service";

function row(overrides: Partial<NotificationPrefsRow> = {}): NotificationPrefsRow {
  return { ...NOTIFICATION_PREFS_ROW_DEFAULTS, ...overrides };
}

/**
 * The fake the whole file shares. It stands in for one `UserNotificationSettings` row and
 * records every call, because "which door did this write go through" is the question tuzak #3
 * turns on.
 */
function fakeDatabase(
  options: { accountTimeZone?: string | null; settingsRow?: NotificationPrefsRow | null } = {},
) {
  const calls = { findUnique: [] as unknown[], upsert: [] as unknown[] };
  let stored = options.settingsRow === undefined ? row() : options.settingsRow;

  const database = {
    user: {
      findUnique: (args: unknown) => {
        calls.findUnique.push(args);
        return Promise.resolve({
          notificationSettings: stored,
          settings:
            options.accountTimeZone === undefined ? null : { timeZone: options.accountTimeZone },
        });
      },
    },
    userNotificationSettings: {
      upsert: (args: unknown) => {
        calls.upsert.push(args);
        const { create, update } = args as {
          create: Record<string, unknown>;
          update: Record<string, unknown>;
        };
        stored = (
          stored ? { ...stored, ...update } : { ...row(), ...create }
        ) as NotificationPrefsRow;
        return Promise.resolve(stored);
      },
    },
  } as unknown as PrismaClient;

  return { calls, database, read: () => stored };
}

describe("toNotificationPrefs", () => {
  it("answers enums and numbers, never the sentence the screen prints", () => {
    const prefs = toNotificationPrefs(row(), "Europe/Istanbul");

    assert.equal(prefs.level, "important");
    assert.equal(prefs.delivery.system, "mentions");
    assert.equal(prefs.panel.count, 5);
    assert.equal(prefs.sounds.notification.profile, "whispr");
    assert.equal(prefs.defaultMuteDuration, "8h");
    assert.equal(typeof prefs.sounds.notification.volume, "number");
  });

  it("reads the two locked rows as true without a column to read", () => {
    const prefs = toNotificationPrefs(row(), null);

    for (const key of LOCKED_NOTIFICATION_TYPE_KEYS) {
      assert.equal(prefs.types[key], true, key);
    }
  });

  it("resolves the mention rows from the legacy authority, inverted exactly once", () => {
    const prefs = toNotificationPrefs(
      row({
        suppressEveryoneMentions: true,
        suppressRoleMentions: false,
        typeMentionEveryone: true,
        typeMentionRole: false,
      }),
      null,
    );

    // The mirrors say the opposite on purpose: the authority is what answers.
    assert.equal(prefs.types.mentionEveryone, false);
    assert.equal(prefs.types.mentionRole, true);
  });

  it("lets the legacy desktop boolean switch the system menu off", () => {
    assert.equal(
      toNotificationPrefs(row({ desktopMentionMode: "ALL", desktopNotifications: false }), null)
        .delivery.system,
      "off",
    );
    assert.equal(
      toNotificationPrefs(row({ desktopMentionMode: "ALL", systemMode: "OFF" }), null).delivery
        .system,
      "all",
    );
  });

  it("never claims to know the browser's permission", () => {
    assert.equal(toNotificationPrefs(row(), null).permission, "unknown");
  });

  it("falls back to the design's window rather than half a range", () => {
    const prefs = toNotificationPrefs(
      row({ quietHoursEnabled: true, quietHoursFrom: "2300", quietHoursTo: null }),
      null,
    );

    assert.equal(prefs.quietHours.start, "23:00");
    assert.equal(prefs.quietHours.end, "08:00");
  });

  it("resolves the quiet-hours zone through the account zone", () => {
    assert.equal(toNotificationPrefs(row(), "Asia/Tokyo").quietHours.tz, "Asia/Tokyo");
    assert.equal(
      toNotificationPrefs(row({ quietHoursTimeZone: "Europe/Berlin" }), "Asia/Tokyo").quietHours.tz,
      "Europe/Berlin",
    );
  });

  it("clamps a value an older client stored out of range", () => {
    const prefs = toNotificationPrefs(
      row({ panelCount: 9, panelDurationSec: 900, soundCallVolume: 400 }),
      null,
    );

    assert.equal(prefs.panel.count, 6);
    assert.equal(prefs.panel.durationSec, 30);
    assert.equal(prefs.sounds.call.volume, 100);
  });
});

describe("assertNoLockedTypes", () => {
  it("refuses a locked row with a code the screen can act on", () => {
    assert.throws(
      () => assertNoLockedTypes({ types: { security: false } }),
      (error: unknown) =>
        error instanceof ApiError &&
        error.status === 400 &&
        error.code === "LOCKED_NOTIFICATION_TYPE",
    );
    assert.throws(
      () => assertNoLockedTypes({ types: { moderation: true } }),
      (error: unknown) => error instanceof ApiError && error.code === "LOCKED_NOTIFICATION_TYPE",
    );
  });

  it("says nothing about a patch that stays inside the fourteen writable rows", () => {
    assert.doesNotThrow(() => assertNoLockedTypes({ types: { dm: false } }));
    assert.doesNotThrow(() => assertNoLockedTypes({ level: "off" }));
    assert.doesNotThrow(() => assertNoLockedTypes(null));
  });
});

describe("buildNotificationPrefsWriteData", () => {
  it("writes only what the caller sent", () => {
    assert.deepEqual(buildNotificationPrefsWriteData({}), {});
    assert.deepEqual(buildNotificationPrefsWriteData({ level: "off" }), { level: "OFF" });
  });

  it("keeps every legacy mirror beside its column (K12)", () => {
    assert.deepEqual(buildNotificationPrefsWriteData({ delivery: { push: false } }), {
      deliveryPush: false,
      mobileNotifications: false,
    });
    assert.deepEqual(buildNotificationPrefsWriteData({ delivery: { email: true } }), {
      deliveryEmail: true,
      emailNotifications: true,
    });
    assert.deepEqual(buildNotificationPrefsWriteData({ delivery: { system: "off" } }), {
      desktopMentionMode: "OFF",
      desktopNotifications: false,
      systemMode: "OFF",
    });
    assert.deepEqual(
      buildNotificationPrefsWriteData({ sounds: { notification: { enabled: false } } }),
      { notificationSound: false, soundNotificationEnabled: false },
    );
    assert.deepEqual(
      buildNotificationPrefsWriteData({ sounds: { notification: { profile: "classic" } } }),
      { notificationSoundFile: "legacyNotification", soundNotificationProfile: "CLASSIC" },
    );
  });

  it("writes the inverted column and its mirror for the four shared mention rows", () => {
    assert.deepEqual(buildNotificationPrefsWriteData({ types: { mentionEveryone: false } }), {
      suppressEveryoneMentions: true,
      typeMentionEveryone: false,
    });
    assert.deepEqual(buildNotificationPrefsWriteData({ types: { mentionRole: true } }), {
      suppressRoleMentions: false,
      typeMentionRole: true,
    });
    assert.deepEqual(buildNotificationPrefsWriteData({ types: { threadReplies: true } }), {
      mentionThreadReplies: true,
      typeThreadReplies: true,
    });
  });

  it("leaves a type row that is not shared with the mention modal alone", () => {
    assert.deepEqual(buildNotificationPrefsWriteData({ types: { badges: true, dm: false } }), {
      typeBadges: true,
      typeDm: false,
    });
  });

  it("writes only the quiet-hours fields the patch names", () => {
    assert.deepEqual(buildNotificationPrefsWriteData({ quietHours: { allowCalls: true } }), {
      quietHoursAllowCalls: true,
    });
    assert.deepEqual(
      buildNotificationPrefsWriteData({ quietHours: { end: "07:30", start: "22:00" } }),
      { quietHoursFrom: "22:00", quietHoursTo: "07:30" },
    );
  });
});

describe("readNotificationPrefs / patchNotificationPrefs", () => {
  it("reads the row and the account zone in a single query", async () => {
    const { calls, database } = fakeDatabase({ accountTimeZone: "Asia/Tokyo" });

    const prefs = await readNotificationPrefs("user-1", { database });

    assert.equal(calls.findUnique.length, 1);
    assert.equal(prefs.quietHours.tz, "Asia/Tokyo");
  });

  it("returns the defaults without writing when there is no row", async () => {
    const { calls, database } = fakeDatabase({ settingsRow: null });

    const prefs = await readNotificationPrefs("user-1", { database });

    assert.equal(prefs.level, "important");
    assert.equal(calls.upsert.length, 0);
  });

  it("does not write for an empty patch", async () => {
    const { calls, database } = fakeDatabase();

    await patchNotificationPrefs("user-1", {}, { database });

    assert.equal(calls.upsert.length, 0);
  });

  it("answers the whole object, not the patch", async () => {
    const { database } = fakeDatabase();

    const prefs = await patchNotificationPrefs("user-1", { level: "all" }, { database });

    assert.equal(prefs.level, "all");
    assert.equal(prefs.panel.count, 5);
    assert.equal(prefs.types.security, true);
  });

  it("refuses a locked row with 400 and leaves the read at true", async () => {
    const { calls, database } = fakeDatabase();

    await assert.rejects(
      () => patchNotificationPrefs("user-1", { types: { security: false } } as never, { database }),
      (error: unknown) => error instanceof ApiError && error.code === "LOCKED_NOTIFICATION_TYPE",
    );
    assert.equal(calls.upsert.length, 0);
    assert.equal((await readNotificationPrefs("user-1", { database })).types.security, true);
  });

  it("refuses a zero-length quiet-hours window", async () => {
    const { calls, database } = fakeDatabase();

    await assert.rejects(
      () =>
        patchNotificationPrefs(
          "user-1",
          { quietHours: { end: "23:00", start: "23:00" } },
          { database },
        ),
      (error: unknown) => error instanceof ApiError && error.status === 400,
    );
    assert.equal(calls.upsert.length, 0);
  });

  it("spells the whole row out when it has to create one", async () => {
    const { calls, database } = fakeDatabase({ settingsRow: null });

    await patchNotificationPrefs("user-1", { level: "off" }, { database });

    const upsert = calls.upsert[0] as { create: Record<string, unknown>; where: unknown };
    assert.deepEqual(upsert.where, { userId: "user-1" });
    assert.equal(upsert.create.userId, "user-1");
    assert.equal(upsert.create.level, "OFF");
    assert.equal(upsert.create.panelCount, 5);
  });
});

describe("tuzak #3 — one row, two endpoints", () => {
  it("leaves the mention settings untouched after a notification-prefs write", async () => {
    const { database } = fakeDatabase();

    const before = await getMentionSettings("user-1", { database });
    await patchNotificationPrefs(
      "user-1",
      { delivery: { push: false }, panel: { count: 3 }, types: { badges: true } },
      { database },
    );
    const after = await getMentionSettings("user-1", { database });

    assert.deepEqual(after, before);
  });

  it("shows a mention-modal write in the notification-prefs read", async () => {
    const { database } = fakeDatabase();

    await updateMentionSettings("user-1", { everyone: false, role: false }, { database });
    const prefs = await readNotificationPrefs("user-1", { database });

    assert.equal(prefs.types.mentionEveryone, false);
    assert.equal(prefs.types.mentionRole, false);
  });

  it("shows a notification-prefs write in the mention-modal read", async () => {
    const { database } = fakeDatabase();

    await patchNotificationPrefs(
      "user-1",
      { delivery: { system: "off" }, types: { mentionEveryone: false, threadReplies: true } },
      { database },
    );
    const mention = await getMentionSettings("user-1", { database });

    assert.equal(mention.everyone, false);
    assert.equal(mention.threadReplies, true);
    assert.equal(mention.desktop, "off");
  });

  it("does not reset the other endpoint's switches when both write in turn", async () => {
    const { database } = fakeDatabase();

    await updateMentionSettings("user-1", { me: false, threadReplies: true }, { database });
    await patchNotificationPrefs("user-1", { types: { badges: true } }, { database });

    const mention = await getMentionSettings("user-1", { database });
    const prefs = await readNotificationPrefs("user-1", { database });

    assert.equal(mention.me, false, "the mention modal's own switch survived the second writer");
    assert.equal(mention.threadReplies, true);
    assert.equal(prefs.types.mentionSelf, false);
    assert.equal(prefs.types.badges, true);
  });
});

describe("deriveModernNotificationColumns — K12, the other direction", () => {
  it("moves the new column whenever the legacy endpoint moves the old one", () => {
    assert.deepEqual(deriveModernNotificationColumns({ mobileNotifications: false }), {
      deliveryPush: false,
    });
    assert.deepEqual(deriveModernNotificationColumns({ emailNotifications: true }), {
      deliveryEmail: true,
    });
    assert.deepEqual(deriveModernNotificationColumns({ notificationSound: false }), {
      soundNotificationEnabled: false,
    });
  });

  it("reads the legacy sound key as a pack, not as a path", () => {
    assert.deepEqual(deriveModernNotificationColumns({ notificationSoundFile: "default" }), {
      soundNotificationProfile: "WHISPR",
    });
    assert.deepEqual(
      deriveModernNotificationColumns({ notificationSoundFile: "legacyNotification" }),
      { soundNotificationProfile: "CLASSIC" },
    );
  });

  it("derives nothing from a body that named none of the four", () => {
    assert.deepEqual(deriveModernNotificationColumns({}), {});
    assert.deepEqual(deriveModernNotificationColumns({ desktopNotifications: false } as never), {});
  });
});
