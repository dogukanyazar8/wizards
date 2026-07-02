import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createRegisteredMobileNotificationRuntimeState,
  createInitialMobileNotificationRuntimeState,
  createMobileNotificationRuntimeStateFromPermission,
  mapExpoNotificationPermissionStatus,
  redactMobileNotificationError,
  summarizeMobileNotificationRuntimeState,
  validateMobileNotificationContract,
} from "../src/notifications/mobile-notification-contract";

describe("mobile notification contract", () => {
  it("starts without claiming notification permission or delivery readiness", () => {
    const state = createInitialMobileNotificationRuntimeState();
    const summary = summarizeMobileNotificationRuntimeState(state);

    assert.equal(state.permissionStatus, "unknown");
    assert.equal(state.hasLocalPermission, false);
    assert.equal(state.status, "not-requested");
    assert.equal(state.tokenFingerprint, null);
    assert.equal(summary.shouldAskAfterUserAction, true);
    assert.equal(summary.requiresServerContract, false);
    assert.equal(summary.isRegistered, false);
  });

  it("maps native permission responses without widening scope", () => {
    assert.equal(mapExpoNotificationPermissionStatus("granted", true), "granted");
    assert.equal(mapExpoNotificationPermissionStatus("denied", true), "denied");
    assert.equal(mapExpoNotificationPermissionStatus("denied", false), "blocked");
    assert.equal(mapExpoNotificationPermissionStatus("undetermined", true), "not-requested");
    assert.equal(mapExpoNotificationPermissionStatus("unexpected", true), "unknown");
  });

  it("keeps granted native permission local until token registration succeeds", () => {
    const state = createMobileNotificationRuntimeStateFromPermission("granted", 1_000);
    const summary = summarizeMobileNotificationRuntimeState(state);

    assert.equal(state.hasLocalPermission, true);
    assert.equal(state.status, "ready-local");
    assert.equal(summary.requiresServerContract, false);
    assert.equal(summary.actionEnabled, true);
  });

  it("marks registered devices without exposing the raw push token", () => {
    const state = createRegisteredMobileNotificationRuntimeState(
      {
        registeredAt: "2026-07-01T10:00:00.000Z",
        tokenFingerprint: "fingerprint_12345678901234567890",
      },
      1_000,
    );
    const summary = summarizeMobileNotificationRuntimeState(state);

    assert.equal(state.status, "registered");
    assert.equal(state.hasLocalPermission, true);
    assert.equal(state.permissionStatus, "granted");
    assert.equal(state.registeredAt, "2026-07-01T10:00:00.000Z");
    assert.equal(state.tokenFingerprint, "fingerprint_12345678901234567890");
    assert.equal(summary.isRegistered, true);
    assert.equal(JSON.stringify(state).includes("ExpoPushToken"), false);
  });

  it("redacts sensitive notification setup failures", () => {
    assert.equal(
      redactMobileNotificationError("bearer abc.def.ghi failed during push setup"),
      "Notification setup failed without exposing sensitive details.",
    );
    assert.match(redactMobileNotificationError("Native module is unavailable"), /Native module/);
  });

  it("validates native notification capability readiness", () => {
    assert.deepEqual(validateMobileNotificationContract(), []);
  });
});
