import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { getAdminDashboardSnapshotUncached } from "@/lib/admin/dashboard";
import {
  composeAdminDashboardSnapshot,
  loadAdminActivitySnapshot,
  loadAdminAuditSnapshot,
  loadAdminNotificationsSnapshot,
  loadAdminOverviewSnapshot,
  loadAdminServersSnapshot,
  loadAdminUsersSnapshot,
  mergeAdminSnapshotSlices,
} from "@/lib/admin/snapshots";
import {
  createSnapshotTestClient,
  SNAPSHOT_FIXTURE_DAYS,
  SNAPSHOT_FIXTURE_NOW,
} from "@/lib/admin/snapshots/snapshot-test-fixture";

/**
 * Captured from the single-`Promise.all` dashboard loader before the split, so
 * it pins the behaviour the six loaders have to reproduce byte for byte.
 */
const goldenSnapshot = JSON.parse(
  readFileSync(new URL("./dashboard-snapshot.golden.json", import.meta.url), "utf8"),
) as unknown;

const input = { days: SNAPSHOT_FIXTURE_DAYS, now: SNAPSHOT_FIXTURE_NOW };

function toPlain(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as unknown;
}

describe("admin snapshot split equivalence", () => {
  it("keeps the combined dashboard loader on the captured output", async () => {
    const { client } = createSnapshotTestClient();

    const snapshot = await getAdminDashboardSnapshotUncached(
      SNAPSHOT_FIXTURE_DAYS,
      client,
      SNAPSHOT_FIXTURE_NOW,
    );

    assert.deepEqual(toPlain(snapshot), goldenSnapshot);
  });

  it("rebuilds the same snapshot from the six separate loaders", async () => {
    const { client } = createSnapshotTestClient();

    const [activity, audit, notifications, overview, servers, users] = await Promise.all([
      loadAdminActivitySnapshot(input, client),
      loadAdminAuditSnapshot(input, client),
      loadAdminNotificationsSnapshot(input, client),
      loadAdminOverviewSnapshot(input, client),
      loadAdminServersSnapshot(input, client),
      loadAdminUsersSnapshot(input, client),
    ]);

    const merged = mergeAdminSnapshotSlices({
      activity,
      audit,
      notifications,
      overview,
      servers,
      users,
    });

    assert.deepEqual(toPlain(merged), goldenSnapshot);
  });

  it("composes the same snapshot through the shared entry point", async () => {
    const { client } = createSnapshotTestClient();

    const composed = await composeAdminDashboardSnapshot(input, client);

    assert.deepEqual(toPlain(composed), goldenSnapshot);
  });
});

describe("admin snapshot query isolation", () => {
  it("touches only the audit log when the audit module loads", async () => {
    const { client, calls, countCalls } = createSnapshotTestClient();

    await loadAdminAuditSnapshot(input, client);

    assert.deepEqual(calls, ["adminAuditLog.findMany"]);
    assert.equal(countCalls("user"), 0);
    assert.equal(countCalls("server"), 0);
    assert.equal(countCalls("mediaUsageSession"), 0);
    assert.equal(countCalls("userDailyMetric"), 0);
  });

  it("keeps campaign loading off the user, server and media tables", async () => {
    const { client, calls, countCalls } = createSnapshotTestClient();

    await loadAdminNotificationsSnapshot(input, client);

    assert.deepEqual(calls, ["notificationCampaign.findMany"]);
    assert.equal(countCalls("user"), 0);
    assert.equal(countCalls("server"), 0);
    assert.equal(countCalls("mediaUsageSession"), 0);
  });

  it("keeps the users module off server, media and audit tables", async () => {
    const { client, countCalls } = createSnapshotTestClient();

    await loadAdminUsersSnapshot(input, client);

    assert.equal(countCalls("server"), 0);
    assert.equal(countCalls("mediaUsageSession"), 0);
    assert.equal(countCalls("adminAuditLog"), 0);
    assert.equal(countCalls("message"), 0);
  });

  it("keeps the servers module off session, user and audit tables", async () => {
    const { client, countCalls } = createSnapshotTestClient();

    await loadAdminServersSnapshot(input, client);

    assert.equal(countCalls("appSession"), 0);
    assert.equal(countCalls("user"), 0);
    assert.equal(countCalls("adminAuditLog"), 0);
  });
});
