import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Track } from "livekit-client";
import { ScreenShareHealthSnapshotSchema } from "@wizards/types";

import {
  classifyMobileScreenShareEncoder,
  collectMobileScreenShareHealthFromStats,
  createMobileScreenShareHealthTracker,
  createMobileScreenShareHealthSampler,
  drainMobileScreenShareHealthEvents,
  formatMobileScreenShareHealthLabel,
  isMobileScreenShareHealthSnapshotPiiFree,
  MOBILE_SCREEN_SHARE_HEALTH_EVENT_KIND,
  MOBILE_SCREEN_SHARE_HEALTH_METRICS,
  MOBILE_SCREEN_SHARE_HEALTH_STALE_MS,
  MOBILE_SCREEN_SHARE_HEALTH_SUMMARY_INTERVAL_MS,
  MOBILE_SCREEN_SHARE_HEALTH_TICK_DIVISOR,
  MOBILE_SCREEN_SHARE_IMPLEMENTATION_PATTERN,
  MOBILE_SCREEN_SHARE_TRACK_SOURCE,
  recordMobileScreenShareHealthSample,
  resetMobileScreenShareHealthForTests,
  resolveMobileScreenShareHealthSource,
  shouldSampleMobileScreenShareHealthOnTick,
  type MobileScreenShareHealthSnapshot,
  type MobileScreenShareStatsReport,
} from "../src/voice/mobile-screen-share-health";
import {
  MOBILE_VOICE_LEVEL_INTERVAL_MS,
  summarizeMobileVoiceLifecycleMatrix,
} from "../src/voice/mobile-voice-lifecycle-contract";
import { createInitialMobileVoiceRoomState } from "../src/voice/mobile-voice-room-contract";

type Entry = Record<string, unknown>;

function report(entries: Entry[]): MobileScreenShareStatsReport {
  return new Map(entries.map((entry, index) => [String(entry.id ?? index), entry]));
}

/**
 * What `@livekit/react-native-webrtc` resolves on Android for a sender:
 * `mediaType` rather than `kind`, no `active`, no `framesPerSecond`, no
 * `powerEfficientEncoder`, a MediaCodec component as the implementation.
 */
function androidSendEntries(overrides: Entry = {}): Entry[] {
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
    { bytesSent: 5, id: "RTCOutboundRTPAudioStream_2", mediaType: "audio", type: "outbound-rtp" },
  ];
}

function androidReceiveEntries(overrides: Entry = {}): Entry[] {
  return [
    {
      bytesReceived: 600_000,
      decoderImplementation: "c2.android.vp9.decoder",
      frameHeight: 1080,
      frameWidth: 1920,
      framesDecoded: 200,
      framesDropped: 2,
      freezeCount: 1,
      id: "RTCInboundRTPVideoStream_3",
      jitterBufferDelay: 8,
      jitterBufferEmittedCount: 200,
      mediaType: "video",
      packetsLost: 4,
      totalFreezesDuration: 0.4,
      type: "inbound-rtp",
      ...overrides,
    },
    {
      currentRoundTripTime: 0.06,
      id: "RTCIceCandidatePair_1",
      nominated: true,
      state: "succeeded",
      type: "candidate-pair",
    },
  ];
}

function snapshot(
  overrides: Partial<MobileScreenShareHealthSnapshot> = {},
): MobileScreenShareHealthSnapshot {
  return {
    bitrateKbps: 1_900,
    decoderImplementation: null,
    direction: "send",
    encoderImplementation: "c2.qti.avc.encoder",
    fps: 30,
    framesDropped: null,
    freezeCount: null,
    height: 720,
    jitterBufferDelayMs: null,
    packetsLost: 0,
    powerEfficientEncoder: null,
    qualityLimitationDurationsMs: { bandwidth: 500, cpu: 0, none: 9_500, other: 0 },
    qualityLimitationReason: "none",
    roundTripTimeMs: 80,
    sampledAt: 0,
    totalFreezesDurationMs: null,
    width: 1280,
    ...overrides,
  };
}

