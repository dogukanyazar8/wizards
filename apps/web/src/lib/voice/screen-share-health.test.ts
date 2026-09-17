import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  classifyScreenShareEncoder,
  collectScreenShareHealthFromStats,
  isScreenShareHealthSnapshotPiiFree,
  sanitizeScreenShareImplementation,
  selectScreenShareStageChip,
  summarizeScreenShareHealthWindow,
  SCREEN_SHARE_ENCODER_CLASS_VALUE,
  SCREEN_SHARE_HEALTH_EVENT_KIND,
  SCREEN_SHARE_HEALTH_MAX_SAMPLE_GAP_MS,
  SCREEN_SHARE_HEALTH_METRICS,
  SCREEN_SHARE_HEALTH_SUMMARY_INTERVAL_MS,
  SCREEN_SHARE_IMPLEMENTATION_PATTERN,
  ScreenShareHealthWindowTracker,
  type ScreenShareHealthSnapshot,
  type ScreenShareStatsReport,
} from "./screen-share-health";

type Entry = Record<string, unknown>;

function report(entries: Entry[]): ScreenShareStatsReport {
  return new Map(entries.map((entry, index) => [String(entry.id ?? index), entry]));
}

/** What Chrome 130+ reports for a VP9 SVC screen share sender. */
function chromeSendEntries(overrides: Entry = {}): Entry[] {
  return [
    {
      active: true,
      bytesSent: 1_500_000,
      encoderImplementation: "SimulcastEncoderAdapter (libvpx, libvpx, libvpx)",
      frameHeight: 1080,
      frameWidth: 1920,
      framesEncoded: 600,
      framesPerSecond: 59,
      id: "OT01",
      kind: "video",
      mediaType: "video",
      powerEfficientEncoder: false,
      qualityLimitationDurations: { bandwidth: 0, cpu: 2.25, none: 10.5, other: 0 },
      qualityLimitationReason: "cpu",
      timestamp: 1_700_000_000_000,
      totalEncodeTime: 3.6,
      type: "outbound-rtp",
      ...overrides,
    },
    {
      id: "RI01",
      kind: "video",
      localId: "OT01",
      packetsLost: 3,
      roundTripTime: 0.042,
      type: "remote-inbound-rtp",
    },
    {
      framesPerSecond: 60,
      height: 1080,
      id: "MS01",
      kind: "video",
      type: "media-source",
      width: 1920,
    },
    {
      currentRoundTripTime: 0.05,
      id: "CP01",
      nominated: true,
      state: "succeeded",
      type: "candidate-pair",
    },
    { id: "OA01", kind: "audio", type: "outbound-rtp", bytesSent: 40_000 },
  ];
}

/** What Chrome reports for a viewer's screen share receiver. */
function chromeReceiveEntries(overrides: Entry = {}): Entry[] {
  return [
    {
      bytesReceived: 800_000,
      decoderImplementation: "libvpx",
      frameHeight: 1080,
      frameWidth: 1920,
      framesDecoded: 300,
      framesDropped: 4,
      framesPerSecond: 30,
      freezeCount: 2,
      id: "IT01",
      jitterBufferDelay: 12,
      jitterBufferEmittedCount: 300,
      kind: "video",
      packetsLost: 7,
      totalFreezesDuration: 1.5,
      type: "inbound-rtp",
      ...overrides,
    },
    {
      currentRoundTripTime: 0.05,
      id: "CP01",
      nominated: true,
      state: "succeeded",
      type: "candidate-pair",
    },
    { id: "IA01", kind: "audio", type: "inbound-rtp", framesDecoded: 99_999 },
  ];
}

/**
 * What `@livekit/react-native-webrtc` resolves on Android: `mediaType` instead
 * of `kind`, no `active`, no `framesPerSecond`, no `powerEfficientEncoder`, and
 * a MediaCodec component name as the implementation.
 */
function reactNativeSendEntries(overrides: Entry = {}): Entry[] {
  return [
    {
      bytesSent: 400_000,
      encoderImplementation: "c2.qti.avc.encoder",
      frameHeight: 720,
      frameWidth: 1280,
      framesEncoded: 300,
      id: "RTCOutboundRTPVideoStream_1",
      mediaType: "video",
      qualityLimitationDurations: { bandwidth: 0.5, cpu: 0, none: 9.5, other: 0 },
      qualityLimitationReason: "bandwidth",
      totalEncodeTime: 1.2,
      type: "outbound-rtp",
      ...overrides,
    },
    {
      id: "RTCRemoteInboundRtpVideoStream_1",
      localId: "RTCOutboundRTPVideoStream_1",
      mediaType: "video",
      packetsLost: 1,
      roundTripTime: 0.08,
      type: "remote-inbound-rtp",
    },
  ];
}

