import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import {
  createDesktopReleaseAudit,
  parseReleaseAuditCliArgs,
  writeDesktopReleaseAudit,
} from "./release-audit.mjs";

const signatureText = "dW50cnVzdGVkIGNvbW1lbnQ6IHNpZ25hdHVyZSBmcm9tIHRhdXJpIHNlY3JldCBrZXkKUlVR";
const uatReleaseTag = "v0.8.14-uat.108";
const uatReleaseBaseUrl = `https://updates.whispr.team/desktop/uat/releases/${uatReleaseTag}/`;

describe("desktop release audit", () => {
  it("creates a redacted release audit report for a signed UAT updater artifact", async () => {
    await withTempAuditFiles(async ({ artifactBytes, artifactPath, manifestPath, signaturePath }) => {
      const report = await createDesktopReleaseAudit({
        artifactPath,
        expectedVersion: "0.8.14",
        manifestSource: manifestPath,
        manifestUrl: "https://updates.whispr.team/desktop/uat/latest.json",
        releaseTag: uatReleaseTag,
        ring: "uat",
        signaturePath,
        webUrl: "https://wizardsweb-uat.up.railway.app/",
      });

      assert.equal(report.ring, "uat");
      assert.equal(report.expectedVersion, "0.8.14");
      assert.equal(report.webUrl, "https://wizardsweb-uat.up.railway.app/");
      assert.deepEqual(
        report.checks.map((check) => [check.id, check.status]),
        [
          ["release_ring", "passed"],
          ["version_contract", "passed"],
          ["release_ops_contract", "passed"],
          ["artifact_hash", "passed"],
          ["updater_feed_preflight", "passed"],
        ],
      );
      assert.deepEqual(report.artifact, {
        fileName: "Whispr_0.8.14_x64-setup.exe",
        sha256: createHash("sha256").update(artifactBytes).digest("hex"),
        sizeBytes: artifactBytes.length,
      });
      assert.deepEqual(report.updaterFeed, {
        artifactUrl: `${uatReleaseBaseUrl}Whispr_0.8.14_x64-setup.exe`,
        manifestUrl: "https://updates.whispr.team/desktop/uat/latest.json",
        platform: "windows-x86_64",
        signatureVerified: true,
        source: "latest.json",
        version: "0.8.14",
      });

      const serialized = JSON.stringify(report);
      assert.doesNotMatch(serialized, new RegExp(signatureText));
      assert.doesNotMatch(serialized, /PRIVATE KEY|TAURI_SIGNING_PRIVATE_KEY/);
      assert.doesNotMatch(serialized, /whispr-release-audit-/);
    });
  });

  it("can write the audit report without leaking updater signatures", async () => {
    await withTempAuditFiles(async ({ artifactPath, dir, manifestPath, signaturePath }) => {
      const outputPath = path.join(dir, "release-audit.json");
      const result = await writeDesktopReleaseAudit({
        artifactPath,
        expectedVersion: "0.8.14",
        manifestSource: manifestPath,
        outputPath,
        ring: "uat",
        signaturePath,
      });
      const written = await readFile(outputPath, "utf8");

      assert.equal(result.outputPath, outputPath);
      assert.match(written, /"updater_feed_preflight"/);
      assert.doesNotMatch(written, new RegExp(signatureText));
    });
  });

  it("fails closed when a release requires an updater manifest but none is provided", async () => {
    await assert.rejects(
      () =>
        createDesktopReleaseAudit({
          requireManifest: true,
          ring: "uat",
        }),
      /requires --manifest/,
    );
  });

  it("records skipped checks for non-updater audits without making fake claims", async () => {
    const report = await createDesktopReleaseAudit({
      ring: "dev",
    });

    assert.equal(report.ring, "dev");
    assert.equal(report.artifact, null);
    assert.equal(report.updaterFeed, null);
    assert.deepEqual(
      report.checks.filter((check) => check.status === "skipped").map((check) => check.id),
      ["artifact_hash", "updater_feed_preflight"],
    );
  });

  it("rejects unsafe release rings and web origins", async () => {
    await assert.rejects(
      () =>
        createDesktopReleaseAudit({
          ring: "nightly",
        }),
      /Release ring must be one of/,
    );

    await assert.rejects(
      () =>
        createDesktopReleaseAudit({
          ring: "uat",
          webUrl: "http://localhost:3000",
        }),
      /web-url must use HTTPS/,
    );

    await assert.rejects(
      () =>
        createDesktopReleaseAudit({
          ring: "uat",
          webUrl: "https://whispr.invalid",
        }),
      /web-url must not point/,
    );
  });

  it("parses audit CLI options safely", () => {
    assert.deepEqual(
      parseReleaseAuditCliArgs([
        "--",
        "--ring=uat",
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
        "--require-manifest",
        "--web-url",
        "https://wizardsweb-uat.up.railway.app/",
        "--out",
        "release-audit.json",
      ]),
      {
        artifactPath: "Whispr_0.8.14_x64-setup.exe",
        checkArtifactUrl: true,
        expectedVersion: "0.8.14",
        manifestSource: "latest.json",
        manifestUrl: "https://updates.whispr.team/desktop/uat/latest.json",
        outputPath: "release-audit.json",
        platform: undefined,
        releaseTag: uatReleaseTag,
        requireManifest: true,
        ring: "uat",
        signaturePath: "Whispr_0.8.14_x64-setup.exe.sig",
        webUrl: "https://wizardsweb-uat.up.railway.app/",
      },
    );

    assert.throws(() => parseReleaseAuditCliArgs(["unexpected"]), /Unexpected positional argument/);
    assert.throws(() => parseReleaseAuditCliArgs(["--unknown", "value"]), /Unknown option/);
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

async function withTempAuditFiles(callback) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "whispr-release-audit-"));
  const artifactPath = path.join(dir, "Whispr_0.8.14_x64-setup.exe");
  const signaturePath = `${artifactPath}.sig`;
  const manifestPath = path.join(dir, "latest.json");
  const artifactBytes = Buffer.from("installer bytes");

  try {
    await writeFile(artifactPath, artifactBytes);
    await writeFile(signaturePath, `${signatureText}\n`, "utf8");
    await writeFile(manifestPath, `${JSON.stringify(buildManifest(), null, 2)}\n`, "utf8");
    await callback({ artifactBytes, artifactPath, dir, manifestPath, signaturePath });
  } finally {
    await rm(dir, { force: true, recursive: true });
  }
}
