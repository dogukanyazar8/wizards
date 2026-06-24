import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import {
  createDesktopUpdateManifest,
  createDesktopUpdateManifestFromFiles,
  parseManifestCliArgs,
  resolveArtifactUrl,
  stripInternalManifestFields,
  writeDesktopUpdateManifest,
} from "./create-update-manifest.mjs";

const signatureText =
  "dW50cnVzdGVkIGNvbW1lbnQ6IHNpZ25hdHVyZSBmcm9tIHRhdXJpIHNlY3JldCBrZXkKUlVRRFJ2OXJMYkFlR29v";
const uatReleaseBaseUrl = "https://updates.whispr.team/desktop/uat/releases/v0.8.14-uat.108/";

describe("desktop update manifest generation", () => {
  it("creates a Tauri updater latest.json manifest from the signed installer artifact", async () => {
    await withTempReleaseFiles(async ({ artifactPath, signaturePath }) => {
      const manifest = await createDesktopUpdateManifestFromFiles({
        artifactPath,
        baseUrl: uatReleaseBaseUrl,
        notes: "UAT updater smoke.",
        pubDate: "2026-06-22T10:00:00.000Z",
        signaturePath,
        version: "0.8.14",
      });

      assert.deepEqual(stripInternalManifestFields(manifest), {
        version: "0.8.14",
        notes: "UAT updater smoke.",
        pub_date: "2026-06-22T10:00:00.000Z",
        platforms: {
          "windows-x86_64": {
            signature: signatureText,
            url: `${uatReleaseBaseUrl}Whispr_0.8.14_x64-setup.exe`,
          },
        },
      });
    });
  });

  it("writes latest.json without logging or transforming the updater signature", async () => {
    await withTempReleaseFiles(async ({ artifactPath, dir, signaturePath }) => {
      const outputPath = path.join(dir, "latest.json");
      const result = await writeDesktopUpdateManifest({
        artifactPath,
        baseUrl: uatReleaseBaseUrl,
        outputPath,
        signaturePath,
        version: "0.8.14",
      });
      const written = JSON.parse(await readFile(outputPath, "utf8"));

      assert.equal(result.outputPath, outputPath);
      assert.equal(written.platforms["windows-x86_64"].signature, signatureText);
      assert.equal(written.platforms["windows-x86_64"].url, result.manifest.platforms["windows-x86_64"].url);
    });
  });

  it("rejects unsafe manifest base URLs", async () => {
    await withTempReleaseFiles(async ({ artifactPath, signaturePath }) => {
      for (const baseUrl of [
        "http://updates.whispr.team/desktop/uat/",
        "https://localhost/desktop/uat/",
        "https://127.0.0.1/desktop/uat/",
        "https://whispr.invalid/desktop/uat/",
        "https://updates.whispr.team/desktop/uat/latest.json",
      ]) {
        assert.throws(
          () =>
            createDesktopUpdateManifest({
              artifactPath,
              baseUrl,
              signature: signatureText,
              signaturePath,
              version: "0.8.14",
            }),
          /base-url|localhost|whispr\.invalid|latest\.json|HTTPS/,
        );
      }
    });
  });

  it("rejects unsupported platforms and non-installer Windows artifacts", async () => {
    await withTempReleaseFiles(async ({ artifactPath, dir, signaturePath }) => {
      assert.throws(
        () =>
          createDesktopUpdateManifest({
            artifactPath,
            baseUrl: uatReleaseBaseUrl,
            platform: "darwin-aarch64",
            signature: signatureText,
            signaturePath,
            version: "0.8.14",
          }),
        /Unsupported updater platform/,
      );

      const zipPath = path.join(dir, "Whispr_0.8.14_x64.zip");
      await writeFile(zipPath, "not an installer", "utf8");
      assert.throws(
        () =>
          createDesktopUpdateManifest({
            artifactPath: zipPath,
            baseUrl: uatReleaseBaseUrl,
            signature: signatureText,
            signaturePath,
            version: "0.8.14",
          }),
        /NSIS \.exe/,
      );
    });
  });

  it("rejects leading-v and malformed manifest versions", async () => {
    await withTempReleaseFiles(async ({ artifactPath, signaturePath }) => {
      for (const version of ["v0.8.14", "0.8", "uat"]) {
        assert.throws(
          () =>
            createDesktopUpdateManifest({
              artifactPath,
              baseUrl: uatReleaseBaseUrl,
              signature: signatureText,
              signaturePath,
              version,
            }),
          /version/,
        );
      }
    });
  });

  it("rejects unsafe artifact filenames before producing URLs", () => {
    assert.throws(
      () => resolveArtifactUrl(uatReleaseBaseUrl, "Whispr 0.8.14 setup.exe"),
      /Artifact filename/,
    );
  });

  it("parses CLI options in explicit long-form and inline forms", () => {
    assert.deepEqual(
      parseManifestCliArgs([
        "--",
        "--artifact",
        "dist/Whispr_0.8.14_x64-setup.exe",
        "--signature=dist/Whispr_0.8.14_x64-setup.exe.sig",
        "--base-url",
        uatReleaseBaseUrl,
        "--version",
        "0.8.14",
      ]),
      {
        artifactPath: "dist/Whispr_0.8.14_x64-setup.exe",
        baseUrl: uatReleaseBaseUrl,
        notes: undefined,
        outputPath: undefined,
        platform: undefined,
        pubDate: undefined,
        signaturePath: "dist/Whispr_0.8.14_x64-setup.exe.sig",
        version: "0.8.14",
      },
    );

    assert.throws(() => parseManifestCliArgs(["--artifact", "installer.exe"]), /Missing required option/);
    assert.throws(() => parseManifestCliArgs(["--unknown", "value"]), /Unknown option/);
  });
});

async function withTempReleaseFiles(callback) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "whispr-update-manifest-"));
  const artifactPath = path.join(dir, "Whispr_0.8.14_x64-setup.exe");
  const signaturePath = `${artifactPath}.sig`;

  try {
    await writeFile(artifactPath, "installer bytes", "utf8");
    await writeFile(signaturePath, `${signatureText}\n`, "utf8");
    await callback({ artifactPath, dir, signaturePath });
  } finally {
    await rm(dir, { force: true, recursive: true });
  }
}
