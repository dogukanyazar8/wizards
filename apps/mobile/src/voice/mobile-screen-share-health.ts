/**
 * Screen share health on the phone: fps, picture size, bitrate and the
 * limitation reason, read from `sender.getStats()` / `receiver.getStats()`.
 *
 * Same contract as the web module (`apps/web/src/lib/voice/screen-share-health.ts`);
 * duplicated rather than shared because the shared package only carries types
 * (Ş0.1) and the phone cannot import web code.
 *
 * Constraints this module honours:
 * - T7: no timer of its own. Sampling rides the 90 ms level ticker with a
 *   counter (`shouldSampleMobileScreenShareHealthOnTick`, every 22nd tick ≈ 2 s).
 * - T6: no `livekit-client` runtime import. The source resolver duck-types the
 *   sender / receiver, so jest suites that mock livekit-client and the node
 *   tests both load this file without touching `VideoPresets`.
 * - 00 §1 privacy: numbers, enums and an allowlisted implementation name only.
 */

import type { Room } from "livekit-client";

import type {
  ScreenShareHealthSnapshot,
  ScreenShareHealthDirection,
  ScreenShareQualityLimitationReason,
  ScreenShareQualityLimitationDurations,
} from "@wizards/types";

export type MobileScreenShareHealthSnapshot = ScreenShareHealthSnapshot;
export type MobileScreenShareHealthDirection = ScreenShareHealthDirection;
export type MobileScreenShareQualityLimitationReason = ScreenShareQualityLimitationReason;
export type MobileScreenShareQualityLimitationDurationsMs = ScreenShareQualityLimitationDurations;

export type MobileScreenShareHealthCounters = {
  bytes: number | null;
  frames: number | null;
  jitterBufferDelayS: number | null;
  jitterBufferEmittedCount: number | null;
};

export type MobileScreenShareHealthSample = {
  counters: MobileScreenShareHealthCounters;
  snapshot: MobileScreenShareHealthSnapshot;
};

/** Shape both `RTCStatsReport` and the `Map` react-native-webrtc resolves satisfy. */
export type MobileScreenShareStatsReport = {
  forEach: (callback: (value: unknown, key: string) => void) => void;
};

export type MobileScreenShareHealthSource = {
  readonly identity: object;
  readonly track: object;
  readonly direction: MobileScreenShareHealthDirection;
  readonly readStats: () => Promise<MobileScreenShareStatsReport>;
};

/**
 * Every 22nd level tick: 22 × 90 ms = 1 980 ms, the closest the ticker gets to
 * K16's 2 s without a timer of its own.
 */
export const MOBILE_SCREEN_SHARE_HEALTH_TICK_DIVISOR = 22;
/** K16: one summary per 60 s; the reporter bridge drains on that interval. */
export const MOBILE_SCREEN_SHARE_HEALTH_SUMMARY_INTERVAL_MS = 60_000;
/** A baseline older than this belongs to a paused ticker, not to this interval. */
export const MOBILE_SCREEN_SHARE_HEALTH_MAX_SAMPLE_GAP_MS = 10_000;
/**
 * No sample for this long means the share (or the room) ended without a tick
 * to say so — the app was backgrounded or the user left — and the open window
 * is closed as "end" on the next drain.
 */
export const MOBILE_SCREEN_SHARE_HEALTH_STALE_MS = 15_000;
/** `Track.Source.ScreenShare` without importing the enum at load time (T6). */
export const MOBILE_SCREEN_SHARE_TRACK_SOURCE = "screen_share";

export const MOBILE_SCREEN_SHARE_IMPLEMENTATION_PATTERN = /^[A-Za-z0-9 ._:/()-]{0,64}$/;
const IMPLEMENTATION_DISALLOWED = /[^A-Za-z0-9 ._:/()-]/g;

export function shouldSampleMobileScreenShareHealthOnTick(tickIndex: number): boolean {
  return tickIndex > 0 && tickIndex % MOBILE_SCREEN_SHARE_HEALTH_TICK_DIVISOR === 0;
}

type StatsEntry = Record<string, unknown>;

