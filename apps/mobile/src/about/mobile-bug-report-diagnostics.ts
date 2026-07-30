import type { MobileReleaseChannel } from "@wizards/types";

import { readMobileFaultLog, type MobileFeedbackFault } from "../feedback/mobile-fault-log";
import { getExpoFileSystemModule } from "../media/expo-mobile-media-modules";
import {
  toMobilePickedImageBatch,
  type MobilePickedImage,
} from "../media/mobile-image-upload-contract";
import { redactMobileBugReportLogLines } from "./mobile-bug-report-model";

export interface MobileBugReportDeviceContext {
  readonly appBuild?: string | undefined;
  readonly appVersion?: string | undefined;
  readonly locale: string;
  readonly releaseChannel?: MobileReleaseChannel | undefined;
}

export interface MobileBugReportDeviceSource {
  readonly deviceModel: string | null;
  readonly osName: string | null;
  readonly osVersion: string | null;
  readonly platform: string;
}

export interface MobileBugReportRuntimeDiagnostics {
  readonly appBuild?: string | undefined;
  readonly appVersion?: string | undefined;
  readonly deviceInfo: {
    readonly deviceModel?: string | undefined;
    readonly locale: string;
    readonly osName?: string | undefined;
    readonly osVersion?: string | undefined;
  };
  readonly platform: string;
  readonly releaseChannel?: MobileReleaseChannel | undefined;
}

export function collectRecentLogLines(
  limit = 500,
  dependencies: {
    readonly readFaults?: () => readonly MobileFeedbackFault[];
  } = {},
): readonly string[] {
  const boundedLimit = Math.max(0, Math.min(500, Math.trunc(limit)));
  if (boundedLimit === 0) {
    return [];
  }

  const faults = (dependencies.readFaults ?? readMobileFaultLog)().slice(0, boundedLimit);
  return redactMobileBugReportLogLines(
    faults.map((fault) => `${fault.at} kind=${fault.kind} reference=${fault.reference}`),
    boundedLimit,
  );
}

function readRuntimeDeviceSource(): MobileBugReportDeviceSource {
  try {
    const Device = require("expo-device") as {
      readonly modelName?: string | null;
      readonly osName?: string | null;
      readonly osVersion?: string | null;
    };
    const { Platform } = require("react-native") as {
      readonly Platform: { readonly OS: string; readonly Version: number | string };
    };

    return {
      deviceModel: Device.modelName ?? null,
      osName: Device.osName ?? Platform.OS,
      osVersion: Device.osVersion ?? String(Platform.Version),
      platform: Platform.OS,
    };
  } catch {
    return { deviceModel: null, osName: null, osVersion: null, platform: "unknown" };
  }
}

/**
 * User identity is intentionally absent. The returned object is the complete
 * allow-list used both for the visible device subtitle and the request builder.
 */
export function collectDeviceInfo(
  context: MobileBugReportDeviceContext,
  source: MobileBugReportDeviceSource = readRuntimeDeviceSource(),
): MobileBugReportRuntimeDiagnostics {
  return {
    ...(context.appBuild ? { appBuild: context.appBuild } : {}),
    ...(context.appVersion ? { appVersion: context.appVersion } : {}),
    deviceInfo: {
      ...(source.deviceModel ? { deviceModel: source.deviceModel } : {}),
      locale: context.locale,
      ...(source.osName ? { osName: source.osName } : {}),
      ...(source.osVersion ? { osVersion: source.osVersion } : {}),
    },
    platform: source.platform,
    ...(context.releaseChannel ? { releaseChannel: context.releaseChannel } : {}),
  };
}

function measureLocalScreenshotSize(uri: string): number | null {
  try {
    const { File } = getExpoFileSystemModule();
    return new File(uri).size ?? null;
  } catch {
    return null;
  }
}

/**
 * Rebuilds the URI-backed upload part for a queued screenshot. A temporary file
 * may have been evicted while offline; that degrades to no screenshot instead
 * of blocking the text report forever.
 */
export function restoreQueuedMobileBugReportScreenshot(uri: string): MobilePickedImage | null {
  return (
    toMobilePickedImageBatch([{ mimeType: "image/jpeg", uri }], measureLocalScreenshotSize)
      .picked[0] ?? null
  );
}
