import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getKrispStatus } from "./krisp-status";
import { DEFAULT_VOICE_AUDIO_PREFERENCES } from "@/store/voice-store";

const connected = {
  audioPreferences: DEFAULT_VOICE_AUDIO_PREFERENCES,
  krispAvailability: "available" as const,
  isKrispNoiseCancellationActive: false,
  isMuted: false,
  isApplyingAudioPreferences: false,
  isRecoveringKrispNoiseCancellation: false,
  isJoining: false,
  isConnected: true,
};

describe("Krisp status reflects preference and processing separately", () => {
  it("never calls an enabled preference off when activation is unavailable", () => {
    const status = getKrispStatus(connected);
    assert.equal(status.labelKey, "server.voice.header.krispUnavailable");
    assert.equal(status.active, false);
    assert.equal(status.descriptionKey, "voice.settings.krispUnavailable");
  });

  it("reports active only for a connected, unmuted, confirmed processor", () => {
    assert.equal(
      getKrispStatus({ ...connected, isKrispNoiseCancellationActive: true }).active,
      true,
    );
    assert.equal(
      getKrispStatus({ ...connected, isMuted: true, isKrispNoiseCancellationActive: true })
        .labelKey,
      "server.voice.header.krispPaused",
    );
    assert.equal(
      getKrispStatus({ ...connected, isConnected: false, isKrispNoiseCancellationActive: true })
        .labelKey,
      "server.voice.header.krispReady",
    );
  });

  it("reports off only when the preference or experiment disables Krisp", () => {
    for (const audioPreferences of [
      { ...connected.audioPreferences, krispNoiseCancellation: false },
      { ...connected.audioPreferences, enhancedNoiseFilterMode: "browser_only" as const },
    ]) {
      assert.equal(
        getKrispStatus({ ...connected, audioPreferences }).labelKey,
        "server.voice.header.krispInactive",
      );
    }
  });

  it("distinguishes pending work from an inactive processor", () => {
    for (const pending of [
      { isApplyingAudioPreferences: true },
      { isRecoveringKrispNoiseCancellation: true },
      { isJoining: true },
      { krispAvailability: "checking" as const },
    ]) {
      assert.equal(
        getKrispStatus({ ...connected, ...pending }).labelKey,
        "voice.room.krispChecking",
      );
    }
  });

  it("preserves failure reasons instead of advertising active noise cancellation", () => {
    for (const [krispAvailability, descriptionKey] of [
      ["requires_livekit_cloud", "voice.settings.krispRequiresCloud"],
      ["unsupported_browser", "voice.settings.krispUnsupportedBrowser"],
      ["blocked_by_security_policy", "voice.settings.krispBlockedBySecurityPolicy"],
      ["unavailable", "voice.settings.krispUnavailable"],
    ] as const) {
      assert.deepEqual(getKrispStatus({ ...connected, krispAvailability }), {
        active: false,
        labelKey: "server.voice.header.krispUnavailable",
        descriptionKey,
      });
    }
  });
});
