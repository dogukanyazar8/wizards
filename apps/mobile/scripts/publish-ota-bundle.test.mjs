import assert from "node:assert/strict";
import { generateKeyPairSync, verify } from "node:crypto";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  buildMobileOtaPublishPlan,
  createSignedOtaMetadata,
  prepareMobileOtaPublication,
} from "./publish-ota-bundle.mjs";

describe("mobile OTA publish plan", () => {
  it("keeps private material outside the workspace and out of serialized plans", () => {
    const root = mkdtempSync(join(tmpdir(), "whispr-ota-plan-"));
    const workspaceRoot = join(root, "workspace");
    const privateKeyPath = join(root, "secrets", "private-key.pem");
    mkdirSync(workspaceRoot, { recursive: true });
    mkdirSync(join(root, "secrets"), { recursive: true });
    writeFileSync(privateKeyPath, "PRIVATE-CONTENT", { mode: 0o600 });

    const plan = buildMobileOtaPublishPlan({
      adminBaseUrl: "https://wizardsweb-uat.up.railway.app",
      bundleKey: "20260730-a1b2",
      environment: "uat",
      platform: "android",
      privateKeyPath,
      releaseId: "release-1",
      rolloutPercentage: 25,
      runtimeVersion: "fingerprint-uat-1",
      workspaceRoot,
    });
    const serialized = JSON.stringify(plan);

    assert.deepEqual(
      plan.steps.map((step) => step.name),
      ["export", "fingerprint", "sign", "r2-upload", "register", "remote-verify"],
    );
    assert.match(serialized, /mobile\/ota\/20260730-a1b2\//);
    assert.doesNotMatch(serialized, /PRIVATE-CONTENT|private-key\.pem|BEGIN PRIVATE KEY/);
    assert.match(serialized, /<external-private-key>/);
  });

  it("rejects a private key placed under the repository", () => {
    const root = mkdtempSync(join(tmpdir(), "whispr-ota-plan-inside-"));
    const privateKeyPath = join(root, "keys", "private-key.pem");
    mkdirSync(join(root, "keys"), { recursive: true });
    writeFileSync(privateKeyPath, "PRIVATE-CONTENT", { mode: 0o600 });

    assert.throws(
      () =>
        buildMobileOtaPublishPlan({
          adminBaseUrl: "https://wizardsweb-uat.up.railway.app",
          bundleKey: "20260730-a1b2",
          environment: "uat",
          platform: "android",
          privateKeyPath,
          releaseId: "release-1",
          rolloutPercentage: 100,
          runtimeVersion: "fingerprint-uat-1",
          workspaceRoot: root,
        }),
      /outside the workspace/i,
    );
  });
});

describe("mobile OTA signing", () => {
  it("signs the exact manifest and directive bytes with RSA-SHA256", () => {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
    });
    const manifestBody = JSON.stringify({
      id: "550e8400-e29b-41d4-a716-446655440000",
      runtimeVersion: "fingerprint-uat-1",
    });
    const signed = createSignedOtaMetadata({
      manifestBody,
      privateKeyPem: privateKey.export({ format: "pem", type: "pkcs8" }).toString(),
    });

    assert.equal(
      verify(
        "RSA-SHA256",
        Buffer.from(manifestBody),
        publicKey,
        Buffer.from(signed.manifestSignature, "base64"),
      ),
      true,
    );
    assert.equal(
      verify(
        "RSA-SHA256",
        Buffer.from(signed.noUpdateDirectiveBody),
        publicKey,
        Buffer.from(signed.noUpdateDirectiveSignature, "base64"),
      ),
      true,
    );
    assert.equal(
      verify(
        "RSA-SHA256",
        Buffer.from(signed.rollbackDirectiveBody),
        publicKey,
        Buffer.from(signed.rollbackDirectiveSignature, "base64"),
      ),
      true,
    );
  });

  it("turns an Expo export into immutable signed registration metadata", () => {
    const root = mkdtempSync(join(tmpdir(), "whispr-ota-export-"));
    const exportDirectory = join(root, "export");
    mkdirSync(join(exportDirectory, "_expo", "static", "js", "android"), {
      recursive: true,
    });
    mkdirSync(join(exportDirectory, "assets"), { recursive: true });
    writeFileSync(
      join(exportDirectory, "_expo", "static", "js", "android", "index.hbc"),
      "bundle-bytes",
    );
    writeFileSync(join(exportDirectory, "assets", "asset-hash"), "asset-bytes");
    writeFileSync(
      join(exportDirectory, "metadata.json"),
      JSON.stringify({
        bundler: "metro",
        fileMetadata: {
          android: {
            assets: [{ ext: "png", path: "assets\\asset-hash" }],
            bundle: "_expo/static/js/android/index.hbc",
          },
        },
        version: 0,
      }),
    );
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });

    const prepared = prepareMobileOtaPublication({
      bundleKey: "20260730-a1b2",
      channel: "UAT",
      exportDirectory,
      keyId: "whispr-mobile-ota-uat-2026-01",
      platform: "android",
      privateKeyPem: privateKey.export({ format: "pem", type: "pkcs8" }).toString(),
      releaseId: "release-1",
      rolloutPercentage: 25,
      runtimeVersion: "fingerprint-uat-1",
    });

    assert.equal(prepared.registration.releaseId, "release-1");
    assert.equal(prepared.registration.payload.rolloutPercentage, 25);
    assert.match(
      prepared.registration.payload.manifestBody,
      /https:\/\/updates\.whispr\.team\/mobile\/ota\/20260730-a1b2\//,
    );
    assert.deepEqual(
      prepared.uploads.map((upload) => upload.key),
      [
        "mobile/ota/20260730-a1b2/_expo/static/js/android/index.hbc",
        "mobile/ota/20260730-a1b2/assets/asset-hash",
      ],
    );
    assert.doesNotMatch(JSON.stringify(prepared), /BEGIN PRIVATE KEY/);
  });
});
