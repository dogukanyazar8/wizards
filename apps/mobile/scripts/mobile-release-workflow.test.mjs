import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import { buildMobileReleaseContract } from "./mobile-release-workflow.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(scriptDirectory, "..", "..", "..");
const workflowPath = resolve(workspaceRoot, ".github", "workflows", "mobile-release.yml");
const awsCliSetupPath = resolve(workspaceRoot, ".github", "scripts", "setup-aws-cli.sh");
const androidBuildToolsSetupPath = resolve(
  workspaceRoot,
  ".github",
  "scripts",
  "setup-android-build-tools.sh",
);
const awsCliPublicKeyPath = resolve(workspaceRoot, ".github", "aws-cli-public-key.asc");

describe("mobile release workflow contract", () => {
  it("builds immutable OTA and APK paths without secret material", () => {
    const ota = buildMobileReleaseContract({
      environment: "uat",
      kind: "ota",
      releaseId: "release-1",
      rollout: 25,
      runNumber: 42,
      sourceSha: "a".repeat(40),
    });
    const apk = buildMobileReleaseContract({
      environment: "canary",
      kind: "apk",
      releaseId: "release-2",
      rollout: 100,
      runNumber: 43,
      sourceSha: "b".repeat(40),
      version: "0.9.0-canary.1",
      versionCode: 8_200,
    });

    assert.match(ota.bundleKey, /^uat-release-1-42-a{12}$/);
    assert.equal(
      apk.artifactKey,
      "mobile/canary/releases/v0.9.0-canary.1/whispr-0.9.0-canary.1-8200.apk",
    );
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
          environment: "canary",
          kind: "ota",
          releaseId: "release-1",
          rollout: 100,
          runNumber: 1,
          sourceSha: "a".repeat(40),
        }),
      /trust root/i,
    );
  });

  it("pins manual, fail-closed OTA and EAS-managed local APK publication", async () => {
    const [workflow, awsCliSetup, androidBuildToolsSetup, awsCliPublicKey] = await Promise.all([
      readFile(workflowPath, "utf8"),
      readFile(awsCliSetupPath, "utf8"),
      readFile(androidBuildToolsSetupPath, "utf8"),
      readFile(awsCliPublicKeyPath, "utf8"),
    ]);

    for (const input of ["environment:", "release_id:", "rollout:", "kind:", "preflight_only:"]) {
      assert.match(workflow, new RegExp(`^\\s{6}${input}`, "m"));
    }
    assert.equal(
      workflow.match(/runs-on: \[self-hosted, Linux, X64, mobile-release\]/g)?.length,
      4,
      "every mobile release job must use the dedicated local runner label",
    );
    assert.doesNotMatch(workflow, /runs-on: ubuntu-latest/);
    assert.match(workflow, /Verify self-hosted release runner toolchain/);
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
      workflow.match(/actions\/setup-java@03ad4de0992f5dab5e18fcb136590ce7c4a0ac95/g)?.length,
      2,
      "preflight and APK publication must provision the pinned JDK",
    );
    assert.equal(
      workflow.match(/\.github\/scripts\/setup-android-build-tools\.sh/g)?.length,
      2,
      "preflight and APK publication must install the verified job-local apksigner",
    );
    const otaJob = workflow.slice(workflow.indexOf("\n  ota:"), workflow.indexOf("\n  apk:"));
    const apkJob = workflow.slice(workflow.indexOf("\n  apk:"));
    assert.doesNotMatch(otaJob, /setup-android-build-tools|setup-java/);
    assert.match(apkJob, /setup-android-build-tools/);
    assert.match(apkJob, /setup-java/);
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
    assert.doesNotMatch(workflow, /--wait|eas-mobile-build\.json|artifacts\.buildUrl/);
    assert.match(workflow, /"\$aapt_path" dump badging "\$apk"/);
    assert.match(workflow, /versionCode='/);
    assert.match(workflow, /"\$apksigner_path" verify --print-certs/);
    assert.match(workflow, /sha256sum/);
    assert.match(workflow, /remote_sha256=.*curl/);
    assert.match(workflow, /"\$remote_sha256" == "\$\{\{ steps\.verify\.outputs\.sha256 \}\}"/);
    assert.match(workflow, /stat -c%s/);
    assert.match(workflow, /Content-Length/i);
    assert.match(workflow, /Range: bytes=0-1023/);
    assert.match(workflow, /api\/v1\/mobile\/app\/update/);
    assert.match(workflow, /\.updateKind == "apk"/);
    assert.match(workflow, /mobile\/\$\{environment\}\/releases/);
    assert.match(workflow, /r2\.cloudflarestorage\.com/);
    assert.match(workflow, /Authorization: Bearer/);
    assert.match(
      workflow,
      /if: inputs\.kind == 'apk' && inputs\.environment == 'uat' && github\.ref_name == 'uat'/,
    );
    assert.match(workflow, /npm install --prefix "\$RUNNER_TEMP\/eas-cli" eas-cli@21\.3\.0/);
    assert.doesNotMatch(workflow, /npm install --global eas-cli/);
    assert.doesNotMatch(workflow, /credentials\.json/);
    assert.doesNotMatch(workflow, /upload-artifact[\s\S]{0,300}private-key/i);
  });
});