function snapshot(overrides: Partial<ScreenShareHealthSnapshot> = {}): ScreenShareHealthSnapshot {
  return {
    bitrateKbps: 5_800,
    decoderImplementation: null,
    direction: "send",
    encoderImplementation: "libvpx",
    fps: 60,
    framesDropped: null,
    freezeCount: null,
    height: 1080,
    jitterBufferDelayMs: null,
    packetsLost: 0,
    powerEfficientEncoder: false,
    qualityLimitationDurationsMs: { bandwidth: 0, cpu: 2_000, none: 10_000, other: 0 },
    qualityLimitationReason: "none",
    roundTripTimeMs: 40,
    sampledAt: 0,
    totalFreezesDurationMs: null,
    width: 1920,
    ...overrides,
  };
}

describe("collectScreenShareHealthFromStats — Chrome sender", () => {
  it("reads the encoder, the picture and the limitation reason from outbound-rtp", () => {
    const sample = collectScreenShareHealthFromStats(
      report(chromeSendEntries()),
      "send",
      null,
      1_000,
    );

    assert.ok(sample);
    assert.deepEqual(sample.snapshot, {
      bitrateKbps: null,
      decoderImplementation: null,
      direction: "send",
      encoderImplementation: "SimulcastEncoderAdapter (libvpx libvpx libvpx)",
      fps: 59,
      framesDropped: null,
      freezeCount: null,
      height: 1080,
      jitterBufferDelayMs: null,
      packetsLost: 3,
      powerEfficientEncoder: false,
      qualityLimitationDurationsMs: { bandwidth: 0, cpu: 2_250, none: 10_500, other: 0 },
      qualityLimitationReason: "cpu",
      roundTripTimeMs: 42,
      sampledAt: 1_000,
      totalFreezesDurationMs: null,
      width: 1920,
    });
    assert.equal(sample.encodeTimePerFrameMs, null);
  });

  it("turns the byte and frame deltas into a bitrate, an fps and an encode cost", () => {
    const first = collectScreenShareHealthFromStats(
      report(chromeSendEntries()),
      "send",
      null,
      1_000,
    );
    const second = collectScreenShareHealthFromStats(
      report(
        chromeSendEntries({
          bytesSent: 2_500_000,
          framesEncoded: 720,
          framesPerSecond: undefined,
          totalEncodeTime: 4.2,
        }),
      ),
      "send",
      first,
      3_000,
    );

    assert.ok(second);
    // 1 000 000 bytes over 2 s = 4 000 000 bit/s.
    assert.equal(second.snapshot.bitrateKbps, 4_000);
    // No `framesPerSecond` in this report: 120 frames over 2 s.
    assert.equal(second.snapshot.fps, 60);
    // 0.6 s of encoder time over 120 frames.
    assert.equal(second.encodeTimePerFrameMs, 5);
  });

  it("refuses a baseline across a gap or a counter reset", () => {
    const first = collectScreenShareHealthFromStats(
      report(chromeSendEntries()),
      "send",
      null,
      1_000,
    );

    const afterGap = collectScreenShareHealthFromStats(
      report(chromeSendEntries({ bytesSent: 9_000_000 })),
      "send",
      first,
      1_000 + SCREEN_SHARE_HEALTH_MAX_SAMPLE_GAP_MS + 1,
    );
    assert.equal(afterGap?.snapshot.bitrateKbps, null);

    const afterReset = collectScreenShareHealthFromStats(
      report(chromeSendEntries({ bytesSent: 10 })),
      "send",
      first,
      3_000,
    );
    assert.equal(afterReset?.snapshot.bitrateKbps, null);
  });

  it("picks the active stream with the tallest picture when SVC or simulcast reports several", () => {
    const entries = [
      {
        ...chromeSendEntries()[0],
        active: true,
        frameHeight: 540,
        id: "OT-low",
        encoderImplementation: "low",
      },
      {
        ...chromeSendEntries()[0],
        active: true,
        frameHeight: 1080,
        id: "OT-mid",
        encoderImplementation: "mid",
      },
      {
        ...chromeSendEntries()[0],
        active: false,
        frameHeight: 1440,
        id: "OT-high",
        encoderImplementation: "high",
      },
      {
        id: "RI-mid",
        kind: "video",
        localId: "OT-mid",
        packetsLost: 11,
        roundTripTime: 0.02,
        type: "remote-inbound-rtp",
      },
      {
        id: "RI-low",
        kind: "video",
        localId: "OT-low",
        packetsLost: 99,
        roundTripTime: 0.9,
        type: "remote-inbound-rtp",
      },
    ] as Entry[];

    const sample = collectScreenShareHealthFromStats(report(entries), "send", null, 1_000);

    assert.equal(sample?.snapshot.height, 1080);
    assert.equal(sample?.snapshot.encoderImplementation, "mid");
    assert.equal(sample?.snapshot.packetsLost, 11);
    assert.equal(sample?.snapshot.roundTripTimeMs, 20);
  });

  it("falls back to the transport round trip when no remote-inbound-rtp exists yet", () => {
    const entries = chromeSendEntries().filter((entry) => entry.type !== "remote-inbound-rtp");
    const sample = collectScreenShareHealthFromStats(report(entries), "send", null, 1_000);

    assert.equal(sample?.snapshot.roundTripTimeMs, 50);
    assert.equal(sample?.snapshot.packetsLost, null);
  });

  it("returns null when the report carries no video stream", () => {
    const sample = collectScreenShareHealthFromStats(
      report([{ id: "OA01", kind: "audio", type: "outbound-rtp", bytesSent: 1 }]),
      "send",
      null,
      1_000,
    );

    assert.equal(sample, null);
  });
});

