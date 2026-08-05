import type { MobileReleaseChannel } from "@wizards/types";

import packageJson from "../../package.json";
import { getMobileRuntimeConfig } from "../config/environment";
import { readMobileUpdateRuntimeIdentity } from "./mobile-update-controller-factory";

/**
 * "Which build is this?" — version and channel, both read from the binary.
 *
 * The bootstrap payload also carries `app.version` and `app.releaseChannel`,
 * but those describe the *web* deployment that answered the request: its
 * channel falls back to "beta" whenever `NEXT_PUBLIC_WHISPR_RELEASE_CHANNEL`
 * is unset. Reading them made a UAT build call itself Beta on one surface and
 * UAT on another. Every surface that names this app's build reads here.
 */

export function resolveMobileAppReleaseChannel(value: string): MobileReleaseChannel {
  switch (value) {
    case "beta":
    case "canary":
      return "beta";
    case "development":
    case "uat":
      return "uat";
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
