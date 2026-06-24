import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import {
  parseValidationCliArgs,
  readDesktopUpdateManifest,
  validateDesktopUpdateManifest,
  validateDesktopUpdateManifestSource,
} from "./validate-update-manifest.mjs";

const signatureText = "dW50cnVzdGVkIGNvbW1lbnQ6IHNpZ25hdHVyZSBmcm9tIHRhdXJpIHNlY3JldCBrZXkKUlVR";
const uatReleaseTag = "v0.8.14-uat.108";
const uatReleaseBaseUrl = `https://updates.whispr.team/desktop/uat/releases/${uatReleaseTag}/`;

describe("desktop update manifest validation", () => {
  it("accepts a safe manifest that matches the expected artifact and signature", async () => {
    await withTempManifestFiles(async ({ artifactPath, manifestPath, signaturePath }) => {
      const result = await validateDesktopUpdateManifestSource({
        artifactPath,
        expectedReleaseTag: uatReleaseTag,
        expectedRing: "uat",
        expectedVersion: "0.8.14",
        manifestSource: manifestPath,
        signaturePath,
      });

      assert.deepEqual(result, {
        artifactUrl: `${uatReleaseBaseUrl}Whispr_0.8.14_x64-setup.exe`,
        platform: "windows-x86_64",
        signature: signatureText,
        source: manifestPath,
        version: "0.8.14",
      });
    });
  });

  it("rejects version, signature, and artifact filename drift", async () => {
    await withTempManifestFiles(async ({ artifactPath, manifest }) => {
      assert.throws(
        () =>
          validateDesktopUpdateManifest(
            {
              ...manifest,
              version: "0.8.13",
            },
            {
              expectedVersion: "0.8.14",
            },
          ),
        /does not match expected version/,
      );

      assert.throws(
        () =>
          validateDesktopUpdateManifest(manifest, {
            expectedSignature: "different-signature",
            expectedVersion: "0.8.14",
          }),
        /signature does not match/,
      );

      assert.throws(
        () =>
          validateDesktopUpdateManifest(
            {
              ...manifest,
              platforms: {
                "windows-x86_64": {
                  ...manifest.platforms["windows-x86_64"],
                  url: `${uatReleaseBaseUrl}Whispr_0.8.15_x64-setup.exe`,
                },
              },
            },
            {
              artifactPath,
              expectedVersion: "0.8.14",
            },
          ),
        /filename mismatch/,
      );

    });
  });

  it("rejects unsafe update origins and unsupported platform entries", () => {
    const baseManifest = buildManifest();

    for (const url of [
      "http://updates.whispr.team/desktop/uat/Whispr_0.8.14_x64-setup.exe",
      "https://localhost/desktop/uat/Whispr_0.8.14_x64-setup.exe",
      "https://127.0.0.1/desktop/uat/Whispr_0.8.14_x64-setup.exe",
      "https://whispr.invalid/desktop/uat/Whispr_0.8.14_x64-setup.exe",
    ]) {
      assert.throws(
        () =>
          validateDesktopUpdateManifest(
            {
              ...baseManifest,
              platforms: {
                "windows-x86_64": {
                  ...baseManifest.platforms["windows-x86_64"],
                  url,
                },
              },
            },
            {
              expectedVersion: "0.8.14",
            },
          ),
        /HTTPS|localhost|whispr\.invalid/,
      );
    }

    assert.throws(
      () =>
        validateDesktopUpdateManifest(baseManifest, {
          expectedVersion: "0.8.14",
          platform: "darwin-aarch64",
        }),
      /Unsupported updater platform/,
    );
  });

  it("rejects mutable ring-root artifact URLs that would be overwritten in R2", () => {
    const manifest = {
      ...buildManifest(),
      platforms: {
        "windows-x86_64": {
          ...buildManifest().platforms["windows-x86_64"],
          url: "https://updates.whispr.team/desktop/uat/Whispr_0.8.14_x64-setup.exe",
        },
      },
    };

    assert.throws(
      () =>
        validateDesktopUpdateManifest(manifest, {
          expectedReleaseTag: uatReleaseTag,
          expectedRing: "uat",
          expectedVersion: "0.8.14",
        }),
      /immutable release path/i,
    );
  });

  it("requires a valid manifest shape and Windows installer URL", () => {
    assert.throws(() => validateDesktopUpdateManifest(null), /must be an object/);
    assert.throws(
      () =>
        validateDesktopUpdateManifest(
          {
            ...buildManifest(),
            pub_date: "not-a-date",
          },
          { expectedVersion: "0.8.14" },
        ),
      /pub_date/,
    );
    assert.throws(
      () =>
        validateDesktopUpdateManifest(
          {
            ...buildManifest(),
            platforms: {
              "windows-x86_64": {
                signature: signatureText,
                url: "https://updates.whispr.team/desktop/uat/Whispr_0.8.14_x64.zip",
              },
            },
          },
          { expectedVersion: "0.8.14" },
        ),
      /NSIS \.exe/,
    );
  });

  it("reads local manifest files and fails closed for remote non-json manifests", async () => {
    await withTempManifestFiles(async ({ manifestPath }) => {
      const { manifest, source } = await readDesktopUpdateManifest(manifestPath);

      assert.equal(source, manifestPath);
      assert.equal(manifest.version, "0.8.14");
      await assert.rejects(
        () => readDesktopUpdateManifest("https://updates.whispr.team/desktop/uat/latest.txt"),
        /Remote updater manifest URL must point to a \.json file/,
      );
    });
  });

  it("accepts local manifest files with a UTF-8 BOM", async () => {
    await withTempManifestFiles(async ({ manifest, manifestPath }) => {
      await writeFile(manifestPath, `\uFEFF${JSON.stringify(manifest, null, 2)}\n`, "utf8");

      const { manifest: readManifest } = await readDesktopUpdateManifest(manifestPath);

      assert.equal(readManifest.version, "0.8.14");
      assert.equal(
        readManifest.platforms["windows-x86_64"].url,
        `${uatReleaseBaseUrl}Whispr_0.8.14_x64-setup.exe`,
      );
    });
  });

  it("parses CLI validation options without accepting unknown switches", () => {
    assert.deepEqual(
      parseValidationCliArgs([
        "--",
        "--manifest=latest.json",
        "--artifact",
        "Whispr_0.8.14_x64-setup.exe",
        "--signature",
        "Whispr_0.8.14_x64-setup.exe.sig",
        "--expected-version",
        "0.8.14",
        "--ring",
        "uat",
        "--release-tag",
        uatReleaseTag,
        "--check-artifact-url",
      ]),
      {
        artifactPath: "Whispr_0.8.14_x64-setup.exe",
        checkArtifactUrl: true,
        expectedReleaseTag: uatReleaseTag,
        expectedRing: "uat",
        expectedVersion: "0.8.14",
        manifestSource: "latest.json",
        platform: undefined,
        signaturePath: "Whispr_0.8.14_x64-setup.exe.sig",
      },
    );

    assert.throws(() => parseValidationCliArgs(["--artifact", "installer.exe"]), /Missing required option/);
    assert.throws(() => parseValidationCliArgs(["--unknown", "value"]), /Unknown option/);
  });
});

function buildManifest(overrides = {}) {
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
    ...overrides,
  };
}

async function withTempManifestFiles(callback) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "whispr-validate-update-manifest-"));
  const artifactPath = path.join(dir, "Whispr_0.8.14_x64-setup.exe");
  const signaturePath = `${artifactPath}.sig`;
  const manifestPath = path.join(dir, "latest.json");
  const manifest = buildManifest();

  try {
    await writeFile(artifactPath, "installer bytes", "utf8");
    await writeFile(signaturePath, `${signatureText}\n`, "utf8");
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    await callback({ artifactPath, dir, manifest, manifestPath, signaturePath });
  } finally {
    await rm(dir, { force: true, recursive: true });
  }
}
