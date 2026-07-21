import {
  MOBILE_NATIVE_CAPABILITIES,
  validateMobileNativeCapabilityContract,
} from "../permissions/mobile-native-capability-contract";
import type { MobilePermissionStatus } from "../permissions/mobile-permission-contract";

export type MobileNotificationRuntimeStatus =
  | "blocked"
  | "checking"
  | "denied"
  | "error"
  | "not-requested"
  | "ready-local"
  | "registered"
  | "registration-failed"
  | "server-contract-pending"
  | "unavailable";

export interface MobileNotificationRuntimeState {
  readonly errorMessage: string | null;
  readonly hasLocalPermission: boolean;
  readonly lastAttemptAt: number | null;
  readonly permissionStatus: MobilePermissionStatus;
  readonly registeredAt: string | null;
  readonly status: MobileNotificationRuntimeStatus;
  readonly tokenFingerprint: string | null;
}

export interface MobileNotificationRuntimeSummary {
  readonly actionEnabled: boolean;
  readonly isRegistered: boolean;
  readonly isTerminalFailure: boolean;
  readonly requiresServerContract: boolean;
  readonly shouldAskAfterUserAction: boolean;
}

const SENSITIVE_NOTIFICATION_ERROR_PATTERN =
  /(access[_-]?token|refresh[_-]?token|oauth[_-]?code|password|secret|bearer\s+[a-z0-9._-]+)/i;

export const MOBILE_PUSH_REGISTRATION_RETRY_INTERVAL_MS = 5 * 60 * 1000;

export function createInitialMobileNotificationRuntimeState(): MobileNotificationRuntimeState {
  return {
    errorMessage: null,
    hasLocalPermission: false,
    lastAttemptAt: null,
    permissionStatus: "unknown",
    registeredAt: null,
    status: "not-requested",
    tokenFingerprint: null,
  };
}

export function createCheckingMobileNotificationRuntimeState(
  current: MobileNotificationRuntimeState,
  now = Date.now(),
): MobileNotificationRuntimeState {
  return {
    ...current,
    errorMessage: null,
    lastAttemptAt: now,
    status: "checking",
  };
}

export function createMobileNotificationRuntimeStateFromPermission(
  permissionStatus: MobilePermissionStatus,
  now = Date.now(),
): MobileNotificationRuntimeState {
  switch (permissionStatus) {
    case "granted":
      return {
        errorMessage: null,
        hasLocalPermission: true,
        lastAttemptAt: now,
        permissionStatus,
        registeredAt: null,
        status: "ready-local",
        tokenFingerprint: null,
      };
    case "blocked":
      return {
        errorMessage: null,
        hasLocalPermission: false,
        lastAttemptAt: now,
        permissionStatus,
        registeredAt: null,
        status: "blocked",
        tokenFingerprint: null,
      };
    case "denied":
      return {
        errorMessage: null,
        hasLocalPermission: false,
        lastAttemptAt: now,
        permissionStatus,
        registeredAt: null,
        status: "denied",
        tokenFingerprint: null,
      };
    case "not-requested":
    case "unknown":
    default:
      return {
        errorMessage: null,
        hasLocalPermission: false,
        lastAttemptAt: now,
        permissionStatus,
        registeredAt: null,
        status: "not-requested",
        tokenFingerprint: null,
      };
  }
}

export function createRegisteredMobileNotificationRuntimeState(
  registration: { registeredAt: string; tokenFingerprint: string },
  now = Date.now(),
): MobileNotificationRuntimeState {
  return {
    errorMessage: null,
    hasLocalPermission: true,
    lastAttemptAt: now,
    permissionStatus: "granted",
    registeredAt: registration.registeredAt,
    status: "registered",
    tokenFingerprint: registration.tokenFingerprint,
  };
}

export function createMobileNotificationRegistrationFailedState(
  error: unknown,
  now = Date.now(),
): MobileNotificationRuntimeState {
  return {
    errorMessage: redactMobileNotificationError(error),
    hasLocalPermission: true,
    lastAttemptAt: now,
    permissionStatus: "granted",
    registeredAt: null,
    status: "registration-failed",
    tokenFingerprint: null,
  };
}