describe("collectScreenShareHealthFromStats — Chrome receiver", () => {
  it("reads decode, freeze and jitter buffer figures from inbound-rtp", () => {
    const sample = collectScreenShareHealthFromStats(
      report(chromeReceiveEntries()),
      "receive",
      null,
      1_000,
    );

    assert.ok(sample);
    assert.deepEqual(sample.snapshot, {
      bitrateKbps: null,
      decoderImplementation: "libvpx",
      direction: "receive",
      encoderImplementation: null,
      fps: 30,
      framesDropped: 4,
      freezeCount: 2,
      height: 1080,
      // 12 s of buffering over 300 emitted frames.
      jitterBufferDelayMs: 40,
      packetsLost: 7,
      powerEfficientEncoder: null,
      qualityLimitationDurationsMs: null,
      qualityLimitationReason: null,
      roundTripTimeMs: 50,
      sampledAt: 1_000,
      totalFreezesDurationMs: 1_500,
      width: 1920,
    });
    assert.equal(sample.counters.frames, 300);
  });

  it("measures the jitter buffer over the interval once a baseline exists", () => {
    const first = collectScreenShareHealthFromStats(
      report(chromeReceiveEntries()),
      "receive",
      null,
      1_000,
    );
    const second = collectScreenShareHealthFromStats(
      report(
        chromeReceiveEntries({
          bytesReceived: 1_300_000,
          framesDecoded: 360,
          jitterBufferDelay: 13.5,
          jitterBufferEmittedCount: 360,
        }),
      ),
      "receive",
      first,
      3_000,
    );

    // 1.5 s over 60 frames since the last sample, not 13.5 s over 360.
    assert.equal(second?.snapshot.jitterBufferDelayMs, 25);
    assert.equal(second?.snapshot.bitrateKbps, 2_000);
  });
});

describe("collectScreenShareHealthFromStats — react-native-webrtc sender", () => {
  it("accepts mediaType-only entries and derives fps from the frame counter", () => {
    const first = collectScreenShareHealthFromStats(
      report(reactNativeSendEntries()),
      "send",
      null,
      1_000,
    );
    const second = collectScreenShareHealthFromStats(
      report(reactNativeSendEntries({ bytesSent: 900_000, framesEncoded: 360 })),
      "send",
      first,
      3_000,
    );

    assert.equal(first?.snapshot.fps, null);
    assert.equal(first?.snapshot.powerEfficientEncoder, null);
    assert.equal(first?.snapshot.encoderImplementation, "c2.qti.avc.encoder");
    assert.equal(first?.snapshot.qualityLimitationReason, "bandwidth");
    assert.equal(first?.snapshot.roundTripTimeMs, 80);
    assert.equal(second?.snapshot.fps, 30);
    assert.equal(second?.snapshot.bitrateKbps, 2_000);
    assert.equal(second?.snapshot.height, 720);
  });
});

