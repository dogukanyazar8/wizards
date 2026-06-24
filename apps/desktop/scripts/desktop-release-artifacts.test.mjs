import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  createDesktopBuildMetadata,
  parseDesktopBuildArtifactCliArgs,
  resolveDesktopArtifactDir,
} from "./desktop-release-artifacts.mjs";
import { getDesktopVersionContract } from "./release-ops.mjs";

const desktopVersion = getDesktopVersionContract().desktopNativeVersion;
const scriptPath = fileURLToPath(import.meta.url);
const desktopRoot = path.resolve(path.dirname(scriptPath), "..");

describe("desktop release artifact metadata", () => {
  it("describes a Windows installer and signature for updater builds", async () => {
    await withArtifactDir(async (artifactDir) => {
      const installerName = `Whispr_${desktopVersion}_x64-setup.exe`;
      await writeFile(path.join(artifactDir, installerName), "installer-bytes");
      await writeFile(path.join(artifactDir, `${installerName}.sig`), "signature-bytes");
      await writeFile(path.join(artifactDir, "latest.json"), "{}");

      const metadata = await createDesktopBuildMetadata({
        artifactDir,
        ring: "uat",
        updaterEnabled: "true",
        version: desktopVersion,
      });

      assert.equal(metadata.releaseRing, "uat");
      assert.equal(metadata.platform, "windows-x86_64");
      assert.equal(metadata.updaterEnabled, true);
      assert.equal(metadata.artifacts.installer.filename, installerName);
      assert.equal(metadata.artifacts.signature.filename, `${installerName}.sig`);
      assert.equal(metadata.artifacts.generatedManifests.length, 1);
      assert.match(metadata.artifacts.installer.sha256, /^[a-f0-9]{64}$/);
    });
  });

  it("allows unsigned installer evidence when updater artifacts are not requested", async () => {
    await withArtifactDir(async (artifactDir) => {
      const installerName = `Whispr_${desktopVersion}_x64-setup.exe`;
      await writeFile(path.join(artifactDir, installerName), "installer-bytes");

      const metadata = await createDesktopBuildMetadata({
        artifactDir,
        ring: "canary",
        updaterEnabled: "false",
        version: desktopVersion,
      });

      assert.equal(metadata.releaseRing, "canary");
      assert.equal(metadata.updaterEnabled, false);
      assert.equal(metadata.artifacts.signature, null);
    });
  });

  it("rejects updater builds when the installer signature is missing or empty", async () => {
    await withArtifactDir(async (artifactDir) => {
      const installerName = `Whispr_${desktopVersion}_x64-setup.exe`;
      await writeFile(path.join(artifactDir, installerName), "installer-bytes");

      await assert.rejects(
        () =>
          createDesktopBuildMetadata({
            artifactDir,
            ring: "uat",
            updaterEnabled: "true",
            version: desktopVersion,
          }),
        /signature file/i,
      );

      await writeFile(path.join(artifactDir, `${installerName}.sig`), "");
      await assert.rejects(
        () =>
          createDesktopBuildMetadata({
            artifactDir,
            ring: "uat",
            updaterEnabled: "true",
            version: desktopVersion,
          }),
        /empty/i,
      );
    });
  });

  it("rejects missing, duplicate, or version-drifted installers", async () => {
    await withArtifactDir(async (artifactDir) => {
      await assert.rejects(
        () =>
          createDesktopBuildMetadata({
            artifactDir,
            ring: "uat",
            updaterEnabled: "false",
            version: desktopVersion,
          }),
        /No NSIS setup installer/i,
      );

      await writeFile(path.join(artifactDir, "Whispr_0.0.0_x64-setup.exe"), "wrong-version");
      await assert.rejects(
        () =>
          createDesktopBuildMetadata({
            artifactDir,
            ring: "uat",
            updaterEnabled: "false",
            version: desktopVersion,
          }),
        /No NSIS setup installer/i,
      );

      await writeFile(path.join(artifactDir, `Whispr_${desktopVersion}_x64-setup.exe`), "one");
      await writeFile(path.join(artifactDir, `Whispr_${desktopVersion}_alt-setup.exe`), "two");
      await assert.rejects(
        () =>
          createDesktopBuildMetadata({
            artifactDir,
            ring: "uat",
            updaterEnabled: "false",
            version: desktopVersion,
          }),
        /Expected exactly one/i,
      );
    });
  });

  it("parses CLI arguments for CI usage", () => {
    assert.deepEqual(
      parseDesktopBuildArtifactCliArgs([
        "--",
        "--artifact-dir",
        "bundle/nsis",
        "--version",
        desktopVersion,
        "--ring=uat",
        "--updater-enabled",
        "true",
        "--out",
        "metadata.json",
      ]),
      {
        artifactDir: "bundle/nsis",
        outputPath: "metadata.json",
        platform: undefined,
        ring: "uat",
        updaterEnabled: "true",
        version: desktopVersion,
      },
    );

    assert.throws(() => parseDesktopBuildArtifactCliArgs(["unexpected"]), /Unexpected positional/);
    assert.throws(() => parseDesktopBuildArtifactCliArgs(["--wat", "1"]), /Unknown option/);
  });

  it("resolves artifact directories from package-relative, repo-relative, and absolute paths", async () => {
    const packageRelative = path.join("src-tauri", "target", "release", "bundle", "nsis");
    const repoRelative = path.join(
      "apps",
      "desktop",
      "src-tauri",
      "target",
      "release",
      "bundle",
      "nsis",
    );
    const absolute = path.join(desktopRoot, packageRelative);

    assert.equal(resolveDesktopArtifactDir(packageRelative), absolute);
    assert.equal(resolveDesktopArtifactDir(repoRelative), absolute);
    assert.equal(resolveDesktopArtifactDir(absolute), absolute);
    assert.equal(resolveDesktopArtifactDir(), absolute);
  });
});

async function withArtifactDir(callback) {
  const root = await mkdtemp(path.join(os.tmpdir(), "whispr-desktop-artifacts-"));
  const artifactDir = path.join(root, "nsis");

  try {
    await mkdir(artifactDir, { recursive: true });
    await callback(artifactDir);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
}
