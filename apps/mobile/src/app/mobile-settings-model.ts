import type { MobileBootstrapPayload } from "@wizards/types";
import type { MobileSessionDiagnostics } from "../auth/session-types";
import type { MobilePermissionSummary } from "../permissions/mobile-permission-contract";
import type { MobileQualityGateSummary } from "../quality/mobile-quality-gate";
import type { MobileStoreReadinessResult } from "../release/mobile-store-contract";
import type { MobileReleaseBudget } from "../release/mobile-release-contract";

export type MobileSettingsEvidenceTone =
  | "danger"
  | "neutral"
  | "success"
  | "warning";

export type MobileSettingsEvidenceItem = {
  description?: string;
  id: string;
  label: string;
  tone: MobileSettingsEvidenceTone;
  value: string;
};

export type MobileFeatureReadinessSummary = {
  available: number;
  disabled: number;
  pending: number;
  total: number;
};

export type MobileSettingsTextLabels = {
  available: string;
  blocked: string;
  disabled: string;
  missing: string;
  pending: string;
  ready: string;
  refreshToken: string;
  scopeCount: string;
  session: string;
  storeBlockers: string;
  storeWarnings: string;
};

const FEATURE_ORDER = [
  "messages",
  "nativeAuthTokenExchange",
  "pushNotifications",
  "voice",
] as const satisfies readonly (keyof MobileBootstrapPayload["features"])[];

const SENSITIVE_TEXT_PATTERN =
  /(access[_-]?token|refresh[_-]?token|oauth[_-]?code|password|secret|bearer\s+[a-z0-9])/i;

export function getMobileSessionEvidence(
  diagnostics: MobileSessionDiagnostics,
  labels: Pick<
    MobileSettingsTextLabels,
    "missing" | "ready" | "refreshToken" | "scopeCount" | "session"
  >,
): MobileSettingsEvidenceItem[] {
  return [
    {
      id: "session",
      label: labels.session,
      tone: diagnostics.hasSession && !diagnostics.isExpired ? "success" : "warning",
      value: diagnostics.hasSession && !diagnostics.isExpired ? labels.ready : labels.missing,
    },
    {
      id: "refresh",
      label: labels.refreshToken,
      tone: diagnostics.hasRefreshToken ? "success" : "neutral",
      value: diagnostics.hasRefreshToken ? labels.ready : labels.missing,
    },
    {
      id: "scope-count",
      label: labels.scopeCount,
      tone: diagnostics.scopeCount > 0 ? "success" : "neutral",
      value: String(diagnostics.scopeCount),
    },
  ];
}

export function summarizeMobileFeatureReadiness(
  features: MobileBootstrapPayload["features"],
): MobileFeatureReadinessSummary {
  const featureList = FEATURE_ORDER.map((key) => features[key]);

  return {
    available: featureList.filter((feature) => feature.status === "available").length,
    disabled: featureList.filter((feature) => feature.status === "disabled").length,
    pending: featureList.filter(
      (feature) =>
        feature.status === "requires-native-permission" ||
        feature.status === "requires-server-contract",
    ).length,
    total: featureList.length,
  };
}

export function getMobileFeatureEvidence(
  features: MobileBootstrapPayload["features"],
  labels: Pick<
    MobileSettingsTextLabels,
    "available" | "disabled" | "pending"
  >,
): MobileSettingsEvidenceItem[] {
  return FEATURE_ORDER.map((key) => {
    const feature = features[key];
    const isAvailable = feature.status === "available";
    const isDisabled = feature.status === "disabled";

    return {
      ...(feature.reason ? { description: feature.reason } : {}),
      id: key,
      label: feature.label,
      tone: isAvailable ? "success" : isDisabled ? "neutral" : "warning",
      value: isAvailable ? labels.available : isDisabled ? labels.disabled : labels.pending,
    };
  });
}

export function getMobilePermissionEvidence(
  summary: MobilePermissionSummary,
  labels: Pick<MobileSettingsTextLabels, "blocked" | "pending" | "ready">,
): MobileSettingsEvidenceItem[] {
  return [
    {
      id: "permission-granted",
      label: labels.ready,
      tone: summary.granted > 0 ? "success" : "neutral",
      value: `${summary.granted}/${summary.total}`,
    },
    {
      id: "permission-action",
      label: labels.pending,
      tone: summary.needsUserAction > 0 ? "warning" : "success",
      value: String(summary.needsUserAction),
    },
    {
      id: "permission-blocked",
      label: labels.blocked,
      tone: summary.blocked + summary.denied > 0 ? "danger" : "success",
      value: String(summary.blocked + summary.denied),
    },
  ];
}

export function getMobileStoreEvidence(
  readiness: MobileStoreReadinessResult,
  labels: Pick<MobileSettingsTextLabels, "ready" | "storeBlockers" | "storeWarnings">,
): MobileSettingsEvidenceItem[] {
  return [
    {
      id: "store-blockers",
      label: labels.storeBlockers,
      tone: readiness.blockers.length > 0 ? "danger" : "success",
      value: readiness.blockers.length > 0 ? String(readiness.blockers.length) : labels.ready,
    },
    {
      id: "store-warnings",
      label: labels.storeWarnings,
      tone: readiness.warnings.length > 0 ? "warning" : "success",
      value: readiness.warnings.length > 0 ? String(readiness.warnings.length) : labels.ready,
    },
  ];
}

export function getMobileReleaseEvidence(input: {
  budgetCount: number;
  qualitySummary: MobileQualityGateSummary;
  releaseBudgets: readonly MobileReleaseBudget[];
}): MobileSettingsEvidenceItem[] {
  return [
    {
      id: "quality-automation",
      label: "Automation",
      tone: input.qualitySummary.automatedGateCount > 0 ? "success" : "warning",
      value: String(input.qualitySummary.automatedGateCount),
    },
    {
      id: "quality-manual",
      label: "Manual QA",
      tone: input.qualitySummary.criticalManualCount > 0 ? "success" : "warning",
      value: `${input.qualitySummary.criticalManualCount}/${input.qualitySummary.manualCheckCount}`,
    },
    {
      id: "performance-budgets",
      label: "Performance",
      tone: input.budgetCount === input.releaseBudgets.length ? "success" : "warning",
      value: String(input.budgetCount),
    },
  ];
}

export function mobileSettingsEvidenceContainsSensitiveText(
  items: readonly MobileSettingsEvidenceItem[],
): boolean {
  return items.some((item) =>
    SENSITIVE_TEXT_PATTERN.test(
      [item.id, item.label, item.value, item.description ?? ""].join(" "),
    ),
  );
}
