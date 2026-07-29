import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { MobileBootstrapPayload } from "@wizards/types";
import type { MobileSessionDiagnostics } from "../src/auth/session-types";
import {
  getMobileFeatureEvidence,
  getMobilePermissionEvidence,
  getMobileReleaseEvidence,
  getMobileSessionEvidence,
  getMobileStoreEvidence,
  mobileSettingsEvidenceContainsSensitiveText,
  summarizeMobileFeatureReadiness,
} from "../src/app/mobile-settings-model";
import type { MobilePermissionSummary } from "../src/permissions/mobile-permission-contract";
import type { MobileStoreReadinessResult } from "../src/release/mobile-store-contract";

const labels = {
  available: "Ready",
  automation: "Automation",
  blocked: "Blocked",
  disabled: "Disabled",
  manualQa: "Manual QA",
  missing: "Missing",
  pending: "Pending",
  performance: "Performance",
  ready: "Ready",
  refreshToken: "Refresh",
  scopeCount: "Scopes",
  session: "Session",
  storeBlockers: "Store blockers",
  storeWarnings: "Store warnings",
};

const features: MobileBootstrapPayload["features"] = {
  attachments: {
    label: "Attachments",
    reason: "Mobile upload provider contract is pending.",
    status: "requires-server-contract",
  },
  invites: {
    label: "Invites",
    reason: "Mobile invite acceptance endpoint is pending.",
    status: "requires-server-contract",
  },
  messageSearch: {
    label: "Message search",
    reason: "Mobile search endpoints are available.",
    status: "available",
  },
  messages: {
    label: "Messages",
    status: "available",
  },
  nativeAuthTokenExchange: {
    label: "Native auth",
    reason: "Server contract is active.",
    status: "available",
  },
  pushNotifications: {
    label: "Push",
    reason: "Native permission onboarding is not connected yet.",
    status: "requires-native-permission",
  },
  voice: {
    label: "Voice",
    reason: "LiveKit mobile contract is pending.",
    status: "requires-server-contract",
  },
};

describe("mobile settings display model", () => {
  it("summarizes feature readiness without making pending features active", () => {
    const summary = summarizeMobileFeatureReadiness(features);
    const evidence = getMobileFeatureEvidence(features, labels);

    assert.deepEqual(summary, {
      available: 3,
      disabled: 0,
      pending: 4,
      total: 7,
    });
    assert.equal(evidence.find((item) => item.id === "attachments")?.value, "Pending");
    assert.equal(evidence.find((item) => item.id === "invites")?.value, "Pending");
    assert.equal(evidence.find((item) => item.id === "messageSearch")?.value, "Ready");
    assert.equal(evidence.find((item) => item.id === "voice")?.tone, "warning");
    assert.equal(evidence.find((item) => item.id === "pushNotifications")?.value, "Pending");
  });

  it("keeps session evidence bounded and token-free", () => {
    const diagnostics: MobileSessionDiagnostics = {
      hasRefreshToken: true,
      hasSession: true,
      isExpired: false,
      scopeCount: 3,
      secondsUntilExpiry: 3600,
      status: "signed-in",
    };
    const evidence = getMobileSessionEvidence(diagnostics, labels);

    assert.deepEqual(
      evidence.map((item) => item.value),
      ["Ready", "Ready", "3"],
    );
    assert.equal(mobileSettingsEvidenceContainsSensitiveText(evidence), false);
  });

  it("does not claim permissions are granted when they still need user action", () => {
    const summary: MobilePermissionSummary = {
      blocked: 0,
      denied: 1,
      granted: 1,
      needsUserAction: 2,
      safeToPromptAfterAction: ["camera", "microphone"],
      total: 4,
    };
    const evidence = getMobilePermissionEvidence(summary, labels);

    assert.equal(evidence.find((item) => item.id === "permission-granted")?.value, "1/4");
    assert.equal(evidence.find((item) => item.id === "permission-action")?.tone, "warning");
    assert.equal(evidence.find((item) => item.id === "permission-blocked")?.tone, "danger");
  });

  it("surfaces store blockers and warnings without leaking sensitive text", () => {
    const readiness: MobileStoreReadinessResult = {
      blockers: [],
      checklist: ["Run store QA."],
      permissionCount: 4,
      privacyRequirementCount: 3,
      warnings: [],
    };
    const evidence = getMobileStoreEvidence(readiness, labels);

    assert.deepEqual(
      evidence.map((item) => item.value),
      ["Ready", "Ready"],
    );
    assert.equal(mobileSettingsEvidenceContainsSensitiveText(evidence), false);
  });

  it("summarizes release evidence with localized labels and bounded values", () => {
    const evidence = getMobileReleaseEvidence({
      budgetCount: 4,
      labels,
      qualitySummary: {
        automatedGateCount: 5,
        budgetCount: 4,
        criticalManualCount: 7,
        manualCheckCount: 15,
        platformCount: 2,
        requiredAreas: ["auth", "dm", "permissions"],
        targetCount: 4,
      },
      releaseBudgets: [
        { label: "Startup", maxMs: 2_500, metric: "startup", target: "<= 2500ms" },
        { label: "Resume", maxMs: 700, metric: "resume", target: "<= 700ms" },
        { label: "Composer", maxMs: 50, metric: "composer", target: "p95 <= 50ms" },
        { label: "Memory", maxMs: 180, metric: "memory", target: "<= 180MB" },
      ],
    });

    assert.deepEqual(
      evidence.map((item) => item.label),
      ["Automation", "Manual QA", "Performance"],
    );
    assert.deepEqual(
      evidence.map((item) => item.value),
      ["5", "7/15", "4"],
    );
    assert.equal(mobileSettingsEvidenceContainsSensitiveText(evidence), false);
  });

  it("flags sensitive-looking accidental evidence text", () => {
    assert.equal(
      mobileSettingsEvidenceContainsSensitiveText([
        {
          id: "bad",
          label: "Session",
          tone: "danger",
          value: "bearer abc123",
        },
      ]),
      true,
    );
  });
});
