import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import type { PrismaClient } from "@wizards/db";
import { MENTION_SETTINGS_DEFAULTS } from "@wizards/types";

import { ApiError } from "@/lib/api";
import { DEFAULT_QUIET_HOURS_TIME_ZONE, isWithinQuietHours } from "@/lib/notifications/quiet-hours";
import {
  buildMentionSettingsWriteData,
  getMentionSettings,
  listMentionSettings,
  readMentionSettings,
  toMentionSettings,
  updateMentionSettings,
  type MentionSettingsRow,
} from "@/lib/notifications/mention-settings-service";

function row(overrides: Partial<MentionSettingsRow> = {}): MentionSettingsRow {
  return {
    desktopMentionMode: "MENTIONS",
    desktopNotifications: true,
    mentionSelf: true,
    mentionThreadReplies: false,
    quietHoursEnabled: false,
    quietHoursFrom: null,
    quietHoursTimeZone: null,
    quietHoursTo: null,
    suppressEveryoneMentions: false,
    suppressRoleMentions: false,
    ...overrides,
  };
}

const DEFAULT_SETTINGS_WITH_ZONE = {
  ...MENTION_SETTINGS_DEFAULTS,
  quietHours: {
    ...MENTION_SETTINGS_DEFAULTS.quietHours,
    timeZone: DEFAULT_QUIET_HOURS_TIME_ZONE,
  },
};

type FakeDatabaseOptions = {
  accountTimeZone?: string | null;
  settingsRow?: MentionSettingsRow | null;
  userMissing?: boolean;
};

function fakeDatabase(options: FakeDatabaseOptions = {}) {
  const calls = {
    findUnique: [] as unknown[],
    upsert: [] as unknown[],
  };

  const database = {
    user: {
      findUnique: (args: unknown) => {
        calls.findUnique.push(args);
        return Promise.resolve(
          options.userMissing
            ? null
            : {
                notificationSettings: options.settingsRow ?? null,
                settings:
                  options.accountTimeZone === undefined
                    ? null
                    : { timeZone: options.accountTimeZone },
              },
        );
      },
    },
    userNotificationSettings: {
      upsert: (args: unknown) => {
        calls.upsert.push(args);
        const { create, update } = args as {
          create: Record<string, unknown>;
          update: Record<string, unknown>;
        };
        const base = options.settingsRow ? { ...options.settingsRow, ...update } : { ...create };
        return Promise.resolve({ ...row(), ...base });
      },
    },
  } as unknown as PrismaClient;

  return { calls, database };
}

describe("toMentionSettings", () => {
  it("inverts the two suppress columns exactly once", () => {
    const settings = toMentionSettings(
      row({ suppressEveryoneMentions: true, suppressRoleMentions: false }),
      null,
    );

    assert.equal(settings.role, true);
    assert.equal(settings.everyone, false);
  });

  it("reads a missing row as the design's defaults", () => {
    const settings = toMentionSettings(null, null);

    assert.deepEqual(settings, DEFAULT_SETTINGS_WITH_ZONE);
    assert.equal(settings.threadReplies, false);
  });

  it("maps the desktop enum onto the contract's lowercase members", () => {
    assert.equal(toMentionSettings(row({ desktopMentionMode: "ALL" }), null).desktop, "all");
    assert.equal(
      toMentionSettings(row({ desktopMentionMode: "MENTIONS" }), null).desktop,
      "mentions",
    );
    assert.equal(toMentionSettings(row({ desktopMentionMode: "OFF" }), null).desktop, "off");
  });

  it("lets the legacy boolean still switch the desktop off", () => {
    // The old Settings page keeps writing `desktopNotifications`. Reading the enum alone would
    // show `Sadece bahsetmeler` to somebody who just switched desktop notifications off there.
    assert.equal(
      toMentionSettings(row({ desktopMentionMode: "ALL", desktopNotifications: false }), null)
        .desktop,
      "off",
    );
  });

  it("resolves the quiet-hours zone through the account zone to Istanbul", () => {
    assert.equal(
      toMentionSettings(row({ quietHoursTimeZone: "Europe/Berlin" }), "Asia/Tokyo").quietHours
        .timeZone,
      "Europe/Berlin",
    );
    assert.equal(toMentionSettings(row(), "Asia/Tokyo").quietHours.timeZone, "Asia/Tokyo");
    assert.equal(toMentionSettings(row(), null).quietHours.timeZone, DEFAULT_QUIET_HOURS_TIME_ZONE);
  });

  it("reads a stored range that is not HH:mm as no range at all", () => {
    const settings = toMentionSettings(
      row({ quietHoursEnabled: true, quietHoursFrom: "2300", quietHoursTo: "08:00" }),
      null,
    );

    assert.equal(settings.quietHours.from, null);
    assert.equal(settings.quietHours.to, "08:00");
  });
});