describe("screen share health privacy", () => {
  it("keeps every string field inside the implementation allowlist", () => {
    const hostile = collectScreenShareHealthFromStats(
      report(
        chromeSendEntries({
          encoderImplementation: 'Şifre <script>alert("x")</script> — Chrome, "Bank"',
        }),
      ),
      "send",
      null,
      1_000,
    );

    assert.ok(hostile);
    assert.equal(hostile.snapshot.encoderImplementation, "ifre scriptalert(x)/script Chrome Bank");
    assert.ok(isScreenShareHealthSnapshotPiiFree(hostile.snapshot));
    assert.ok(
      SCREEN_SHARE_IMPLEMENTATION_PATTERN.test(hostile.snapshot.encoderImplementation ?? ""),
    );
  });

  it("bounds the implementation name and drops empty ones", () => {
    assert.equal(sanitizeScreenShareImplementation("x".repeat(100))?.length, 64);
    assert.equal(sanitizeScreenShareImplementation("   "), null);
    assert.equal(sanitizeScreenShareImplementation(42), null);
  });

  it("rejects a snapshot that smuggles free text in an enum field", () => {
    const leaky = snapshot({ qualityLimitationReason: "window: Bank statement" as never });

    assert.equal(isScreenShareHealthSnapshotPiiFree(leaky), false);
  });

  it("serializes only the contract fields", () => {
    const sample = collectScreenShareHealthFromStats(
      report(chromeSendEntries()),
      "send",
      null,
      1_000,
    );

    assert.deepEqual(Object.keys(sample?.snapshot ?? {}).sort(), [
      "bitrateKbps",
      "decoderImplementation",
      "direction",
      "encoderImplementation",
      "fps",
      "framesDropped",
      "freezeCount",
      "height",
      "jitterBufferDelayMs",
      "packetsLost",
      "powerEfficientEncoder",
      "qualityLimitationDurationsMs",
      "qualityLimitationReason",
      "roundTripTimeMs",
      "sampledAt",
      "totalFreezesDurationMs",
      "width",
    ]);
  });
});

describe("classifyScreenShareEncoder", () => {
  it("trusts the browser flag before the implementation name", () => {
    assert.equal(
      classifyScreenShareEncoder(
        snapshot({ powerEfficientEncoder: true, encoderImplementation: "libvpx" }),
      ),
      "hw",
    );
    assert.equal(
      classifyScreenShareEncoder(
        snapshot({ powerEfficientEncoder: false, encoderImplementation: "ExternalEncoder" }),
      ),
      "sw",
    );
  });

  it("classifies known implementation families when the flag is missing", () => {
    const withName = (encoderImplementation: string | null) =>
      classifyScreenShareEncoder(snapshot({ encoderImplementation, powerEfficientEncoder: null }));

    assert.equal(withName("libvpx"), "sw");
    assert.equal(withName("OpenH264"), "sw");
    assert.equal(withName("SimulcastEncoderAdapter (libvpx libvpx libvpx)"), "sw");
    assert.equal(withName("ExternalEncoder"), "hw");
    assert.equal(withName("OMX.google.h264.encoder"), "sw");
    assert.equal(withName("c2.android.avc.encoder"), "sw");
    assert.equal(withName("OMX.qcom.video.encoder.avc"), "hw");
    assert.equal(withName("c2.qti.avc.encoder"), "hw");
    assert.equal(withName(null), "unknown");
    assert.equal(withName("SomethingNew"), "unknown");
  });
});