function readNumber(entry: StatsEntry, key: string): number | null {
  const value = entry[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readString(entry: StatsEntry, key: string): string | null {
  const value = entry[key];
  return typeof value === "string" ? value : null;
}

function readBoolean(entry: StatsEntry, key: string): boolean | null {
  const value = entry[key];
  return typeof value === "boolean" ? value : null;
}

function isVideoEntry(entry: StatsEntry): boolean {
  const kind = readString(entry, "kind") ?? readString(entry, "mediaType");
  return kind === null || kind === "video";
}

function collectEntries(report: MobileScreenShareStatsReport): StatsEntry[] {
  const entries: StatsEntry[] = [];
  report.forEach((value) => {
    if (value && typeof value === "object") {
      entries.push(value as StatsEntry);
    }
  });
  return entries;
}

function selectOutboundVideoRtp(entries: readonly StatsEntry[]): StatsEntry | null {
  let best: StatsEntry | null = null;
  let bestRank: [number, number, number] = [-1, -1, -1];

  for (const entry of entries) {
    if (readString(entry, "type") !== "outbound-rtp" || !isVideoEntry(entry)) {
      continue;
    }

    const rank: [number, number, number] = [
      readBoolean(entry, "active") === false ? 0 : 1,
      readNumber(entry, "frameHeight") ?? -1,
      readNumber(entry, "bytesSent") ?? -1,
    ];
    const wins =
      rank[0] > bestRank[0] ||
      (rank[0] === bestRank[0] &&
        (rank[1] > bestRank[1] || (rank[1] === bestRank[1] && rank[2] > bestRank[2])));

    if (best === null || wins) {
      best = entry;
      bestRank = rank;
    }
  }

  return best;
}

function selectInboundVideoRtp(entries: readonly StatsEntry[]): StatsEntry | null {
  let best: StatsEntry | null = null;
  let bestBytes = -1;

  for (const entry of entries) {
    if (readString(entry, "type") !== "inbound-rtp" || !isVideoEntry(entry)) {
      continue;
    }

    const bytes = readNumber(entry, "bytesReceived") ?? -1;
    if (best === null || bytes > bestBytes) {
      best = entry;
      bestBytes = bytes;
    }
  }

  return best;
}

function selectRemoteInboundRtp(
  entries: readonly StatsEntry[],
  outbound: StatsEntry,
): StatsEntry | null {
  const outboundId = readString(outbound, "id");
  let fallback: StatsEntry | null = null;

  for (const entry of entries) {
    if (readString(entry, "type") !== "remote-inbound-rtp" || !isVideoEntry(entry)) {
      continue;
    }

    if (outboundId !== null && readString(entry, "localId") === outboundId) {
      return entry;
    }

    fallback ??= entry;
  }

  return fallback;
}

function readCandidatePairRoundTripMs(entries: readonly StatsEntry[]): number | null {
  for (const entry of entries) {
    if (readString(entry, "type") !== "candidate-pair") {
      continue;
    }

    const selected =
      readBoolean(entry, "nominated") === true || readString(entry, "state") === "succeeded";
    const rtt = readNumber(entry, "currentRoundTripTime");
    if (selected && rtt !== null) {
      return round2(rtt * 1000);
    }
  }

  return null;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function secondsToMs(value: number | null): number | null {
  return value === null ? null : Math.round(value * 1000);
}

export function sanitizeMobileScreenShareImplementation(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const cleaned = value.replace(IMPLEMENTATION_DISALLOWED, "").replace(/\s+/g, " ").trim();
  const bounded = cleaned.slice(0, 64).trim();

  return bounded.length > 0 ? bounded : null;
}

function readQualityLimitationReason(
  entry: StatsEntry,
): MobileScreenShareQualityLimitationReason | null {
  const reason = readString(entry, "qualityLimitationReason");
  if (reason === null) {
    return null;
  }

  return reason === "none" || reason === "cpu" || reason === "bandwidth" ? reason : "other";
}

function readQualityLimitationDurations(
  entry: StatsEntry,
): MobileScreenShareQualityLimitationDurationsMs | null {
  const durations = entry.qualityLimitationDurations;
  if (!durations || typeof durations !== "object") return null;
  const source = durations as StatsEntry;

  return {
    bandwidth: secondsToMs(readNumber(source, "bandwidth")) ?? 0,
    cpu: secondsToMs(readNumber(source, "cpu")) ?? 0,
    none: secondsToMs(readNumber(source, "none")) ?? 0,
    other: secondsToMs(readNumber(source, "other")) ?? 0,
  };
}

function usableInterval(
  previous: MobileScreenShareHealthSample | null,
  sampledAt: number,
): number | null {
  if (!previous) {
    return null;
  }

  const deltaMs = sampledAt - previous.snapshot.sampledAt;
  return deltaMs > 0 && deltaMs <= MOBILE_SCREEN_SHARE_HEALTH_MAX_SAMPLE_GAP_MS ? deltaMs : null;
}

function rateFromCounters(
  current: number | null,
  previous: number | null,
  intervalMs: number | null,
): number | null {
  if (current === null || previous === null || intervalMs === null) {
    return null;
  }

  const delta = current - previous;
  return delta < 0 ? null : delta / (intervalMs / 1000);
}

function readFps(entry: StatsEntry, framesRate: number | null): number | null {
  const reported = readNumber(entry, "framesPerSecond");
  if (reported !== null) {
    return round2(reported);
  }

  return framesRate === null ? null : round2(framesRate);
}

function readJitterBufferDelayMs(
  delayS: number | null,
  emitted: number | null,
  previous: MobileScreenShareHealthSample | null,
  intervalMs: number | null,
): number | null {
  if (delayS === null || emitted === null) {
    return null;
  }

  if (previous && intervalMs !== null) {
    const previousDelay = previous.counters.jitterBufferDelayS;
    const previousEmitted = previous.counters.jitterBufferEmittedCount;
    if (previousDelay !== null && previousEmitted !== null) {
      const deltaEmitted = emitted - previousEmitted;
      const deltaDelay = delayS - previousDelay;
      if (deltaEmitted > 0 && deltaDelay >= 0) {
        return round2((deltaDelay / deltaEmitted) * 1000);
      }
    }
  }

  return emitted > 0 ? round2((delayS / emitted) * 1000) : null;
}

/**
 * One stats report → one sample. `previous` must come from the same stream
 * (pass `null` after the source changes); `now` is the caller's clock because
 * react-native-webrtc and Chrome disagree on the report's `timestamp` unit.
 */
export function collectMobileScreenShareHealthFromStats(
  report: MobileScreenShareStatsReport,
  direction: MobileScreenShareHealthDirection,
  previous: MobileScreenShareHealthSample | null = null,
  now = Date.now(),
): MobileScreenShareHealthSample | null {
  const entries = collectEntries(report);
  const baseline = previous && previous.snapshot.direction === direction ? previous : null;
  const intervalMs = usableInterval(baseline, now);
  const counters = intervalMs === null ? null : (baseline?.counters ?? null);

  if (direction === "send") {
    const outbound = selectOutboundVideoRtp(entries);
    if (!outbound) {
      return null;
    }

    const remoteInbound = selectRemoteInboundRtp(entries, outbound);
    const bytes = readNumber(outbound, "bytesSent");
    const frames = readNumber(outbound, "framesEncoded");
    const bitrate = rateFromCounters(bytes, counters?.bytes ?? null, intervalMs);
    const framesRate = rateFromCounters(frames, counters?.frames ?? null, intervalMs);
    const remoteRtt = remoteInbound ? readNumber(remoteInbound, "roundTripTime") : null;

    return {
      counters: { bytes, frames, jitterBufferDelayS: null, jitterBufferEmittedCount: null },
      snapshot: {
        bitrateKbps: bitrate === null ? null : Math.round((bitrate * 8) / 1000),
        decoderImplementation: null,
        direction: "send",
        encoderImplementation: sanitizeMobileScreenShareImplementation(
          outbound.encoderImplementation,
        ),
        fps: readFps(outbound, framesRate),
        framesDropped: null,
        freezeCount: null,
        height: readNumber(outbound, "frameHeight"),
        jitterBufferDelayMs: null,
        packetsLost: remoteInbound ? readNumber(remoteInbound, "packetsLost") : null,
        powerEfficientEncoder: readBoolean(outbound, "powerEfficientEncoder"),
        qualityLimitationDurationsMs: readQualityLimitationDurations(outbound),
        qualityLimitationReason: readQualityLimitationReason(outbound),
        roundTripTimeMs:
          remoteRtt !== null ? round2(remoteRtt * 1000) : readCandidatePairRoundTripMs(entries),
        sampledAt: now,
        totalFreezesDurationMs: null,
        width: readNumber(outbound, "frameWidth"),
      },
    };
  }

  const inbound = selectInboundVideoRtp(entries);
  if (!inbound) {
    return null;
  }

  const bytes = readNumber(inbound, "bytesReceived");
  const frames = readNumber(inbound, "framesDecoded");
  const jitterBufferDelayS = readNumber(inbound, "jitterBufferDelay");
  const jitterBufferEmittedCount = readNumber(inbound, "jitterBufferEmittedCount");
  const bitrate = rateFromCounters(bytes, counters?.bytes ?? null, intervalMs);
  const framesRate = rateFromCounters(frames, counters?.frames ?? null, intervalMs);

  return {
    counters: { bytes, frames, jitterBufferDelayS, jitterBufferEmittedCount },
    snapshot: {
      bitrateKbps: bitrate === null ? null : Math.round((bitrate * 8) / 1000),
      decoderImplementation: sanitizeMobileScreenShareImplementation(inbound.decoderImplementation),
      direction: "receive",
      encoderImplementation: null,
      fps: readFps(inbound, framesRate),
      framesDropped: readNumber(inbound, "framesDropped"),
      freezeCount: readNumber(inbound, "freezeCount"),
      height: readNumber(inbound, "frameHeight"),
      jitterBufferDelayMs: readJitterBufferDelayMs(
        jitterBufferDelayS,
        jitterBufferEmittedCount,
        baseline,
        intervalMs,
      ),
      packetsLost: readNumber(inbound, "packetsLost"),
      powerEfficientEncoder: null,
      qualityLimitationDurationsMs: null,
      qualityLimitationReason: null,
      roundTripTimeMs: readCandidatePairRoundTripMs(entries),
      sampledAt: now,
      totalFreezesDurationMs: secondsToMs(readNumber(inbound, "totalFreezesDuration")),
      width: readNumber(inbound, "frameWidth"),
    },
  };
}

export function isMobileScreenShareHealthSnapshotPiiFree(
  snapshot: MobileScreenShareHealthSnapshot,
): boolean {
  return Object.entries(snapshot).every(([key, value]) => {
    if (typeof value !== "string") {
      return true;
    }

    if (key === "direction") {
      return value === "send" || value === "receive";
    }

    if (key === "qualityLimitationReason") {
      return value === "none" || value === "cpu" || value === "bandwidth" || value === "other";
    }

    if (key === "encoderImplementation" || key === "decoderImplementation") {
      return MOBILE_SCREEN_SHARE_IMPLEMENTATION_PATTERN.test(value);
    }

    return false;
  });
}

// ---------------------------------------------------------------------------
// Source resolution (duck-typed, no livekit-client runtime import — T6)
// ---------------------------------------------------------------------------

type StatsReader = { getStats?: () => Promise<unknown> };

type PublicationLike = {
  readonly track?: unknown;
};

type ParticipantLike = {
  getTrackPublication(source: string): PublicationLike | undefined;
};

function readStatsReader(track: unknown, key: "receiver" | "sender"): StatsReader | null {
  if (!track || typeof track !== "object") {
    return null;
  }

  const reader = (track as Record<string, unknown>)[key];
  return reader &&
    typeof reader === "object" &&
    typeof (reader as StatsReader).getStats === "function"
    ? (reader as StatsReader)
    : null;
}

/**
 * The local share wins when the phone is both sharing and watching: what this
 * device sends is what its owner can act on. Otherwise the first remote share
 * with a live receiver is measured.
 */
export function resolveMobileScreenShareHealthSource(
  room: Pick<Room, "localParticipant" | "remoteParticipants"> | null,
): MobileScreenShareHealthSource | null {
  if (!room) {
    return null;
  }

  const localTrack = (room.localParticipant as unknown as ParticipantLike).getTrackPublication(
    MOBILE_SCREEN_SHARE_TRACK_SOURCE,
  )?.track;
  const sender = readStatsReader(localTrack, "sender");
  if (sender) {
    return {
      identity: sender,
      track: localTrack as object,
      direction: "send",
      readStats: () => sender.getStats!() as Promise<MobileScreenShareStatsReport>,
    };
  }

  for (const participant of room.remoteParticipants.values()) {
    const remoteTrack = (participant as unknown as ParticipantLike).getTrackPublication(
      MOBILE_SCREEN_SHARE_TRACK_SOURCE,
    )?.track;
    const receiver = readStatsReader(remoteTrack, "receiver");
    if (receiver) {
      return {
        identity: receiver,
        track: remoteTrack as object,
        direction: "receive",
        readStats: () => receiver.getStats!() as Promise<MobileScreenShareStatsReport>,
      };
    }
  }

  return null;
}

/** No timer: the room's foreground ticker owns cadence and calls stop on cleanup. */
export function createMobileScreenShareHealthSampler(options: {
  onSample: (snapshot: MobileScreenShareHealthSnapshot | null, track: object | null) => void;
  now?: () => number;
}) {
  const now = options.now ?? Date.now;
  let source: MobileScreenShareHealthSource | null = null;
  let baseline: MobileScreenShareHealthSample | null = null;
  let generation = 0;
  let inFlight = false;
  function publish(snapshot: MobileScreenShareHealthSnapshot | null) {
    recordMobileScreenShareHealthSample(snapshot, now());
    options.onSample(snapshot, snapshot ? (source?.track ?? null) : null);
  }
  function stop() {
    generation += 1;
    baseline = null;
    source = null;
    publish(null);
  }
  async function sample(next: MobileScreenShareHealthSource | null) {
    if (!next) {
      if (source) stop();
      return;
    }
    if (source?.identity !== next.identity || source.direction !== next.direction) {
      if (source) stop();
      source = next;
      baseline = null;
    }
    if (inFlight) return;
    const currentGeneration = generation;
    inFlight = true;
    try {
      const stats = await next.readStats();
      if (currentGeneration !== generation || source?.identity !== next.identity) return;
      baseline = collectMobileScreenShareHealthFromStats(stats, next.direction, baseline, now());
      publish(baseline?.snapshot ?? null);
    } catch {
      // Native reads may reject while a publication is being removed.
      if (currentGeneration === generation) {
        baseline = null;
        publish(null);
      }
    } finally {
      inFlight = false;
    }
  }
  return { sample, stop };
}

// ---------------------------------------------------------------------------
// Client-health summary (K16) — drained by the health reporter bridge every 60 s
// ---------------------------------------------------------------------------

export const MOBILE_SCREEN_SHARE_HEALTH_METRICS = {
  encoder: "screen_share.encoder",
  recvFps: "screen_share.recv.fps",
  recvFreezeCount: "screen_share.recv.freeze_count",
  recvJitterBufferMs: "screen_share.recv.jitter_buffer_ms",
  sendBitrateKbps: "screen_share.send.bitrate_kbps",
  sendFps: "screen_share.send.fps",
  sendHeight: "screen_share.send.height",
  sendLimitBandwidthPct: "screen_share.send.limit_bw_pct",
  sendLimitCpuPct: "screen_share.send.limit_cpu_pct",
} as const;

export type MobileScreenShareHealthMetricName =
  (typeof MOBILE_SCREEN_SHARE_HEALTH_METRICS)[keyof typeof MOBILE_SCREEN_SHARE_HEALTH_METRICS];

export type MobileScreenShareHealthUnit = "count" | "fps" | "kbps" | "ms" | "pct";
export type MobileScreenShareHealthPhase = "end" | "interval" | "start";
export type MobileScreenShareEncoderClass = "hw" | "sw" | "unknown";

/** Same reasoning as the web module: the one `ClientHealthKind` nothing else writes. */
export const MOBILE_SCREEN_SHARE_HEALTH_EVENT_KIND = "API_LATENCY";

export type MobileScreenShareHealthEvent = {
  readonly context: {
    readonly direction: MobileScreenShareHealthDirection;
    readonly phase: MobileScreenShareHealthPhase;
    readonly sampleCount: number;
    readonly sampleId: string;
    readonly windowMs: number;
  };
  readonly kind: typeof MOBILE_SCREEN_SHARE_HEALTH_EVENT_KIND;
  readonly surface: MobileScreenShareHealthMetricName;
  readonly unit: MobileScreenShareHealthUnit;
  readonly value: number;
};

const SOFTWARE_ENCODER_PATTERN =
  /(libvpx|libaom|openh264|ffmpeg|svt|dav1d|software|omx\.google\.|c2\.android\.)/i;
const HARDWARE_ENCODER_PATTERN =
  /(external|hardware|mediacodec|videotoolbox|nvenc|amf|qsv|vaapi|v4l2|d3d|^omx\.|^c2\.)/i;

export function classifyMobileScreenShareEncoder(
  snapshot: MobileScreenShareHealthSnapshot,
): MobileScreenShareEncoderClass {
  if (snapshot.powerEfficientEncoder === true) {
    return "hw";
  }

  if (snapshot.powerEfficientEncoder === false) {
    return "sw";
  }

  const name = snapshot.encoderImplementation;
  if (!name) {
    return "unknown";
  }

  if (SOFTWARE_ENCODER_PATTERN.test(name)) {
    return "sw";
  }

  return HARDWARE_ENCODER_PATTERN.test(name) ? "hw" : "unknown";
}

export const MOBILE_SCREEN_SHARE_ENCODER_CLASS_VALUE: Record<
  MobileScreenShareEncoderClass,
  number
> = {
  hw: 2,
  sw: 1,
  unknown: 0,
};

function percentile(values: readonly number[], p: number): number | null {
  if (values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank - 1))] ?? null;
}

export function summarizeMobileScreenShareHealthWindow(
  samples: readonly MobileScreenShareHealthSnapshot[],
  input: { phase: MobileScreenShareHealthPhase; sampleIdPrefix: string },
): MobileScreenShareHealthEvent[] {
  const first = samples[0];
  const last = samples[samples.length - 1];
  if (!first || !last) {
    return [];
  }

  const context = {
    direction: last.direction,
    phase: input.phase,
    sampleCount: samples.length,
    windowMs: Math.max(0, last.sampledAt - first.sampledAt),
  };
  const events: MobileScreenShareHealthEvent[] = [];
  const push = (
    surface: MobileScreenShareHealthMetricName,
    unit: MobileScreenShareHealthUnit,
    value: number | null,
  ) => {
    if (value === null || !Number.isFinite(value)) {
      return;
    }

    events.push({
      context: {
        ...context,
        sampleId: `${input.sampleIdPrefix}:${surface.replace("screen_share.", "")}`,
      },
      kind: MOBILE_SCREEN_SHARE_HEALTH_EVENT_KIND,
      surface,
      unit,
      value: round2(value),
    });
  };
  const numbers = (pick: (sample: MobileScreenShareHealthSnapshot) => number | null) =>
    samples.map(pick).filter((value): value is number => value !== null);

  if (last.direction === "send") {
    const endDurations = last.qualityLimitationDurationsMs;
    const startDurations = first.qualityLimitationDurationsMs;
    const useDelta = last !== first && startDurations !== null;
    const read = (key: keyof MobileScreenShareQualityLimitationDurationsMs) =>
      useDelta
        ? Math.max(0, (endDurations?.[key] ?? 0) - (startDurations?.[key] ?? 0))
        : (endDurations?.[key] ?? 0);
    const cpu = read("cpu");
    const bandwidth = read("bandwidth");
    const total = cpu + bandwidth + read("none") + read("other");

    push(
      MOBILE_SCREEN_SHARE_HEALTH_METRICS.sendFps,
      "fps",
      percentile(
        numbers((s) => s.fps),
        50,
      ),
    );
    push(
      MOBILE_SCREEN_SHARE_HEALTH_METRICS.sendBitrateKbps,
      "kbps",
      percentile(
        numbers((s) => s.bitrateKbps),
        50,
      ),
    );
    push(MOBILE_SCREEN_SHARE_HEALTH_METRICS.sendHeight, "count", last.height);
    if (total > 0) {
      push(MOBILE_SCREEN_SHARE_HEALTH_METRICS.sendLimitCpuPct, "pct", (cpu / total) * 100);
      push(
        MOBILE_SCREEN_SHARE_HEALTH_METRICS.sendLimitBandwidthPct,
        "pct",
        (bandwidth / total) * 100,
      );
    }
    push(
      MOBILE_SCREEN_SHARE_HEALTH_METRICS.encoder,
      "count",
      MOBILE_SCREEN_SHARE_ENCODER_CLASS_VALUE[classifyMobileScreenShareEncoder(last)],
    );
    return events;
  }

  push(
    MOBILE_SCREEN_SHARE_HEALTH_METRICS.recvFps,
    "fps",
    percentile(
      numbers((s) => s.fps),
      50,
    ),
  );
  push(
    MOBILE_SCREEN_SHARE_HEALTH_METRICS.recvFreezeCount,
    "count",
    last.freezeCount === null
      ? null
      : last === first || first.freezeCount === null
        ? last.freezeCount
        : Math.max(0, last.freezeCount - first.freezeCount),
  );
  push(
    MOBILE_SCREEN_SHARE_HEALTH_METRICS.recvJitterBufferMs,
    "ms",
    percentile(
      numbers((s) => s.jitterBufferDelayMs),
      50,
    ),
  );
  return events;
}

/**
 * Folds the ≈2 s samples into K16's cadence without a timer: a start summary
 * on the first sample, a window summary whenever the bridge drains (every
 * 60 s), an end summary when the share stops or the samples go stale.
 */
export function createMobileScreenShareHealthTracker(
  options: {
    intervalMs?: number;
    sessionToken?: string;
    staleMs?: number;
  } = {},
) {
  const intervalMs = options.intervalMs ?? MOBILE_SCREEN_SHARE_HEALTH_SUMMARY_INTERVAL_MS;
  const staleMs = options.staleMs ?? MOBILE_SCREEN_SHARE_HEALTH_STALE_MS;
  const sessionToken =
    options.sessionToken ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  let direction: MobileScreenShareHealthDirection | null = null;
  let window: MobileScreenShareHealthSnapshot[] = [];
  let windowIndex = 0;
  let windowStartedAt = 0;
  let lastSampleAt = 0;
  let pending: MobileScreenShareHealthEvent[] = [];

  function flush(phase: MobileScreenShareHealthPhase): void {
    pending.push(
      ...summarizeMobileScreenShareHealthWindow(window, {
        phase,
        sampleIdPrefix: `${sessionToken}:${direction ?? "none"}:${windowIndex}:${phase}`,
      }),
    );
    windowIndex += 1;
  }

  function end(): void {
    if (direction === null) {
      return;
    }

    flush("end");
    direction = null;
    window = [];
  }

  function closeIfStale(now: number): void {
    if (direction !== null && now - lastSampleAt > staleMs) {
      end();
    }
  }

  return {
    /** Sample from the ticker, or `null` when the tick found no share. */
    record(snapshot: MobileScreenShareHealthSnapshot | null, now: number): void {
      closeIfStale(now);

      if (snapshot === null) {
        end();
        return;
      }

      lastSampleAt = now;

      if (direction !== snapshot.direction) {
        end();
        direction = snapshot.direction;
        window = [snapshot];
        windowStartedAt = now;
        flush("start");
        return;
      }

      window.push(snapshot);
      if (now - windowStartedAt >= intervalMs) {
        flush("interval");
        window = [snapshot];
        windowStartedAt = now;
      }
    },
    /** Everything the bridge should ship now; the open window is summarized too. */
    drain(now: number): MobileScreenShareHealthEvent[] {
      closeIfStale(now);

      if (direction !== null && window.length > 1) {
        flush("interval");
        const baseline = window[window.length - 1];
        window = baseline ? [baseline] : [];
        windowStartedAt = now;
      }

      const events = pending;
      pending = [];
      return events;
    },
    get isActive(): boolean {
      return direction !== null;
    },
    get pendingCount(): number {
      return pending.length;
    },
  };
}

export type MobileScreenShareHealthTracker = ReturnType<
  typeof createMobileScreenShareHealthTracker
>;

let sharedTracker: MobileScreenShareHealthTracker = createMobileScreenShareHealthTracker();

/** Called from the voice room ticker; `null` when the tick found no share. */
export function recordMobileScreenShareHealthSample(
  snapshot: MobileScreenShareHealthSnapshot | null,
  now = Date.now(),
): void {
  sharedTracker.record(snapshot, now);
}

/** Called by the health reporter bridge on its 60 s flush. */
export function drainMobileScreenShareHealthEvents(
  now = Date.now(),
): MobileScreenShareHealthEvent[] {
  return sharedTracker.drain(now);
}

export function resetMobileScreenShareHealthForTests(): void {
  sharedTracker = createMobileScreenShareHealthTracker();
}

// ---------------------------------------------------------------------------
// Presentation
// ---------------------------------------------------------------------------

/** "1080p · 30 fps" for the viewer title; null until a picture has been measured. */
export function formatMobileScreenShareHealthLabel(
  snapshot: MobileScreenShareHealthSnapshot | null | undefined,
): string | null {
  if (!snapshot || snapshot.height === null || snapshot.height <= 0) {
    return null;
  }

  const height = `${Math.round(snapshot.height)}p`;
  return snapshot.fps === null ? height : `${height} · ${Math.round(snapshot.fps)} fps`;
}
