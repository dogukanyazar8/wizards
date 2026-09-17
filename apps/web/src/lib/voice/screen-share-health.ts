/**
 * Screen share health — what the encoder, the decoder and the network actually
 * did, read from `RTCStatsReport`.
 *
 * Until this module nothing on the video path read `getStats`: the stage chip
 * wrote the *selected* preset ("1080p · 60 fps") as if it were measured. Every
 * number here is measured; when a field is not in the report the snapshot says
 * `null`, never a guess.
 *
 * Privacy contract (00 §1): only numbers, enums and the codec/encoder
 * implementation name leave this module. No window title, source name, user,
 * channel or server id is ever read from the report. Implementation names are
 * passed through an allowlist so a vendor string cannot smuggle free text.
 *
 * Pure: no timers, no DOM, no store. The sampler (`hooks/use-screen-share-health`)
 * owns cadence; the reporter (`components/app/web-health-reporter`) owns
 * delivery. The snapshot shape is `@wizards/types` `ScreenShareHealthSnapshotSchema`
 * (Ş0.1); the tests parse every fixture through it.
 */

import type {
  ScreenShareHealthDirection,
  ScreenShareHealthSnapshot,
  ScreenShareQualityLimitationDurations,
  ScreenShareQualityLimitationReason,
} from "@wizards/types";

export type {
  ScreenShareHealthDirection,
  ScreenShareHealthSnapshot,
  ScreenShareQualityLimitationReason,
};
export type ScreenShareQualityLimitationDurationsMs = ScreenShareQualityLimitationDurations;

/**
 * Cumulative counters the next sample needs to turn totals into rates. They
 * ride next to the snapshot rather than inside it so the store and the wire
 * only ever see the snapshot.
 */
export type ScreenShareHealthCounters = {
  bytes: number | null;
  frames: number | null;
  jitterBufferDelayS: number | null;
  jitterBufferEmittedCount: number | null;
  totalEncodeTimeS: number | null;
};

export type ScreenShareHealthSample = {
  counters: ScreenShareHealthCounters;
  /** Encoder cost per frame over the interval; null until two samples exist. */
  encodeTimePerFrameMs: number | null;
  snapshot: ScreenShareHealthSnapshot;
};

/** Shape both `RTCStatsReport` and a plain `Map` satisfy. */
export type ScreenShareStatsReport = {
  forEach: (callback: (value: unknown) => void) => void;
};

/** K16: one `getStats` every 2 s while a share is on stage. */
export const SCREEN_SHARE_HEALTH_SAMPLE_INTERVAL_MS = 2_000;
/** K16: one summary to client-health at start, every 60 s, and at the end. */
export const SCREEN_SHARE_HEALTH_SUMMARY_INTERVAL_MS = 60_000;
/**
 * A previous sample older than this is not a baseline: the tab was hidden or
 * the ticker paused, and a rate computed across the gap would read as a stall.
 */
export const SCREEN_SHARE_HEALTH_MAX_SAMPLE_GAP_MS = 10_000;

/** Spec allowlist for the only free-text fields (`*Implementation`). */
export const SCREEN_SHARE_IMPLEMENTATION_PATTERN = /^[A-Za-z0-9 ._:/()-]{0,64}$/;
const IMPLEMENTATION_DISALLOWED = /[^A-Za-z0-9 ._:/()-]/g;

type StatsEntry = Record<string, unknown>;

