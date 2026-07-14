import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const mobileRoot = path.resolve(import.meta.dirname, "..");
const harnessPath = path.join(mobileRoot, "scripts", "mobile-redesign-device-capture.ts");

test("deterministic device capture accepts only a pinned UAT DPR-3 environment", async () => {
  assert.equal(existsSync(harnessPath), true, "deterministic device capture harness must exist");

  const packageJson = JSON.parse(readFileSync(path.join(mobileRoot, "package.json"), "utf8")) as {
    scripts?: Record<string, string>;
  };
  assert.equal(
    packageJson.scripts?.["visual:capture:android"],
    "node --import tsx scripts/mobile-redesign-device-capture.ts --platform android",
  );
  assert.equal(
    packageJson.scripts?.["visual:capture:ios"],
    "node --import tsx scripts/mobile-redesign-device-capture.ts --platform ios",
  );

  const capture = await import("./mobile-redesign-device-capture");
  assert.deepEqual(capture.DEVICE_CAPTURE_LOGICAL_VIEWPORT, { height: 844, width: 390 });
  assert.deepEqual(capture.DEVICE_CAPTURE_PHYSICAL_VIEWPORT, { height: 2532, width: 1170 });
  assert.deepEqual(capture.DEVICE_CAPTURE_SAFE_AREA_INSETS, { bottom: 0, left: 0, right: 0, top: 42 });

  const environment = capture.readCaptureEnvironment();
  assert.equal(environment.deviceScaleFactor, 3);
  assert.equal(environment.fontScale, 1);
  assert.equal(environment.locale, "tr-TR");
  assert.equal(environment.timezone, "Europe/Istanbul");
  assert.equal(environment.colorSpace, "sRGB");
  assert.equal(environment.reducedMotion, "always");
  assert.equal(environment.masks.version, 1);
  assert.deepEqual(Object.keys(environment.masks.platforms).sort(), ["android", "ios"]);
  assert.throws(
    () => capture.assertDeterministicDeviceCapture({ ...environment, buildProfile: "production" }),
    /UAT-only/i,
  );

  const outputRoot = mkdtempSync(path.join(tmpdir(), "whispr-device-capture-"));
  const result = await capture.writeDeterministicDeviceCapture({
    anchor: "1a",
    build: "uat-20260715.1",
    buildProfile: "uat",
    commit: "0123456789abcdef0123456789abcdef01234567",
    inputPath: path.join(mobileRoot, "visual-baselines", "whispr-mobile-redesign", "v1", "1a.png"),
    outputRoot,
    platform: "android",
    testAccount: "visual-uat-capture",
    theme: "light",
  });

  assert.equal(result.manifest.buildProfile, "uat");
  assert.equal(result.manifest.anchor, "1a");
  assert.equal(result.manifest.platform, "android");
  assert.equal(result.manifest.theme, "light");
  assert.equal(result.manifest.locale, "tr-TR");
  assert.equal(result.manifest.timezone, "Europe/Istanbul");
  assert.equal(result.manifest.testAccount, "visual-uat-capture");
  assert.equal(result.manifest.mask.version, 1);
  assert.equal(existsSync(result.capturePath), true);
  assert.equal(existsSync(result.manifestPath), true);
  assert.match(result.capturePath, /1a-light[\\/]1a-light\.png$/);
  assert.match(result.manifestPath, /1a-light[\\/]1a-light-manifest\.json$/);

  const evidence = await capture.readDeterministicDeviceCapture({
    anchor: "1a",
    captureDirectory: outputRoot,
    theme: "light",
  });
  assert.equal(evidence.manifest.inputHash, result.manifest.inputHash);

  assert.doesNotThrow(() =>
    capture.assertVisualCaptureEvidenceIsFresh({
      changedPaths: ["artifacts/redesign/1a-light/1a-light.png"],
      commit: result.manifest.commit,
    }),
  );
  assert.throws(
    () =>
      capture.assertVisualCaptureEvidenceIsFresh({
        changedPaths: ["apps/mobile/src/navigation/mobile-navigation.tsx"],
        commit: result.manifest.commit,
      }),
    /stale/i,
  );

  await writeFile(result.manifestPath, JSON.stringify({ ...result.manifest, platform: "unknown" }));
  await assert.rejects(
    () => capture.readDeterministicDeviceCapture({
      anchor: "1a",
      captureDirectory: outputRoot,
      theme: "light",
    }),
    /invalid platform, mask, or image hash/i,
  );
});
