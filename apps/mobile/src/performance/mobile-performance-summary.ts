import type { MobilePerformanceSample } from "./mobile-performance-metrics";

/**
 * The device panel reports the *budget's* metrics, not the raw surfaces.
 *
 * A launch is only the headline once the session resolved; a chat open means a
 * different thing when the stream was already cached; and a send has two halves
 * with different budgets. Pooling any of those together produces a number nobody
 * can act on, which is what the old single "startup" value was.
 */
export type MobilePerformanceSummaryMetric =
  "chat-open-cached" | "chat-open-network" | "resume" | "send-ack" | "send-echo" | "startup";

/** Order the panel renders, and the order a baseline file is written in. */
export const MOBILE_PERFORMANCE_SUMMARY_METRICS: readonly MobilePerformanceSummaryMetric[] = [
  "startup",
  "resume",
  "chat-open-cached",
  "chat-open-network",
  "send-echo",
  "send-ack",
];

export type MobilePerformanceSummaryRow = {
  readonly count: number;
  readonly metric: MobilePerformanceSummaryMetric;
  readonly p50Ms: number | null;
  readonly p95Ms: number | null;
  readonly p99Ms: number | null;
};

const CHAT_ROUTES = new Set(["ChannelChat", "DirectMessage"]);

/**
 * Nearest rank, matching the server-side rollup so a device number and a
 * production number mean the same thing.
 */
export function percentileMs(values: readonly number[], percentile: number): number | null {
  if (values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const rank = Math.ceil((percentile / 100) * sorted.length);
  const index = Math.min(Math.max(rank, 1), sorted.length) - 1;
  return sorted[index] ?? null;
}

function classifySample(sample: MobilePerformanceSample): MobilePerformanceSummaryMetric | null {
  const context = sample.context as {
    readonly authenticated?: unknown;
    readonly cacheHit?: unknown;
    readonly phase?: unknown;
    readonly route?: unknown;
  };

  if (sample.metric === "startup") {
    // Content drawn before the session resolved is a shell, not the launch.
    return context.phase === "content-visible" && context.authenticated === true ? "startup" : null;
  }

  if (sample.metric !== "navigation") {
    // List-load samples are render cost, not what the reader waited for.
    return null;
  }

  if (context.phase === "send-echo" || context.phase === "send-ack") {
    return context.phase;
  }

  if (context.route === "Resume") {
    return "resume";
  }

  if (typeof context.route === "string" && CHAT_ROUTES.has(context.route)) {
    // No flag means network: it is the bucket that must not flatter itself.
    return context.cacheHit === true ? "chat-open-cached" : "chat-open-network";
  }

  return null;
}

export function summarizeMobilePerformanceSamples(
  samples: readonly MobilePerformanceSample[],
): readonly MobilePerformanceSummaryRow[] {
  const buckets = new Map<MobilePerformanceSummaryMetric, number[]>(
    MOBILE_PERFORMANCE_SUMMARY_METRICS.map((metric) => [metric, []]),
  );

  for (const sample of samples) {
    const metric = classifySample(sample);
    if (metric) {
      buckets.get(metric)?.push(sample.durationMs);
    }
  }

  // Every budgeted metric is listed even at zero: an unmeasured gap has to be
  // visible in the panel, not inferred from a missing row.
  return MOBILE_PERFORMANCE_SUMMARY_METRICS.map((metric) => {
    const values = buckets.get(metric) ?? [];
    return {
      count: values.length,
      metric,
      p50Ms: percentileMs(values, 50),
      p95Ms: percentileMs(values, 95),
      p99Ms: percentileMs(values, 99),
    };
  });
}
