import type { ScreenShareHealthSnapshot } from "@wizards/types";
import {
  collectScreenShareHealthFromStats,
  ScreenShareHealthWindowTracker,
  SCREEN_SHARE_HEALTH_SAMPLE_INTERVAL_MS,
  type ScreenShareHealthMetricEvent,
  type ScreenShareHealthSample,
  type ScreenShareStatsReport,
} from "./screen-share-health";

/** Cadence shared by the mounted hook and its fake-clock test. */
export function startScreenShareHealthPolling(sample: () => void) {
  sample();
  const interval = setInterval(sample, SCREEN_SHARE_HEALTH_SAMPLE_INTERVAL_MS);
  return () => clearInterval(interval);
}

export type ScreenShareHealthSource = {
  /** Local object identity only. Never included in a snapshot or telemetry. */
  identity: object;
  direction: "send" | "receive";
  readStats: () => Promise<ScreenShareStatsReport>;
};

/** One stream's lifetime; cadence belongs to the React hook. */
export function createScreenShareHealthSampler(options: {
  now?: () => number;
  onSample: (snapshot: ScreenShareHealthSnapshot | null) => void;
  onSummary?: (events: ScreenShareHealthMetricEvent[]) => void;
  onFirstDecodedFrame?: () => void;
}) {
  const now = options.now ?? Date.now;
  const tracker = new ScreenShareHealthWindowTracker();
  let source: ScreenShareHealthSource | null = null;
  let baseline: ScreenShareHealthSample | null = null;
  let generation = 0;
  let inFlight = false;
  let firstFrameReported = false;

  function publish(snapshot: ScreenShareHealthSnapshot | null) {
    options.onSample(snapshot);
    const events = tracker.observe(snapshot, now());
    if (events.length) options.onSummary?.(events);
  }

  function stop() {
    generation += 1;
    source = null;
    baseline = null;
    firstFrameReported = false;
    publish(null);
  }

  async function sample(next: ScreenShareHealthSource | null) {
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
      baseline = collectScreenShareHealthFromStats(stats, next.direction, baseline, now());
      if (
        next.direction === "receive" &&
        !firstFrameReported &&
        (baseline?.counters.frames ?? 0) > 0
      ) {
        firstFrameReported = true;
        options.onFirstDecodedFrame?.();
      }
      publish(baseline?.snapshot ?? null);
    } catch {
      // Native stats can reject during unpublish. Clear instead of displaying stale quality.
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