function readNumber(entry: StatsEntry, key: string): number | null {
  const value = entry[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readCount(entry: StatsEntry, key: string): number | null {
  const value = readNumber(entry, key);
  return value === null ? null : Math.max(0, Math.round(value));
}

function readString(entry: StatsEntry, key: string): string | null {
  const value = entry[key];
  return typeof value === "string" ? value : null;
}

function readBoolean(entry: StatsEntry, key: string): boolean | null {
  const value = entry[key];
  return typeof value === "boolean" ? value : null;
}

/**
 * `kind` on current libwebrtc, `mediaType` on older reports. An entry naming
 * neither is accepted: a sender- or receiver-scoped `getStats()` only carries
 * that one track's RTP streams.
 */
function isVideoEntry(entry: StatsEntry): boolean {
  const kind = readString(entry, "kind") ?? readString(entry, "mediaType");
  return kind === null || kind === "video";
}

function collectEntries(report: ScreenShareStatsReport): StatsEntry[] {
  const entries: StatsEntry[] = [];
  report.forEach((value) => {
    if (value && typeof value === "object") {
      entries.push(value as StatsEntry);
    }
  });
  return entries;
}

/**
 * SVC and simulcast can report several `outbound-rtp` streams. The one that
 * matters is the active stream carrying the tallest picture: that is what a
 * viewer on a good link receives, and the one whose limitation reason explains
 * a drop.
 */
export function selectOutboundVideoRtp(entries: readonly StatsEntry[]): StatsEntry | null {
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

export function selectInboundVideoRtp(entries: readonly StatsEntry[]): StatsEntry | null {
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

function selectMediaSource(entries: readonly StatsEntry[]): StatsEntry | null {
  return (
    entries.find((entry) => readString(entry, "type") === "media-source" && isVideoEntry(entry)) ??
    null
  );
}

/** Round-trip time of the transport when no `remote-inbound-rtp` carries one. */
function readCandidatePairRoundTripMs(entries: readonly StatsEntry[]): number | null {
  for (const entry of entries) {
    if (readString(entry, "type") !== "candidate-pair") {
      continue;
    }

    const selected =
      readBoolean(entry, "nominated") === true || readString(entry, "state") === "succeeded";
    const rtt = readNumber(entry, "currentRoundTripTime");
    if (selected && rtt !== null) {
      return roundMs(rtt * 1000);
    }
  }

  return null;
}

function roundMs(value: number): number {
  return Math.round(value * 100) / 100;
}

function secondsToMs(value: number | null): number | null {
  return value === null ? null : Math.round(value * 1000);
}

/**
 * Strips everything outside the allowlist instead of dropping the name: Chrome's
 * "SimulcastEncoderAdapter (libvpx, libvpx, libvpx)" carries commas and is
 * still worth keeping as "SimulcastEncoderAdapter (libvpx libvpx libvpx)".
 */
export function sanitizeScreenShareImplementation(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const cleaned = value.replace(IMPLEMENTATION_DISALLOWED, "").replace(/\s+/g, " ").trim();
  const bounded = cleaned.slice(0, 64).trim();

  return bounded.length > 0 ? bounded : null;
}

function readQualityLimitationReason(entry: StatsEntry): ScreenShareQualityLimitationReason | null {
  const reason = readString(entry, "qualityLimitationReason");
  if (reason === null) {
    return null;
  }

  return reason === "none" || reason === "cpu" || reason === "bandwidth" ? reason : "other";
}

/** Seconds per reason in the report, milliseconds here; null when the engine does not report them. */
function readQualityLimitationDurations(
  entry: StatsEntry,
): ScreenShareQualityLimitationDurationsMs | null {
  const durations = entry.qualityLimitationDurations;
  if (!durations || typeof durations !== "object") {
    return null;
  }

  const source = durations as StatsEntry;
  return {
    bandwidth: secondsToMs(readNumber(source, "bandwidth")) ?? 0,
    cpu: secondsToMs(readNumber(source, "cpu")) ?? 0,
    none: secondsToMs(readNumber(source, "none")) ?? 0,
    other: secondsToMs(readNumber(source, "other")) ?? 0,
  };
}

function usableInterval(
  previous: ScreenShareHealthSample | null | undefined,
  sampledAt: number,
): number | null {
  if (!previous) {
    return null;
  }

  const deltaMs = sampledAt - previous.snapshot.sampledAt;
  return deltaMs > 0 && deltaMs <= SCREEN_SHARE_HEALTH_MAX_SAMPLE_GAP_MS ? deltaMs : null;
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
  // A counter that went backwards means the stream restarted; there is no rate.
  return delta < 0 ? null : delta / (intervalMs / 1000);
}

function readFps(entry: StatsEntry, framesRate: number | null): number | null {
  const reported = readNumber(entry, "framesPerSecond");
  if (reported !== null) {
    return roundMs(Math.max(0, reported));
  }

  return framesRate === null ? null : roundMs(framesRate);
}

function readJitterBufferDelayMs(
  delayS: number | null,
  emitted: number | null,
  previous: ScreenShareHealthSample | null | undefined,
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
        return roundMs((deltaDelay / deltaEmitted) * 1000);
      }
    }
  }

  return emitted > 0 ? roundMs((delayS / emitted) * 1000) : null;
}

/**
 * Turns one stats report into a health sample.
 *
 * `previous` is the sample this function returned last time for the same
 * stream; it is what turns `bytesSent` into a bitrate. A baseline from the
 * other direction is ignored, so a viewer's counters are never subtracted from
 * a sharer's. `now` is the sampler's clock, not the report's `timestamp`:
 * Chrome and react-native-webrtc do not agree on that field's unit.
 */
export function collectScreenShareHealthFromStats(
  report: ScreenShareStatsReport,
  direction: ScreenShareHealthDirection,
  previous: ScreenShareHealthSample | null = null,
  now = Date.now(),
): ScreenShareHealthSample | null {
  const entries = collectEntries(report);
  const baseline = previous && previous.snapshot.direction === direction ? previous : null;
  const sampledAt = Math.max(0, Math.round(now));

  return direction === "send"
    ? collectSendSample(entries, baseline, sampledAt)
    : collectReceiveSample(entries, baseline, sampledAt);
}

function collectSendSample(
  entries: readonly StatsEntry[],
  previous: ScreenShareHealthSample | null,
  sampledAt: number,
): ScreenShareHealthSample | null {
  const outbound = selectOutboundVideoRtp(entries);
  if (!outbound) {
    return null;
  }

  const intervalMs = usableInterval(previous, sampledAt);
  const mediaSource = selectMediaSource(entries);
  const remoteInbound = selectRemoteInboundRtp(entries, outbound);
  const bytes = readNumber(outbound, "bytesSent");
  const frames = readNumber(outbound, "framesEncoded");
  const totalEncodeTimeS = readNumber(outbound, "totalEncodeTime");
  const previousCounters = intervalMs === null ? null : (previous?.counters ?? null);
  const bitrate = rateFromCounters(bytes, previousCounters?.bytes ?? null, intervalMs);
  const framesRate = rateFromCounters(frames, previousCounters?.frames ?? null, intervalMs);
  const remoteRtt = remoteInbound ? readNumber(remoteInbound, "roundTripTime") : null;
  let encodeTimePerFrameMs: number | null = null;

  if (
    previousCounters &&
    previousCounters.frames !== null &&
    previousCounters.totalEncodeTimeS !== null &&
    frames !== null &&
    totalEncodeTimeS !== null
  ) {
    const deltaFrames = frames - previousCounters.frames;
    const deltaSeconds = totalEncodeTimeS - previousCounters.totalEncodeTimeS;
    if (deltaFrames > 0 && deltaSeconds >= 0) {
      encodeTimePerFrameMs = roundMs((deltaSeconds / deltaFrames) * 1000);
    }
  }

  return {
    counters: {
      bytes,
      frames,
      jitterBufferDelayS: null,
      jitterBufferEmittedCount: null,
      totalEncodeTimeS,
    },
    encodeTimePerFrameMs,
    snapshot: {
      bitrateKbps: bitrate === null ? null : Math.round((bitrate * 8) / 1000),
      decoderImplementation: null,
      direction: "send",
      encoderImplementation: sanitizeScreenShareImplementation(outbound.encoderImplementation),
      fps: readFps(outbound, framesRate) ?? (mediaSource ? readFps(mediaSource, null) : null),
      // Not measured on the sending side; the viewer's snapshot carries them.
      framesDropped: null,
      freezeCount: null,
      height:
        readCount(outbound, "frameHeight") ??
        (mediaSource ? readCount(mediaSource, "height") : null),
      jitterBufferDelayMs: null,
      packetsLost: remoteInbound ? readCount(remoteInbound, "packetsLost") : null,
      powerEfficientEncoder: readBoolean(outbound, "powerEfficientEncoder"),
      qualityLimitationDurationsMs: readQualityLimitationDurations(outbound),
      qualityLimitationReason: readQualityLimitationReason(outbound),
      roundTripTimeMs:
        remoteRtt !== null ? roundMs(remoteRtt * 1000) : readCandidatePairRoundTripMs(entries),
      sampledAt,
      totalFreezesDurationMs: null,
      width:
        readCount(outbound, "frameWidth") ?? (mediaSource ? readCount(mediaSource, "width") : null),
    },
  };
}

function collectReceiveSample(
  entries: readonly StatsEntry[],
  previous: ScreenShareHealthSample | null,
  sampledAt: number,
): ScreenShareHealthSample | null {
  const inbound = selectInboundVideoRtp(entries);
  if (!inbound) {
    return null;
  }

  const intervalMs = usableInterval(previous, sampledAt);
  const bytes = readNumber(inbound, "bytesReceived");
  const frames = readNumber(inbound, "framesDecoded");
  const jitterBufferDelayS = readNumber(inbound, "jitterBufferDelay");
  const jitterBufferEmittedCount = readNumber(inbound, "jitterBufferEmittedCount");
  const previousCounters = intervalMs === null ? null : (previous?.counters ?? null);
  const bitrate = rateFromCounters(bytes, previousCounters?.bytes ?? null, intervalMs);
  const framesRate = rateFromCounters(frames, previousCounters?.frames ?? null, intervalMs);

  return {
    counters: {
      bytes,
      frames,
      jitterBufferDelayS,
      jitterBufferEmittedCount,
      totalEncodeTimeS: null,
    },
    encodeTimePerFrameMs: null,
    snapshot: {
      bitrateKbps: bitrate === null ? null : Math.round((bitrate * 8) / 1000),
      decoderImplementation: sanitizeScreenShareImplementation(inbound.decoderImplementation),
      direction: "receive",
      encoderImplementation: null,
      fps: readFps(inbound, framesRate),
      framesDropped: readCount(inbound, "framesDropped"),
      freezeCount: readCount(inbound, "freezeCount"),
      height: readCount(inbound, "frameHeight"),
      jitterBufferDelayMs: readJitterBufferDelayMs(
        jitterBufferDelayS,
        jitterBufferEmittedCount,
        previous,
        intervalMs,
      ),
      packetsLost: readCount(inbound, "packetsLost"),
      powerEfficientEncoder: null,
      // The encoder's limitation is the sharer's to report.
      qualityLimitationDurationsMs: null,
      qualityLimitationReason: null,
      roundTripTimeMs: readCandidatePairRoundTripMs(entries),
      sampledAt,
      totalFreezesDurationMs: secondsToMs(readNumber(inbound, "totalFreezesDuration")),
      width: readCount(inbound, "frameWidth"),
    },
  };
}

/**
 * The only strings a snapshot may carry are the two implementation names, and
 * they must match the allowlist. Used by the tests and by the reporter as a
 * last gate before anything is serialized.
 */
export function isScreenShareHealthSnapshotPiiFree(snapshot: ScreenShareHealthSnapshot): boolean {
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
      return SCREEN_SHARE_IMPLEMENTATION_PATTERN.test(value);
    }

    return false;
  });
}

