import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createInitialMobilePermissionReadiness,
  getMobilePermissionNativeMetadata,
  getPermissionReadinessForFeature,
  MOBILE_PERMISSION_INTENTS,
  summarizeMobilePermissionReadiness,
  validateMobilePermissionContract,
} from "../src/permissions/mobile-permission-contract";

describe("mobile permission contract", () => {
  it("keeps every sensitive permission behind a user action", () => {
    assert.equal(MOBILE_PERMISSION_INTENTS.length, 5);
    assert.equal(
      MOBILE_PERMISSION_INTENTS.every((intent) => intent.promptPolicy === "after-user-action"),
      true,
    );
    assert.deepEqual(validateMobilePermissionContract(), []);
  });

  it("starts permission readiness as unknown without pretending permissions are granted", () => {
    const readiness = createInitialMobilePermissionReadiness();
    const summary = summarizeMobilePermissionReadiness(readiness);

    assert.equal(summary.total, 5);
    assert.equal(summary.granted, 0);
    assert.equal(summary.needsUserAction, 5);
    assert.deepEqual(summary.safeToPromptAfterAction, [
      "notifications",
      "microphone",
      "camera",
      "photoLibrary",
      "screenCapture",
    ]);
  });

  it("summarizes granted, denied, and blocked permission states", () => {
    const readiness = createInitialMobilePermissionReadiness().map((item) => {
      if (item.intent.id === "notifications") {
        return { ...item, status: "granted" as const };
      }

      if (item.intent.id === "camera") {
        return { ...item, status: "blocked" as const };
      }

      return item;
    });
    const summary = summarizeMobilePermissionReadiness(readiness);

    assert.equal(summary.granted, 1);
    assert.equal(summary.blocked, 1);
    assert.equal(summary.needsUserAction, 3);
    assert.deepEqual(summary.safeToPromptAfterAction, [
      "microphone",
      "photoLibrary",
      "screenCapture",
    ]);
  });

  it("maps feature readiness without widening permission scope", () => {
    const readiness = createInitialMobilePermissionReadiness();

    assert.deepEqual(
      getPermissionReadinessForFeature(readiness, "voice").map((item) => item.intent.id),
      ["notifications", "microphone"],
    );
    assert.deepEqual(
      getPermissionReadinessForFeature(readiness, "screenShare").map((item) => item.intent.id),
      ["screenCapture"],
    );
    assert.deepEqual(
      getPermissionReadinessForFeature(readiness, "attachments").map((item) => item.intent.id),
      ["photoLibrary"],
    );
  });

  it("keeps runtime permissions aligned with native store metadata", () => {
    const metadata = MOBILE_PERMISSION_INTENTS.map((intent) =>
      getMobilePermissionNativeMetadata(intent.id),
    );

    assert.deepEqual(
      metadata.map((item) => item.id),
      ["notifications", "microphone", "camera", "photoLibrary", "screenCapture"],
    );
    assert.equal(
      metadata.every((item) => /only when|you choose|you can control/i.test(item.usageDescription)),
      true,
    );
    assert.equal(
      metadata.some((item) => item.androidPermission === "ACCESS_FINE_LOCATION"),
      false,
    );
  });
});
