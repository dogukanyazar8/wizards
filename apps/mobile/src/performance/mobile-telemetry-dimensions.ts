import { Platform } from "react-native";
import Constants from "expo-constants";
import { getMobileRuntimeConfig, type MobileEnvironmentName } from "../config/environment";
import * as Device from "expo-device";
import { getMobileNetworkClassSnapshot } from "../network/mobile-network-events";

/**
 * What a measurement has to carry to be comparable.
 *
 * A p95 pooled across builds, platforms and device classes is not a number anyone
 * can act on: a regression on low-end Android disappears into a median full of
 * flagship samples. These are the slices, and they are resolved once per flush
 * rather than per sample.
 */
export type MobileTelemetryDeviceTier = "high" | "low" | "mid" | "unknown";
export type MobileTelemetryNetworkClass = "cellular" | "offline" | "unknown" | "wifi";

export type MobileTelemetryDimensions = {
  readonly appVersion: string;
  readonly buildId: string;
  readonly deviceTier: MobileTelemetryDeviceTier;
  readonly environment: MobileEnvironmentName;
  readonly networkClass: MobileTelemetryNetworkClass;
  readonly osName: string;
  readonly osVersion: string;
};

export type MobileTelemetryDimensionsResolver = () => MobileTelemetryDimensions;

function readNetworkClass(): MobileTelemetryNetworkClass {
  return getMobileNetworkClassSnapshot();
}

/**
 * Device tier is deliberately coarse and deliberately not a model name: the goal
 * is to tell a slow class of device from a fast one, not to identify a handset.
 */
const MOBILE_LOW_TIER_MEMORY_BYTES = 3 * 1024 ** 3;
const MOBILE_MID_TIER_MEMORY_BYTES = 6 * 1024 ** 3;

function readDeviceTier(): MobileTelemetryDeviceTier {
  const totalMemory = Device.totalMemory;
  if (typeof totalMemory !== "number" || totalMemory <= 0) {
    return "unknown";
  }

  if (totalMemory < MOBILE_LOW_TIER_MEMORY_BYTES) {
    return "low";
  }

  return totalMemory < MOBILE_MID_TIER_MEMORY_BYTES ? "mid" : "high";
}

/**
 * Two sources because either one can be missing on a real device: the manifest
 * is absent when `Constants.expoConfig` does not resolve, and the inlined value
 * only exists when the pipeline exported it. Both are written by the same build,
 * so agreeing on one of them is enough.
 */
function readBuildId(): string {
  const extra = Constants.expoConfig?.extra as { whispr?: { buildId?: unknown } } | undefined;
  const manifestBuildId = extra?.whispr?.buildId;
  if (typeof manifestBuildId === "string" && manifestBuildId.length > 0) {
    return manifestBuildId;
  }

  const inlinedBuildId = process.env.EXPO_PUBLIC_WHISPR_BUILD_ID;
  return typeof inlinedBuildId === "string" && inlinedBuildId.length > 0
    ? inlinedBuildId
    : "unknown";
}

export function resolveMobileTelemetryDimensions(): MobileTelemetryDimensions {
  const runtimeConfig = getMobileRuntimeConfig();

  const manifest = Constants.expoConfig;

  return {
    appVersion: manifest?.version ?? "unknown",
    // The build the sample came from. Without it a regression cannot be pinned to
    // a release, which is the first question anyone asks about a p95.
    buildId: readBuildId(),
    deviceTier: readDeviceTier(),
    environment: runtimeConfig.environment,
    networkClass: readNetworkClass(),
    osName: Platform.OS,
    osVersion: String(Platform.Version),
  };
}
