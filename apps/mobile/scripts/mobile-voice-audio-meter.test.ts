import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  MOBILE_VOICE_AUDIO_ACTIVITY_STALE_MS,
  MOBILE_VOICE_SPEAKING_ATTACK_LEVEL,
  MOBILE_VOICE_SPEAKING_RELEASE_HOLD_MS,
  MOBILE_VOICE_SPEAKING_RELEASE_LEVEL,
  createMobileVoiceAudioActivityFromPeer,
  getFreshMobileVoiceAudioActivity,
  measureMobileVoiceAudioActivity,
  readMobileVoiceAudioLevel,
  type MobileVoiceAudioStatsReport,
} from "../src/voice/mobile-voice-audio-meter";

function createStatsReport(
  entries: readonly Record<string, unknown>[],
): MobileVoiceAudioStatsReport {
  return new Map(entries.map((entry, index) => [`stat-${index}`, entry]));
}

describe("mobile voice audio level stats", () => {
  it("prefers the capture-side level for the local microphone", () => {
    const report = createStatsReport([
      { audioLevel: 0.01, kind: "audio", type: "outbound-rtp" },
      { audioLevel: 0.42, kind: "audio", type: "media-source" },
    ]);

    assert.equal(readMobileVoiceAudioLevel(report, "outbound"), 0.42);
  });

  it("reads the inbound level for a remote microphone", () => {
    const report = createStatsReport([
      { audioLevel: 0.11, kind: "audio", type: "inbound-rtp" },
      { framesDecoded: 30, kind: "video", type: "inbound-rtp" },
    ]);

    assert.equal(readMobileVoiceAudioLevel(report, "inbound"), 0.11);
  });

  it("ignores the video stream's stats when both directions are present", () => {
    const report = createStatsReport([
      { audioLevel: 0.5, kind: "video", type: "media-source" },
      { audioLevel: 0.2, kind: "audio", type: "media-source" },
    ]);

    assert.equal(readMobileVoiceAudioLevel(report, "outbound"), 0.2);
  });

  it("falls back to the legacy track stats when nothing better reports a level", () => {
    const report = createStatsReport([
      { kind: "audio", type: "media-source" },
      { audioLevel: 0.07, kind: "audio", type: "track" },
    ]);

    assert.equal(readMobileVoiceAudioLevel(report, "outbound"), 0.07);
  });

  it("returns null when the platform reports no level at all", () => {
    const report = createStatsReport([{ bytesSent: 1000, kind: "audio", type: "outbound-rtp" }]);

    assert.equal(readMobileVoiceAudioLevel(report, "outbound"), null);
    assert.equal(readMobileVoiceAudioLevel(null, "inbound"), null);
  });

  it("clamps an out-of-range level into 0..1", () => {
    const report = createStatsReport([{ audioLevel: 4.2, kind: "audio", type: "inbound-rtp" }]);

    assert.equal(readMobileVoiceAudioLevel(report, "inbound"), 1);
  });
});