describe("buildMentionSettingsWriteData", () => {
  it("writes only what the caller sent", () => {
    assert.deepEqual(buildMentionSettingsWriteData({}), {});
    assert.deepEqual(buildMentionSettingsWriteData({ me: false }), { mentionSelf: false });
  });

  it("keeps the inverse mapping in this one place", () => {
    assert.deepEqual(buildMentionSettingsWriteData({ everyone: false, role: false }), {
      suppressEveryoneMentions: true,
      suppressRoleMentions: true,
    });
    assert.deepEqual(buildMentionSettingsWriteData({ everyone: true, role: true }), {
      suppressEveryoneMentions: false,
      suppressRoleMentions: false,
    });
  });

  it("writes the legacy desktop boolean alongside the enum", () => {
    assert.deepEqual(buildMentionSettingsWriteData({ desktop: "off" }), {
      desktopMentionMode: "OFF",
      desktopNotifications: false,
    });
    assert.deepEqual(buildMentionSettingsWriteData({ desktop: "all" }), {
      desktopMentionMode: "ALL",
      desktopNotifications: true,
    });
  });

  it("writes only the quiet-hours fields the patch names", () => {
    assert.deepEqual(buildMentionSettingsWriteData({ quietHours: { enabled: true } }), {
      quietHoursEnabled: true,
    });
    assert.deepEqual(
      buildMentionSettingsWriteData({
        quietHours: { from: "23:00", timeZone: "Europe/Istanbul", to: "08:00" },
      }),
      {
        quietHoursFrom: "23:00",
        quietHoursTimeZone: "Europe/Istanbul",
        quietHoursTo: "08:00",
      },
    );
  });
});

describe("getMentionSettings", () => {
  it("returns the defaults without writing when the row does not exist", async () => {
    const { calls, database } = fakeDatabase({ settingsRow: null });

    const settings = await getMentionSettings("user-1", { database });

    assert.equal(settings.me, true);
    assert.equal(settings.threadReplies, false);
    assert.equal(settings.desktop, "mentions");
    assert.equal(calls.findUnique.length, 1);
    assert.equal(calls.upsert.length, 0);
  });

  it("reads the row and the account zone in a single query", async () => {
    const { calls, database } = fakeDatabase({
      accountTimeZone: "Asia/Tokyo",
      settingsRow: row({ mentionThreadReplies: true, suppressRoleMentions: true }),
    });

    const settings = await getMentionSettings("user-1", { database });

    assert.equal(calls.findUnique.length, 1);
    assert.equal(settings.role, false);
    assert.equal(settings.threadReplies, true);
    assert.equal(settings.quietHours.timeZone, "Asia/Tokyo");
  });

  it("answers the defaults for a user row that is gone", async () => {
    const { database } = fakeDatabase({ userMissing: true });

    assert.deepEqual(await getMentionSettings("user-1", { database }), DEFAULT_SETTINGS_WITH_ZONE);
  });
});

describe("updateMentionSettings", () => {
  it("creates the row when there is none, defaults included", async () => {
    const { calls, database } = fakeDatabase({ settingsRow: null });

    const settings = await updateMentionSettings("user-1", { role: false }, { database });

    assert.equal(calls.upsert.length, 1);
    const upsert = calls.upsert[0] as {
      create: Record<string, unknown>;
      update: Record<string, unknown>;
      where: Record<string, unknown>;
    };
    assert.deepEqual(upsert.where, { userId: "user-1" });
    assert.equal(upsert.create.userId, "user-1");
    assert.equal(upsert.create.suppressRoleMentions, true);
    assert.equal(upsert.create.mentionThreadReplies, false);
    assert.equal(upsert.create.desktopMentionMode, "MENTIONS");
    assert.deepEqual(upsert.update, { suppressRoleMentions: true });
    assert.equal(settings.role, false);
  });

  it("does not write for an empty patch", async () => {
    const { calls, database } = fakeDatabase({ settingsRow: row() });

    await updateMentionSettings("user-1", {}, { database });

    assert.equal(calls.upsert.length, 0);
  });

  it("rejects a patch that carries an unknown field", async () => {
    const { calls, database } = fakeDatabase({ settingsRow: row() });

    await assert.rejects(() =>
      updateMentionSettings("user-1", { sessizSaat: true } as never, { database }),
    );
    assert.equal(calls.upsert.length, 0);
  });

  it("rejects a zero-length quiet-hours range with 400", async () => {
    const { calls, database } = fakeDatabase({ settingsRow: row() });

    await assert.rejects(
      () =>
        updateMentionSettings(
          "user-1",
          { quietHours: { enabled: true, from: "23:00", to: "23:00" } },
          { database },
        ),
      (error: unknown) => error instanceof ApiError && error.status === 400,
    );
    assert.equal(calls.upsert.length, 0);
  });

  it("rejects switching quiet hours on with no stored range", async () => {
    const { database } = fakeDatabase({ settingsRow: row() });

    await assert.rejects(
      () => updateMentionSettings("user-1", { quietHours: { enabled: true } }, { database }),
      (error: unknown) => error instanceof ApiError && error.status === 400,
    );
  });

  it("accepts switching quiet hours on when the row already holds a range", async () => {
    const { calls, database } = fakeDatabase({
      settingsRow: row({ quietHoursFrom: "23:00", quietHoursTo: "08:00" }),
    });

    const settings = await updateMentionSettings(
      "user-1",
      { quietHours: { enabled: true } },
      { database },
    );

    assert.deepEqual((calls.upsert[0] as { update: unknown }).update, { quietHoursEnabled: true });
    assert.equal(settings.quietHours.enabled, true);
    assert.equal(settings.quietHours.from, "23:00");
  });

  it("keeps the legacy desktop boolean in step with the enum", async () => {
    const { calls, database } = fakeDatabase({ settingsRow: row() });

    const settings = await updateMentionSettings("user-1", { desktop: "off" }, { database });

    assert.deepEqual((calls.upsert[0] as { update: unknown }).update, {
      desktopMentionMode: "OFF",
      desktopNotifications: false,
    });
    assert.equal(settings.desktop, "off");
  });
});