function statsReader(entries: Entry[]) {
  return { getStats: () => Promise.resolve(report(entries)) };
}

function fakeRoom(input: { local?: unknown; remotes?: unknown[] }) {
  const participant = (track: unknown) => ({
    getTrackPublication: (source: string) =>
      source === MOBILE_SCREEN_SHARE_TRACK_SOURCE && track ? { track } : undefined,
  });

  return {
    localParticipant: participant(input.local),
    remoteParticipants: new Map(
      (input.remotes ?? []).map((track, index) => [`remote-${index}`, participant(track)]),
    ),
  } as unknown as Parameters<typeof resolveMobileScreenShareHealthSource>[0];
}

describe("mobile screen share health — react-native-webrtc sender", () => {
  it("preserves unknown measurements as null in the shared wire contract", () => {
    const send = collectMobileScreenShareHealthFromStats(
      report(androidSendEntries().slice(0, 1)),
      "send",
      null,
      1000,
    );
    const receive = collectMobileScreenShareHealthFromStats(
      report(
        androidReceiveEntries({
          freezeCount: undefined,
          framesDropped: undefined,
          packetsLost: undefined,
          totalFreezesDuration: undefined,
        }),
      ),
      "receive",
      null,
      1000,
    );
    assert.equal(send?.snapshot.freezeCount, null);
    assert.equal(send?.snapshot.framesDropped, null);
    assert.equal(send?.snapshot.packetsLost, null);
    assert.equal(send?.snapshot.totalFreezesDurationMs, null);
    assert.equal(receive?.snapshot.freezeCount, null);
    assert.equal(receive?.snapshot.qualityLimitationDurationsMs, null);
    assert.ok(ScreenShareHealthSnapshotSchema.safeParse(send?.snapshot).success);
    assert.ok(ScreenShareHealthSnapshotSchema.safeParse(receive?.snapshot).success);
  });
  it("reads the MediaCodec sender and derives fps and bitrate from the counters", () => {
    const first = collectMobileScreenShareHealthFromStats(
      report(androidSendEntries()),
      "send",
      null,
      1_000,
    );
    const second = collectMobileScreenShareHealthFromStats(
      report(androidSendEntries({ bytesSent: 900_000, framesEncoded: 360 })),
      "send",
      first,
      3_000,
    );

    assert.ok(first);
    assert.deepEqual(first.snapshot, {
      bitrateKbps: null,
      decoderImplementation: null,
      direction: "send",
      encoderImplementation: "c2.qti.avc.encoder",
      fps: null,
      framesDropped: null,
      freezeCount: null,
      height: 720,
      jitterBufferDelayMs: null,
      packetsLost: 1,
      powerEfficientEncoder: null,
      qualityLimitationDurationsMs: { bandwidth: 500, cpu: 0, none: 9_500, other: 0 },
      qualityLimitationReason: "bandwidth",
      roundTripTimeMs: 80,
      sampledAt: 1_000,
      totalFreezesDurationMs: null,
      width: 1280,
    });
    // 60 frames and 500 000 bytes over 2 s.
    assert.equal(second?.snapshot.fps, 30);
    assert.equal(second?.snapshot.bitrateKbps, 2_000);
  });

  it("does not subtract a viewer baseline from a sharer sample", () => {
    const receive = collectMobileScreenShareHealthFromStats(
      report(androidReceiveEntries()),
      "receive",
      null,
      1_000,
    );
    const send = collectMobileScreenShareHealthFromStats(
      report(androidSendEntries()),
      "send",
      receive,
      3_000,
    );

    assert.equal(send?.snapshot.bitrateKbps, null);
  });
});

