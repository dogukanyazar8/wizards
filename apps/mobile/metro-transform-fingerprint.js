"use strict";

/**
 * Metro's transform cache key is built from the Metro version, `cacheVersion`,
 * the transformer module's own bytes and the Babel *config file's* bytes
 * (`metro/src/DeltaBundler/getTransformCacheKey.js` +
 * `@expo/metro-config/build/babel-transformer.js`). It never covers the Babel
 * plugins that `babel.config.js` resolves out of `node_modules` at transform
 * time — so bumping a plugin leaves every already-cached module holding output
 * the old plugin produced.
 *
 * For most plugins that is merely stale. For `react-native-worklets` it is
 * fatal: the plugin stamps its own version onto every worklet as
 * `__pluginVersion`, and the runtime compares it to the installed JS version
 * with exact string equality, throwing "[Worklets] Mismatch between JavaScript
 * code version and Worklets Babel plugin version" on the first worklet it
 * serializes. A 0.10.0 -> 0.10.1 bump is enough, and it survives every restart
 * until the cache is cleared by hand.
 *
 * Folding the installed versions into `cacheVersion` puts them back into the
 * key, so a dependency bump invalidates the transform cache exactly the way an
 * edit to `babel.config.js` already does.
 */

/** Packages contributing Babel plugins whose output is version-sensitive. */
const TRANSFORM_CACHE_PACKAGES = Object.freeze([
  "babel-preset-expo",
  "react-native-worklets",
  "react-native-reanimated",
]);

/** Reads an installed version, resolving from this app rather than the caller. */
function readInstalledVersion(name) {
  try {
    return require(`${name}/package.json`).version ?? null;
  } catch {
    // A plugin that is not installed contributes nothing to the transform, so
    // its absence is a legitimate state — record it instead of failing the
    // bundler at startup.
    return null;
  }
}

/**
 * Returns a stable, human-readable fingerprint of the transform-critical
 * dependency versions. Readable rather than hashed: it shows up verbatim in
 * Metro cache diagnostics, which is where it is useful.
 */
function computeTransformFingerprint(readVersion = readInstalledVersion) {
  return TRANSFORM_CACHE_PACKAGES.map((name) => `${name}@${readVersion(name) ?? "absent"}`).join(
    "+",
  );
}

module.exports = { TRANSFORM_CACHE_PACKAGES, computeTransformFingerprint };
