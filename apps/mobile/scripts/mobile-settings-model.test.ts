import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { MobileBootstrapPayload } from "@wizards/types";
import type { MobileSessionDiagnostics } from "../src/auth/session-types";
import {
  getMobileFeatureEvidence,
  getMobilePermissionEvidence,
  getMobileSessionEvidence,
  getMobileStoreEvidence,
  mobileSettingsEvidenceContainsSensitiveText,
  summarizeMobileFeatureReadiness,
} from "../src/app/mobile-settings-model";
import type { MobilePermissionSummary } from "../src/permissions/mobile-permission-contract";
import type { MobileStoreReadinessResult } from "../src/release/mobile-store-contract";

const labels = {
  available: "Ready",
  blocked: "Blocked",
  disabled: "Disabled",
  missing: "Missing",
  pending: "Pending",
  ready: "Ready",
  refreshToken: "Refresh",
  scopeCount: "Scopes",
  session: "Session",
  storeBlockers: "Store blockers",
  storeWarnings: "Store warnings",
};

const features: MobileBootstrapPayload["features"] = {
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
      available: 2,
      disabled: 0,
      pending: 2,
      total: 4,
    });
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
