import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MOBILE_NATIVE_CAPABILITIES,
  summarizeMobileNativeCapabilities,
  validateMobileNativeCapabilityContract,
} from "../src/permissions/mobile-native-capability-contract";

describe("mobile native capability contract", () => {
  it("keeps native capabilities explicit and user-action scoped", () => {
    const allowedPermissions = new Set(["camera", "microphone", "notifications", "photoLibrary"]);

    assert.deepEqual(
      MOBILE_NATIVE_CAPABILITIES.map((capability) => capability.id),
      ["nativeNotifications", "voiceChannels", "videoCalls", "mediaAttachments", "screenShare"],
    );

    for (const capability of MOBILE_NATIVE_CAPABILITIES) {
      assert.notEqual(capability.userActionTrigger.trim(), "");
      assert.equal(
        capability.permissionIntents.every((permission) => allowedPermissions.has(permission)),
        true,
      );
    }
  });

  it("keeps screen sharing behind research until native platform contracts exist", () => {
    const screenShare = MOBILE_NATIVE_CAPABILITIES.find(
      (capability) => capability.id === "screenShare",
    );

    assert.ok(screenShare);
    assert.equal(screenShare.stage, "research-required");
    assert.deepEqual(screenShare.permissionIntents, []);
  });

  it("marks push notification registration foundation ready after token lifecycle exists", () => {
    const nativeNotifications = MOBILE_NATIVE_CAPABILITIES.find(
      (capability) => capability.id === "nativeNotifications",
    );

    assert.ok(nativeNotifications);
    assert.equal(nativeNotifications.stage, "foundation-ready");
    assert.deepEqual(nativeNotifications.permissionIntents, ["notifications"]);
  });

  it("marks voice channels foundation ready after native LiveKit lifecycle exists", () => {
    const voiceChannels = MOBILE_NATIVE_CAPABILITIES.find(
      (capability) => capability.id === "voiceChannels",
    );

    assert.ok(voiceChannels);
    assert.equal(voiceChannels.stage, "foundation-ready");
    assert.deepEqual(voiceChannels.permissionIntents, ["microphone", "notifications"]);
  });

  it("summarizes native capability readiness without claiming unfinished features are ready", () => {
    const summary = summarizeMobileNativeCapabilities();

    assert.equal(summary.total, 5);
    assert.equal(summary.foundationReady, 3);
    assert.equal(summary.blockedByNativeModule, 1);
    assert.equal(summary.blockedByServerContract, 0);
    assert.equal(summary.blockedByResearch, 1);
    assert.deepEqual(validateMobileNativeCapabilityContract(), []);
  });
});
