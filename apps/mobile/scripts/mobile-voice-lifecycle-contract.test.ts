import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";

import {
  MOBILE_VOICE_DISCONNECTED_MESSAGE,
  MOBILE_VOICE_HEARTBEAT_INTERVAL_MS,
  MOBILE_VOICE_LEVEL_INTERVAL_MS,
  MOBILE_VOICE_UAT_LIFECYCLE_SCENARIOS,
  summarizeMobileVoiceLifecycleMatrix,
  validateMobileVoiceLifecycleContract,
} from "../src/voice/mobile-voice-lifecycle-contract";

describe("mobile voice lifecycle contract", () => {
  it("covers the native LiveKit UAT voice matrix without pretending unsupported features are ready", () => {
    const scenarioIds = MOBILE_VOICE_UAT_LIFECYCLE_SCENARIOS.map((scenario) => scenario.id);

    assert.deepEqual(scenarioIds, [
      "permission-denied",
      "join-livekit-room",
      "mute-toggle",
      "camera-toggle",
      "audio-output-switch",
      "unexpected-disconnect-cleanup",
      "heartbeat-cleanup",
    ]);

    assert.equal(
      MOBILE_VOICE_UAT_LIFECYCLE_SCENARIOS.every((scenario) => scenario.userVisible === false),
      true,
    );
    assert.equal(
      MOBILE_VOICE_UAT_LIFECYCLE_SCENARIOS.some((scenario) =>
        scenario.validation.includes("server-leave"),
      ),
      true,
    );
  });

  it("keeps voice timers bounded for mobile battery and speaking responsiveness", () => {
    assert.equal(MOBILE_VOICE_HEARTBEAT_INTERVAL_MS >= 20_000, true);
    assert.equal(MOBILE_VOICE_HEARTBEAT_INTERVAL_MS <= 30_000, true);
    assert.equal(MOBILE_VOICE_LEVEL_INTERVAL_MS >= 75, true);
    assert.equal(MOBILE_VOICE_LEVEL_INTERVAL_MS <= 150, true);
  });

  it("keeps the voice hook aligned with disconnect and heartbeat cleanup requirements", () => {
    const hookSource = readFileSync(
      resolve(__dirname, "../src/voice/use-mobile-voice-room.ts"),
      "utf8",
    );

    assert.match(hookSource, /MOBILE_VOICE_HEARTBEAT_INTERVAL_MS/);
    assert.match(hookSource, /MOBILE_VOICE_LEVEL_INTERVAL_MS/);
    assert.match(hookSource, /RoomEvent\.Disconnected/);
    assert.match(hookSource, /intentionallyDisconnectedRoomsRef/);
    assert.match(hookSource, /leaveMobileVoiceState/);
    assert.match(hookSource, /AudioSession\.stopAudioSession/);
    assert.match(hookSource, /server-leave cleanup/i);
  });

  it("publishes camera tracks, flips the local camera, and stops video in background", () => {
    const hookSource = readFileSync(
      resolve(__dirname, "../src/voice/use-mobile-voice-room.ts"),
      "utf8",
    );
    const voiceProviderSource = readFileSync(
      resolve(__dirname, "../src/app/providers/mobile-voice-provider.tsx"),
      "utf8",
    );

    assert.match(hookSource, /getTrackPublication\(Track\.Source\.Camera\)/);
    assert.match(hookSource, /cameraTrackRef/);
    assert.match(hookSource, /isCameraEnabled:\s*participant\.isCameraEnabled/);
    assert.doesNotMatch(
      hookSource,
      /isCameraEnabled:\s*Boolean\(cameraPublication\?\.isSubscribed\s*\|\|/,
    );
    assert.match(hookSource, /restartTrack\([\s\S]*facingMode/);
    assert.match(hookSource, /setCameraEnabled\(false\)/);
    assert.match(hookSource, /selfVideo:\s*false/);
    assert.match(voiceProviderSource, /requestCameraPermission[\s\S]*toggleCamera/);
  });

  it("enumerates and switches only bounded mobile audio devices", () => {
    const hookSource = readFileSync(
      resolve(__dirname, "../src/voice/use-mobile-voice-room.ts"),
      "utf8",
    );

    assert.match(hookSource, /Room\.getLocalDevices\("audioinput"\)/);
    assert.match(hookSource, /AudioSession\.getAudioOutputs\(\)/);
    assert.match(hookSource, /switchActiveDevice\("audioinput"/);
    assert.match(hookSource, /toMobileVoiceInputOptions/);
    assert.match(hookSource, /toMobileVoiceOutputOptions/);
  });

  it("summarizes lifecycle readiness without leaking endpoint or token material", () => {
    const summary = summarizeMobileVoiceLifecycleMatrix();

    assert.equal(summary.requiredScenarioCount, 7);
    assert.equal(summary.hasPermissionDeniedCoverage, true);
    assert.equal(summary.hasDisconnectCleanupCoverage, true);
    assert.equal(summary.hasHeartbeatCleanupCoverage, true);
    assert.doesNotMatch(JSON.stringify(summary), /token|bearer|wss?:\/\//i);
    assert.doesNotMatch(MOBILE_VOICE_DISCONNECTED_MESSAGE, /token|bearer|wss?:\/\//i);
    assert.deepEqual(validateMobileVoiceLifecycleContract(), []);
  });
});

describe("mobile voice teardown safety", () => {
  const roomHookSource = readFileSync(
    resolve(import.meta.dirname, "../src/voice/use-mobile-voice-room.ts"),
    "utf8",
  );
  const dmCallFeatureSource = readFileSync(
    resolve(import.meta.dirname, "../src/app/features/use-mobile-dm-call-feature.ts"),
    "utf8",
  );

  it("never leaves a LiveKit teardown promise unguarded", () => {
    // Regression: when the peer hangs up first the peer connection is already closed, so
    // disconnect() and microphone toggles reject with "PC manager is closed". Unguarded,
    // that surfaced in the app as an uncaught promise rejection.
    const disconnectCalls = roomHookSource.match(/disconnect\(true\).*/g) ?? [];

    assert.ok(disconnectCalls.length > 0);
    for (const call of disconnectCalls) {
      assert.match(call, /\.catch\(/);
    }
    assert.match(
      roomHookSource,
      /pushToTalkController\.cancel\(\{ closeMicrophone: true \}\)\.catch\(/,
    );
  });

  it("keeps DM call teardown resilient to a failing room leave", () => {
    assert.match(dmCallFeatureSource, /leaveVoiceChannel\(\)\)\.catch\(/);
  });
});
