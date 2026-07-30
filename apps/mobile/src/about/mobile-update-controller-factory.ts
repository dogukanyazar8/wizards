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

export function readMobileUpdateRuntimeIdentity(platform: MobileUpdatePlatform): {
  readonly runtimeVersion?: string;
  readonly versionCode?: number;
} {
  const updates = require("expo-updates") as typeof import("expo-updates");
  const runtimeVersion = updates.runtimeVersion ?? undefined;
  if (platform !== "android") {
    return runtimeVersion ? { runtimeVersion } : {};
  }

  const constantsModule = require("expo-constants") as typeof import("expo-constants");
  const versionCode = constantsModule.default.platform?.android?.versionCode;
  return {
    ...(runtimeVersion ? { runtimeVersion } : {}),
    ...(typeof versionCode === "number" && versionCode > 0 ? { versionCode } : {}),
  };
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