// ---------------------------------------------------------------------------
// Encoder class
// ---------------------------------------------------------------------------

/**
 * `hw | sw | unknown`, never a vendor name in product copy (00 §1). The
 * browser's own `powerEfficientEncoder` flag wins; the implementation name is
 * only a fallback for engines that do not report the flag.
 */
export type ScreenShareEncoderClass = "hw" | "sw" | "unknown";

/**
 * Software first: Android's `OMX.google.*` / `c2.android.*` are MediaCodec
 * names too, and only the remaining `OMX.*` / `c2.*` families are hardware.
 */
const SOFTWARE_ENCODER_PATTERN =
  /(libvpx|libaom|openh264|ffmpeg|svt|dav1d|software|omx\.google\.|c2\.android\.)/i;
const HARDWARE_ENCODER_PATTERN =
  /(external|hardware|mediacodec|videotoolbox|nvenc|amf|qsv|vaapi|v4l2|d3d|^omx\.|^c2\.)/i;

export function classifyScreenShareEncoder(
  snapshot: ScreenShareHealthSnapshot,
): ScreenShareEncoderClass {
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

/** Numeric wire form of the class: client-health rows carry numbers, not strings. */
export const SCREEN_SHARE_ENCODER_CLASS_VALUE: Record<ScreenShareEncoderClass, number> = {
  hw: 2,
  sw: 1,
  unknown: 0,
};

// ---------------------------------------------------------------------------
// Client-health summary (K16)
// ---------------------------------------------------------------------------

export const SCREEN_SHARE_HEALTH_METRICS = {
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

export type ScreenShareHealthMetricName =
  (typeof SCREEN_SHARE_HEALTH_METRICS)[keyof typeof SCREEN_SHARE_HEALTH_METRICS];

export const SCREEN_SHARE_HEALTH_METRIC_PREFIX = "screen_share.";

export type ScreenShareHealthUnit = "count" | "fps" | "kbps" | "ms" | "pct";
export type ScreenShareHealthPhase = "end" | "interval" | "start";

/**
 * `ClientHealthKind` has no media bucket and the enum lives in `@wizards/db`,
 * which this strip does not own. `API_LATENCY` is the one kind nothing writes
 * today, so screen share rows cannot pollute another dashboard; the surface
 * name is what identifies them. The Ş0.2 report carries the request for a
 * `MEDIA_HEALTH` kind.
 */
export const SCREEN_SHARE_HEALTH_EVENT_KIND = "API_LATENCY";

export type ScreenShareHealthMetricEvent = {
  context: {
    direction: ScreenShareHealthDirection;
    phase: ScreenShareHealthPhase;
    sampleCount: number;
    sampleId: string;
    windowMs: number;
  };
  kind: typeof SCREEN_SHARE_HEALTH_EVENT_KIND;
  surface: ScreenShareHealthMetricName;
  unit: ScreenShareHealthUnit;
  value: number;
};

/** Nearest-rank percentile, as the server rollup computes it. */
function percentile(values: readonly number[], p: number): number | null {
  if (values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank - 1))] ?? null;
}

