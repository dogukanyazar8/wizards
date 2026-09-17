import assert from "node:assert/strict";
import { test } from "node:test";
import { shouldSuspendVoiceMediaOnAppStateChange } from "../src/voice/mobile-voice-background-media";
for (const platform of ["ios", "android"] as const) {
  for (const nextAppState of ["active", "inactive", "background"] as const) {
    for (const captureConsentInProgress of [false, true]) {
      test(`${platform} ${nextAppState} consent=${captureConsentInProgress}: active share survives`, () => {
        assert.deepEqual(
          shouldSuspendVoiceMediaOnAppStateChange({
            platform,
            nextAppState,
            captureConsentInProgress,
            isScreenSharing: true,
          }),
          {
            suspendCamera: nextAppState !== "active" && !captureConsentInProgress,
            suspendScreenShare: false,
          },
        );
      });
    }
  }
}
test("non-mobile platforms retain background screen suspension", () => {
  assert.deepEqual(
    shouldSuspendVoiceMediaOnAppStateChange({
      platform: "web",
      nextAppState: "background",
      captureConsentInProgress: false,
      isScreenSharing: true,
    }),
    { suspendCamera: true, suspendScreenShare: true },
  );
});
