import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createInitialMobilePermissionReadiness,
  getPermissionReadinessForFeature,
  MOBILE_PERMISSION_INTENTS,
  summarizeMobilePermissionReadiness,
} from "../src/permissions/mobile-permission-contract";

describe("mobile permission contract", () => {
  it("keeps every sensitive permission behind a user action", () => {
    assert.equal(MOBILE_PERMISSION_INTENTS.length, 4);
    assert.equal(
      MOBILE_PERMISSION_INTENTS.every((intent) => intent.promptPolicy === "after-user-action"),
      true,
    );
  });

  it("starts permission readiness as unknown without pretending permissions are granted", () => {
    const readiness = createInitialMobilePermissionReadiness();
    const summary = summarizeMobilePermissionReadiness(readiness);

    assert.equal(summary.total, 4);
    assert.equal(summary.granted, 0);
    assert.equal(summary.needsUserAction, 4);
    assert.deepEqual(summary.safeToPromptAfterAction, [
      "notifications",
      "microphone",
      "camera",
      "photoLibrary",
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
    assert.equal(summary.needsUserAction, 2);
    assert.deepEqual(summary.safeToPromptAfterAction, ["microphone", "photoLibrary"]);
  });

  it("maps feature readiness without widening permission scope", () => {
    const readiness = createInitialMobilePermissionReadiness();

    assert.deepEqual(
      getPermissionReadinessForFeature(readiness, "voice").map((item) => item.intent.id),
      ["notifications", "microphone"],
    );
    assert.deepEqual(
      getPermissionReadinessForFeature(readiness, "attachments").map((item) => item.intent.id),
      ["photoLibrary"],
    );
  });
});