describe("mobile screen share health — react-native-webrtc receiver", () => {
  it("reads decode, freeze and jitter buffer figures", () => {
    const sample = collectMobileScreenShareHealthFromStats(
      report(androidReceiveEntries()),
      "receive",
      null,
      1_000,
    );

    assert.ok(sample);
    assert.equal(sample.snapshot.direction, "receive");
    assert.equal(sample.snapshot.decoderImplementation, "c2.android.vp9.decoder");
    assert.equal(sample.snapshot.height, 1080);
    assert.equal(sample.snapshot.framesDropped, 2);
    assert.equal(sample.snapshot.freezeCount, 1);
    assert.equal(sample.snapshot.totalFreezesDurationMs, 400);
    assert.equal(sample.snapshot.jitterBufferDelayMs, 40);
    assert.equal(sample.snapshot.roundTripTimeMs, 60);
    assert.equal(sample.snapshot.packetsLost, 4);
    assert.equal(sample.snapshot.encoderImplementation, null);
  });
});

describe("mobile screen share health — ticker budget (T7)", () => {
  it("samples every 22nd level tick, about two seconds apart, with no timer of its own", () => {
    const sampledTicks = Array.from({ length: 100 }, (_, index) => index + 1).filter(
      shouldSampleMobileScreenShareHealthOnTick,
    );

    assert.deepEqual(sampledTicks, [22, 44, 66, 88]);
    assert.equal(shouldSampleMobileScreenShareHealthOnTick(0), false);

    const cadenceMs = MOBILE_SCREEN_SHARE_HEALTH_TICK_DIVISOR * MOBILE_VOICE_LEVEL_INTERVAL_MS;
    assert.ok(cadenceMs >= 1_800 && cadenceMs <= 2_200, `cadence ${cadenceMs}ms is not ≈2 s`);
    assert.equal(summarizeMobileVoiceLifecycleMatrix().timerBudgetCount, 2);
  });

  it("resolves the screen share publication by the same source id livekit uses", () => {
    assert.equal(MOBILE_SCREEN_SHARE_TRACK_SOURCE, Track.Source.ScreenShare);
  });
});

describe("mobile screen share health — source resolution", () => {
  it("prefers the local sender, then the first remote receiver, else nothing", async () => {
    const local = { sender: statsReader(androidSendEntries()) };
    const remote = { receiver: statsReader(androidReceiveEntries()) };

    const sending = resolveMobileScreenShareHealthSource(fakeRoom({ local, remotes: [remote] }));
    const watching = resolveMobileScreenShareHealthSource(fakeRoom({ remotes: [remote] }));
    const idle = resolveMobileScreenShareHealthSource(fakeRoom({}));
    const unpublished = resolveMobileScreenShareHealthSource(
      fakeRoom({ local: { sender: undefined }, remotes: [{ receiver: null }] }),
    );

    assert.equal(sending?.direction, "send");
    assert.equal(watching?.direction, "receive");
    assert.equal(idle, null);
    assert.equal(unpublished, null);
    assert.equal(resolveMobileScreenShareHealthSource(null), null);

    const sample = collectMobileScreenShareHealthFromStats(
      await watching!.readStats(),
      watching!.direction,
    );
    assert.equal(sample?.snapshot.height, 1080);
  });
});