/**
 * Time the encoder spent limited, over the window when both ends report the
 * cumulative durations, else the cumulative figure of the last sample.
 */
function limitationShare(
  first: ScreenShareHealthSnapshot,
  last: ScreenShareHealthSnapshot,
): { bandwidth: number; cpu: number; total: number } | null {
  const end = last.qualityLimitationDurationsMs;
  if (!end) {
    return null;
  }

  const start = last !== first ? first.qualityLimitationDurationsMs : null;
  const read = (key: keyof ScreenShareQualityLimitationDurationsMs) =>
    start ? Math.max(0, end[key] - start[key]) : end[key];
  const bandwidth = read("bandwidth");
  const cpu = read("cpu");
  const total = bandwidth + cpu + read("none") + read("other");

  return total > 0 ? { bandwidth, cpu, total } : null;
}

function counterDelta(
  first: number | null,
  last: number | null,
  sameSample: boolean,
): number | null {
  if (last === null) {
    return null;
  }

  return sameSample || first === null ? last : Math.max(0, last - first);
}

/**
 * One window of samples → the metric rows the server keeps. Percentile over the
 * window for rates, delta over the window for cumulative counters, last sample
 * for the picture height and the encoder class. A metric the window could not
 * measure is left out rather than written as zero.
 */
export function summarizeScreenShareHealthWindow(
  samples: readonly ScreenShareHealthSnapshot[],
  input: { phase: ScreenShareHealthPhase; sampleIdPrefix: string },
): ScreenShareHealthMetricEvent[] {
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
  const events: ScreenShareHealthMetricEvent[] = [];
  const push = (
    surface: ScreenShareHealthMetricName,
    unit: ScreenShareHealthUnit,
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
      kind: SCREEN_SHARE_HEALTH_EVENT_KIND,
      surface,
      unit,
      value: Math.round(value * 100) / 100,
    });
  };
  const numbers = (pick: (sample: ScreenShareHealthSnapshot) => number | null) =>
    samples.map(pick).filter((value): value is number => value !== null);

  if (last.direction === "send") {
    const limitation = limitationShare(first, last);
    push(
      SCREEN_SHARE_HEALTH_METRICS.sendFps,
      "fps",
      percentile(
        numbers((s) => s.fps),
        50,
      ),
    );
    push(
      SCREEN_SHARE_HEALTH_METRICS.sendBitrateKbps,
      "kbps",
      percentile(
        numbers((s) => s.bitrateKbps),
        50,
      ),
    );
    push(SCREEN_SHARE_HEALTH_METRICS.sendHeight, "count", last.height);
    if (limitation) {
      push(
        SCREEN_SHARE_HEALTH_METRICS.sendLimitCpuPct,
        "pct",
        (limitation.cpu / limitation.total) * 100,
      );
      push(
        SCREEN_SHARE_HEALTH_METRICS.sendLimitBandwidthPct,
        "pct",
        (limitation.bandwidth / limitation.total) * 100,
      );
    }
    push(
      SCREEN_SHARE_HEALTH_METRICS.encoder,
      "count",
      SCREEN_SHARE_ENCODER_CLASS_VALUE[classifyScreenShareEncoder(last)],
    );
    return events;
  }

  push(
    SCREEN_SHARE_HEALTH_METRICS.recvFps,
    "fps",
    percentile(
      numbers((s) => s.fps),
      50,
    ),
  );
  push(
    SCREEN_SHARE_HEALTH_METRICS.recvFreezeCount,
    "count",
    counterDelta(first.freezeCount, last.freezeCount, last === first),
  );
  push(
    SCREEN_SHARE_HEALTH_METRICS.recvJitterBufferMs,
    "ms",
    percentile(
      numbers((s) => s.jitterBufferDelayMs),
      50,
    ),
  );
  return events;
}

