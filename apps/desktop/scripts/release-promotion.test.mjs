import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import {
  createDesktopReleasePromotionBundle,
  parseReleasePromotionCliArgs,
  writeDesktopReleasePromotionBundle,
} from "./release-promotion.mjs";

const signatureText = "dW50cnVzdGVkIGNvbW1lbnQ6IHNpZ25hdHVyZSBmcm9tIHRhdXJpIHNlY3JldCBrZXkKUlVR";
const uatReleaseTag = "v0.8.14-uat.108";
const uatReleaseBaseUrl = `https://updates.whispr.team/desktop/uat/releases/${uatReleaseTag}/`;

describe("desktop release promotion bundle", () => {
  it("creates a ready promotion bundle without leaking signatures or local paths", async () => {
    await withTempPromotionFiles(async ({ artifactPath, manifestPath, signaturePath }) => {
      const bundle = await createDesktopReleasePromotionBundle({
        artifactPath,
        expectedVersion: "0.8.14",
        manifestSource: manifestPath,
        manifestUrl: "https://updates.whispr.team/desktop/uat/latest.json",
        releaseTag: uatReleaseTag,
        ring: "uat",
        signaturePath,
        webUrl: "https://wizardsweb-uat.up.railway.app/",
      });

      assert.equal(bundle.status, "ready-for-promotion");
      assert.equal(bundle.release.ring, "uat");
      assert.equal(bundle.release.version, "0.8.14");
      assert.equal(bundle.release.webUrl, "https://wizardsweb-uat.up.railway.app/");
      assert.equal(bundle.release.artifactFileName, "Whispr_0.8.14_x64-setup.exe");
      assert.equal(bundle.release.manifestUrl, "https://updates.whispr.team/desktop/uat/latest.json");
      assert.equal(bundle.release.updaterManifestSource, "latest.json");
      assert.ok(bundle.release.artifactSha256);
      assert.ok(bundle.requiredSmokeTests.some((test) => test.id === "release-promotion-bundle"));
      assert.ok(bundle.manualQaSteps.some((step) => /updater card/i.test(step)));
      assert.ok(bundle.operatorChecklist.length >= 4);
      assert.ok(bundle.performanceEvidence.some((item) => item.id === "updater-check-install"));
      assert.ok(bundle.promotionRules.some((rule) => rule.ring === "stable"));
      assert.ok(bundle.rollbackPlan.some((item) => /aws --endpoint-url/.test(item)));

      const serialized = JSON.stringify(bundle);
      assert.doesNotMatch(serialized, new RegExp(signatureText));
      assert.doesNotMatch(serialized, /PRIVATE KEY|TAURI_SIGNING_PRIVATE_KEY|WINDOWS_CERTIFICATE_PASSWORD/);
      assert.doesNotMatch(serialized, /whispr-release-promotion-/);
    });
  });

  it("writes JSON and Markdown evidence for release operators", async () => {
    await withTempPromotionFiles(async ({ artifactPath, dir, manifestPath, signaturePath }) => {
      const outputDir = path.join(dir, "evidence");
      const result = await writeDesktopReleasePromotionBundle({
        artifactPath,
        expectedVersion: "0.8.14",
        manifestSource: manifestPath,
        outputDir,
        ring: "uat",
        signaturePath,
        webUrl: "https://wizardsweb-uat.up.railway.app/",
      });
      const [json, markdown] = await Promise.all([
        readFile(result.jsonPath, "utf8"),
        readFile(result.markdownPath, "utf8"),
      ]);

      assert.match(json, /"ready-for-promotion"/);
      assert.match(markdown, /Whispr Desktop Release Promotion - 0\.8\.14 \(uat\)/);
      assert.match(markdown, /Mandatory Smoke Tests/);
      assert.match(markdown, /Manual QA Steps/);
      assert.match(markdown, /Performance Evidence/);
      assert.match(markdown, /Ring Promotion Rules/);
      assert.match(markdown, /aws --endpoint-url/);
      assert.doesNotMatch(json, new RegExp(signatureText));
      assert.doesNotMatch(markdown, new RegExp(signatureText));
    });
  });

  it("fails closed without required promotion inputs", async () => {
    await withTempPromotionFiles(async ({ artifactPath, manifestPath, signaturePath }) => {
      await assert.rejects(
        () =>
          createDesktopReleasePromotionBundle({
            artifactPath,
            manifestSource: manifestPath,
            ring: "uat",
            webUrl: "https://wizardsweb-uat.up.railway.app/",
          }),
        /signature file does not exist/,
      );

      await assert.rejects(
        () =>
          createDesktopReleasePromotionBundle({
            artifactPath,
            ring: "uat",
            signaturePath,
            webUrl: "https://wizardsweb-uat.up.railway.app/",
          }),
        /requires --manifest/,
      );
    });
  });

  it("blocks promotion when the manifest signature does not match the .sig file", async () => {
    await withTempPromotionFiles(async ({ artifactPath, manifestPath, signaturePath }) => {
      await writeFile(signaturePath, "different-signature\n", "utf8");

      await assert.rejects(
        () =>
          createDesktopReleasePromotionBundle({
            artifactPath,
            expectedVersion: "0.8.14",
            manifestSource: manifestPath,
            ring: "uat",
            signaturePath,
            webUrl: "https://wizardsweb-uat.up.railway.app/",
          }),
        /signature does not match/,
      );
    });
  });

  it("parses promotion CLI options safely", () => {
    assert.deepEqual(
      parseReleasePromotionCliArgs([
        "--",
        "--ring",
        "uat",
        "--manifest",
        "latest.json",
        "--manifest-url",
        "https://updates.whispr.team/desktop/uat/latest.json",
        "--artifact",
        "Whispr_0.8.14_x64-setup.exe",
        "--signature",
        "Whispr_0.8.14_x64-setup.exe.sig",
        "--expected-version",
        "0.8.14",
        "--release-tag",
        uatReleaseTag,
        "--check-artifact-url",
        "--web-url",
        "https://wizardsweb-uat.up.railway.app/",
        "--out-dir",
        "release-evidence",
      ]),
      {
        artifactPath: "Whispr_0.8.14_x64-setup.exe",
        checkArtifactUrl: true,
        expectedVersion: "0.8.14",
        manifestSource: "latest.json",
        manifestUrl: "https://updates.whispr.team/desktop/uat/latest.json",
        outputDir: "release-evidence",
        platform: undefined,
        releaseTag: uatReleaseTag,
        ring: "uat",
        signaturePath: "Whispr_0.8.14_x64-setup.exe.sig",
        webUrl: "https://wizardsweb-uat.up.railway.app/",
      },
    );

    assert.throws(() => parseReleasePromotionCliArgs(["unexpected"]), /Unexpected positional argument/);
    assert.throws(() => parseReleasePromotionCliArgs(["--unknown", "value"]), /Unknown option/);
    assert.throws(() => parseReleasePromotionCliArgs(["--artifact", "installer.exe"]), /Missing required option/);
  });
});

function buildManifest() {
  return {
    version: "0.8.14",
    notes: "UAT updater smoke.",
    pub_date: "2026-06-22T10:00:00.000Z",
    platforms: {
      "windows-x86_64": {
        signature: signatureText,
        url: `${uatReleaseBaseUrl}Whispr_0.8.14_x64-setup.exe`,
      },
    },
  };
}

async function withTempPromotionFiles(callback) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "whispr-release-promotion-"));
  const artifactPath = path.join(dir, "Whispr_0.8.14_x64-setup.exe");
  const signaturePath = `${artifactPath}.sig`;
  const manifestPath = path.join(dir, "latest.json");

  try {
    await writeFile(artifactPath, Buffer.from("installer bytes"));
    await writeFile(signaturePath, `${signatureText}\n`, "utf8");
    await writeFile(manifestPath, `${JSON.stringify(buildManifest(), null, 2)}\n`, "utf8");
    await callback({ artifactPath, dir, manifestPath, signaturePath });
  } finally {
    await rm(dir, { force: true, recursive: true });
  }
}
