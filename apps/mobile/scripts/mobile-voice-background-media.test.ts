import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { shouldSuspendVoiceMediaOnAppStateChange } from "../src/voice/mobile-voice-background-media";

describe("voice background media policy", () => {
  it("never suspends media while the app is active", () => {
    assert.equal(
      shouldSuspendVoiceMediaOnAppStateChange({
        nextAppState: "active",
        captureConsentInProgress: false,
      }),
      false,
    );
    assert.equal(
      shouldSuspendVoiceMediaOnAppStateChange({
        nextAppState: "active",
        captureConsentInProgress: true,
      }),
      false,
    );
  });

  it("suspends camera and screen share when the app truly backgrounds", () => {
    assert.equal(
      shouldSuspendVoiceMediaOnAppStateChange({
        nextAppState: "background",
        captureConsentInProgress: false,
      }),
      true,
    );
  });

  it("keeps media live through the capture-consent dialog that briefly backgrounds the app", () => {
    // Android MediaProjection / camera-permission / iOS broadcast picker all fire a
    // transient background while their system dialog is up. That must not tear down
    // the camera the user is starting screen share on (or vice versa).
    assert.equal(
      shouldSuspendVoiceMediaOnAppStateChange({
        nextAppState: "background",
        captureConsentInProgress: true,
      }),
      false,
    );
    assert.equal(
      shouldSuspendVoiceMediaOnAppStateChange({
        nextAppState: "inactive",
        captureConsentInProgress: true,
      }),
      false,
    );
  });

  it("still suspends on iOS inactive transitions outside a consent flow", () => {
    assert.equal(
      shouldSuspendVoiceMediaOnAppStateChange({
        nextAppState: "inactive",
        captureConsentInProgress: false,
      }),
      true,
    );
  });
});