describe("mobile screen share health — privacy", () => {
  it("keeps the implementation name inside the allowlist and bounded", () => {
    const hostile = collectMobileScreenShareHealthFromStats(
      report(
        androidSendEntries({
          encoderImplementation: `Ekran: "Banka" <WhatsApp> — ${"x".repeat(80)}`,
        }),
      ),
      "send",
      null,
      1_000,
    );

    assert.ok(hostile);
    assert.ok(
      MOBILE_SCREEN_SHARE_IMPLEMENTATION_PATTERN.test(hostile.snapshot.encoderImplementation ?? ""),
    );
    assert.equal(hostile.snapshot.encoderImplementation?.length, 64);
    assert.ok(isMobileScreenShareHealthSnapshotPiiFree(hostile.snapshot));
    assert.equal(
      isMobileScreenShareHealthSnapshotPiiFree(
        snapshot({ qualityLimitationReason: "window: Banka" as never }),
      ),
      false,
    );
  });

  it("classifies Android MediaCodec names without naming a vendor in product copy", () => {
    assert.equal(classifyMobileScreenShareEncoder(snapshot()), "hw");
    assert.equal(
      classifyMobileScreenShareEncoder(
        snapshot({ encoderImplementation: "c2.android.avc.encoder" }),
      ),
      "sw",
    );
    assert.equal(
      classifyMobileScreenShareEncoder(
        snapshot({ encoderImplementation: "OMX.google.h264.encoder" }),
      ),
      "sw",
    );
    assert.equal(
      classifyMobileScreenShareEncoder(
        snapshot({ encoderImplementation: "OMX.qcom.video.encoder.avc" }),
      ),
      "hw",
    );
    assert.equal(
      classifyMobileScreenShareEncoder(snapshot({ encoderImplementation: null })),
      "unknown",
    );
    assert.equal(
      classifyMobileScreenShareEncoder(snapshot({ powerEfficientEncoder: false })),
      "sw",
    );
  });
});

describe("mobile screen share health — K16 summary without a timer", () => {
  it("emits start on the first sample, a window on drain, and end when the share stops", () => {
    const tracker = createMobileScreenShareHealthTracker({ sessionToken: "t" });
    let now = 0;

    tracker.record(snapshot({ sampledAt: now }), now);
    const start = tracker.drain(now);
    assert.deepEqual([...new Set(start.map((event) => event.context.phase))], ["start"]);
    assert.equal(
      start[0]?.context.sampleId,
      `t:send:0:start:${MOBILE_SCREEN_SHARE_HEALTH_METRICS.sendFps.replace("screen_share.", "")}`,
    );

    for (let tick = 0; tick < 30; tick += 1) {
      now += 2_000;
      tracker.record(snapshot({ sampledAt: now, fps: 28 + (tick % 3) }), now);
    }
    const interval = tracker.drain(now);
    assert.deepEqual([...new Set(interval.map((event) => event.context.phase))], ["interval"]);
    assert.equal(
      interval.find((event) => event.surface === MOBILE_SCREEN_SHARE_HEALTH_METRICS.sendFps)?.value,
      29,
    );
    assert.equal(tracker.drain(now).length, 0);

    now += 2_000;
    tracker.record(null, now);
    const end = tracker.drain(now);
    assert.deepEqual([...new Set(end.map((event) => event.context.phase))], ["end"]);
    assert.equal(tracker.isActive, false);
    assert.ok(end.every((event) => event.kind === MOBILE_SCREEN_SHARE_HEALTH_EVENT_KIND));
    assert.ok(end.every((event) => event.surface.startsWith("screen_share.")));
    assert.ok(end.every((event) => typeof event.value === "number"));
  });

  it("closes a window whose samples went stale when the ticker stopped without a null", () => {
    const tracker = createMobileScreenShareHealthTracker({ sessionToken: "t" });

    tracker.record(snapshot({ sampledAt: 0 }), 0);
    tracker.drain(0);
    tracker.record(snapshot({ sampledAt: 2_000 }), 2_000);

    const events = tracker.drain(2_000 + MOBILE_SCREEN_SHARE_HEALTH_STALE_MS + 1);

    assert.deepEqual([...new Set(events.map((event) => event.context.phase))], ["end"]);
    assert.equal(tracker.isActive, false);
  });

  it("rolls the window on the summary interval even between drains", () => {
    const tracker = createMobileScreenShareHealthTracker({ sessionToken: "t" });
    const stepMs = 2_000;
    let now = 0;

    tracker.record(snapshot({ sampledAt: now }), now);
    while (now < MOBILE_SCREEN_SHARE_HEALTH_SUMMARY_INTERVAL_MS) {
      now += stepMs;
      tracker.record(snapshot({ sampledAt: now }), now);
    }

    // The 60 s window closed inside `record`; the drain only ships it.
    assert.equal(tracker.pendingCount > 0, true);
    const phases = [...new Set(tracker.drain(now).map((event) => event.context.phase))];
    assert.deepEqual(phases, ["start", "interval"]);
    assert.equal(tracker.isActive, true);
  });

  it("exposes one shared tracker for the ticker and the reporter bridge", () => {
    resetMobileScreenShareHealthForTests();

    recordMobileScreenShareHealthSample(snapshot({ direction: "receive", sampledAt: 10 }), 10);
    const events = drainMobileScreenShareHealthEvents(10);

    assert.ok(events.length > 0);
    assert.ok(events.every((event) => event.context.direction === "receive"));
    assert.deepEqual(drainMobileScreenShareHealthEvents(20), []);
    resetMobileScreenShareHealthForTests();
  });
});