function randomSessionToken(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Folds the 2 s stream into the K16 cadence: a summary of the first sample at
 * start, one per 60 s window, and one for the tail at the end. The 2 s samples
 * themselves never leave the client.
 *
 * Pure apart from the session token; the caller supplies the clock, so the
 * reporter and the tests drive it the same way.
 */
export class ScreenShareHealthWindowTracker {
  private direction: ScreenShareHealthDirection | null = null;
  private window: ScreenShareHealthSnapshot[] = [];
  private windowIndex = 0;
  private windowStartedAt = 0;
  private readonly intervalMs: number;
  private readonly sessionToken: string;

  constructor(options: { intervalMs?: number; sessionToken?: string } = {}) {
    this.intervalMs = options.intervalMs ?? SCREEN_SHARE_HEALTH_SUMMARY_INTERVAL_MS;
    this.sessionToken = options.sessionToken ?? randomSessionToken();
  }

  get isActive(): boolean {
    return this.direction !== null;
  }

  private prefix(phase: ScreenShareHealthPhase): string {
    return `${this.sessionToken}:${this.direction ?? "none"}:${this.windowIndex}:${phase}`;
  }

  private flush(phase: ScreenShareHealthPhase): ScreenShareHealthMetricEvent[] {
    const events = summarizeScreenShareHealthWindow(this.window, {
      phase,
      sampleIdPrefix: this.prefix(phase),
    });
    this.windowIndex += 1;
    return events;
  }

  /** Feed every snapshot the sampler publishes, and `null` when the share ends. */
  observe(snapshot: ScreenShareHealthSnapshot | null, now: number): ScreenShareHealthMetricEvent[] {
    if (snapshot === null) {
      if (this.direction === null) {
        return [];
      }

      const events = this.flush("end");
      this.direction = null;
      this.window = [];
      return events;
    }

    if (this.direction !== snapshot.direction) {
      const ended = this.direction === null ? [] : this.flush("end");
      this.direction = snapshot.direction;
      this.window = [snapshot];
      this.windowStartedAt = now;
      return [...ended, ...this.flush("start")];
    }

    this.window.push(snapshot);
    if (now - this.windowStartedAt < this.intervalMs) {
      return [];
    }

    const events = this.flush("interval");
    // The last sample stays as the baseline of the next window so cumulative
    // counters (limitation durations, freezes) keep their deltas contiguous.
    this.window = [snapshot];
    this.windowStartedAt = now;
    return events;
  }
}

// ---------------------------------------------------------------------------
// Stage chip
// ---------------------------------------------------------------------------

export type ScreenShareStageChip = {
  fps: number | null;
  height: number | null;
  limitation: "bandwidth" | "cpu" | null;
  resolutionLabel: string | null;
  source: "measured" | "preset";
};

/**
 * Real numbers when a sample of the share on stage exists, the selected preset
 * before the first sample arrives (the stream has not started, so there is
 * nothing to measure). `expectedDirection` ties the sample to the stage: a
 * sender watching someone else must not see its own upload figures on their
 * picture. A measured chip never mixes in preset values: a missing fps stays
 * `null`.
 */
export function selectScreenShareStageChip(input: {
  expectedDirection?: ScreenShareHealthDirection | null;
  health: ScreenShareHealthSnapshot | null;
  presetFps: number | null;
  presetResolutionLabel: string | null;
}): ScreenShareStageChip {
  const { health } = input;
  const directionMatches =
    !input.expectedDirection || !health || health.direction === input.expectedDirection;

  if (health && directionMatches && health.height !== null && health.height > 0) {
    const reason = health.qualityLimitationReason;
    return {
      fps: health.fps === null ? null : Math.round(health.fps),
      height: Math.round(health.height),
      limitation: reason === "cpu" || reason === "bandwidth" ? reason : null,
      resolutionLabel: `${Math.round(health.height)}p`,
      source: "measured",
    };
  }

  return {
    fps: input.presetFps,
    height: null,
    limitation: null,
    resolutionLabel: input.presetResolutionLabel,
    source: "preset",
  };
}

export type ScreenShareStageChipTranslate = (
  key: string,
  values?: Record<string, number | string>,
) => string;

/**
 * What `ServerScreenShareStage` receives. A measured chip is one finished
 * string (`voice.screenShare.health.chip`, plus the limitation suffix) handed
 * over as `resolutionLabel` with `fps: null`, because the stage only knows how
 * to join a preset label and an fps number (`server.voice.share.meta`) and the
 * stage file belongs to another strip.
 */
export function resolveScreenShareStageChipProps(input: {
  chip: ScreenShareStageChip;
  t: ScreenShareStageChipTranslate;
}): { fps: number | null; resolutionLabel: string | null } {
  const { chip, t } = input;

  if (chip.source === "preset" || chip.height === null) {
    return { fps: chip.fps, resolutionLabel: chip.resolutionLabel };
  }

  const picture =
    chip.fps === null
      ? `${chip.height}p`
      : t("voice.screenShare.health.chip", { fps: chip.fps, height: chip.height });
  const limitation = chip.limitation
    ? t(`voice.screenShare.health.limited.${chip.limitation}`)
    : null;

  return { fps: null, resolutionLabel: limitation ? `${picture} · ${limitation}` : picture };
}
