import type {
  MobileAndroidArtifact,
  MobileAppUpdateResponse,
  MobileBuildEnvironment,
  MobileUpdatePlatform,
} from "@wizards/types";

import {
  createAndroidApkUpdateController,
  type CreateAndroidApkUpdateControllerInput,
} from "./android-apk-update-controller";
import {
  createExpoUpdateController,
  type MobileUpdateController,
} from "./mobile-update-controller";

export type MobileUpdateControllerKind = "apk" | "none" | "ota" | "store";

export interface SelectMobileUpdateControllerInput {
  readonly buildEnvironment: MobileBuildEnvironment;
  readonly createApkController?: (
    input: CreateAndroidApkUpdateControllerInput,
  ) => MobileUpdateController;
  readonly currentVersionCode: number;
  readonly decision: MobileAppUpdateResponse;
  readonly otaController: MobileUpdateController;
  readonly platform: MobileUpdatePlatform;
}

export interface MobileUpdateControllerSelection {
  readonly controller: MobileUpdateController;
  readonly kind: MobileUpdateControllerKind;
}

export interface MobileUpdateRuntimeIdentity {
  readonly buildVersion?: string;
  readonly runtimeVersion?: string;
  readonly versionCode?: number;
  readonly versionName?: string;
}

export function resolveMobileUpdateRuntimeIdentity({
  nativeBuildVersion,
  nativeVersion,
  platform,
  runtimeVersion,
}: {
  readonly nativeBuildVersion: string | null | undefined;
  readonly nativeVersion: string | null | undefined;
  readonly platform: MobileUpdatePlatform;
  readonly runtimeVersion: string | null | undefined;
}): MobileUpdateRuntimeIdentity {
  const normalizedRuntimeVersion = runtimeVersion?.trim();
  const versionName = nativeVersion?.trim();
  const parsedVersionCode =
    platform === "android" && nativeBuildVersion && /^\d+$/.test(nativeBuildVersion)
      ? Number(nativeBuildVersion)
      : undefined;
  const versionCode =
    parsedVersionCode !== undefined &&
    Number.isSafeInteger(parsedVersionCode) &&
    parsedVersionCode > 0
      ? parsedVersionCode
      : undefined;
  const buildVersion =
    platform === "android"
      ? versionCode === undefined
        ? undefined
        : String(versionCode)
      : nativeBuildVersion?.trim() || undefined;

  return {
    ...(buildVersion ? { buildVersion } : {}),
    ...(normalizedRuntimeVersion ? { runtimeVersion: normalizedRuntimeVersion } : {}),
    ...(versionCode === undefined ? {} : { versionCode }),
    ...(versionName ? { versionName } : {}),
  };
}

export function readMobileUpdateRuntimeIdentity(
  platform: MobileUpdatePlatform,
): MobileUpdateRuntimeIdentity {
  const updates = require("expo-updates") as typeof import("expo-updates");
  const application = require("expo-application") as typeof import("expo-application");
  return resolveMobileUpdateRuntimeIdentity({
    nativeBuildVersion: application.nativeBuildVersion,
    nativeVersion: application.nativeApplicationVersion,
    platform,
    runtimeVersion: updates.runtimeVersion,
  });
}

function disabledSelection(kind: "none" | "store"): MobileUpdateControllerSelection {
  return {
    controller: createExpoUpdateController({ isEnabled: false }),
    kind,
  };
}

function isNewerArtifact(
  artifact: MobileAndroidArtifact | undefined,
  currentVersionCode: number,
): artifact is MobileAndroidArtifact {
  return artifact !== undefined && artifact.versionCode > currentVersionCode;
}

export function selectMobileUpdateController({
  buildEnvironment,
  createApkController = createAndroidApkUpdateController,
  currentVersionCode,
  decision,
  otaController,
  platform,
}: SelectMobileUpdateControllerInput): MobileUpdateControllerSelection {
  if (decision.updateKind === "ota") {
    return { controller: otaController, kind: "ota" };
  }

  if (decision.updateKind === "store") {
    return disabledSelection("store");
  }

  const internalAndroid =
    platform === "android" && (buildEnvironment === "uat" || buildEnvironment === "canary");
  if (
    decision.updateKind === "apk" &&
    internalAndroid &&
    isNewerArtifact(decision.androidArtifact, currentVersionCode)
  ) {
    return {
      controller: createApkController({
        artifact: decision.androidArtifact,
        latestVersion: decision.latest?.version ?? String(decision.androidArtifact.versionCode),
      }),
      kind: "apk",
    };
  }

  return disabledSelection(buildEnvironment === "production" ? "store" : "none");
}
