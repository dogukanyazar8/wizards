export type MobilePermissionIntentId = "camera" | "microphone" | "notifications" | "photoLibrary";
export type MobilePermissionStatus = "blocked" | "denied" | "granted" | "not-requested" | "unknown";
export type MobilePermissionPromptPolicy = "after-user-action" | "never-automatically";

export interface MobilePermissionIntent {
  readonly id: MobilePermissionIntentId;
  readonly promptPolicy: MobilePermissionPromptPolicy;
  readonly requiredFor: readonly ("attachments" | "camera" | "messages" | "voice")[];
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
  },
  {
    id: "microphone",
    promptPolicy: "after-user-action",
    requiredFor: ["voice"],
  },
  {
    id: "camera",
    promptPolicy: "after-user-action",
    requiredFor: ["camera"],
  },
  {
    id: "photoLibrary",
    promptPolicy: "after-user-action",
    requiredFor: ["attachments"],
  },
] as const;

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
  feature: "attachments" | "camera" | "messages" | "voice",
): readonly MobilePermissionReadiness[] {
  return readiness.filter((item) => item.intent.requiredFor.includes(feature));
}
