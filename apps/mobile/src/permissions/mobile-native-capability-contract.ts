import {
  MOBILE_PERMISSION_INTENTS,
  validateMobilePermissionContract,
  type MobilePermissionFeature,
  type MobilePermissionIntentId,
} from "./mobile-permission-contract";

export type MobileNativeCapabilityId =
  "mediaAttachments" | "nativeNotifications" | "screenShare" | "videoCalls" | "voiceChannels";

export type MobileNativeCapabilityStage =
  "foundation-ready" | "requires-native-module" | "requires-server-contract" | "research-required";

export interface MobileNativeCapability {
  readonly feature: MobilePermissionFeature;
  readonly id: MobileNativeCapabilityId;
  readonly permissionIntents: readonly MobilePermissionIntentId[];
  readonly stage: MobileNativeCapabilityStage;
  readonly platformSupport?: {
    readonly android: "supported";
    readonly ios: "unsupported-ios-no-extension";
  };
  readonly userActionTrigger: string;
}

export interface MobileNativeCapabilitySummary {
  readonly blockedByNativeModule: number;
  readonly blockedByResearch: number;
  readonly blockedByServerContract: number;
  readonly foundationReady: number;
  readonly total: number;
}

export const MOBILE_NATIVE_CAPABILITIES: readonly MobileNativeCapability[] = [
  {
    feature: "messages",
    id: "nativeNotifications",
    permissionIntents: ["notifications"],
    stage: "foundation-ready",
    userActionTrigger: "User enables push notifications from notification settings.",
  },
  {
    feature: "voice",
    id: "voiceChannels",
    permissionIntents: ["microphone", "notifications"],
    stage: "foundation-ready",
    userActionTrigger: "User taps join on a voice channel or call surface.",
  },
  {
    feature: "camera",
    id: "videoCalls",
    permissionIntents: ["camera", "microphone"],
    stage: "foundation-ready",
    userActionTrigger: "User starts camera or joins a video call.",
  },
  {
    feature: "attachments",
    id: "mediaAttachments",
    permissionIntents: ["photoLibrary"],
    stage: "foundation-ready",
    userActionTrigger: "User taps attach and chooses media or files.",
  },
  {
    feature: "screenShare",
    id: "screenShare",
    platformSupport: { android: "supported", ios: "unsupported-ios-no-extension" },
    permissionIntents: ["screenCapture"],
    stage: "foundation-ready",
    userActionTrigger: "User explicitly starts screen sharing from a call.",
  },
] as const;

export function summarizeMobileNativeCapabilities(
  capabilities: readonly MobileNativeCapability[] = MOBILE_NATIVE_CAPABILITIES,
): MobileNativeCapabilitySummary {
  return {
    blockedByNativeModule: capabilities.filter(
      (capability) => capability.stage === "requires-native-module",
    ).length,
    blockedByResearch: capabilities.filter((capability) => capability.stage === "research-required")
      .length,
    blockedByServerContract: capabilities.filter(
      (capability) => capability.stage === "requires-server-contract",
    ).length,
    foundationReady: capabilities.filter((capability) => capability.stage === "foundation-ready")
      .length,
    total: capabilities.length,
  };
}

export function validateMobileNativeCapabilityContract(): string[] {
  const issues = validateMobilePermissionContract();
  const intentIds = new Set(MOBILE_PERMISSION_INTENTS.map((intent) => intent.id));

  for (const capability of MOBILE_NATIVE_CAPABILITIES) {
    if (!capability.userActionTrigger.trim()) {
      issues.push(`${capability.id} must document a user action trigger.`);
    }

    for (const permissionId of capability.permissionIntents) {
      if (!intentIds.has(permissionId)) {
        issues.push(`${capability.id} references unknown permission ${permissionId}.`);
      }
    }

    if (capability.id === "screenShare" && capability.stage !== "foundation-ready") {
      issues.push("screenShare must stay foundation-ready after mobile capture contracts exist.");
    }

    if (
      capability.id === "screenShare" &&
      !capability.permissionIntents.includes("screenCapture")
    ) {
      issues.push("screenShare must declare the screenCapture permission intent.");
    }

    if (capability.id === "nativeNotifications" && capability.stage !== "foundation-ready") {
      issues.push(
        "nativeNotifications must stay foundation-ready after push token registration exists.",
      );
    }

    if (capability.id === "voiceChannels" && capability.stage !== "foundation-ready") {
      issues.push("voiceChannels must stay foundation-ready after native LiveKit join exists.");
    }

    if (capability.id === "videoCalls" && capability.stage !== "foundation-ready") {
      issues.push("videoCalls must stay foundation-ready after native camera publishing exists.");
    }

    if (
      capability.stage === "foundation-ready" &&
      capability.permissionIntents.some((permissionId) => !intentIds.has(permissionId))
    ) {
      issues.push(`${capability.id} cannot be foundation-ready with unknown permissions.`);
    }
  }

  return issues;
}