export function createUnavailableMobileNotificationRuntimeState(
  reason: string,
  now = Date.now(),
): MobileNotificationRuntimeState {
  return {
    errorMessage: redactMobileNotificationError(reason),
    hasLocalPermission: false,
    lastAttemptAt: now,
    permissionStatus: "unknown",
    registeredAt: null,
    status: "unavailable",
    tokenFingerprint: null,
  };
}

export function createErroredMobileNotificationRuntimeState(
  error: unknown,
  now = Date.now(),
): MobileNotificationRuntimeState {
  return {
    errorMessage: redactMobileNotificationError(error),
    hasLocalPermission: false,
    lastAttemptAt: now,
    permissionStatus: "unknown",
    registeredAt: null,
    status: "error",
    tokenFingerprint: null,
  };
}

export function summarizeMobileNotificationRuntimeState(
  state: MobileNotificationRuntimeState,
): MobileNotificationRuntimeSummary {
  return {
    actionEnabled: state.status !== "checking",
    isRegistered: state.status === "registered",
    isTerminalFailure:
      state.status === "blocked" || state.status === "error" || state.status === "unavailable",
    requiresServerContract: state.status === "server-contract-pending",
    shouldAskAfterUserAction:
      state.permissionStatus === "unknown" || state.permissionStatus === "not-requested",
  };
}

export function hasGrantedMobileNotificationPermission(
  state: MobileNotificationRuntimeState,
): boolean {
  return state.hasLocalPermission || state.permissionStatus === "granted";
}

/**
 * The permission prompt card must disappear as soon as the operating system grants the
 * permission, even when push-token registration is still pending or failed. Registration
 * problems are surfaced by the notification setup card instead, because tapping "allow"
 * again cannot fix them.
 */
export function shouldOfferMobileNotificationPermission(
  state: MobileNotificationRuntimeState,
): boolean {
  if (state.status === "checking" || hasGrantedMobileNotificationPermission(state)) {
    return false;
  }

  return (
    state.status !== "blocked" &&
    state.status !== "server-contract-pending" &&
    state.status !== "unavailable"
  );
}

export function shouldAttemptMobilePushRegistration(
  state: MobileNotificationRuntimeState,
  now = Date.now(),
): boolean {
  if (state.status === "registered") {
    return false;
  }

  if (state.status !== "registration-failed") {
    return true;
  }

  return (
    state.lastAttemptAt === null ||
    now - state.lastAttemptAt >= MOBILE_PUSH_REGISTRATION_RETRY_INTERVAL_MS
  );
}

export function mapExpoNotificationPermissionStatus(
  status: string | null | undefined,
  canAskAgain: boolean | null | undefined = true,
): MobilePermissionStatus {
  const normalizedStatus = String(status ?? "").toLowerCase();

  if (normalizedStatus === "granted") {
    return "granted";
  }

  if (normalizedStatus === "denied") {
    return canAskAgain === false ? "blocked" : "denied";
  }

  if (normalizedStatus === "undetermined") {
    return "not-requested";
  }

  return "unknown";
}

export function redactMobileNotificationError(error: unknown): string {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "Notification setup could not be completed.";

  if (SENSITIVE_NOTIFICATION_ERROR_PATTERN.test(message)) {
    return "Notification setup failed without exposing sensitive details.";
  }

  return message.slice(0, 180);
}

export function validateMobileNotificationContract(): string[] {
  const issues = validateMobileNativeCapabilityContract();
  const nativeNotifications = MOBILE_NATIVE_CAPABILITIES.find(
    (capability) => capability.id === "nativeNotifications",
  );

  if (!nativeNotifications) {
    issues.push("nativeNotifications capability must be declared.");
  } else {
    if (nativeNotifications.stage !== "foundation-ready") {
      issues.push("nativeNotifications must be foundation-ready after token registration exists.");
    }

    if (!nativeNotifications.permissionIntents.includes("notifications")) {
      issues.push("nativeNotifications must depend on the notifications permission intent.");
    }
  }

  const redacted = redactMobileNotificationError(
    "bearer abc.def.ghi should never be shown in notification errors",
  );
  if (/bearer|abc\.def\.ghi/i.test(redacted)) {
    issues.push("Notification error redaction must remove bearer-like secrets.");
  }

  return issues;
}
