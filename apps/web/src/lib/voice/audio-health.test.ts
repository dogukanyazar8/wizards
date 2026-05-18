import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  collectVoiceAudioHealthFromSender,
  collectVoiceAudioHealthFromStats,
} from "./audio-health";

describe("voice audio health telemetry helpers", () => {
  it("extracts only coarse audio health counters from RTC stats", () => {
    const stats = new Map<string, unknown>([
      [
        "outbound-audio",
        {
          id: "outbound-audio",
          kind: "audio",
          packetsSent: 120,
          type: "outbound-rtp",
        },
      ],
      [
        "remote-inbound-audio",
        {
          id: "remote-inbound-audio",
          kind: "audio",
          packetsLost: 2,
          roundTripTime: 0.12345,
          type: "remote-inbound-rtp",
        },
      ],
      [
        "audio-source",
        {
          audioLevel: 0.42,
          totalAudioEnergy: 18.75,
          totalSamplesDuration: 42.5,
          type: "audio-source",
        },
      ],
      [
        "video-source",
        {
          kind: "video",
          packetsSent: 999,
          type: "outbound-rtp",
        },
      ],
    ]);

    assert.deepEqual(collectVoiceAudioHealthFromStats(stats), {
      audioLevel: 0.42,
      packetsLost: 2,
      packetsSent: 120,
      roundTripTimeMs: 123.45,
      totalAudioEnergy: 18.75,
      totalSamplesDuration: 42.5,
    });
  });

  it("returns null when stats do not contain audio health counters", () => {
    const stats = new Map<string, unknown>([
      [
        "candidate-pair",
        {
          availableOutgoingBitrate: 1_000,
          type: "candidate-pair",
        },
      ],
    ]);

    assert.equal(collectVoiceAudioHealthFromStats(stats), null);
  });

  it("reads stats from an RTCRtpSender-like object without requiring browser APIs", async () => {
    const metric = await collectVoiceAudioHealthFromSender({
      getStats: async () =>
        new Map<string, unknown>([
          [
            "outbound-audio",
            {
              mediaType: "audio",
              packetsSent: 12,
              type: "outbound-rtp",
            },
          ],
        ]),
    });

    assert.deepEqual(metric, {
      packetsSent: 12,
    });
  });
});