describe("summarizeScreenShareHealthWindow", () => {
  it("reports the sender window as p50 rates, delta limitation shares and the encoder class", () => {
    const samples = [
      snapshot({
        fps: 60,
        bitrateKbps: 6_000,
        sampledAt: 0,
        qualityLimitationDurationsMs: { bandwidth: 0, cpu: 2_000, none: 10_000, other: 0 },
      }),
      snapshot({
        fps: 58,
        bitrateKbps: 5_000,
        sampledAt: 2_000,
        qualityLimitationDurationsMs: { bandwidth: 4_000, cpu: 7_000, none: 25_000, other: 0 },
      }),
      snapshot({
        fps: 59,
        bitrateKbps: 5_500,
        sampledAt: 4_000,
        height: 1440,
        powerEfficientEncoder: true,
        qualityLimitationDurationsMs: { bandwidth: 8_000, cpu: 12_000, none: 40_000, other: 0 },
      }),
    ];

    const events = summarizeScreenShareHealthWindow(samples, {
      phase: "interval",
      sampleIdPrefix: "s:1",
    });
    const byName = new Map(events.map((event) => [event.surface, event]));

    assert.equal(byName.get(SCREEN_SHARE_HEALTH_METRICS.sendFps)?.value, 59);
    assert.equal(byName.get(SCREEN_SHARE_HEALTH_METRICS.sendFps)?.unit, "fps");
    assert.equal(byName.get(SCREEN_SHARE_HEALTH_METRICS.sendBitrateKbps)?.value, 5_500);
    assert.equal(byName.get(SCREEN_SHARE_HEALTH_METRICS.sendHeight)?.value, 1_440);
    // Deltas over the window: cpu 10 000 / 48 000, bandwidth 8 000 / 48 000.
    assert.equal(byName.get(SCREEN_SHARE_HEALTH_METRICS.sendLimitCpuPct)?.value, 20.83);
    assert.equal(byName.get(SCREEN_SHARE_HEALTH_METRICS.sendLimitBandwidthPct)?.value, 16.67);
    assert.equal(
      byName.get(SCREEN_SHARE_HEALTH_METRICS.encoder)?.value,
      SCREEN_SHARE_ENCODER_CLASS_VALUE.hw,
    );
    assert.ok(events.every((event) => event.kind === SCREEN_SHARE_HEALTH_EVENT_KIND));
    assert.ok(
      events.every(
        (event) => event.context.sampleId === `s:1:${event.surface.replace("screen_share.", "")}`,
      ),
    );
    assert.ok(
      events.every((event) => event.context.sampleCount === 3 && event.context.windowMs === 4_000),
    );
    assert.ok(events.every((event) => typeof event.value === "number"));
  });

  it("uses the cumulative shares when the window holds a single sample", () => {
    const events = summarizeScreenShareHealthWindow(
      [
        snapshot({
          qualityLimitationDurationsMs: { bandwidth: 0, cpu: 2_500, none: 7_500, other: 0 },
        }),
      ],
      { phase: "start", sampleIdPrefix: "s:0" },
    );

    assert.equal(
      events.find((event) => event.surface === SCREEN_SHARE_HEALTH_METRICS.sendLimitCpuPct)?.value,
      25,
    );
  });

  it("reports the receiver window as fps, freeze delta and jitter buffer", () => {
    const events = summarizeScreenShareHealthWindow(
      [
        snapshot({
          direction: "receive",
          fps: 28,
          freezeCount: 2,
          jitterBufferDelayMs: 30,
          sampledAt: 0,
        }),
        snapshot({
          direction: "receive",
          fps: 30,
          freezeCount: 5,
          jitterBufferDelayMs: 50,
          sampledAt: 2_000,
        }),
      ],
      { phase: "end", sampleIdPrefix: "s:2" },
    );

    assert.deepEqual(
      events.map((event) => [event.surface, event.value, event.unit]),
      [
        [SCREEN_SHARE_HEALTH_METRICS.recvFps, 28, "fps"],
        [SCREEN_SHARE_HEALTH_METRICS.recvFreezeCount, 3, "count"],
        [SCREEN_SHARE_HEALTH_METRICS.recvJitterBufferMs, 30, "ms"],
      ],
    );
  });

  it("skips a metric it cannot measure instead of writing zero", () => {
    const events = summarizeScreenShareHealthWindow(
      [
        snapshot({
          fps: null,
          bitrateKbps: null,
          qualityLimitationDurationsMs: { bandwidth: 0, cpu: 0, none: 0, other: 0 },
        }),
      ],
      { phase: "start", sampleIdPrefix: "s:3" },
    );

    assert.deepEqual(
      events.map((event) => event.surface),
      [SCREEN_SHARE_HEALTH_METRICS.sendHeight, SCREEN_SHARE_HEALTH_METRICS.encoder],
    );
  });
});

