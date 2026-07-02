import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";
import {
  createInitialMobileVoiceRuntimeState,
  createMobileVoiceRuntimeStateFromPermission,
  mapNativeMicrophonePermissionStatus,
  redactMobileVoiceError,
  summarizeMobileVoiceRuntimeState,
  validateMobileVoiceContract,
} from "../src/voice/mobile-voice-contract";

describe("mobile voice contract", () => {
  it("starts without claiming microphone permission or voice readiness", () => {
    const state = createInitialMobileVoiceRuntimeState();
    const summary = summarizeMobileVoiceRuntimeState(state);

    assert.equal(state.microphoneStatus, "unknown");
    assert.equal(state.hasMicrophonePermission, false);
    assert.equal(state.status, "not-requested");
    assert.equal(summary.shouldAskAfterUserAction, true);
    assert.equal(summary.requiresServerContract, false);
  });

  it("maps native microphone permission responses without widening scope", () => {
    assert.equal(mapNativeMicrophonePermissionStatus("granted", true), "granted");
    assert.equal(mapNativeMicrophonePermissionStatus("denied", true), "denied");
    assert.equal(mapNativeMicrophonePermissionStatus("denied", false), "blocked");
    assert.equal(mapNativeMicrophonePermissionStatus("never_ask_again", true), "blocked");
    assert.equal(mapNativeMicrophonePermissionStatus("undetermined", true), "not-requested");
    assert.equal(mapNativeMicrophonePermissionStatus("unexpected", true), "unknown");
  });

  it("keeps granted microphone permission ready for native LiveKit room lifecycle", () => {
    const state = createMobileVoiceRuntimeStateFromPermission("granted", 1_000);
    const summary = summarizeMobileVoiceRuntimeState(state);

    assert.equal(state.hasMicrophonePermission, true);
    assert.equal(state.status, "ready");
    assert.equal(summary.requiresNativeModule, false);
    assert.equal(summary.requiresServerContract, false);
    assert.equal(summary.actionEnabled, true);
  });

  it("redacts sensitive voice setup failures", () => {
    assert.equal(
      redactMobileVoiceError("bearer abc.def.ghi failed during voice setup"),
      "Voice setup failed without exposing sensitive details.",
    );
    assert.match(redactMobileVoiceError("Native module is unavailable"), /Native module/);
  });

  it("validates native voice capability readiness", () => {
    assert.deepEqual(validateMobileVoiceContract(), []);
  });

  it("keeps microphone preparation on the React Native permission surface", () => {
    const runtimeSource = readFileSync(
      resolve(__dirname, "../src/voice/mobile-voice-runtime.ts"),
      "utf8",
    );

    assert.match(runtimeSource, /PermissionsAndroid/);
    assert.match(runtimeSource, /RECORD_AUDIO/);
    assert.doesNotMatch(runtimeSource, /expo-audio/);
  });
});
