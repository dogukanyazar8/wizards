import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  evaluateFlags,
  getFlagRolloutBucket,
  isFeatureFlagOnForUser,
  type FeatureFlagRecord,
} from "@/lib/feature-flags/service";

function flag(overrides: Partial<FeatureFlagRecord> = {}): FeatureFlagRecord {
  return {
    clientTypes: [],
    enabled: true,
    key: "voice-noise-suppression",
    rolloutPercent: 100,
    ...overrides,
  };
}

describe("feature flag evaluation", () => {
  it("gives the same answer every time for the same person and flag", () => {
    const partial = flag({ rolloutPercent: 37 });
    const first = isFeatureFlagOnForUser(partial, { clientType: "MOBILE", userId: "user-1" });

    for (let attempt = 0; attempt < 100; attempt += 1) {
      assert.equal(
        isFeatureFlagOnForUser(partial, { clientType: "MOBILE", userId: "user-1" }),
        first,
        `evaluation ${attempt} disagreed with the first one`,
      );
    }
  });

  it("keeps the bucket inside the percentage range", () => {
    for (const userId of ["user-1", "user-2", "user-3", "user-4"]) {
      const bucket = getFlagRolloutBucket("voice-noise-suppression", userId);

      assert.ok(bucket >= 0 && bucket < 100, `${userId} landed outside the bucket range`);
    }
  });

  it("splits the same person differently between two flags", () => {
    const buckets = new Set([
      getFlagRolloutBucket("flag-a", "user-1"),
      getFlagRolloutBucket("flag-b", "user-1"),
    ]);

    assert.equal(buckets.size, 2, "two flags must not share one bucket");
  });

  it("shuts off for everyone the moment the flag is disabled", () => {
    const killed = flag({ enabled: false, rolloutPercent: 100 });

    assert.equal(isFeatureFlagOnForUser(killed, { clientType: "WEB", userId: "user-1" }), false);
    assert.equal(isFeatureFlagOnForUser(killed, { clientType: "WEB", userId: null }), false);
  });

  it("limits a flag to the platforms it names", () => {
    const mobileOnly = flag({ clientTypes: ["MOBILE"] });

    assert.equal(
      isFeatureFlagOnForUser(mobileOnly, { clientType: "MOBILE", userId: "user-1" }),
      true,
    );
    assert.equal(
      isFeatureFlagOnForUser(mobileOnly, { clientType: "WEB", userId: "user-1" }),
      false,
    );
  });

  it("treats a signed-out reader as outside any partial rollout", () => {
    assert.equal(
      isFeatureFlagOnForUser(flag({ rolloutPercent: 50 }), { clientType: "WEB", userId: null }),
      false,
    );
    assert.equal(
      isFeatureFlagOnForUser(flag({ rolloutPercent: 100 }), { clientType: "WEB", userId: null }),
      true,
    );
  });

  it("returns one boolean per flag key", () => {
    const result = evaluateFlags([flag({ key: "a" }), flag({ enabled: false, key: "b" })], {
      clientType: "WEB",
      userId: "user-1",
    });

    assert.deepEqual(result, { a: true, b: false });
  });
});