describe("ScreenShareHealthWindowTracker — K16 cadence", () => {
  it("keeps deduplication ids within the server's 64 character limit", () => {
    const tracker = new ScreenShareHealthWindowTracker();
    tracker.observe(snapshot({ direction: "receive" }), 0);
    const events = tracker.observe(
      snapshot({ direction: "receive", sampledAt: 60000, jitterBufferDelayMs: 20 }),
      60000,
    );
    assert.ok(events.length > 0);
    assert.ok(events.every((event) => event.context.sampleId.length <= 64));
  });
  it("emits a start summary, one per interval, and an end summary", () => {
    const tracker = new ScreenShareHealthWindowTracker({ sessionToken: "t" });
    const flushes: string[] = [];
    let now = 0;

    const record = (events: ReturnType<typeof tracker.observe>) => {
      if (events.length > 0) {
        flushes.push(events[0]!.context.phase);
      }
    };

    record(tracker.observe(snapshot({ sampledAt: now }), now));
    for (let tick = 0; tick < 45; tick += 1) {
      now += 2_000;
      record(tracker.observe(snapshot({ sampledAt: now }), now));
    }
    record(tracker.observe(null, now));

    assert.deepEqual(flushes, ["start", "interval", "end"]);
    assert.equal(tracker.isActive, false);
  });

  it("gives every window a distinct sample id and keeps them stable for a retry", () => {
    const tracker = new ScreenShareHealthWindowTracker({ sessionToken: "t" });
    const start = tracker.observe(snapshot({ sampledAt: 0 }), 0);
    const interval = tracker.observe(
      snapshot({ sampledAt: SCREEN_SHARE_HEALTH_SUMMARY_INTERVAL_MS }),
      SCREEN_SHARE_HEALTH_SUMMARY_INTERVAL_MS,
    );

    assert.equal(
      start[0]?.context.sampleId,
      `t:send:0:start:${SCREEN_SHARE_HEALTH_METRICS.sendFps.replace("screen_share.", "")}`,
    );
    assert.equal(
      interval[0]?.context.sampleId,
      `t:send:1:interval:${SCREEN_SHARE_HEALTH_METRICS.sendFps.replace("screen_share.", "")}`,
    );
    assert.notEqual(start[0]?.context.sampleId, interval[0]?.context.sampleId);
  });

  it("closes the sender window and opens a viewer window when the direction flips", () => {
    const tracker = new ScreenShareHealthWindowTracker({ sessionToken: "t" });
    tracker.observe(snapshot({ direction: "send", sampledAt: 0 }), 0);

    const events = tracker.observe(snapshot({ direction: "receive", sampledAt: 2_000 }), 2_000);

    assert.deepEqual(
      [...new Set(events.map((event) => `${event.context.direction}:${event.context.phase}`))],
      ["send:end", "receive:start"],
    );
  });

  it("ignores a null before any sample", () => {
    const tracker = new ScreenShareHealthWindowTracker({ sessionToken: "t" });

    assert.deepEqual(tracker.observe(null, 0), []);
  });
});

describe("selectScreenShareStageChip", () => {
  it("writes the measured picture when a sample exists", () => {
    const chip = selectScreenShareStageChip({
      health: snapshot({ fps: 57.6, height: 1080, qualityLimitationReason: "cpu" }),
      presetFps: 60,
      presetResolutionLabel: "1440p",
    });

    assert.deepEqual(chip, {
      fps: 58,
      height: 1080,
      limitation: "cpu",
      resolutionLabel: "1080p",
      source: "measured",
    });
  });

  it("keeps the preset label while nothing has been measured", () => {
    const preset = { presetFps: 60, presetResolutionLabel: "1080p" };

    assert.deepEqual(selectScreenShareStageChip({ health: null, ...preset }), {
      fps: 60,
      height: null,
      limitation: null,
      resolutionLabel: "1080p",
      source: "preset",
    });
    assert.equal(
      selectScreenShareStageChip({ health: snapshot({ height: null }), ...preset }).source,
      "preset",
    );
  });

  it("never fills a measured chip with preset numbers", () => {
    const chip = selectScreenShareStageChip({
      health: snapshot({ fps: null, height: 720, qualityLimitationReason: "none" }),
      presetFps: 60,
      presetResolutionLabel: "1080p",
    });

    assert.equal(chip.fps, null);
    assert.equal(chip.limitation, null);
    assert.equal(chip.resolutionLabel, "720p");
  });
});
