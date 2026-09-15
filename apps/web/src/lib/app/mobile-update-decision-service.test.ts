import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  decideMobileUpdate,
  type MobileUpdateDecisionDependencies,
  type MobileUpdateReleaseRecord,
} from "./mobile-update-decision-service";

const release: MobileUpdateReleaseRecord = {
  artifacts: [
    {
      kind: "APK",
      platform: "ANDROID",
      publishedAt: new Date("2026-07-30T09:30:00.000Z"),
      sha256: "a".repeat(64),
      signingCertSha256: Array(32).fill("AB").join(":"),
      sizeBytes: 50_541_363n,
      url: "https://updates.whispr.team/mobile/uat/releases/v0.9.0/whispr-8200.apk",
      versionCode: 8_200,
    },
  ],
  channel: "UAT",
  codename: "Halo",
  mandatory: false,
  minSupportedVersionCode: 8_000,
  otaBundles: [
    {
      enabled: true,
      platform: "ANDROID",
      publishedAt: new Date("2026-07-30T09:45:00.000Z"),
      runtimeVersion: "runtime-new",
    },
  ],
  releasedAt: new Date("2026-07-30T09:00:00.000Z"),
  sizeBytes: 50_541_363n,
  version: "0.9.0",
};

function dependencies(
  value: MobileUpdateReleaseRecord | null = release,
): MobileUpdateDecisionDependencies {
  return {
    findLatestRelease: async () => value,
  };
}

const baseInput = {
  buildEnvironment: "uat" as const,
  channel: "beta" as const,
  installed: "0.8.15",
  platform: "android" as const,
  runtimeVersion: "runtime-old",
  versionCode: 8_100,
};

describe("mobile update decision service", () => {
  it("prefers a compatible signed OTA over a newer APK", async () => {
    const decision = await decideMobileUpdate(
      { ...baseInput, runtimeVersion: "runtime-new" },
      dependencies(),
    );

    assert.equal(decision.updateKind, "ota");
    assert.equal(decision.androidArtifact, undefined);
    assert.equal(decision.otaEnabled, true);
  });

  it("offers a newer APK only to matching internal Android builds", async () => {
    const decision = await decideMobileUpdate(baseInput, dependencies());

    assert.equal(decision.updateKind, "apk");
    assert.equal(decision.androidArtifact?.versionCode, 8_200);
    assert.equal(decision.minSupportedVersionCode, 8_000);
  });

  it("offers a higher Android versionCode within the same SemVer", async () => {
    const decision = await decideMobileUpdate(
      { ...baseInput, installed: "0.9.0", versionCode: 8_199 },
      dependencies(),
    );

    assert.equal(decision.updateKind, "apk");
    assert.equal(decision.androidArtifact?.versionCode, 8_200);
    assert.equal(decision.latest?.version, "0.9.0");
  });

  it("turns the minimum supported versionCode into a mandatory update gate", async () => {
    const decision = await decideMobileUpdate({ ...baseInput, versionCode: 7_999 }, dependencies());

    assert.equal(decision.latest?.mandatory, true);
  });

  it("offers a mandatory APK when only the Android versionCode is below the minimum", async () => {
    const decision = await decideMobileUpdate(
      { ...baseInput, installed: "0.9.0", versionCode: 7_999 },
      dependencies(),
    );

    assert.equal(decision.updateKind, "apk");
    assert.equal(decision.androidArtifact?.versionCode, 8_200);
    assert.equal(decision.latest?.mandatory, true);
  });

  it("never exposes an APK to production even when client query values are forged", async () => {
    const decision = await decideMobileUpdate(
      {
        ...baseInput,
        buildEnvironment: "production",
        channel: "beta",
      },
      dependencies(),
    );

    assert.equal(decision.updateKind, "store");
    assert.equal(decision.androidArtifact, undefined);
    assert.doesNotMatch(JSON.stringify(decision), /\.apk/);
  });

  it("never exposes APK to iOS or to an equal/newer Android versionCode", async () => {
    const ios = await decideMobileUpdate({ ...baseInput, platform: "ios" }, dependencies());
    const current = await decideMobileUpdate({ ...baseInput, versionCode: 8_200 }, dependencies());

    assert.equal(ios.updateKind, "none");
    assert.equal(current.updateKind, "none");
  });

  it("returns none when no newer published release exists", async () => {
    const missing = await decideMobileUpdate(baseInput, dependencies(null));
    const current = await decideMobileUpdate(
      { ...baseInput, installed: "0.9.0", versionCode: 8_200 },
      dependencies(),
    );

    assert.equal(missing.updateKind, "none");
    assert.equal(current.updateKind, "none");
  });
});

it("uses only the UAT database stream for Beta and STABLE for Stable", async () => {
  for (const [channel, expected] of [
    ["beta", "UAT"],
    ["stable", "STABLE"],
  ] as const) {
    await decideMobileUpdate(
      { ...baseInput, channel },
      {
        findLatestRelease: async (actual) => {
          assert.equal(actual, expected);
          return null;
        },
      },
    );
  }
});

it("does not offer cross-environment OTA even if runtime fingerprints match", async () => {
  for (const buildEnvironment of ["production", "development"] as const) {
    const decision = await decideMobileUpdate(
      { ...baseInput, buildEnvironment, runtimeVersion: "runtime-new" },
      dependencies(),
    );
    assert.notEqual(decision.updateKind, "ota");
    assert.equal(decision.otaEnabled, false);
    assert.equal(decision.androidArtifact, undefined);
  }
});
