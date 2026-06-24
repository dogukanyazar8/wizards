import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import {
  createDesktopReleasePublishPlan,
  parseDesktopPublishPlanCliArgs,
} from "./desktop-release-publish-plan.mjs";
import { getDesktopVersionContract } from "./release-ops.mjs";

const desktopVersion = getDesktopVersionContract().desktopNativeVersion;

describe("desktop release publish plan", () => {
  it("creates a redacted UAT R2 and GitHub Release publishing plan", async () => {
    await withPublishFiles(async (files) => {
      const plan = createDesktopReleasePublishPlan({
        ...files,
        publishGithubRelease: "true",
        publishR2: "true",
        releaseTag: `v${desktopVersion}-uat.108`,
        ring: "uat",
        updaterBaseUrl: "https://updates.whispr.team/desktop/uat/",
        version: desktopVersion,
        webUrl: "https://wizardsweb-uat.up.railway.app/",
      });

      assert.equal(plan.release.ring, "uat");
      assert.equal(plan.r2.manifestUrl, "https://updates.whispr.team/desktop/uat/latest.json");
      assert.deepEqual(
        plan.r2.uploads.map((upload) => upload.key),
        [
          `desktop/uat/Whispr_${desktopVersion}_x64-setup.exe`,
          "desktop/uat/latest.json",
          `desktop/uat/Whispr_${desktopVersion}_x64-setup.exe.sig`,
        ],
      );
      assert.equal(plan.githubRelease.prerelease, true);
      assert.equal(plan.githubRelease.releaseTag, `v${desktopVersion}-uat.108`);
      assert.ok(plan.githubRelease.assets.includes("desktop-build-metadata.json"));

      const serialized = JSON.stringify(plan);
      assert.doesNotMatch(serialized, /CLOUDFLARE|R2_SECRET|WINDOWS_CERTIFICATE|PRIVATE KEY/);
      assert.doesNotMatch(serialized, /whispr-publish-plan-/);
    });
  });

  it("creates a stable release plan with a normal GitHub Release", async () => {
    await withPublishFiles(async (files) => {
      const plan = createDesktopReleasePublishPlan({
        ...files,
        publishGithubRelease: "true",
        publishR2: "true",
        releaseTag: `v${desktopVersion}`,
        ring: "stable",
        updaterBaseUrl: "https://updates.whispr.team/desktop/stable/",
        version: desktopVersion,
        webUrl: "https://whispr.team/",
      });

      assert.equal(plan.githubRelease.prerelease, false);
      assert.equal(plan.githubRelease.releaseTag, `v${desktopVersion}`);
      assert.equal(plan.r2.uploads[0].key, `desktop/stable/Whispr_${desktopVersion}_x64-setup.exe`);
    });
  });

  it("fails closed for unsafe or mismatched publish inputs", async () => {
    await withPublishFiles(async (files) => {
      assert.throws(
        () =>
          createDesktopReleasePublishPlan({
            ...files,
            publishGithubRelease: "true",
            publishR2: "false",
            releaseTag: `v${desktopVersion}-uat.108`,
            ring: "uat",
            updaterBaseUrl: "https://updates.whispr.team/desktop/uat/",
            version: desktopVersion,
          }),
        /requires publish_r2=true/i,
      );

      assert.throws(
        () =>
          createDesktopReleasePublishPlan({
            ...files,
            publishGithubRelease: "false",
            publishR2: "true",
            releaseTag: `v${desktopVersion}-uat.108`,
            ring: "uat",
            updaterBaseUrl: "https://updates.whispr.team/desktop/stable/",
            version: desktopVersion,
          }),
        /release ring segment/i,
      );

      assert.throws(
        () =>
          createDesktopReleasePublishPlan({
            ...files,
            publishGithubRelease: "false",
            publishR2: "true",
            releaseTag: `v${desktopVersion}`,
            ring: "uat",
            updaterBaseUrl: "https://updates.whispr.team/desktop/uat/",
            version: desktopVersion,
          }),
        /must start with/i,
      );

      assert.throws(
        () =>
          createDesktopReleasePublishPlan({
            ...files,
            manifestPath: files.auditPath,
            publishGithubRelease: "false",
            publishR2: "true",
            releaseTag: `v${desktopVersion}-uat.108`,
            ring: "uat",
            updaterBaseUrl: "https://updates.whispr.team/desktop/uat/",
            version: desktopVersion,
          }),
        /manifest filename must be latest\.json/i,
      );

      assert.throws(
        () =>
          createDesktopReleasePublishPlan({
            ...files,
            publishGithubRelease: "false",
            publishR2: "false",
            releaseTag: `v${desktopVersion}-uat.108`,
            ring: "uat",
            updaterBaseUrl: "https://updates.whispr.team/desktop/uat/",
            version: desktopVersion,
          }),
        /at least one publish target/i,
      );

      assert.throws(
        () =>
          createDesktopReleasePublishPlan({
            ...files,
            publishGithubRelease: "false",
            publishR2: "true",
            releaseTag: `v${desktopVersion}-uat.108`,
            ring: "uat",
            updaterBaseUrl: "https://updates.whispr.team/desktop/uat/latest.json",
            version: desktopVersion,
          }),
        /artifact directory/i,
      );

      assert.throws(
        () =>
          createDesktopReleasePublishPlan({
            ...files,
            publishGithubRelease: "false",
            publishR2: "true",
            releaseTag: `v${desktopVersion}-uat.108`,
            ring: "uat",
            signaturePath: files.auditPath,
            updaterBaseUrl: "https://updates.whispr.team/desktop/uat/",
            version: desktopVersion,
          }),
        /signature filename must match/i,
      );
    });
  });

  it("parses CLI arguments for GitHub Actions usage", () => {
    assert.deepEqual(
      parseDesktopPublishPlanCliArgs([
        "--",
        "--ring",
        "uat",
        "--version",
        desktopVersion,
        "--release-tag",
        `v${desktopVersion}-uat.108`,
        "--updater-base-url",
        "https://updates.whispr.team/desktop/uat/",
        "--publish-r2",
        "true",
        "--publish-github-release",
        "true",
        "--artifact",
        "Whispr_0.8.14_x64-setup.exe",
        "--manifest",
        "latest.json",
        "--signature",
        "Whispr_0.8.14_x64-setup.exe.sig",
        "--metadata",
        "desktop-build-metadata.json",
        "--audit",
        "desktop-release-audit.json",
        "--promotion-json",
        "desktop-release-promotion.json",
        "--promotion-md",
        "desktop-release-promotion.md",
        "--out",
        "desktop-publish-plan.json",
      ]),
      {
        auditPath: "desktop-release-audit.json",
        installerPath: "Whispr_0.8.14_x64-setup.exe",
        manifestPath: "latest.json",
        metadataPath: "desktop-build-metadata.json",
        outputPath: "desktop-publish-plan.json",
        promotionJsonPath: "desktop-release-promotion.json",
        promotionMarkdownPath: "desktop-release-promotion.md",
        publishGithubRelease: "true",
        publishR2: "true",
        releaseTag: `v${desktopVersion}-uat.108`,
        ring: "uat",
        signaturePath: "Whispr_0.8.14_x64-setup.exe.sig",
        updaterBaseUrl: "https://updates.whispr.team/desktop/uat/",
        version: desktopVersion,
        webUrl: undefined,
      },
    );

    assert.throws(() => parseDesktopPublishPlanCliArgs(["unexpected"]), /Unexpected positional/);
    assert.throws(() => parseDesktopPublishPlanCliArgs(["--wat", "1"]), /Unknown option/);
  });
});

async function withPublishFiles(callback) {
  const root = await mkdtemp(path.join(os.tmpdir(), "whispr-publish-plan-"));
  const evidenceDir = path.join(root, "evidence");
  const installerName = `Whispr_${desktopVersion}_x64-setup.exe`;

  try {
    await mkdir(evidenceDir, { recursive: true });
    const files = {
      auditPath: path.join(evidenceDir, `desktop-release-audit-${desktopVersion}-uat.json`),
      installerPath: path.join(root, installerName),
      manifestPath: path.join(root, "latest.json"),
      metadataPath: path.join(root, "desktop-build-metadata.json"),
      promotionJsonPath: path.join(evidenceDir, `desktop-release-promotion-${desktopVersion}-uat.json`),
      promotionMarkdownPath: path.join(evidenceDir, `desktop-release-promotion-${desktopVersion}-uat.md`),
      signaturePath: path.join(root, `${installerName}.sig`),
    };

    await Promise.all(
      Object.values(files).map((filePath) => writeFile(filePath, `content:${path.basename(filePath)}`)),
    );
    await callback(files);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
}
