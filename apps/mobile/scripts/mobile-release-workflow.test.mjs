import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import { buildMobileReleaseContract } from "./mobile-release-workflow.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(scriptDirectory, "..", "..", "..");
const workflowPath = resolve(workspaceRoot, ".github", "workflows", "mobile-release.yml");
const easConfigPath = resolve(workspaceRoot, "apps", "mobile", "eas.json");
const awsCliSetupPath = resolve(workspaceRoot, ".github", "scripts", "setup-aws-cli.sh");
const androidBuildToolsSetupPath = resolve(
  workspaceRoot,
  ".github",
  "scripts",
  "setup-android-build-tools.sh",
);
const awsCliPublicKeyPath = resolve(workspaceRoot, ".github", "aws-cli-public-key.asc");

describe("mobile release workflow contract", () => {
  it("validates APK dispatch before build and finalizes paths from the actual versionCode", () => {
    const ota = buildMobileReleaseContract({
      environment: "uat",
      kind: "ota",
      releaseId: "release-1",
      rollout: 25,
      runNumber: 42,
      sourceSha: "a".repeat(40),
    });
    const pendingApk = buildMobileReleaseContract({
      environment: "uat",
      kind: "apk",
      releaseId: "release-2",
      rollout: 100,
      runNumber: 43,
      sourceSha: "b".repeat(40),
      version: "0.9.0-uat.1",
    });
    const apk = buildMobileReleaseContract({
      environment: "uat",
      kind: "apk",
      releaseId: "release-2",
      rollout: 100,
      runNumber: 43,
      sourceSha: "b".repeat(40),
      version: "0.9.0-uat.1",
      versionCode: 8_200,
    });

    assert.match(ota.bundleKey, /^uat-release-1-42-a{12}$/);
    assert.equal(pendingApk.artifactKey, undefined);
    assert.equal(pendingApk.fileName, undefined);
    assert.equal(pendingApk.latestKey, "mobile/uat/latest.json");
    assert.equal(apk.artifactKey, "mobile/uat/releases/v0.9.0-uat.1/whispr-0.9.0-uat.1-8200.apk");
    assert.doesNotMatch(JSON.stringify({ ota, apk }), /private|secret|token/i);
  });

  it("rejects every currently unsupported trust/distribution combination", () => {
    assert.throws(
      () =>
        buildMobileReleaseContract({
          environment: "production",
          kind: "apk",
          releaseId: "release-1",
          rollout: 100,
          runNumber: 1,
          sourceSha: "a".repeat(40),
          version: "1.0.0",
          versionCode: 1,
        }),
      /production.*APK/i,
    );
    assert.throws(
      () =>
        buildMobileReleaseContract({
          environment: "production",
          kind: "ota",
          releaseId: "release-1",
          rollout: 100,
          runNumber: 1,
          sourceSha: "a".repeat(40),
        }),
      /trust root/i,
    );
  });

  it("preflight reports GitHub-hosted scratch space without a fixed capacity threshold", async () => {
    const workflow = await readFile(workflowPath, "utf8");
    const preflightJob = workflow.slice(
      workflow.indexOf("\n  preflight:"),
      workflow.indexOf("\n  contract:"),
    );

    assert.match(preflightJob, /Verify GitHub-hosted release runner toolchain/u);
    assert.match(preflightJob, /df -Pk "\$RUNNER_TEMP"/u);
    assert.match(preflightJob, /GitHub-hosted mobile release runner/u);
    assert.doesNotMatch(preflightJob, /Report hosted runner storage layout|mountpoint|\/mnt/u);
    assert.doesNotMatch(preflightJob, /20971520|at least 20 GiB/u);
  });

  it("records final GitHub-hosted scratch telemetry without an optional environment indirection", async () => {
    const workflow = await readFile(workflowPath, "utf8");
    const apkJob = workflow.slice(workflow.indexOf("\n  apk:"));
    const diskEnd = apkJob.slice(
      apkJob.indexOf("- name: Record APK build disk end"),
      apkJob.indexOf("- name: Verify APK certificate and immutable metadata"),
    );

    assert.match(diskEnd, /if: always\(\)/u);
    assert.match(diskEnd, /set -u/u);
    assert.match(diskEnd, /df -Pk "\$RUNNER_TEMP"/u);
    assert.doesNotMatch(diskEnd, /WHISPR_BUILD_ROOT/u);
  });

  it("pins manual, fail-closed OTA and EAS-managed local APK publication", async () => {
    const [workflow, easConfigSource, awsCliSetup, androidBuildToolsSetup, awsCliPublicKey] =
      await Promise.all([
        readFile(workflowPath, "utf8"),
        readFile(easConfigPath, "utf8"),
        readFile(awsCliSetupPath, "utf8"),
        readFile(androidBuildToolsSetupPath, "utf8"),
        readFile(awsCliPublicKeyPath, "utf8"),
      ]);
    const easConfig = JSON.parse(easConfigSource);

    for (const input of ["environment:", "release_id:", "rollout:", "kind:", "preflight_only:"]) {
      assert.match(workflow, new RegExp(`^\\s{6}${input}`, "m"));
    }
    assert.doesNotMatch(workflow, /^\s{6}version_code:/m);
    assert.doesNotMatch(workflow, /\$\{\{\s*inputs\.version_code\s*\}\}/);
    assert.equal(
      workflow.match(/runs-on: ubuntu-24\.04/g)?.length,
      4,
      "every mobile release job must use the GitHub-hosted Linux runner",
    );
    assert.doesNotMatch(workflow, /runs-on: \[self-hosted/u);
    assert.match(workflow, /Verify GitHub-hosted release runner toolchain/);
    assert.match(workflow, /github\.ref_name.*uat/);
    assert.equal(
      workflow.match(/persist-credentials: false/g)?.length,
      4,
      "every checkout that handles release state must avoid persisting GITHUB_TOKEN",
    );
    assert.equal(
      workflow.match(/\.github\/scripts\/setup-aws-cli\.sh/g)?.length,
      3,
      "every job that invokes the AWS CLI must install the verified job-local tool",
    );
    assert.match(awsCliSetup, /awscli-exe-linux-x86_64-2\.27\.41\.zip/);
    assert.match(awsCliSetup, /gpg .*--verify/);
    assert.match(awsCliSetup, /--install-dir "\$install_root"/);
    assert.match(awsCliSetup, /FB5DB77FD5C118B80511ADA8A6310ACC4672475C/);
    assert.doesNotMatch(awsCliSetup, /sudo|\/usr\/local/);
    assert.equal(
      workflow.match(/actions\/setup-java@de7274f081f381c8f8158605e0321c36c376e2e6/g)?.length,
      2,
      "preflight and APK publication must provision the pinned JDK",
    );
    assert.equal(
      workflow.match(/\.github\/scripts\/setup-android-build-tools\.sh/g)?.length,
      2,
      "preflight and APK publication must install the verified job-local apksigner",
    );
    const preflightJob = workflow.slice(
      workflow.indexOf("\n  preflight:"),
      workflow.indexOf("\n  contract:"),
    );
    const otaJob = workflow.slice(workflow.indexOf("\n  ota:"), workflow.indexOf("\n  apk:"));
    const apkJob = workflow.slice(workflow.indexOf("\n  apk:"));
    assert.doesNotMatch(otaJob, /setup-android-build-tools|setup-java/);
    assert.match(apkJob, /setup-android-build-tools/);
    assert.match(apkJob, /setup-java/);
    assert.doesNotMatch(
      apkJob,
      /Reclaim hosted runner disk|sudo rm -rf|docker image prune|WHISPR_BUILD_ROOT|GRADLE_USER_HOME|scratch_root/u,
      "build steps must use the guarded hosted storage helper instead of ad-hoc cleanup",
    );
    assert.match(androidBuildToolsSetup, /commandlinetools-linux-15859902_latest\.zip/);
    assert.match(
      androidBuildToolsSetup,
      /4e4c464f145a7512b57d088ac6c278c03c9eea610886b35a5e0804e74eedf583/,
    );
    assert.match(androidBuildToolsSetup, /platforms;android-36/);
    assert.match(androidBuildToolsSetup, /build-tools;36\.0\.0/);
    assert.match(androidBuildToolsSetup, /ndk;27\.1\.12297006/);
    assert.match(androidBuildToolsSetup, /cmake;3\.30\.5/);
    assert.match(androidBuildToolsSetup, /\$\{RUNNER_TOOL_CACHE%\/\}\/whispr-android-sdk/);
    assert.match(androidBuildToolsSetup, /sha256sum --check/);
    assert.doesNotMatch(androidBuildToolsSetup, /sudo|\/usr\/local/);
    assert.match(awsCliPublicKey, /-----BEGIN PGP PUBLIC KEY BLOCK-----/);
    assert.match(awsCliPublicKey, /=knv7/);
    assert.match(workflow, /Scrub mobile release material/);
    assert.match(workflow, /WHISPR_MOBILE_OTA_PRIVATE_KEY/);
    assert.match(workflow, /Require OTA and R2 publication secrets/);
    assert.match(
      workflow,
      /eas build --platform android --profile "\$environment" --local --non-interactive --freeze-credentials/,
    );
    assert.match(workflow, /--output "\$apk"/);
    assert.match(workflow, /EAS_LOCAL_BUILD_WORKINGDIR="\$build_root\/work"/);
    assert.match(workflow, /EAS_LOCAL_BUILD_ARTIFACTS_DIR="\$build_root\/artifacts"/);
    assert.match(workflow, /TMPDIR="\$build_root\/tmp"/);
    assert.match(apkJob, /build_root="\$RUNNER_TEMP\/eas-local-build"/u);
    assert.match(workflow, /SENTRY_DISABLE_AUTO_UPLOAD: "true"/);
    assert.equal(
      easConfig.build.uat.env.ORG_GRADLE_PROJECT_reactNativeArchitectures,
      "arm64-v8a,armeabi-v7a",
      "the internal UAT phone APK must avoid emulator ABIs",
    );
    assert.match(preflightJob, /df -Pk "\$RUNNER_TEMP"/);
    assert.doesNotMatch(preflightJob, /20971520|at least 20 GiB/u);
    assert.match(apkJob, /- name: Record APK build disk start/u);
    assert.match(apkJob, /- name: Record APK build disk end\r?\n\s+if: always\(\)/u);
    assert.equal(apkJob.match(/df -Pk "\$RUNNER_TEMP"/gu)?.length, 2);
    assert.match(apkJob, /rm -rf -- "\$RUNNER_TEMP\/eas-local-build"/u);
    assert.doesNotMatch(workflow, /jlumbroso\/free-disk-space|free-disk-space@/u);
    assert.match(workflow, /> "\$build_log" 2>&1/);
    assert.match(workflow, /grep -F '\[RUN_GRADLEW\]'/);
    assert.match(workflow, /\[A-Za-z0-9\+\\\/=\]\{80,\}/);
    assert.doesNotMatch(workflow, /cat "\$build_log"/);
    assert.match(workflow, /rm -f -- "\$RUNNER_TEMP\/eas-local-build\.log"/);
    assert.doesNotMatch(workflow, /--wait|eas-mobile-build\.json|artifacts\.buildUrl/);
    assert.match(workflow, /"\$aapt_path" dump badging "\$apk"/);
    assert.match(workflow, /versionCode='/);
    assert.match(workflow, /versionName='/);
    assert.match(workflow, /actual_version_name.*VALUE_INPUTS_VERSION/);
    assert.match(workflow, /--version-code "\$actual_version_code"/);
    assert.match(workflow, /steps\.verify\.outputs\.version_code/);
    assert.match(workflow, /"\$apksigner_path" verify --print-certs/);
    assert.match(workflow, /sha256sum/);
    assert.match(workflow, /remote_sha256=.*curl/);
    assert.match(workflow, /"\$remote_sha256" == "\$\{VALUE_STEPS_VERIFY_OUTPUTS_SHA256\}"/);
    assert.match(workflow, /stat -c%s/);
    assert.match(workflow, /Content-Length/i);
    assert.match(workflow, /Range: bytes=0-1023/);
    assert.match(workflow, /api\/v1\/mobile\/app\/update/);
    assert.match(workflow, /installed=\$\{VALUE_STEPS_VERIFY_OUTPUTS_VERSION_NAME\}/);
    assert.doesNotMatch(workflow, /installed=0\.0\.0/);
    assert.match(workflow, /\.updateKind == "apk"/);
    assert.match(workflow, /artifact_key="\$\{VALUE_STEPS_VERIFY_OUTPUTS_ARTIFACT_KEY\}"/);
    assert.match(workflow, /r2\.cloudflarestorage\.com/);
    assert.match(workflow, /Authorization: Bearer/);
    assert.match(
      workflow,
      /if: inputs\.kind == 'apk' && inputs\.environment == 'uat' && github\.ref_name == 'uat'/,
    );
    assert.match(workflow, /npm install --prefix "\$RUNNER_TEMP\/eas-cli" eas-cli@24\.5\.0/);
    assert.doesNotMatch(workflow, /npm install --global eas-cli/);
    assert.doesNotMatch(workflow, /credentials\.json/);
    assert.doesNotMatch(workflow, /upload-artifact[\s\S]{0,300}private-key/i);
  });
});

it("rejects a removed publishing environment before preparing any artifact", () => {
  for (const kind of ["apk", "ota"]) {
    assert.throws(
      () => buildMobileReleaseContract({ environment: "canary", kind }),
      /environment must be uat or production/,
    );
  }
});
