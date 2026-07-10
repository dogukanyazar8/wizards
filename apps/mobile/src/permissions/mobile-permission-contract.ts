import {
  WHISPR_MOBILE_PERMISSION_DISCLOSURES,
  getWhisprMobileAndroidPermissions,
  getWhisprMobileIosInfoPlistUsageDescriptions,
  type MobileStorePermissionId,
} from "../release/mobile-store-contract";

export type MobilePermissionIntentId =
  | "camera"
  | "microphone"
  | "notifications"
  | "photoLibrary"
  | "screenCapture";
export type MobilePermissionFeature =
  | "attachments"
  | "camera"
  | "messages"
  | "screenShare"
  | "voice";
export type MobilePermissionStatus = "blocked" | "denied" | "granted" | "not-requested" | "unknown";
export type MobilePermissionPromptPolicy = "after-user-action" | "never-automatically";

export interface MobilePermissionIntent {
  readonly id: MobilePermissionIntentId;
  readonly promptPolicy: MobilePermissionPromptPolicy;
  readonly requiredFor: readonly MobilePermissionFeature[];
  readonly storeDisclosureId: MobileStorePermissionId;
}

export interface MobilePermissionNativeMetadata {
  readonly androidPermission?: string;
  readonly id: MobilePermissionIntentId;
  readonly iosInfoPlistKey?: string;
  readonly usageDescription: string;
}

export interface MobilePermissionReadiness {
  readonly intent: MobilePermissionIntent;
  readonly status: MobilePermissionStatus;
}

export interface MobilePermissionSummary {
  readonly blocked: number;
  readonly denied: number;
  readonly granted: number;
  readonly needsUserAction: number;
  readonly safeToPromptAfterAction: readonly MobilePermissionIntentId[];
  readonly total: number;
}

export const MOBILE_PERMISSION_INTENTS: readonly MobilePermissionIntent[] = [
  {
    id: "notifications",
    promptPolicy: "after-user-action",
    requiredFor: ["messages", "voice"],
    storeDisclosureId: "notifications",
  },
  {
    id: "microphone",
    promptPolicy: "after-user-action",
    requiredFor: ["voice"],
    storeDisclosureId: "microphone",
  },
  {
    id: "camera",
    promptPolicy: "after-user-action",
    requiredFor: ["camera"],
    storeDisclosureId: "camera",
  },
  {
    id: "photoLibrary",
    promptPolicy: "after-user-action",
    requiredFor: ["attachments"],
    storeDisclosureId: "photoLibrary",
  },
  {
    id: "screenCapture",
    promptPolicy: "after-user-action",
    requiredFor: ["screenShare"],
    storeDisclosureId: "screenCapture",
  },
] as const;

// Biometrics is disclosed in the store/native app config but is intentionally
// managed by the dedicated app-lock authentication flow. It is not a generic
// runtime permission that the media/notification permission dispatcher can request.
const STORE_ONLY_PERMISSION_IDS = new Set<MobileStorePermissionId>(["biometrics"]);

const disclosureById = new Map(
  WHISPR_MOBILE_PERMISSION_DISCLOSURES.map((disclosure) => [disclosure.id, disclosure]),
);

export function createInitialMobilePermissionReadiness(): readonly MobilePermissionReadiness[] {
  return MOBILE_PERMISSION_INTENTS.map((intent) => ({
    intent,
    status: "unknown",
  }));
}

export function summarizeMobilePermissionReadiness(
  readiness: readonly MobilePermissionReadiness[],
): MobilePermissionSummary {
  const summary = readiness.reduce(
    (current, item) => {
      const next = { ...current };

      if (item.status === "blocked") {
        next.blocked += 1;
      }

      if (item.status === "denied") {
        next.denied += 1;
      }

      if (item.status === "granted") {
        next.granted += 1;
      }

      if (item.status === "not-requested" || item.status === "unknown") {
        next.needsUserAction += 1;
      }

      return next;
    },
    {
      blocked: 0,
      denied: 0,
      granted: 0,
      needsUserAction: 0,
    },
  );

  return {
    ...summary,
    safeToPromptAfterAction: readiness
      .filter(
        (item) =>
          item.intent.promptPolicy === "after-user-action" &&
          (item.status === "not-requested" || item.status === "unknown"),
      )
      .map((item) => item.intent.id),
    total: readiness.length,
  };
}

export function getPermissionReadinessForFeature(
  readiness: readonly MobilePermissionReadiness[],
  feature: MobilePermissionFeature,
): readonly MobilePermissionReadiness[] {
  return readiness.filter((item) => item.intent.requiredFor.includes(feature));
}

export function getMobilePermissionNativeMetadata(
  id: MobilePermissionIntentId,
): MobilePermissionNativeMetadata {
  const disclosure = disclosureById.get(id);

  if (!disclosure) {
    return {
      id,
      usageDescription:
        "Whispr requests this permission only after a user action for the related feature.",
    };
  }

  return {
    ...(disclosure.androidPermission ? { androidPermission: disclosure.androidPermission } : {}),
    id,
    ...(disclosure.iosInfoPlistKey ? { iosInfoPlistKey: disclosure.iosInfoPlistKey } : {}),
    usageDescription: disclosure.usageDescription,
  };
}

export function validateMobilePermissionContract(): string[] {
  const issues: string[] = [];
  const intentIds = new Set<MobileStorePermissionId>(
    MOBILE_PERMISSION_INTENTS.map((intent) => intent.id),
  );
  const disclosureIds = new Set(
    WHISPR_MOBILE_PERMISSION_DISCLOSURES.map((disclosure) => disclosure.id),
  );
  const androidPermissions = new Set(getWhisprMobileAndroidPermissions());
  const iosUsageDescriptions = getWhisprMobileIosInfoPlistUsageDescriptions();

  for (const intent of MOBILE_PERMISSION_INTENTS) {
    if (intent.promptPolicy !== "after-user-action") {
      issues.push(`${intent.id} must never prompt before a user action.`);
    }

    if (!disclosureIds.has(intent.storeDisclosureId)) {
      issues.push(`${intent.id} is missing a matching store permission disclosure.`);
    }

    if (intent.storeDisclosureId !== intent.id) {
      issues.push(`${intent.id} store disclosure id must match the runtime intent id.`);
    }
  }

  for (const disclosure of WHISPR_MOBILE_PERMISSION_DISCLOSURES) {
    if (!intentIds.has(disclosure.id) && !STORE_ONLY_PERMISSION_IDS.has(disclosure.id)) {
      issues.push(`${disclosure.id} store disclosure is not represented at runtime.`);
    }

    if (!disclosure.userActionRequired) {
      issues.push(`${disclosure.id} store disclosure must require user action.`);
    }

    if (disclosure.androidPermission && !androidPermissions.has(disclosure.androidPermission)) {
      issues.push(`${disclosure.id} Android permission is not emitted by app config.`);
    }

    if (disclosure.iosInfoPlistKey && !iosUsageDescriptions[disclosure.iosInfoPlistKey]) {
      issues.push(`${disclosure.id} iOS usage description is not emitted by app config.`);
    }
  }

  return issues;
}
