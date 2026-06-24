import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildDesktopReleaseTag,
  createDesktopReleaseWorkflowContract,
  parseDesktopReleaseWorkflowCliArgs,
} from "./desktop-release-workflow.mjs";
import { getDesktopVersionContract } from "./release-ops.mjs";

const desktopVersion = getDesktopVersionContract().desktopNativeVersion;

describe("desktop release workflow contract", () => {
  it("accepts a safe UAT release dispatch contract", () => {
    const contract = createDesktopReleaseWorkflowContract({
      publishGithubRelease: "false",
      publishR2: "false",
      refName: "uat",
      releaseSequence: "108",
      ring: "uat",
      version: desktopVersion,
      webUrl: "https://wizardsweb-uat.up.railway.app/",
    });

    assert.equal(contract.releaseRing, "uat");
    assert.equal(contract.version, desktopVersion);
    assert.equal(contract.releaseTag, `v${desktopVersion}-uat.108`);
    assert.equal(contract.prerelease, true);
    assert.equal(contract.webUrl, "https://wizardsweb-uat.up.railway.app/");
    assert.equal(contract.publish.githubRelease, false);
    assert.equal(contract.publish.r2, false);
    assert.equal(contract.updater.enabled, false);
    assert.equal(contract.updater.artifactBaseUrl, null);
    assert.equal(contract.updater.manifestUrl, null);
  });

  it("supports updater-enabled baseline builds without publishing to R2", () => {
    const contract = createDesktopReleaseWorkflowContract({
      enableUpdater: "true",
      publishGithubRelease: "false",
      publishR2: "false",
      refName: "codex/desktop-0.8.13-baseline",
      releaseSequence: "108",
      ring: "uat",
      version: desktopVersion,
      webUrl: "https://wizardsweb-uat.up.railway.app/",
    });

    assert.equal(contract.publish.githubRelease, false);
    assert.equal(contract.publish.r2, false);
    assert.equal(contract.updater.enabled, true);
    assert.equal(
      contract.updater.artifactBaseUrl,
      `https://updates.whispr.team/desktop/uat/releases/v${desktopVersion}-uat.108/`,
    );
    assert.equal(contract.updater.feedBaseUrl, "https://updates.whispr.team/desktop/uat/");
    assert.equal(
      contract.updater.manifestUrl,
      "https://updates.whispr.team/desktop/uat/latest.json",
    );
  });

  it("validates updater artifact URLs when updater publishing is requested", () => {
    const contract = createDesktopReleaseWorkflowContract({
      enableUpdater: "true",
      publishGithubRelease: "false",
      publishR2: "true",
      refName: "uat",
      releaseSequence: "108",
      ring: "uat",
      version: desktopVersion,
      webUrl: "https://wizardsweb-uat.up.railway.app/",
    });

    assert.equal(
      contract.updater.artifactBaseUrl,
      `https://updates.whispr.team/desktop/uat/releases/v${desktopVersion}-uat.108/`,
    );
    assert.equal(contract.updater.feedBaseUrl, "https://updates.whispr.team/desktop/uat/");
    assert.equal(
      contract.updater.manifestUrl,
      "https://updates.whispr.team/desktop/uat/latest.json",
    );

    assert.throws(
      () =>
        createDesktopReleaseWorkflowContract({
          enableUpdater: "true",
          publishR2: "true",
          refName: "uat",
          releaseSequence: "108",
          ring: "uat",
          updaterBaseUrl: "https://updates.whispr.team/desktop/stable/",
          version: desktopVersion,
          webUrl: "https://wizardsweb-uat.up.railway.app/",
        }),
      /release ring segment/i,
    );

    assert.throws(
      () =>
        createDesktopReleaseWorkflowContract({
          enableUpdater: "true",
          publishR2: "true",
          refName: "uat",
          releaseSequence: "108",
          ring: "uat",
          updaterBaseUrl: "https://updates.whispr.team/desktop/uat/latest.json",
          version: desktopVersion,
          webUrl: "https://wizardsweb-uat.up.railway.app/",
        }),
      /not latest\.json/i,
    );
  });

  it("requires remote updater evidence when GitHub Release publishing is requested", () => {
    assert.throws(
      () =>
        createDesktopReleaseWorkflowContract({
          enableUpdater: "true",
          publishGithubRelease: "true",
          publishR2: "false",
          refName: "uat",
          releaseSequence: "108",
          ring: "uat",
          version: desktopVersion,
          webUrl: "https://wizardsweb-uat.up.railway.app/",
        }),
      /requires publish_r2=true/i,
    );
  });

  it("rejects publishing updater artifacts when updater support is disabled", () => {
    assert.throws(
      () =>
        createDesktopReleaseWorkflowContract({
          enableUpdater: "false",
          publishGithubRelease: "false",
          publishR2: "true",
          refName: "uat",
          releaseSequence: "108",
          ring: "uat",
          version: desktopVersion,
          webUrl: "https://wizardsweb-uat.up.railway.app/",
        }),
      /requires enable_updater=true/i,
    );
  });

  it("uses ring-aware tag names", () => {
    assert.equal(
      buildDesktopReleaseTag({ releaseSequence: "42", ring: "uat", version: desktopVersion }),
      `v${desktopVersion}-uat.42`,
    );
    assert.equal(
      buildDesktopReleaseTag({ releaseSequence: "42", ring: "canary", version: desktopVersion }),
      `v${desktopVersion}-canary.42`,
    );
    assert.equal(
      buildDesktopReleaseTag({ releaseSequence: null, ring: "stable", version: desktopVersion }),
      `v${desktopVersion}`,
    );
  });

  it("rejects invalid rings, missing versions, and version drift", () => {
    assert.throws(
      () =>
        createDesktopReleaseWorkflowContract({
          releaseSequence: "1",
          ring: "prod",
          version: desktopVersion,
          webUrl: "https://wizardsweb-uat.up.railway.app/",
        }),
      /release ring/i,
    );

    assert.throws(
      () =>
        createDesktopReleaseWorkflowContract({
          releaseSequence: "1",
          ring: "uat",
          webUrl: "https://wizardsweb-uat.up.railway.app/",
        }),
      /version is required/i,
    );

    assert.throws(
      () =>
        createDesktopReleaseWorkflowContract({
          releaseSequence: "1",
          ring: "uat",
          version: "0.0.0",
          webUrl: "https://wizardsweb-uat.up.railway.app/",
        }),
      /must match desktop native version/i,
    );
  });

  it("rejects unsafe web URLs", () => {
    for (const webUrl of [
      "http://wizardsweb-uat.up.railway.app/",
      "https://localhost:3000/",
      "https://127.0.0.1:3000/",
      "https://whispr.invalid/",
    ]) {
      assert.throws(
        () =>
          createDesktopReleaseWorkflowContract({
            releaseSequence: "1",
            ring: "uat",
            version: desktopVersion,
            webUrl,
          }),
        /HTTPS|localhost|whispr\.invalid/i,
      );
    }
  });

  it("requires non-stable release sequences", () => {
    assert.throws(
      () =>
        createDesktopReleaseWorkflowContract({
          ring: "uat",
          version: desktopVersion,
          webUrl: "https://wizardsweb-uat.up.railway.app/",
        }),
      /positive release sequence/i,
    );
  });

  it("protects stable releases with explicit branch, URL, version, and confirmation gates", () => {
    const stableBase = {
      refName: "main",
      ring: "stable",
      version: desktopVersion,
      webUrl: "https://whispr.team/",
    };

    assert.throws(
      () => createDesktopReleaseWorkflowContract(stableBase),
      /confirm_stable_release=true/i,
    );

    assert.throws(
      () =>
        createDesktopReleaseWorkflowContract({
          ...stableBase,
          confirmStableRelease: "true",
          refName: "uat",
        }),
      /main branch/i,
    );

    assert.throws(
      () =>
        createDesktopReleaseWorkflowContract({
          ...stableBase,
          confirmStableRelease: "true",
          webUrl: "https://wizardsweb-uat.up.railway.app/",
        }),
      /https:\/\/whispr\.team\//i,
    );

    const contract = createDesktopReleaseWorkflowContract({
      ...stableBase,
      confirmStableRelease: "true",
    });

    assert.equal(contract.releaseTag, `v${desktopVersion}`);
    assert.equal(contract.prerelease, false);
  });

  it("parses CLI arguments for GitHub Actions usage", () => {
    assert.deepEqual(
      parseDesktopReleaseWorkflowCliArgs([
        "--",
        "--ring=uat",
        "--version",
        desktopVersion,
        "--web-url",
        "https://wizardsweb-uat.up.railway.app/",
        "--enable-updater=true",
        "--publish-github-release=false",
        "--publish-r2",
        "true",
        "--release-sequence",
        "12",
      ]),
      {
        confirmStableRelease: undefined,
        enableUpdater: "true",
        outputPath: undefined,
        projectRoot: undefined,
        publishGithubRelease: "false",
        publishR2: "true",
        refName: undefined,
        releaseSequence: "12",
        ring: "uat",
        updaterBaseUrl: undefined,
        version: desktopVersion,
        webUrl: "https://wizardsweb-uat.up.railway.app/",
      },
    );

    assert.throws(() => parseDesktopReleaseWorkflowCliArgs(["--wat", "1"]), /Unknown option/);
    assert.throws(() => parseDesktopReleaseWorkflowCliArgs(["unexpected"]), /Unexpected positional/);
  });
});
