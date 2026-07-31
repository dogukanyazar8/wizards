"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { withDangerousMod, withMainApplication } = require("expo/config-plugins");

const INTEGRITY_SUBPACKAGE = "integrity";
const PACKAGE_CLASS = "WhisprApkIntegrityPackage";

function ensureMainApplicationPackage(contents, androidPackage) {
  const importLine = `import ${androidPackage}.${INTEGRITY_SUBPACKAGE}.${PACKAGE_CLASS}`;
  let updated = contents;

  if (!updated.includes(importLine)) {
    const reactPackageImport = /^import com\.facebook\.react\.ReactPackage\s*$/m;
    if (!reactPackageImport.test(updated)) {
      throw new Error("Generated MainApplication.kt is missing the ReactPackage import.");
    }
    updated = updated.replace(reactPackageImport, (match) => `${match}\n${importLine}`);
  }

  const registration = `add(${PACKAGE_CLASS}())`;
  if (!updated.includes(registration)) {
    const packagesApply = /PackageList\(this\)\.packages\.apply\s*\{\r?\n/;
    if (!packagesApply.test(updated)) {
      throw new Error("Generated MainApplication.kt is missing PackageList(...).packages.apply.");
    }
    updated = updated.replace(packagesApply, (match) => `${match}          ${registration}\n`);
  }

  return updated;
}

function withWhisprApkIntegritySources(config) {
  return withDangerousMod(config, [
    "android",
    (configWithMod) => {
      const androidPackage = configWithMod.android?.package;
      if (!androidPackage) {
        throw new Error("android.package must be set before the APK integrity plugin runs.");
      }

      const sourceRoot = path.join(
        configWithMod.modRequest.platformProjectRoot,
        "app",
        "src",
        "main",
        "java",
        ...androidPackage.split("."),
        INTEGRITY_SUBPACKAGE,
      );
      fs.mkdirSync(sourceRoot, { recursive: true });

      const sources = require("./whispr-apk-integrity-sources");
      for (const [fileName, render] of Object.entries(sources)) {
        fs.writeFileSync(path.join(sourceRoot, fileName), render(androidPackage), "utf8");
      }

      return configWithMod;
    },
  ]);
}

function withWhisprApkIntegrityMainApplication(config) {
  return withMainApplication(config, (configWithMainApplication) => {
    const androidPackage = configWithMainApplication.android?.package;
    if (!androidPackage) {
      throw new Error("android.package must be set before the APK integrity plugin runs.");
    }

    configWithMainApplication.modResults.contents = ensureMainApplicationPackage(
      configWithMainApplication.modResults.contents,
      androidPackage,
    );
    return configWithMainApplication;
  });
}

function withWhisprApkIntegrity(config) {
  return withWhisprApkIntegritySources(withWhisprApkIntegrityMainApplication(config));
}

module.exports = withWhisprApkIntegrity;
module.exports.ensureMainApplicationPackage = ensureMainApplicationPackage;