describe("mobile voice speaking state", () => {
  it("turns on within a single tick once the level clears the attack threshold", () => {
    const activity = measureMobileVoiceAudioActivity({
      isMuted: false,
      level: MOBILE_VOICE_SPEAKING_ATTACK_LEVEL,
      now: 1_000,
    });

    assert.equal(activity.isSpeaking, true);
    assert.equal(activity.loudAt, 1_000);
  });

  it("keeps the ring lit through the syllable gaps inside the hold window", () => {
    const speaking = measureMobileVoiceAudioActivity({
      isMuted: false,
      level: 0.3,
      now: 1_000,
    });
    const gap = measureMobileVoiceAudioActivity({
      isMuted: false,
      level: 0,
      now: 1_000 + MOBILE_VOICE_SPEAKING_RELEASE_HOLD_MS - 1,
      previous: speaking,
    });

    assert.equal(gap.isSpeaking, true);
  });

  it("releases once the level stays under the release threshold past the hold", () => {
    const speaking = measureMobileVoiceAudioActivity({
      isMuted: false,
      level: 0.3,
      now: 1_000,
    });
    const released = measureMobileVoiceAudioActivity({
      isMuted: false,
      level: 0,
      now: 1_000 + MOBILE_VOICE_SPEAKING_RELEASE_HOLD_MS,
      previous: speaking,
    });

    assert.equal(released.isSpeaking, false);
  });

  it("holds between the release and attack thresholds without latching on", () => {
    const quiet = measureMobileVoiceAudioActivity({
      isMuted: false,
      level: MOBILE_VOICE_SPEAKING_RELEASE_LEVEL,
      now: 1_000,
    });

    assert.equal(quiet.isSpeaking, false);

    const speaking = measureMobileVoiceAudioActivity({
      isMuted: false,
      level: 0.3,
      now: 1_100,
    });
    const sustained = measureMobileVoiceAudioActivity({
      isMuted: false,
      level: MOBILE_VOICE_SPEAKING_RELEASE_LEVEL,
      now: 1_100 + MOBILE_VOICE_SPEAKING_RELEASE_HOLD_MS * 4,
      previous: speaking,
    });

    assert.equal(sustained.isSpeaking, true);
  });

  it("drops to silent the instant the microphone is muted", () => {
    const speaking = measureMobileVoiceAudioActivity({
      isMuted: false,
      level: 0.4,
      now: 1_000,
    });
    const muted = measureMobileVoiceAudioActivity({
      isMuted: true,
      level: 0.4,
      now: 1_010,
      previous: speaking,
    });

    assert.equal(muted.isSpeaking, false);
    assert.equal(muted.audioLevel, 0);
  });

  it("treats a non-finite level as silence", () => {
    const activity = measureMobileVoiceAudioActivity({
      isMuted: false,
      level: Number.NaN,
      now: 1_000,
    });

    assert.equal(activity.audioLevel, 0);
    assert.equal(activity.isSpeaking, false);
  });
});

describe("mobile voice peer activity", () => {
  it("adopts a peer's speaking state and arms the hold", () => {
    const activity = createMobileVoiceAudioActivityFromPeer({
      audioLevel: 0.2,
      isMuted: false,
      isSpeaking: true,
      now: 2_000,
    });

    assert.equal(activity.isSpeaking, true);
    assert.equal(activity.loudAt, 2_000);
  });

  it("ignores a level a muted peer reports", () => {
    const activity = createMobileVoiceAudioActivityFromPeer({
      audioLevel: 0.9,
      isMuted: true,
      isSpeaking: true,
      now: 2_000,
    });

    assert.equal(activity.isSpeaking, false);
    assert.equal(activity.audioLevel, 0);
  });
});

describe("mobile voice activity freshness", () => {
  it("hands the avatar back to LiveKit once a measurement goes stale", () => {
    const activity = measureMobileVoiceAudioActivity({
      isMuted: false,
      level: 0.4,
      now: 1_000,
    });

    assert.equal(
      getFreshMobileVoiceAudioActivity(activity, 1_000 + MOBILE_VOICE_AUDIO_ACTIVITY_STALE_MS),
      activity,
    );
    assert.equal(
      getFreshMobileVoiceAudioActivity(activity, 1_001 + MOBILE_VOICE_AUDIO_ACTIVITY_STALE_MS),
      null,
    );
    assert.equal(getFreshMobileVoiceAudioActivity(undefined, 1_000), null);
  });

  it("keeps the thresholds ordered and the response budget under a frame pair", () => {
    assert.equal(MOBILE_VOICE_SPEAKING_RELEASE_LEVEL < MOBILE_VOICE_SPEAKING_ATTACK_LEVEL, true);
    assert.equal(MOBILE_VOICE_SPEAKING_RELEASE_HOLD_MS <= 250, true);
    assert.equal(
      MOBILE_VOICE_AUDIO_ACTIVITY_STALE_MS > MOBILE_VOICE_SPEAKING_RELEASE_HOLD_MS,
      true,
    );
  });
});
