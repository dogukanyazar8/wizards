import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MOBILE_AUTOMATED_GATES,
  MOBILE_MANUAL_QA_CHECKS,
  MOBILE_QA_DEVICE_MATRIX,
  summarizeMobileQualityGate,
  validateMobileQualityGate,
  type MobileQualityArea,
} from "../src/quality/mobile-quality-gate";

const expectedAreas: MobileQualityArea[] = [
  "accessibility",
  "auth",
  "deep-link",
  "dm",
  "launch",
  "navigation",
  "permissions",
  "performance",
  "realtime",
  "release",
  "search",
  "store",
  "sync",
  "theme",
  "voice",
  "workspace",
];

describe("mobile quality gate", () => {
  it("keeps the manual QA checklist broad enough for a real mobile release", () => {
    const areas = new Set(MOBILE_MANUAL_QA_CHECKS.map((check) => check.area));

    for (const area of expectedAreas) {
      assert.equal(areas.has(area), true, `Missing mobile manual QA area: ${area}`);
    }

    assert.equal(
      MOBILE_MANUAL_QA_CHECKS.some((check) => check.risk === "critical"),
      true,
    );
  });

  it("covers Android, iOS, compact, and tablet targets", () => {
    const platforms = new Set(MOBILE_QA_DEVICE_MATRIX.map((target) => target.platform));
    const sizeClasses = new Set(MOBILE_QA_DEVICE_MATRIX.map((target) => target.sizeClass));

    assert.equal(platforms.has("android"), true);
    assert.equal(platforms.has("ios"), true);
    assert.equal(sizeClasses.has("compact"), true);
    assert.equal(sizeClasses.has("tablet"), true);
  });

  it("keeps automated gates scoped to the mobile package", () => {
    assert.equal(MOBILE_AUTOMATED_GATES.length >= 5, true);
    for (const gate of MOBILE_AUTOMATED_GATES) {
      assert.equal(
        gate.id.startsWith("mobile-maestro-") || gate.command.includes("@wizards/mobile"),
        true,
      );
    }
  });

  it("tracks the current native mobile product navigation language", () => {
    const navigationCheck = MOBILE_MANUAL_QA_CHECKS.find((check) => check.id === "tab-navigation");
    assert.ok(navigationCheck);
    assert.match(navigationCheck.label, /Home, DMs, Notifications, Calls, and Profile/);
    assert.doesNotMatch(navigationCheck.label, /Overview, Chat, Voice, and Settings/);

    const voiceCheck = MOBILE_MANUAL_QA_CHECKS.find(
      (check) => check.id === "voice-disabled-contract",
    );
    assert.ok(voiceCheck);
    assert.match(voiceCheck.label, /LiveKit join/i);
    assert.match(voiceCheck.label, /heartbeat cleanup/i);

    const accessibilityCheck = MOBILE_MANUAL_QA_CHECKS.find(
      (check) => check.id === "native-accessibility-touch-targets",
    );
    assert.ok(accessibilityCheck);
    assert.match(accessibilityCheck.label, /44px/);
    assert.match(accessibilityCheck.label, /accessibility labels/i);

    const inviteCheck = MOBILE_MANUAL_QA_CHECKS.find(
      (check) => check.id === "invite-link-contract",
    );
    assert.ok(inviteCheck);
    assert.match(inviteCheck.label, /Safe invite links/);
    assert.match(inviteCheck.label, /server contract/i);

    const searchCheck = MOBILE_MANUAL_QA_CHECKS.find(
      (check) => check.id === "message-search-contract",
    );
    assert.ok(searchCheck);
    assert.match(searchCheck.label, /authenticated mobile endpoints/i);
    assert.match(searchCheck.label, /server-side permission checks/i);

    const searchUiCheck = MOBILE_MANUAL_QA_CHECKS.find((check) => check.id === "message-search-ui");
    assert.ok(searchUiCheck);
    assert.match(searchUiCheck.label, /bounded real results/i);
    assert.match(searchUiCheck.label, /selected conversation/i);

    const dedicatedChannelCheck = MOBILE_MANUAL_QA_CHECKS.find(
      (check) => check.id === "workspace-dedicated-channel-chat",
    );
    assert.ok(dedicatedChannelCheck);
    assert.match(dedicatedChannelCheck.label, /dedicated channel chat screen/i);
    assert.match(dedicatedChannelCheck.label, /safe-area/i);

    const themeCheck = MOBILE_MANUAL_QA_CHECKS.find(
      (check) => check.id === "theme-light-dark-system",
    );
    assert.ok(themeCheck);
    assert.equal(themeCheck.area, "theme");
    assert.match(themeCheck.label, /System, light, and dark/i);

    const darkModeGate = MOBILE_AUTOMATED_GATES.find(
      (gate) => gate.id === "mobile-maestro-dark-mode",
    );
    assert.ok(darkModeGate);
    assert.match(darkModeGate.command, /phase1-dark-mode\.yml/);
  });

  it("summarizes quality readiness without leaking sensitive strings", () => {
    const summary = summarizeMobileQualityGate();

    assert.equal(summary.platformCount, 2);
    assert.equal(summary.requiredAreas.length, expectedAreas.length);
    assert.deepEqual(validateMobileQualityGate(), []);
  });
});
