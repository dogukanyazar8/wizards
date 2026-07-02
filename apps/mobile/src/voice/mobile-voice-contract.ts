import {
  MOBILE_NATIVE_CAPABILITIES,
  validateMobileNativeCapabilityContract,
} from "../permissions/mobile-native-capability-contract";
import type { MobilePermissionStatus } from "../permissions/mobile-permission-contract";

export type MobileVoiceRuntimeStatus =
  | "blocked"
  | "checking"
  | "denied"
  | "error"
  | "native-module-pending"
  | "not-requested"
  | "ready"
  | "unavailable";

export interface MobileVoiceRuntimeState {
  readonly errorMessage: string | null;
  readonly hasMicrophonePermission: boolean;
  readonly lastAttemptAt: number | null;
  readonly microphoneStatus: MobilePermissionStatus;
  readonly status: MobileVoiceRuntimeStatus;
}

export interface MobileVoiceRuntimeSummary {
  readonly actionEnabled: boolean;
  readonly isTerminalFailure: boolean;
  readonly requiresNativeModule: boolean;
  readonly requiresServerContract: boolean;
  readonly shouldAskAfterUserAction: boolean;
}

const SENSITIVE_VOICE_ERROR_PATTERN =
  /(access[_-]?token|refresh[_-]?token|oauth[_-]?code|password|secret|bearer\s+[a-z0-9._-]+)/i;

export function createInitialMobileVoiceRuntimeState(): MobileVoiceRuntimeState {
  return {
    errorMessage: null,
    hasMicrophonePermission: false,
    lastAttemptAt: null,
    microphoneStatus: "unknown",
    status: "not-requested",
  };
}

export function createCheckingMobileVoiceRuntimeState(
  current: MobileVoiceRuntimeState,
  now = Date.now(),
): MobileVoiceRuntimeState {
  return {
    ...current,
    errorMessage: null,
    lastAttemptAt: now,
    status: "checking",
  };
}

export function createMobileVoiceRuntimeStateFromPermission(
  microphoneStatus: MobilePermissionStatus,
  now = Date.now(),
): MobileVoiceRuntimeState {
  switch (microphoneStatus) {
    case "granted":
      return {
        errorMessage: null,
        hasMicrophonePermission: true,
        lastAttemptAt: now,
        microphoneStatus,
        status: "ready",
      };
    case "blocked":
      return {
        errorMessage: null,
        hasMicrophonePermission: false,
        lastAttemptAt: now,
        microphoneStatus,
        status: "blocked",
      };
    case "denied":
      return {
        errorMessage: null,
        hasMicrophonePermission: false,
        lastAttemptAt: now,
        microphoneStatus,
        status: "denied",
      };
    case "not-requested":
    case "unknown":
    default:
      return {
        errorMessage: null,
        hasMicrophonePermission: false,
        lastAttemptAt: now,
        microphoneStatus,
        status: "not-requested",
      };
  }
}

export function createUnavailableMobileVoiceRuntimeState(
  reason: string,
  now = Date.now(),
): MobileVoiceRuntimeState {
  return {
    errorMessage: redactMobileVoiceError(reason),
    hasMicrophonePermission: false,
    lastAttemptAt: now,
    microphoneStatus: "unknown",
    status: "unavailable",
  };
}

export function createErroredMobileVoiceRuntimeState(
  error: unknown,
  now = Date.now(),
): MobileVoiceRuntimeState {
  return {
    errorMessage: redactMobileVoiceError(error),
    hasMicrophonePermission: false,
    lastAttemptAt: now,
    microphoneStatus: "unknown",
    status: "error",
  };
}

export function summarizeMobileVoiceRuntimeState(
  state: MobileVoiceRuntimeState,
): MobileVoiceRuntimeSummary {
  return {
    actionEnabled: state.status !== "checking",
    isTerminalFailure:
      state.status === "blocked" || state.status === "error" || state.status === "unavailable",
    requiresNativeModule: state.status === "native-module-pending",
    requiresServerContract: false,
    shouldAskAfterUserAction:
      state.microphoneStatus === "unknown" || state.microphoneStatus === "not-requested",
  };
}

export function mapNativeMicrophonePermissionStatus(
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

  if (normalizedStatus === "blocked" || normalizedStatus === "never_ask_again") {
    return "blocked";
  }

  if (normalizedStatus === "not-requested" || normalizedStatus === "undetermined") {
    return "not-requested";
  }

  return "unknown";
}

export function redactMobileVoiceError(error: unknown): string {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "Voice setup could not be completed.";

  if (SENSITIVE_VOICE_ERROR_PATTERN.test(message)) {
    return "Voice setup failed without exposing sensitive details.";
  }

  return message.slice(0, 180);
}

export function validateMobileVoiceContract(): string[] {
  const issues = validateMobileNativeCapabilityContract();
  const voiceChannels = MOBILE_NATIVE_CAPABILITIES.find(
    (capability) => capability.id === "voiceChannels",
  );

  if (!voiceChannels) {
    issues.push("voiceChannels capability must be declared.");
  } else {
    if (voiceChannels.stage !== "foundation-ready") {
      issues.push("voiceChannels must stay foundation-ready after native LiveKit join exists.");
    }

    if (!voiceChannels.permissionIntents.includes("microphone")) {
      issues.push("voiceChannels must depend on the microphone permission intent.");
    }

    if (!voiceChannels.userActionTrigger.trim()) {
      issues.push("voiceChannels must document a user action trigger.");
    }
  }

  const redacted = redactMobileVoiceError(
    "bearer abc.def.ghi should never be shown in voice errors",
  );
  if (/bearer|abc\.def\.ghi/i.test(redacted)) {
    issues.push("Voice error redaction must remove bearer-like secrets.");
  }

  return issues;
}
