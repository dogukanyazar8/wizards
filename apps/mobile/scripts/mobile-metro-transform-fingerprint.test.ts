import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const requireFromApp = createRequire(join(root, "metro.config.js"));

type FingerprintModule = {
  TRANSFORM_CACHE_PACKAGES: readonly string[];
  computeTransformFingerprint: (readVersion?: (name: string) => string | null) => string;
};

const { TRANSFORM_CACHE_PACKAGES, computeTransformFingerprint } = requireFromApp(
  "./metro-transform-fingerprint.js",
) as FingerprintModule;

test("the fingerprint covers every package whose Babel plugin stamps versioned output", () => {
  assert.deepEqual([...TRANSFORM_CACHE_PACKAGES].sort(), [
    "babel-preset-expo",
    "react-native-reanimated",
    "react-native-worklets",
  ]);
});

test("the fingerprint pins the versions that are actually installed", () => {
  const value = computeTransformFingerprint();

  for (const name of TRANSFORM_CACHE_PACKAGES) {
    const installed = (
      requireFromApp(`${name}/package.json`) as {
        version: string;
      }
    ).version;
    assert.ok(
      value.includes(`${name}@${installed}`),
      `Fingerprint "${value}" does not pin ${name}@${installed}`,
    );
  }
});

test("a patch-level bump produces a different fingerprint", () => {
  const before = computeTransformFingerprint(() => "0.10.0");
  const after = computeTransformFingerprint((name) =>
    name === "react-native-worklets" ? "0.10.1" : "0.10.0",
  );

  assert.notEqual(before, after);
});

test("an uninstalled package degrades instead of throwing", () => {
  const value = computeTransformFingerprint(() => null);

  assert.ok(value.includes("absent"));
});

test("metro.config.js folds the fingerprint into Metro's transform cache key", () => {
  const metroConfig = readFileSync(join(root, "metro.config.js"), "utf8");

  assert.match(metroConfig, /require\("\.\/metro-transform-fingerprint(?:\.js)?"\)/);
  assert.match(metroConfig, /config\.cacheVersion\s*=/);
});