describe("listMentionSettings", () => {
  function fakeFanOutDatabase(
    users: readonly {
      id: string;
      notificationSettings: MentionSettingsRow | null;
      timeZone?: string | null;
    }[],
  ) {
    const calls: unknown[] = [];

    const database = {
      user: {
        findMany: (args: unknown) => {
          calls.push(args);
          return Promise.resolve(
            users.map((user) => ({
              id: user.id,
              notificationSettings: user.notificationSettings,
              settings: user.timeZone === undefined ? null : { timeZone: user.timeZone },
            })),
          );
        },
      },
    } as unknown as PrismaClient;

    return { calls, database };
  }

  it("reads every recipient in one query and de-duplicates the ids", async () => {
    const { calls, database } = fakeFanOutDatabase([
      { id: "user-1", notificationSettings: row({ suppressEveryoneMentions: true }) },
      { id: "user-2", notificationSettings: null },
    ]);

    const settings = await listMentionSettings(["user-1", "user-2", "user-1"], { database });

    assert.equal(calls.length, 1);
    assert.deepEqual((calls[0] as { where: { id: { in: string[] } } }).where.id.in, [
      "user-1",
      "user-2",
    ]);
    assert.equal(settings.get("user-1")?.everyone, false);
    // The second recipient has no row: absent from the map, defaults through the reader.
    assert.equal(settings.has("user-2"), false);
    assert.equal(readMentionSettings(settings, "user-2").everyone, true);
  });

  it("answers the defaults for a recipient with no row at all", async () => {
    const { database } = fakeFanOutDatabase([]);

    const settings = await listMentionSettings(["user-9"], { database });

    assert.deepEqual(settings.get("user-9"), undefined);
    assert.deepEqual(
      readMentionSettings(settings, "user-9"),
      DEFAULT_SETTINGS_WITH_ZONE,
      "a fan-out recipient without a row must still be readable",
    );
  });

  it("does not query at all for an empty recipient list", async () => {
    const { calls, database } = fakeFanOutDatabase([]);

    assert.equal((await listMentionSettings([], { database })).size, 0);
    assert.equal(calls.length, 0);
  });

  it("carries each recipient's own quiet-hours window", async () => {
    const { database } = fakeFanOutDatabase([
      {
        id: "user-1",
        notificationSettings: row({
          quietHoursEnabled: true,
          quietHoursFrom: "23:00",
          quietHoursTimeZone: "UTC",
          quietHoursTo: "08:00",
        }),
      },
    ]);

    const settings = await listMentionSettings(["user-1"], { database });
    const recipient = readMentionSettings(settings, "user-1");

    assert.equal(isWithinQuietHours(recipient, new Date("2026-08-21T00:30:00.000Z")), true);
    assert.equal(isWithinQuietHours(recipient, new Date("2026-08-21T09:00:00.000Z")), false);
  });
});

describe("mention settings surfaces", () => {
  it("binds the Settings page toggles to the same endpoint the modal uses", () => {
    // Ş4 kabul: two surfaces, one source. The Settings page must not grow its own copy of the
    // inverse mapping — it reads and writes through `lib/settings/client.ts`, which calls
    // `mention-settings/route.ts`, which calls this service.
    const panel = readFileSync(
      new URL("../../components/settings/settings-panel.tsx", import.meta.url),
      "utf8",
    );

    assert.match(panel, /fetchMentionSettings/u);
    assert.match(panel, /patchMentionSettings/u);
    assert.match(panel, /settings-mention-role/u);
    assert.match(panel, /settings-mention-everyone/u);
    assert.doesNotMatch(panel, /suppress(?:Role|Everyone)Mentions/u);
  });

  it("keeps the inverse mapping out of the route", () => {
    const route = readFileSync(
      new URL("../../app/api/v1/notifications/mention-settings/route.ts", import.meta.url),
      "utf8",
    );

    assert.doesNotMatch(route, /suppress/iu);
  });
});
