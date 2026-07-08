export type MobileVoiceLifecycleScenarioId =
  | "permission-denied"
  | "join-livekit-room"
  | "mute-toggle"
  | "camera-toggle"
  | "audio-output-switch"
  | "unexpected-disconnect-cleanup"
  | "heartbeat-cleanup";

export type MobileVoiceLifecycleScenario = {
  id: MobileVoiceLifecycleScenarioId;
  userVisible: boolean;
  validation: readonly string[];
};

export type MobileVoiceLifecycleMatrixSummary = {
  hasDisconnectCleanupCoverage: boolean;
  hasHeartbeatCleanupCoverage: boolean;
  hasPermissionDeniedCoverage: boolean;
  requiredScenarioCount: number;
  timerBudgetCount: number;
};

export const MOBILE_VOICE_HEARTBEAT_INTERVAL_MS = 25_000;
export const MOBILE_VOICE_LEVEL_INTERVAL_MS = 90;
export const MOBILE_VOICE_LEVEL_CHANGE_THRESHOLD = 0.025;
export const MOBILE_VOICE_DISCONNECTED_MESSAGE =
  "Voice room connection closed. Rejoin to continue.";

export const MOBILE_VOICE_UAT_LIFECYCLE_SCENARIOS: readonly MobileVoiceLifecycleScenario[] = [
  {
    id: "permission-denied",
    userVisible: false,
    validation: ["user-action-permission", "fail-closed-state"],
  },
  {
    id: "join-livekit-room",
    userVisible: false,
    validation: ["server-join", "livekit-connect", "audio-session-start"],
  },
  {
    id: "mute-toggle",
    userVisible: false,
    validation: ["local-microphone-toggle", "participant-state-refresh"],
  },
  {
    id: "camera-toggle",
    userVisible: false,
    validation: ["local-camera-toggle", "heartbeat-media-state"],
  },
  {
    id: "audio-output-switch",
    userVisible: false,
    validation: ["audio-session-route", "local-output-state"],
  },
  {
    id: "unexpected-disconnect-cleanup",
    userVisible: false,
    validation: ["room-disconnect", "server-leave", "audio-session-stop"],
  },
  {
    id: "heartbeat-cleanup",
    userVisible: false,
    validation: ["heartbeat-clear", "level-ticker-clear", "server-leave"],
  },
];

const REQUIRED_SCENARIO_IDS: readonly MobileVoiceLifecycleScenarioId[] = [
  "permission-denied",
  "join-livekit-room",
  "mute-toggle",
  "camera-toggle",
  "audio-output-switch",
  "unexpected-disconnect-cleanup",
  "heartbeat-cleanup",
];

const SENSITIVE_TEXT_PATTERN = /(token|bearer|wss?:\/\/|password|secret)/i;

export function summarizeMobileVoiceLifecycleMatrix(): MobileVoiceLifecycleMatrixSummary {
  const scenarioIds = new Set(MOBILE_VOICE_UAT_LIFECYCLE_SCENARIOS.map((scenario) => scenario.id));

  return {
    hasDisconnectCleanupCoverage: scenarioIds.has("unexpected-disconnect-cleanup"),
    hasHeartbeatCleanupCoverage: scenarioIds.has("heartbeat-cleanup"),
    hasPermissionDeniedCoverage: scenarioIds.has("permission-denied"),
    requiredScenarioCount: REQUIRED_SCENARIO_IDS.length,
    timerBudgetCount: 2,
  };
}

export function validateMobileVoiceLifecycleContract(): string[] {
  const issues: string[] = [];
  const scenarioIds = MOBILE_VOICE_UAT_LIFECYCLE_SCENARIOS.map((scenario) => scenario.id);
  const uniqueScenarioIds = new Set(scenarioIds);

  if (scenarioIds.length !== REQUIRED_SCENARIO_IDS.length) {
    issues.push("Mobile voice lifecycle matrix must cover every required UAT scenario.");
  }

  if (uniqueScenarioIds.size !== scenarioIds.length) {
    issues.push("Mobile voice lifecycle matrix must not duplicate scenario ids.");
  }

  for (const scenarioId of REQUIRED_SCENARIO_IDS) {
    if (!uniqueScenarioIds.has(scenarioId)) {
      issues.push(`Mobile voice lifecycle matrix is missing ${scenarioId}.`);
    }
  }

  if (
    MOBILE_VOICE_HEARTBEAT_INTERVAL_MS < 20_000 ||
    MOBILE_VOICE_HEARTBEAT_INTERVAL_MS > 30_000
  ) {
    issues.push("Mobile voice heartbeat interval must stay between 20s and 30s.");
  }

  if (MOBILE_VOICE_LEVEL_INTERVAL_MS < 75 || MOBILE_VOICE_LEVEL_INTERVAL_MS > 150) {
    issues.push("Mobile voice level ticker must stay between 75ms and 150ms.");
  }

  if (
    MOBILE_VOICE_LEVEL_CHANGE_THRESHOLD < 0.01 ||
    MOBILE_VOICE_LEVEL_CHANGE_THRESHOLD > 0.05
  ) {
    issues.push("Mobile voice level change threshold must stay between 0.01 and 0.05.");
  }

  const serializedContract = JSON.stringify({
    disconnectedMessage: MOBILE_VOICE_DISCONNECTED_MESSAGE,
    scenarios: MOBILE_VOICE_UAT_LIFECYCLE_SCENARIOS,
  });
  if (SENSITIVE_TEXT_PATTERN.test(serializedContract)) {
    issues.push("Mobile voice lifecycle contract must not contain endpoint or credential text.");
  }

  const summary = summarizeMobileVoiceLifecycleMatrix();
  if (!summary.hasPermissionDeniedCoverage) {
    issues.push("Mobile voice lifecycle matrix must cover permission-denied behavior.");
  }

  if (!summary.hasDisconnectCleanupCoverage) {
    issues.push("Mobile voice lifecycle matrix must cover unexpected disconnect cleanup.");
  }

  if (!summary.hasHeartbeatCleanupCoverage) {
    issues.push("Mobile voice lifecycle matrix must cover heartbeat cleanup.");
  }

  return issues;
}
