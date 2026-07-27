import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  getMobileVoiceAudioRoute,
  getMobileVoiceAudioRouteIcon,
  getMobileVoiceParticipantBadge,
  hasMobileVoiceAudioRouteInputChanged,
} from "../src/voice/mobile-voice-audio-route";
import { toMobileVoiceOutputOptions } from "../src/voice/mobile-voice-device-contract";
import type { MobileVoiceRoomParticipant } from "../src/voice/mobile-voice-room-contract";

function createParticipant(
  overrides: Partial<MobileVoiceRoomParticipant> = {},
): MobileVoiceRoomParticipant {
  return {
    audioLevel: 0,
    avatarUrl: null,
    displayName: null,
    isCameraEnabled: false,
    isMuted: false,
    isScreenSharing: false,
    isSelf: false,
    isSpeaking: false,
    userId: "user-1",
    username: "user-1",
    ...overrides,
  };
}

function routeFor(
  outputIds: readonly string[],
  selectedAudioOutputId: string | null,
  selfAudioOutput: "default" | "speaker" = "default",
) {
  return getMobileVoiceAudioRoute({
    availableAudioOutputs: toMobileVoiceOutputOptions(outputIds),
    selectedAudioOutputId,
    selfAudioOutput,
  });
}

describe("mobile voice audio route", () => {
  it("reads an explicit device selection before anything else", () => {
    assert.equal(routeFor(["default", "speaker", "earpiece"], "speaker"), "speaker");
    // Android routes the loudspeaker through `force_speaker`; iOS through `speaker`.
    assert.equal(routeFor(["default", "force_speaker"], "force_speaker"), "speaker");
    assert.equal(routeFor(["default", "bluetooth", "earpiece"], "bluetooth"), "headset");
    assert.equal(routeFor(["default", "headset", "earpiece"], "headset"), "headset");
    assert.equal(routeFor(["default", "earpiece", "speaker"], "earpiece"), "earpiece");
  });

  it("prefers a plugged or paired headset over the loudspeaker when nothing is selected", () => {
    assert.equal(routeFor(["default", "earpiece", "bluetooth"], null), "headset");
    assert.equal(routeFor(["default", "earpiece", "headset"], null), "headset");
    // A headset outranks the speaker even while the speaker mode is still latched,
    // because the OS has already moved the audio to the headset.
    assert.equal(routeFor(["default", "headset"], null, "speaker"), "headset");
  });

  it("falls back to the speaker mode, then the earpiece, then the neutral default", () => {
    assert.equal(routeFor(["default", "earpiece"], null, "speaker"), "speaker");
    assert.equal(routeFor(["default", "earpiece"], null), "earpiece");
    assert.equal(routeFor(["default"], null), "default");
    assert.equal(routeFor([], null), "default");
  });

  it("ignores a selection the device list no longer offers", () => {
    // The headset was unplugged: the stale preference must not keep claiming it.
    assert.equal(routeFor(["default", "earpiece"], "headset"), "earpiece");
    assert.equal(routeFor(["default", "force_speaker"], "bluetooth", "speaker"), "speaker");
  });

  it("names one icon per route, with the earpiece reading as speaker-off", () => {
    assert.equal(getMobileVoiceAudioRouteIcon("speaker"), "volume-high-outline");
    assert.equal(getMobileVoiceAudioRouteIcon("headset"), "headset-outline");
    assert.equal(getMobileVoiceAudioRouteIcon("earpiece"), "volume-mute-outline");
    // iOS only reports `default` / `force_speaker`, so `default` stays neutral.
    assert.equal(getMobileVoiceAudioRouteIcon("default"), "headset-outline");
  });

  it("ranks the participant badge muted over speaking over the audio route", () => {
    assert.deepEqual(
      getMobileVoiceParticipantBadge(
        createParticipant({ isMuted: true, isSelf: true, isSpeaking: true }),
        "speaker",
      ),
      { icon: "mic-off", tone: "danger" },
    );
    assert.deepEqual(
      getMobileVoiceParticipantBadge(
        createParticipant({ isSelf: true, isSpeaking: true }),
        "speaker",
      ),
      { icon: "pulse", tone: "success" },
    );
  });

  it("shows the real route on the self badge and a neutral headset on everyone else", () => {
    assert.deepEqual(
      getMobileVoiceParticipantBadge(createParticipant({ isSelf: true }), "speaker"),
      {
        icon: "volume-high-outline",
        tone: "muted",
      },
    );
    assert.deepEqual(
      getMobileVoiceParticipantBadge(createParticipant({ isSelf: true }), "earpiece"),
      { icon: "volume-mute-outline", tone: "muted" },
    );
    // A remote member's own output device is not observable from here.
    assert.deepEqual(getMobileVoiceParticipantBadge(createParticipant(), "speaker"), {
      icon: "headset-outline",
      tone: "muted",
    });
  });

  it("only reports a route change when the outputs or the selection actually move", () => {
    const outputs = toMobileVoiceOutputOptions(["default", "earpiece"]);
    const withHeadset = toMobileVoiceOutputOptions(["default", "earpiece", "headset"]);

    assert.equal(
      hasMobileVoiceAudioRouteInputChanged(
        { availableAudioOutputs: outputs, selectedAudioOutputId: null },
        {
          availableAudioOutputs: toMobileVoiceOutputOptions(["default", "earpiece"]),
          selectedAudioOutputId: null,
        },
      ),
      false,
    );
    assert.equal(
      hasMobileVoiceAudioRouteInputChanged(
        { availableAudioOutputs: outputs, selectedAudioOutputId: null },
        { availableAudioOutputs: withHeadset, selectedAudioOutputId: null },
      ),
      true,
    );
    assert.equal(
      hasMobileVoiceAudioRouteInputChanged(
        { availableAudioOutputs: outputs, selectedAudioOutputId: null },
        { availableAudioOutputs: outputs, selectedAudioOutputId: "earpiece" },
      ),
      true,
    );
    // Order matters: the platform lists the active route first.
    assert.equal(
      hasMobileVoiceAudioRouteInputChanged(
        { availableAudioOutputs: outputs, selectedAudioOutputId: null },
        {
          availableAudioOutputs: toMobileVoiceOutputOptions(["earpiece", "default"]),
          selectedAudioOutputId: null,
        },
      ),
      true,
    );
  });
});
