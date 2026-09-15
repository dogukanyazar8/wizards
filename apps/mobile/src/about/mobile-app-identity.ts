import type { MobileReleaseChannel } from "@wizards/types";

import packageJson from "../../package.json";
import { getMobileRuntimeConfig } from "../config/environment";
import { readMobileUpdateRuntimeIdentity } from "./mobile-update-controller-factory";

export const MOBILE_RELEASE_CODENAME = "Resonance";

/** Do not label an older installed binary with this bundle's release name. */
export function getMobileAppCodename(version: string): string | undefined {
  return normalizeMobileAppVersion(version) === packageJson.version
    ? MOBILE_RELEASE_CODENAME
    : undefined;
}

/**
 * "Which build is this?" — version and channel, both read from the binary.
 *
 * Identity comes from the installed binary, not the responding web deployment.
 * UAT builds are labeled Beta; production builds are labeled Stable.
 */

export function resolveMobileAppReleaseChannel(value: string): MobileReleaseChannel {
  switch (value) {
    case "beta":
    case "development":
    case "uat":
      return "beta";
    case "production":
    case "stable":
    default:
      return "stable";
  }
}

export function getMobileAppReleaseChannel(): MobileReleaseChannel {
  return resolveMobileAppReleaseChannel(getMobileRuntimeConfig().releaseChannel);
}

/** Strips a leading `v` and any build suffix so one version string is shown everywhere. */
export function normalizeMobileAppVersion(value: string): string {
  const trimmed = value.trim();
  return /^v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)/.exec(trimmed)?.[1] ?? trimmed;
}

/**
 * The installed binary's version, falling back to the bundled manifest when the
 * native module cannot answer (tests, web preview) — never to a server value.
 */
export function getMobileAppVersion(): string {
  // Required lazily, like `readMobileUpdateRuntimeIdentity` requires its expo
  // modules: the pure helpers above run under the node test runner, which
  // cannot parse react-native's Flow-typed entrypoint.
  const { Platform } = require("react-native") as typeof import("react-native");
  const identity = readMobileUpdateRuntimeIdentity(Platform.OS === "android" ? "android" : "ios");
  return normalizeMobileAppVersion(identity.versionName ?? packageJson.version);
}
