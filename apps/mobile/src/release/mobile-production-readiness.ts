import {
  MOBILE_NATIVE_CAPABILITIES,
  type MobileNativeCapabilityId,
} from "../permissions/mobile-native-capability-contract";
import { validateMobileStoreReadiness } from "./mobile-store-contract";

export type MobileProductionReadinessArea =
  "auth" | "native" | "performance" | "privacy" | "release" | "store";

export type MobileProductionReadinessStage = "production" | "store-candidate" | "uat";

export type MobileProductionReadinessRisk = "critical" | "high" | "medium";

export type MobileProductionReadinessGate = {
  area: MobileProductionReadinessArea;
  automatedGate: string;
  evidence: string;
  id: string;
  risk: MobileProductionReadinessRisk;
  stage: MobileProductionReadinessStage;
};

export type MobileProductionReadinessSummary = {
  automatedGateCount: number;
  criticalGateCount: number;
  evidenceCount: number;
  productionGateCount: number;
  stageCount: number;
  storeCandidateGateCount: number;
  totalGateCount: number;
  uatGateCount: number;
};

const SENSITIVE_VALUE_PATTERN =
  /(?:access[_-]?token|refresh[_-]?token|oauth[_-]?code|password|secret)\s*[:=]\s*\S+|bearer\s+[a-z0-9._-]{8,}/i;
const REQUIRED_NATIVE_CAPABILITY_IDS: readonly MobileNativeCapabilityId[] = [
  "nativeNotifications",
  "voiceChannels",
  "mediaAttachments",
];

export const MOBILE_PRODUCTION_READINESS_GATES: readonly MobileProductionReadinessGate[] = [
  {
    area: "auth",
    automatedGate: "mobile-auth-exchange-contract",
    evidence:
      "Email/password, refresh, revoke, and web handoff flows reject malformed session payloads before storage.",
    id: "secure-auth-session-lifecycle",
    risk: "critical",
    stage: "uat",
  },
  {
    area: "privacy",
    automatedGate: "mobile-deep-link-contract",
    evidence:
      "Deep links carrying credential-like query values are rejected and never become a mobile route.",
    id: "deep-link-secret-rejection",
    risk: "critical",
    stage: "uat",
  },
  {
    area: "native",
    automatedGate: "mobile-permission-contract",
    evidence:
      "Camera, microphone, notification, and photo library prompts are tied to user actions only.",
    id: "native-permission-user-action-boundary",
    risk: "critical",
    stage: "uat",
  },
  {
    area: "native",
    automatedGate: "mobile-native-capability-contract",
    evidence:
      "Unfinished native features stay marked as server-contract, native-module, or research gated.",
    id: "native-capability-honesty",
    risk: "critical",
    stage: "uat",
  },
  {
    area: "performance",
    automatedGate: "mobile-release-check",
    evidence:
      "Startup, resume, composer latency, and idle memory budgets are recorded before promotion.",
    id: "mobile-performance-budget-evidence",
    risk: "high",
    stage: "uat",
  },
  {
    area: "store",
    automatedGate: "mobile-store-contract",
    evidence:
      "Android permissions, iOS usage descriptions, and store privacy answers use one disclosure contract.",
    id: "store-permission-disclosure-alignment",
    risk: "critical",
    stage: "store-candidate",
  },
  {
    area: "release",
    automatedGate: "mobile-release-contract",
    evidence:
      "EAS profiles use the expected channels, HTTPS endpoints, and production store distribution.",
    id: "eas-profile-release-boundary",
    risk: "critical",
    stage: "production",
  },
  {
    area: "release",
    automatedGate: "mobile-quality-check",
    evidence:
      "Android, iOS, compact, and tablet smoke coverage is required before production promotion.",
    id: "manual-qa-device-matrix",
    risk: "high",
    stage: "production",
  },
] as const;

export function summarizeMobileProductionReadiness(
  gates: readonly MobileProductionReadinessGate[] = MOBILE_PRODUCTION_READINESS_GATES,
): MobileProductionReadinessSummary {
  const stages = new Set(gates.map((gate) => gate.stage));
  const automatedGates = new Set(gates.map((gate) => gate.automatedGate));

  return {
    automatedGateCount: automatedGates.size,
    criticalGateCount: gates.filter((gate) => gate.risk === "critical").length,
    evidenceCount: gates.filter((gate) => gate.evidence.trim().length > 0).length,
    productionGateCount: gates.filter((gate) => gate.stage === "production").length,
    stageCount: stages.size,
    storeCandidateGateCount: gates.filter((gate) => gate.stage === "store-candidate").length,
    totalGateCount: gates.length,
    uatGateCount: gates.filter((gate) => gate.stage === "uat").length,
  };
}

export function validateMobileProductionReadiness(): string[] {
  const issues: string[] = [];
  const summary = summarizeMobileProductionReadiness();
  const storeReadiness = validateMobileStoreReadiness();
  const capabilityIds = new Set(MOBILE_NATIVE_CAPABILITIES.map((capability) => capability.id));

  if (summary.stageCount !== 3) {
    issues.push(
      "Mobile production readiness must cover uat, store-candidate, and production stages.",
    );
  }

  if (summary.evidenceCount !== summary.totalGateCount) {
    issues.push("Every mobile production readiness gate must document evidence.");
  }

  if (summary.criticalGateCount < 4) {
    issues.push(
      "Mobile production readiness must keep critical security and release gates explicit.",
    );
  }

  for (const requiredCapability of REQUIRED_NATIVE_CAPABILITY_IDS) {
    if (!capabilityIds.has(requiredCapability)) {
      issues.push(
        `Production readiness references a missing native capability: ${requiredCapability}.`,
      );
    }
  }

  for (const gate of MOBILE_PRODUCTION_READINESS_GATES) {
    const text = `${gate.id} ${gate.automatedGate} ${gate.evidence}`;

    if (SENSITIVE_VALUE_PATTERN.test(text)) {
      issues.push(`Mobile production readiness gate ${gate.id} contains sensitive-looking text.`);
    }

    if (!/^[a-z0-9-]+$/.test(gate.id)) {
      issues.push(`Mobile production readiness gate ${gate.id} must use a stable kebab-case id.`);
    }
  }

  issues.push(...storeReadiness.blockers);

  return issues;
}
