import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ApiError } from "@/lib/api";
import {
  updateFeatureFlag,
  type FeatureFlagAdminDependencies,
} from "@/lib/feature-flags/admin-service";

function harness(overrides: { missing?: boolean } = {}) {
  const audits: Array<{ action: string; metadata: unknown; targetId?: string | null }> = [];
  const broadcasts: string[] = [];

  const dependencies: FeatureFlagAdminDependencies = {
    broadcastChange: (key) => {
      broadcasts.push(key);
    },
    findFlag: async () =>
      overrides.missing
        ? null
        : { clientTypes: [], description: null, enabled: true, rolloutPercent: 100 },
    updateFlag: async (key, update) => ({
      clientTypes: update.clientTypes ?? [],
      description: update.description ?? null,
      enabled: update.enabled ?? false,
      key,
      rolloutPercent: update.rolloutPercent ?? 0,
    }),
    writeAuditLog: async (args) => {
      audits.push({
        action: args.action,
        metadata: args.metadata,
        targetId: args.targetId ?? null,
      });
    },
  };

  return { audits, broadcasts, dependencies };
}

describe("feature flag administration", () => {
  it("records both sides of the change and tells connected clients", async () => {
    const { audits, broadcasts, dependencies } = harness();

    const flag = await updateFeatureFlag(
      {
        adminUserId: "admin-1",
        key: "voice-noise-suppression",
        update: { enabled: false },
      },
      dependencies,
    );

    assert.equal(flag.enabled, false);
    assert.deepEqual(broadcasts, ["voice-noise-suppression"]);
    assert.equal(audits.length, 1);
    assert.equal(audits[0]?.action, "flag.update");
    assert.equal(audits[0]?.targetId, "voice-noise-suppression");
    assert.deepEqual(audits[0]?.metadata, {
      after: { clientTypes: [], enabled: false, rolloutPercent: 0 },
      before: { clientTypes: [], enabled: true, rolloutPercent: 100 },
    });
  });

  it("refuses a rollout outside the percentage range", async () => {
    const { audits, dependencies } = harness();

    await assert.rejects(
      () =>
        updateFeatureFlag(
          { adminUserId: "admin-1", key: "a", update: { rolloutPercent: 140 } },
          dependencies,
        ),
      (error: unknown) => error instanceof ApiError && error.status === 400,
    );
    assert.deepEqual(audits, []);
  });

  it("reports an unknown flag as not found", async () => {
    const { broadcasts, dependencies } = harness({ missing: true });

    await assert.rejects(
      () =>
        updateFeatureFlag(
          { adminUserId: "admin-1", key: "ghost", update: { enabled: true } },
          dependencies,
        ),
      (error: unknown) => error instanceof ApiError && error.status === 404,
    );
    assert.deepEqual(broadcasts, []);
  });
});
