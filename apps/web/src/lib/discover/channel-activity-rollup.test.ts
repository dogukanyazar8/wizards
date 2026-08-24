import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  rollUpDiscoverChannelActivity,
  type ChannelActivityRollupOperations,
  type DiscoverActivityRollupChannel,
} from "./channel-activity-rollup";
import { startOutboxWorker, stopOutboxWorker } from "@/lib/outbox/worker";

const NOW = new Date("2026-08-21T12:37:45.000Z");

function channel(
  id: string,
  overrides: Partial<DiscoverActivityRollupChannel> = {},
): DiscoverActivityRollupChannel {
  return {
    id,
    permissionOverrides: [],
    server: {
      discoverable: true,
      isPublic: true,
      ownerId: "owner",
      roles: [{ id: "everyone", isDefault: true, permissions: 1n << 9n }],
    },
    type: "TEXT",
    ...overrides,
  };
}

function inMemoryOperations(
  channels: DiscoverActivityRollupChannel[],
  messageCounts: ReadonlyMap<string, number>,
  existingRows: Map<string, { messageCount: number; windowStart: Date }> = new Map(),
) {
  const countInputs: unknown[] = [];
  const operations: ChannelActivityRollupOperations = {
    countMessages: async (input) => {
      countInputs.push(input);
      return input.channelIds.flatMap((channelId) => {
        const count = messageCounts.get(channelId) ?? 0;
        return count > 0 ? [{ channelId, count }] : [];
      });
    },
    insertRows: async (rows) => {
      let count = 0;
      for (const row of rows) {
        const key = `${row.channelId}|${row.windowStart.toISOString()}`;
        if (!existingRows.has(key)) {
          existingRows.set(key, {
            messageCount: row.messageCount,
            windowStart: row.windowStart,
          });
          count += 1;
        }
      }
      return count;
    },
    loadChannels: async () => channels,
    pruneRows: async (before) => {
      let count = 0;
      for (const [key, row] of existingRows) {
        if (row.windowStart < before) {
          existingRows.delete(key);
          count += 1;
        }
      }
      return count;
    },
  };

  return { countInputs, existingRows, operations };
}

describe("discover channel activity rollup", () => {
  it("counts only the last closed UTC hour and ignores deleted messages", async () => {
    const state = inMemoryOperations([channel("public")], new Map([["public", 7]]));

    const result = await rollUpDiscoverChannelActivity({ now: NOW, operations: state.operations });

    assert.deepEqual(result, { rows: 1 });
    assert.deepEqual(state.countInputs, [
      {
        channelIds: ["public"],
        createdAt: {
          gte: new Date("2026-08-21T11:00:00.000Z"),
          lt: new Date("2026-08-21T12:00:00.000Z"),
        },
        deletedAt: null,
      },
    ]);
  });

  it("is idempotent when the same window runs twice", async () => {
    const state = inMemoryOperations([channel("public")], new Map([["public", 7]]));

    const first = await rollUpDiscoverChannelActivity({ now: NOW, operations: state.operations });
    const second = await rollUpDiscoverChannelActivity({ now: NOW, operations: state.operations });

    assert.deepEqual(first, { rows: 1 });
    assert.deepEqual(second, { rows: 0 });
    assert.equal(state.existingRows.size, 1);
  });

  it("never sends private or undiscoverable channel ids to message counting", async () => {
    const state = inMemoryOperations(
      [
        channel("public"),
        channel("private", {
          server: {
            discoverable: true,
            isPublic: true,
            ownerId: "owner",
            roles: [{ id: "everyone", isDefault: true, permissions: 0n }],
          },
        }),
        channel("denied", {
          permissionOverrides: [
            {
              allow: 0n,
              deny: 1n << 9n,
              targetId: "everyone",
              targetType: "ROLE",
            },
          ],
        }),
        channel("hidden-server", {
          server: {
            discoverable: false,
            isPublic: true,
            ownerId: "owner",
            roles: [{ id: "everyone", isDefault: true, permissions: 1n << 9n }],
          },
        }),
      ],
      new Map([
        ["public", 3],
        ["private", 99],
        ["denied", 99],
        ["hidden-server", 99],
      ]),
    );

    await rollUpDiscoverChannelActivity({ now: NOW, operations: state.operations });

    assert.deepEqual(state.countInputs[0], {
      channelIds: ["public"],
      createdAt: {
        gte: new Date("2026-08-21T11:00:00.000Z"),
        lt: new Date("2026-08-21T12:00:00.000Z"),
      },
      deletedAt: null,
    });
  });

  it("prunes rows older than 30 days", async () => {
    const rows = new Map([
      ["old", { messageCount: 2, windowStart: new Date("2026-07-20T12:00:00.000Z") }],
      ["kept", { messageCount: 2, windowStart: new Date("2026-08-01T12:00:00.000Z") }],
    ]);
    const state = inMemoryOperations([], new Map(), rows);

    await rollUpDiscoverChannelActivity({ now: NOW, operations: state.operations });

    assert.deepEqual([...state.existingRows.keys()], ["kept"]);
  });

  it("returns rows zero without counting when the visible set is empty", async () => {
    const state = inMemoryOperations([], new Map());

    const result = await rollUpDiscoverChannelActivity({ now: NOW, operations: state.operations });

    assert.deepEqual(result, { rows: 0 });
    assert.deepEqual(state.countInputs, []);
  });

  it("is called once from the worker hourly maintenance block", async () => {
    let signalRollup: (() => void) | undefined;
    const called = new Promise<void>((resolve) => {
      signalRollup = resolve;
    });
    let calls = 0;

    startOutboxWorker({
      cleanupJobs: async () => undefined,
      cleanupExpiredSessions: async () => ({ count: 0 }),
      cleanupMobileMediaUploads: async () => ({ deleted: 0, failed: 0 }),
      cleanupReauthChallenges: async () => 0,
      drainJobs: async () => 0,
      intervalMs: 60_000,
      purgeExpiredBugReports: async () => ({ deleted: 0 }),
      purgeExpiredEvidence: async () => ({ casesPurged: 0, evidenceDeleted: 0 }),
      rollUpClientHealthEvents: async () => ({ deleted: 0, summarized: 0 }),
      rollUpDiscoverChannelActivity: async () => {
        calls += 1;
        signalRollup?.();
        return { rows: 0 };
      },
      runImmediately: true,
      sweepBadges: async () => ({
        expired: 0,
        founderUpdated: 0,
        rarityComputed: false,
        revoked: 0,
      }),
      sweepExpiredFocus: async () => ({ restored: 0 }),
      sweepModerationCaseAlerts: async () => ({ alertedCases: 0, notified: 0 }),
      workerId: "test-discover-rollup",
    });

    const observed = await Promise.race([
      called.then(() => true),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 100)),
    ]);
    await stopOutboxWorker({ timeoutMs: 1_000 });

    assert.equal(observed, true);
    assert.equal(calls, 1);
  });
});
