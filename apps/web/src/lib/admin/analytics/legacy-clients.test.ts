import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  LEGACY_MOBILE_APP_VERSION,
  compareAppVersions,
  isLegacyMobileVersion,
  summarizeLegacyMobileClients,
  type LegacyClientStore,
} from "@/lib/admin/analytics/legacy-clients";

const NOW = new Date("2026-08-05T12:00:00.000Z");

function storeStub(rows: Array<{ appVersion: string | null; count: number }>) {
  const queries: Array<{ where?: { startedAt?: { gte: Date } } }> = [];

  const store = {
    appSession: {
      groupBy: async (args: { where?: { startedAt?: { gte: Date } } }) => {
        queries.push(args);
        return rows.map((row) => ({ _count: { _all: row.count }, appVersion: row.appVersion }));
      },
    },
  } as unknown as LegacyClientStore;

  return { queries, store };
}

describe("legacy mobile clients", () => {
  it("compares versions numerically, not as strings", () => {
    // The trap this exists for: "0.10.0" < "0.9.0" is true lexicographically.
    assert.ok(compareAppVersions("0.10.0", "0.9.0") > 0);
    assert.ok(compareAppVersions("0.8.15", "0.9.0") < 0);
    assert.equal(compareAppVersions("0.9.0", "0.9.0.0"), 0);
    assert.ok(compareAppVersions("v0.9.0-rc.1", "0.9.0") === 0);
  });

  it("treats a missing version as a legacy client", () => {
    assert.equal(isLegacyMobileVersion(null), true);
    assert.equal(isLegacyMobileVersion("  "), true);
    assert.equal(isLegacyMobileVersion("0.8.15"), true);
    assert.equal(isLegacyMobileVersion(LEGACY_MOBILE_APP_VERSION), false);
    assert.equal(isLegacyMobileVersion("1.0.0"), false);
  });

  it("counts only the sessions that block the frozen field removal", async () => {
    const { queries, store } = storeStub([
      { appVersion: "0.8.15", count: 4 },
      { appVersion: "0.8.9", count: 2 },
      { appVersion: null, count: 1 },
      { appVersion: "0.9.0", count: 30 },
      { appVersion: "0.10.2", count: 12 },
    ]);

    const summary = await summarizeLegacyMobileClients({ now: NOW, store });

    assert.equal(summary.sessions, 7);
    assert.equal(summary.clear, false);
    assert.deepEqual(
      summary.versions.map((entry) => entry.appVersion),
      [null, "0.8.9", "0.8.15"],
    );
    assert.equal(
      queries[0]?.where?.startedAt?.gte?.toISOString(),
      new Date(NOW.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    );
  });

  it("reports a clear gate when every session is current", async () => {
    const { store } = storeStub([{ appVersion: "0.9.1", count: 500 }]);

    assert.deepEqual(await summarizeLegacyMobileClients({ now: NOW, store }), {
      clear: true,
      maxVersion: LEGACY_MOBILE_APP_VERSION,
      sessions: 0,
      versions: [],
      windowDays: 30,
    });
  });
});
