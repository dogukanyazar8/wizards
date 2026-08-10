import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { PrismaClient } from "@wizards/db";

import {
  DEFAULT_SERVER_USER_SETTINGS,
  buildServerUserSettings,
  buildServerUserSettingsUpdateData,
  listServerUserSettingsWithDatabase,
  toMessageNotification,
  toServerNotificationLevel,
} from "@/lib/workspace/server-user-settings-service";

describe("notification level mapping", () => {
  it("round-trips every client-facing level", () => {
    for (const level of ["all", "mentions", "none"] as const) {
      assert.equal(toServerNotificationLevel(toMessageNotification(level)), level);
    }
  });

  it("maps the column's four members onto the contract's three", () => {
    assert.equal(toServerNotificationLevel("ALL"), "all");
    assert.equal(toServerNotificationLevel("MENTIONS"), "mentions");
    assert.equal(toServerNotificationLevel("NOTHING"), "none");
    // DEFAULT means "inherit the server default", which is ALL_MESSAGES.
    assert.equal(toServerNotificationLevel("DEFAULT"), "all");
  });
});

describe("buildServerUserSettings", () => {
  it("treats a missing row as the defaults rather than an error", () => {
    assert.deepEqual(buildServerUserSettings(null), DEFAULT_SERVER_USER_SETTINGS);
    assert.equal(DEFAULT_SERVER_USER_SETTINGS.starred, false);
  });

  it("serialises mutedUntil as an ISO string", () => {
    const settings = buildServerUserSettings({
      messageNotifications: "MENTIONS",
      muted: true,
      mutedUntil: new Date("2026-08-11T18:00:00.000Z"),
      starred: true,
    });

    assert.deepEqual(settings, {
      muted: true,
      mutedUntil: "2026-08-11T18:00:00.000Z",
      notificationLevel: "mentions",
      starred: true,
    });
  });
});

describe("buildServerUserSettingsUpdateData", () => {
  it("writes only the fields the caller actually sent", () => {
    assert.deepEqual(buildServerUserSettingsUpdateData({ starred: true }), { starred: true });
    assert.deepEqual(buildServerUserSettingsUpdateData({}), {});
  });

  it("distinguishes clearing mutedUntil from leaving it alone", () => {
    assert.deepEqual(buildServerUserSettingsUpdateData({ mutedUntil: null }), {
      mutedUntil: null,
    });
    assert.deepEqual(buildServerUserSettingsUpdateData({}), {});
    assert.deepEqual(
      buildServerUserSettingsUpdateData({ mutedUntil: "2026-08-11T18:00:00.000Z" }),
      { mutedUntil: new Date("2026-08-11T18:00:00.000Z") },
    );
  });

  it("translates the notification level to the column's enum", () => {
    assert.deepEqual(buildServerUserSettingsUpdateData({ notificationLevel: "none" }), {
      messageNotifications: "NOTHING",
    });
  });
});

describe("listServerUserSettingsWithDatabase", () => {
  function fakeDatabase(rows: readonly unknown[]) {
    const calls: unknown[] = [];
    return {
      calls,
      database: {
        userServerSettings: {
          findMany: (args: unknown) => {
            calls.push(args);
            return Promise.resolve(rows);
          },
        },
      } as unknown as PrismaClient,
    };
  }

  // A0.3: the rail can hold 50 servers. One query for the whole list, never one
  // per server — the bootstrap is the app's cold-start path.
  it("reads every server's settings in a single query", async () => {
    const { calls, database } = fakeDatabase([]);

    await listServerUserSettingsWithDatabase(database, "user-1", [
      "server-1",
      "server-2",
      "server-3",
    ]);

    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0], {
      select: {
        messageNotifications: true,
        muted: true,
        mutedUntil: true,
        serverId: true,
        starred: true,
      },
      where: { serverId: { in: ["server-1", "server-2", "server-3"] }, userId: "user-1" },
    });
  });

  it("maps rows by server and leaves an unsaved server on the defaults", async () => {
    const { database } = fakeDatabase([
      {
        messageNotifications: "MENTIONS",
        muted: true,
        mutedUntil: null,
        serverId: "server-2",
        starred: true,
      },
    ]);

    const settings = await listServerUserSettingsWithDatabase(database, "user-1", [
      "server-1",
      "server-2",
    ]);

    assert.deepEqual(settings.get("server-2"), {
      muted: true,
      mutedUntil: null,
      notificationLevel: "mentions",
      starred: true,
    });
    assert.equal(settings.get("server-1"), undefined);
  });

  // An empty list must not become `IN ()` — that is a full-table read on some
  // engines and a wasted round trip on all of them.
  it("skips the query entirely when there are no servers", async () => {
    const { calls, database } = fakeDatabase([]);

    const settings = await listServerUserSettingsWithDatabase(database, "user-1", []);

    assert.equal(calls.length, 0);
    assert.equal(settings.size, 0);
  });
});
