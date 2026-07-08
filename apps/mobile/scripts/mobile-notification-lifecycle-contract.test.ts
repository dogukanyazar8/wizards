import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MOBILE_NOTIFICATION_DELIVERY_CONTRACT,
  MOBILE_NOTIFICATION_LIFECYCLE_STEPS,
  getMobileNotificationLifecycleStepIds,
  redactMobileNotificationDeliveryPayload,
  validateMobileNotificationLifecycleContract,
} from "../src/notifications/mobile-notification-lifecycle-contract";

describe("mobile notification lifecycle contract", () => {
  it("keeps token registration user-initiated and logout cleanup ordered", () => {
    assert.deepEqual(getMobileNotificationLifecycleStepIds(), [
      "user-action-permission",
      "native-token-read",
      "server-registration",
      "logout-revoke",
      "local-session-clear",
    ]);

    const permissionStep = MOBILE_NOTIFICATION_LIFECYCLE_STEPS.find(
      (step) => step.id === "user-action-permission",
    );
    assert.ok(permissionStep);
    assert.equal(permissionStep.requiresUserAction, true);
    assert.equal(permissionStep.serverEndpoint, null);

    const revokeIndex = MOBILE_NOTIFICATION_LIFECYCLE_STEPS.findIndex(
      (step) => step.id === "logout-revoke",
    );
    const clearIndex = MOBILE_NOTIFICATION_LIFECYCLE_STEPS.findIndex(
      (step) => step.id === "local-session-clear",
    );
    assert.equal(revokeIndex > -1 && clearIndex > -1 && revokeIndex < clearIndex, true);
  });

  it("bounds mobile delivery categories without exposing raw content or push tokens", () => {
    assert.deepEqual(
      MOBILE_NOTIFICATION_DELIVERY_CONTRACT.map((item) => item.id),
      ["direct-message", "mention", "voice-invite"],
    );

    for (const item of MOBILE_NOTIFICATION_DELIVERY_CONTRACT) {
      assert.equal(item.provider, "expo");
      assert.equal(item.requiresRegisteredDevice, true);
      assert.equal(item.allowRawPushTokenInPayload, false);
      assert.equal(item.maxBodyLength <= 160, true);
    }
  });

  it("redacts delivery payloads before diagnostics or evidence", () => {
    const payload = redactMobileNotificationDeliveryPayload({
      actionUrl: "/channels/server-1/channel-1?access_token=secret-token",
      body: "Bearer abc.def.ghi should not leak",
      pushToken: "ExpoPushToken[aaaaaaaaaaaaaaaaaaaa]",
      title: "A very long title ".repeat(20),
      type: "mention",
    });

    assert.equal(JSON.stringify(payload).includes("ExpoPushToken"), false);
    assert.equal(JSON.stringify(payload).includes("abc.def.ghi"), false);
    assert.equal(JSON.stringify(payload).includes("access_token"), false);
    assert.equal(payload.body, "redacted");
    assert.equal(payload.actionUrl, "/channels/server-1/channel-1");
    assert.equal(typeof payload.title, "string");
    assert.equal((payload.title ?? "").length <= 80, true);
  });

  it("validates the lifecycle and server delivery contract", () => {
    assert.deepEqual(validateMobileNotificationLifecycleContract(), []);
  });
});
