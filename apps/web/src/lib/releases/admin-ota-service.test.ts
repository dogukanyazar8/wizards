import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";

import { ApiError } from "@/lib/api";
import {
  registerAdminOtaBundle,
  setAdminOtaBundleEnabled,
  type AdminOtaBundleInput,
  type AdminOtaServiceDependencies,
} from "./admin-ota-service";

const manifestBody = JSON.stringify({
  assets: [],
  createdAt: "2026-07-30T09:00:00.000Z",
  extra: {},
  id: "550e8400-e29b-41d4-a716-446655440000",
  launchAsset: {
    contentType: "application/javascript",
    hash: "YWJj",
    key: "bundle",
    url: "https://updates.whispr.team/mobile/ota/20260730-a1b2/index.js",
  },
  metadata: {},
  runtimeVersion: "fingerprint-uat-1",
});

const input: AdminOtaBundleInput = {
  bundleKey: "20260730-a1b2",
  channel: "UAT",
  enabled: true,
  id: "550e8400-e29b-41d4-a716-446655440000",
  manifestBody,
  manifestSha256: createHash("sha256").update(manifestBody).digest("hex"),
  manifestSignature: "bWFuaWZlc3Q=",
  noUpdateDirectiveBody: JSON.stringify({ type: "noUpdateAvailable" }),
  noUpdateDirectiveSignature: "bm8tdXBkYXRl",
  platform: "ANDROID",
  rollbackDirectiveBody: JSON.stringify({ type: "rollBackToEmbedded" }),
  rollbackDirectiveSignature: "cm9sbGJhY2s=",
  rolloutPercentage: 100,
  runtimeVersion: "fingerprint-uat-1",
  signingKeyId: "whispr-mobile-ota-uat-2026-01",
};

function dependencies(
  overrides: Partial<AdminOtaServiceDependencies> = {},
): AdminOtaServiceDependencies {
  return {
    createBundle: async (releaseId, value, publishedAt) => ({
      bundleKey: value.bundleKey,
      enabled: value.enabled,
      id: value.id,
      publishedAt,
      releaseId,
      rolloutPercentage: value.rolloutPercentage,
    }),
    findBundleByKey: async () => null,
    findRelease: async () => ({
      channel: "UAT",
      id: "release-1",
      publishedAt: new Date("2026-07-30T08:00:00.000Z"),
    }),
    now: () => new Date("2026-07-30T10:00:00.000Z"),
    setBundleEnabled: async (releaseId, bundleId, enabled) => ({
      enabled,
      id: bundleId,
      releaseId,
    }),
    ...overrides,
  };
}

describe("admin OTA publication service", () => {
  it("registers pre-signed metadata against an already-published release", async () => {
    const result = await registerAdminOtaBundle("release-1", input, dependencies());

    assert.deepEqual(result, {
      bundle: {
        bundleKey: "20260730-a1b2",
        enabled: true,
        id: input.id,
        publishedAt: new Date("2026-07-30T10:00:00.000Z"),
        releaseId: "release-1",
        rolloutPercentage: 100,
      },
    });
  });

  it("rejects unpublished releases and channel changes", async () => {
    await assert.rejects(
      registerAdminOtaBundle(
        "release-1",
        input,
        dependencies({
          findRelease: async () => ({
            channel: "UAT",
            id: "release-1",
            publishedAt: null,
          }),
        }),
      ),
      (error: unknown) => error instanceof ApiError && error.code === "RELEASE_MUST_BE_PUBLISHED",
    );
    await assert.rejects(
      registerAdminOtaBundle("release-1", { ...input, channel: "STABLE" }, dependencies()),
      (error: unknown) => error instanceof ApiError && error.code === "OTA_CHANNEL_MISMATCH",
    );
  });

  it("rejects duplicate immutable keys and changed signed bodies", async () => {
    await assert.rejects(
      registerAdminOtaBundle(
        "release-1",
        input,
        dependencies({ findBundleByKey: async () => ({ id: "existing" }) }),
      ),
      (error: unknown) => error instanceof ApiError && error.code === "OTA_BUNDLE_EXISTS",
    );
    await assert.rejects(
      registerAdminOtaBundle(
        "release-1",
        { ...input, manifestSha256: "0".repeat(64) },
        dependencies(),
      ),
      (error: unknown) => error instanceof ApiError && error.code === "OTA_MANIFEST_HASH_MISMATCH",
    );
  });

  it("changes only the kill-switch state of a release-owned bundle", async () => {
    const result = await setAdminOtaBundleEnabled("release-1", input.id, false, dependencies());

    assert.deepEqual(result, {
      bundle: {
        enabled: false,
        id: input.id,
        releaseId: "release-1",
      },
    });
  });
});