describe("mobile screen share health — room state and presentation", () => {
  it("starts with no measurement in the room state", () => {
    assert.equal(createInitialMobileVoiceRoomState().screenShareHealth, null);
  });

  it("formats the viewer label from measured values only", () => {
    assert.equal(
      formatMobileScreenShareHealthLabel(snapshot({ fps: 29.6, height: 720 })),
      "720p · 30 fps",
    );
    assert.equal(
      formatMobileScreenShareHealthLabel(snapshot({ fps: null, height: 1080 })),
      "1080p",
    );
    assert.equal(formatMobileScreenShareHealthLabel(snapshot({ height: null })), null);
    assert.equal(formatMobileScreenShareHealthLabel(null), null);
  });
});

describe("mobile health sampler lifetime", () => {
  it("drops overlapping reads and ignores late completion after leaving", async () => {
    let resolve!: (value: MobileScreenShareStatsReport) => void;
    let calls = 0;
    const samples: (MobileScreenShareHealthSnapshot | null)[] = [];
    const sampler = createMobileScreenShareHealthSampler({
      onSample: (sample) => samples.push(sample),
    });
    const source = {
      identity: {},
      track: {},
      direction: "send" as const,
      readStats: () => {
        calls += 1;
        return new Promise<MobileScreenShareStatsReport>((done) => {
          resolve = done;
        });
      },
    };
    const pending = sampler.sample(source);
    await sampler.sample(source);
    assert.equal(calls, 1);
    sampler.stop();
    resolve(report(androidSendEntries()));
    await pending;
    assert.deepEqual(samples, [null]);
  });

  it("resets rates for a replacement track and clears failed reads", async () => {
    let now = 1000;
    let latest: MobileScreenShareHealthSnapshot | null = null;
    let measuredTrack: object | null = null;
    const sampler = createMobileScreenShareHealthSampler({
      now: () => now,
      onSample: (sample, track) => {
        latest = sample;
        measuredTrack = track;
      },
    });
    const source = {
      identity: {},
      track: {},
      direction: "send" as const,
      readStats: async () => report(androidSendEntries()),
    };
    await sampler.sample(source);
    now += 2000;
    await sampler.sample({
      ...source,
      readStats: async () => report(androidSendEntries({ bytesSent: 600_000 })),
    });
    assert.equal((latest as MobileScreenShareHealthSnapshot | null)?.bitrateKbps, 800);
    const replacement = { ...source, identity: {}, track: {} };
    now += 2000;
    await sampler.sample(replacement);
    assert.equal((latest as MobileScreenShareHealthSnapshot | null)?.bitrateKbps, null);
    assert.equal(measuredTrack, replacement.track);
    await sampler.sample({
      ...replacement,
      readStats: async () => {
        throw new Error("ended");
      },
    });
    assert.equal(latest, null);
    assert.equal(measuredTrack, null);
    await sampler.sample(replacement);
    assert.ok(latest);
    await sampler.sample(null);
    assert.equal(latest, null);
  });
});
