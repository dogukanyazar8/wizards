import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";

import {
  buildExpoMultipartResponse,
  resolveOtaManifest,
  type OtaBundleRecord,
  type OtaManifestRepository,
} from "./ota-manifest-service";

const updateId = "550e8400-e29b-41d4-a716-446655440000";
const manifestBody = JSON.stringify({
  assets: [
    {
      contentType: "image/png",
      fileExtension: ".png",
      hash: "YWJj",
      key: "icon",
      url: "https://updates.whispr.team/mobile/ota/20260730-a1b2/icon.png",
    },
  ],
  createdAt: "2026-07-30T09:00:00.000Z",
  extra: {},
  id: updateId,
  launchAsset: {
    contentType: "application/javascript",
    hash: "ZGVm",
    key: "bundle",
    url: "https://updates.whispr.team/mobile/ota/20260730-a1b2/index.js",
  },
  metadata: {},
  runtimeVersion: "fingerprint-uat-1",
});
const noUpdateBody = JSON.stringify({ type: "noUpdateAvailable" });
const rollbackBody = JSON.stringify({
  parameters: { commitTime: 1_754_000_000_000 },
  type: "rollBackToEmbedded",
});

function bundle(overrides: Partial<OtaBundleRecord> = {}): OtaBundleRecord {
  return {
    bundleKey: "20260730-a1b2",
    channel: "UAT",
    enabled: true,
    id: updateId,
    manifestBody,
    manifestSha256: createHash("sha256").update(manifestBody).digest("hex"),
    manifestSignature: "bWFuaWZlc3Q=",
    noUpdateDirectiveBody: noUpdateBody,
    noUpdateDirectiveSignature: "bm8tdXBkYXRl",
    platform: "ANDROID",
    publishedAt: new Date("2026-07-30T09:00:00.000Z"),
    rollbackDirectiveBody: rollbackBody,
    rollbackDirectiveSignature: "cm9sbGJhY2s=",
    rolloutPercentage: 100,
    runtimeVersion: "fingerprint-uat-1",
    signingKeyId: "whispr-mobile-ota-uat-2026-01",
    ...overrides,
  };
}

function repository(
  compatible: OtaBundleRecord | null,
  signingFallback: OtaBundleRecord | null = compatible,
): OtaManifestRepository {
  return {
    findLatestCompatible: async () => compatible,
    findLatestSigningBundle: async () => signingFallback,
  };
}

const request = {
  channel: "uat" as const,
  installationId: "install-a",
  platform: "android" as const,
  runtimeVersion: "fingerprint-uat-1",
};

describe("OTA manifest decision", () => {
  it("returns the exact pre-signed manifest for the newest compatible publication", async () => {
    const result = await resolveOtaManifest(request, repository(bundle()));

    assert.deepEqual(result, {
      body: manifestBody,
      kind: "manifest",
      signature: "bWFuaWZlc3Q=",
      signingKeyId: "whispr-mobile-ota-uat-2026-01",
    });
  });

  it("returns a signed no-update directive for the current update", async () => {
    const result = await resolveOtaManifest(
      { ...request, currentUpdateId: updateId },
      repository(bundle()),
    );

    assert.deepEqual(result, {
      body: noUpdateBody,
      kind: "directive",
      signature: "bm8tdXBkYXRl",
      signingKeyId: "whispr-mobile-ota-uat-2026-01",
    });
  });

  it("rolls back when the newest compatible publication is disabled", async () => {
    const result = await resolveOtaManifest(request, repository(bundle({ enabled: false })));

    assert.deepEqual(result, {
      body: rollbackBody,
      kind: "directive",
      signature: "cm9sbGJhY2s=",
      signingKeyId: "whispr-mobile-ota-uat-2026-01",
    });
  });

  it("uses a published signing fallback when this runtime has no bundle", async () => {
    const result = await resolveOtaManifest(request, repository(null, bundle()));

    assert.deepEqual(result, {
      body: noUpdateBody,
      kind: "directive",
      signature: "bm8tdXBkYXRl",
      signingKeyId: "whispr-mobile-ota-uat-2026-01",
    });
  });

  it("keeps staged rollout decisions stable for an installation", async () => {
    const staged = bundle({ rolloutPercentage: 37 });
    const first = await resolveOtaManifest(request, repository(staged));
    const second = await resolveOtaManifest(request, repository(staged));

    assert.deepEqual(first, second);
    assert.ok(first === null || first.kind === "directive" || first.kind === "manifest");
  });

  it("fails closed when stored signed metadata was changed after publication", async () => {
    await assert.rejects(
      resolveOtaManifest(request, repository(bundle({ manifestSha256: "0".repeat(64) }))),
      /manifest hash mismatch/i,
    );
  });
});

describe("Expo multipart response", () => {
  it("places the signature on the named manifest part", () => {
    const response = buildExpoMultipartResponse({
      body: manifestBody,
      kind: "manifest",
      signature: "bWFuaWZlc3Q=",
      signingKeyId: "whispr-mobile-ota-uat-2026-01",
    });

    assert.match(response.contentType, /^multipart\/mixed; boundary=/);
    assert.match(response.body, /content-disposition: form-data; name="manifest"/i);
    assert.match(response.body, /content-type: application\/json/i);
    assert.match(
      response.body,
      /expo-signature: sig="bWFuaWZlc3Q=", keyid="whispr-mobile-ota-uat-2026-01", alg="rsa-v1_5-sha256"/i,
    );
    assert.ok(response.body.includes(manifestBody));
  });
});
