import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createFakeDatabase } from "@/lib/home/home-test-doubles";
import { applyExpiredFocus, sweepExpiredFocus } from "@/lib/home/presence-service";

const NOW = new Date("2026-08-19T09:00:00.000Z");

describe("focus sweep", () => {
  it("restores every closed window and announces each one", async () => {
    const { calls, database } = createFakeDatabase({
      models: {
        user: {
          findMany: () => [
            {
              id: "u1",
              status: "DND",
              statusExpiresAt: new Date("2026-08-19T08:00:00.000Z"),
              statusFocusMinutes: 25,
              statusRestoreTo: "IDLE",
            },
            {
              id: "u2",
              status: "DND",
              statusExpiresAt: new Date("2026-08-19T08:59:00.000Z"),
              statusFocusMinutes: 50,
              statusRestoreTo: null,
            },
          ],
          updateMany: () => ({ count: 1 }),
        },
      },
    });
    const announced: unknown[] = [];

    const result = await sweepExpiredFocus({
      broadcast: (input) => {
        announced.push(input);
        return Promise.resolve();
      },
      database,
      now: NOW,
    });

    assert.deepEqual(result, { restored: 2 });
    assert.deepEqual(announced, [
      { status: "IDLE", userId: "u1" },
      { status: "ONLINE", userId: "u2" },
    ]);

    const reads = calls.filter((call) => call.operation === "user.findMany");
    assert.equal(reads.length, 1);
    // Served by `User(statusExpiresAt)`: the sweep asks one indexed question.
    assert.deepEqual((reads[0]?.args as { where?: unknown })?.where, {
      statusExpiresAt: { lte: NOW },
    });

    const writes = calls.filter((call) => call.operation === "user.updateMany");
    assert.equal(writes.length, 2);
    assert.deepEqual((writes[0]?.args as { data?: unknown })?.data, {
      status: "IDLE",
      statusExpiresAt: null,
      statusFocusMinutes: null,
      statusRestoreTo: null,
    });
  });

  it("writes nothing when no window has closed", async () => {
    const { calls, database } = createFakeDatabase({
      models: { user: { findMany: () => [] } },
    });
    const announced: unknown[] = [];

    const result = await sweepExpiredFocus({
      broadcast: (input) => {
        announced.push(input);
        return Promise.resolve();
      },
      database,
      now: NOW,
    });

    assert.deepEqual(result, { restored: 0 });
    assert.deepEqual(announced, []);
    assert.ok(!calls.some((call) => call.operation === "user.updateMany"));
  });

  it("stale sweep yeni açılan focus window'unu ezemez", async () => {
    const oldExpiry = new Date("2026-08-19T08:00:00.000Z");
    const { calls, database } = createFakeDatabase({
      models: {
        user: {
          findMany: () => [
            {
              id: "u1",
              status: "DND",
              statusExpiresAt: oldExpiry,
              statusFocusMinutes: 25,
              statusRestoreTo: "ONLINE",
            },
          ],
          updateMany: () => ({ count: 0 }),
        },
      },
    });
    const announced: unknown[] = [];

    const result = await sweepExpiredFocus({
      broadcast: (input) => {
        announced.push(input);
        return Promise.resolve();
      },
      database,
      now: NOW,
    });

    assert.deepEqual(result, { restored: 0 });
    assert.deepEqual(announced, []);
    const write = calls.find((call) => call.operation === "user.updateMany");
    assert.deepEqual((write?.args as { where?: unknown })?.where, {
      id: "u1",
      status: "DND",
      statusExpiresAt: oldExpiry,
      statusFocusMinutes: 25,
      statusRestoreTo: "ONLINE",
    });
  });

  it("stale sweep manuel presence değişimini ezemez", async () => {
    const { database } = createFakeDatabase({
      models: {
        user: {
          findMany: () => [
            {
              id: "u1",
              status: "DND",
              statusExpiresAt: new Date("2026-08-19T08:00:00.000Z"),
              statusFocusMinutes: 25,
              statusRestoreTo: "IDLE",
            },
          ],
          updateMany: () => ({ count: 0 }),
        },
      },
    });
    const announced: unknown[] = [];

    await sweepExpiredFocus({
      broadcast: (input) => {
        announced.push(input);
        return Promise.resolve();
      },
      database,
      now: NOW,
    });

    assert.deepEqual(announced, []);
  });
});

describe("lazy focus resolution", () => {
  it("only announces when its own conditional write actually landed", async () => {
    const won = createFakeDatabase({
      models: { user: { updateMany: () => ({ count: 1 }) } },
    });
    const lost = createFakeDatabase({
      models: { user: { updateMany: () => ({ count: 0 }) } },
    });
    const announced: unknown[] = [];
    const broadcast = (input: unknown) => {
      announced.push(input);
      return Promise.resolve();
    };
    const input = {
      expected: {
        status: "DND" as const,
        statusExpiresAt: new Date("2026-08-19T08:00:00.000Z"),
        statusFocusMinutes: 25,
        statusRestoreTo: "ONLINE" as const,
      },
      status: "ONLINE" as const,
      userId: "u1",
    };

    await applyExpiredFocus(input, { broadcast, database: won.database, now: NOW });
    await applyExpiredFocus(input, { broadcast, database: lost.database, now: NOW });

    // Two readers can race on the same expired window; only the one whose
    // update matched may tell the friends about it.
    assert.deepEqual(announced, [{ status: "ONLINE", userId: "u1" }]);
    assert.deepEqual((won.calls[0]?.args as { where?: unknown })?.where, {
      id: "u1",
      status: "DND",
      statusExpiresAt: new Date("2026-08-19T08:00:00.000Z"),
      statusFocusMinutes: 25,
      statusRestoreTo: "ONLINE",
    });
  });

  it("iki concurrent cleanup'ta yalnız compare-and-set kazananı yayınlar", async () => {
    let remainingWins = 1;
    const fake = createFakeDatabase({
      models: {
        user: {
          updateMany: () => ({ count: remainingWins-- > 0 ? 1 : 0 }),
        },
      },
    });
    const announced: unknown[] = [];
    const input = {
      expected: {
        status: "DND" as const,
        statusExpiresAt: new Date("2026-08-19T08:00:00.000Z"),
        statusFocusMinutes: 25,
        statusRestoreTo: "ONLINE" as const,
      },
      status: "ONLINE" as const,
      userId: "u1",
    };

    await Promise.all([
      applyExpiredFocus(input, {
        broadcast: async (value) => void announced.push(value),
        database: fake.database,
        now: NOW,
      }),
      applyExpiredFocus(input, {
        broadcast: async (value) => void announced.push(value),
        database: fake.database,
        now: NOW,
      }),
    ]);

    assert.deepEqual(announced, [{ status: "ONLINE", userId: "u1" }]);
    assert.deepEqual((fake.calls[0]?.args as { where?: unknown })?.where, {
      id: "u1",
      status: "DND",
      statusExpiresAt: new Date("2026-08-19T08:00:00.000Z"),
      statusFocusMinutes: 25,
      statusRestoreTo: "ONLINE",
    });
  });
});
