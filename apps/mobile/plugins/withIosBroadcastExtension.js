"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { withInfoPlist, withEntitlementsPlist, withXcodeProject } = require("expo/config-plugins");
const TARGET = "WhisprBroadcast";

function configureBroadcastProject(project, bundleIdentifier) {
  const existing = Object.entries(project.pbxNativeTargetSection()).find(
    ([key, target]) =>
      !key.endsWith("_comment") && String(target.name).replaceAll('"', "") === TARGET,
  );
  if (existing) return project;
  const main = project.getFirstTarget().firstTarget;
  const mainConfigurations =
    project.pbxXCConfigurationList()[main.buildConfigurationList].buildConfigurations;
  const mainSettings =
    project.pbxXCBuildConfigurationSection()[mainConfigurations[0].value].buildSettings;
  const target = project.addTarget(
    TARGET,
    "app_extension",
    TARGET,
    `${bundleIdentifier}.broadcast`,
  );
  project.addBuildPhase(
    [`${TARGET}/SampleHandler.swift`],
    "PBXSourcesBuildPhase",
    "Sources",
    target.uuid,
  );
  project.addBuildPhase([], "PBXFrameworksBuildPhase", "Frameworks", target.uuid);
  const configurations =
    project.pbxXCConfigurationList()[target.pbxNativeTarget.buildConfigurationList]
      .buildConfigurations;
  for (const { value } of configurations)
    Object.assign(project.pbxXCBuildConfigurationSection()[value].buildSettings, {
      SWIFT_VERSION: "5.0",
      APPLICATION_EXTENSION_API_ONLY: "YES",
      SKIP_INSTALL: "YES",
      CODE_SIGN_ENTITLEMENTS: `${TARGET}/${TARGET}.entitlements`,
      INFOPLIST_FILE: `${TARGET}/Info.plist`,
      IPHONEOS_DEPLOYMENT_TARGET: mainSettings.IPHONEOS_DEPLOYMENT_TARGET ?? "16.4",
      TARGETED_DEVICE_FAMILY: mainSettings.TARGETED_DEVICE_FAMILY ?? '"1,2"',
      CURRENT_PROJECT_VERSION: mainSettings.CURRENT_PROJECT_VERSION ?? "1",
      MARKETING_VERSION: mainSettings.MARKETING_VERSION ?? "1.0",
      ...(mainSettings.DEVELOPMENT_TEAM ? { DEVELOPMENT_TEAM: mainSettings.DEVELOPMENT_TEAM } : {}),
    });
  return project;
}

function withIosBroadcastExtension(config) {
  const bundle = config.ios?.bundleIdentifier;
  if (!bundle) throw new Error("iOS broadcast requires a bundle identifier.");
  const group = `group.${bundle}`;
  config = withInfoPlist(config, (mod) => {
    Object.assign(mod.modResults, {
      RTCAppGroupIdentifier: group,
      RTCScreenSharingSocketFD: "rtc_SSFD",
      RTCScreenSharingExtension: `${bundle}.broadcast`,
    });
    return mod;
  });
  config = withEntitlementsPlist(config, (mod) => {
    mod.modResults["com.apple.security.application-groups"] = [
      ...new Set([...(mod.modResults["com.apple.security.application-groups"] ?? []), group]),
    ];
    return mod;
  });
  return withXcodeProject(config, (mod) => {
    const destination = path.join(mod.modRequest.platformProjectRoot, TARGET);
    fs.mkdirSync(destination, { recursive: true });
    for (const file of ["SampleHandler.swift", "Info.plist", `${TARGET}.entitlements`]) {
      const source = fs.readFileSync(
        path.join(__dirname, "..", "ios-extension", TARGET, file),
        "utf8",
      );
      fs.writeFileSync(path.join(destination, file), source.replaceAll("__APP_GROUP__", group));
    }
    configureBroadcastProject(mod.modResults, bundle);
    return mod;
  });
}
module.exports = withIosBroadcastExtension;
module.exports.configureBroadcastProject = configureBroadcastProject;
