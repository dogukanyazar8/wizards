/**
 * What summarizing needs, and no more.
 *
 * Structural on purpose: the panel now reads measurements back from the retained
 * log as well as from memory, and a row that came off disk carries the same three
 * fields without carrying the in-memory sample's narrower metric union.
 */
export type MobilePerformanceSummaryInput = {
  readonly context: Readonly<Record<string, unknown>>;
  readonly durationMs: number;
  readonly metric: string;
};

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

function classifySample(
  sample: MobilePerformanceSummaryInput,
): MobilePerformanceSummaryMetric | null {
  const context = sample.context as {
    readonly authenticated?: unknown;
    readonly cacheHit?: unknown;
    readonly phase?: unknown;
    readonly route?: unknown;
    readonly stage?: unknown;
  };

  // A stage is a milestone *inside* an open, not an open. Counting it would
  // report three openings for every one the reader performed and drag the
  // percentile down with partial timings.
  if (typeof context.stage === "string") {
    return null;
  }

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

/**
 * The chat open, split into what the client actually spent the time on.
 *
 * `navigated` is the transition, `mounted` is the screen tree, `content` is the
 * list's first render — each measured from the same tap, so they read as a
 * running total rather than three unrelated numbers.
 */
export const MOBILE_CHAT_OPEN_STAGES = ["navigated", "mounted", "content"] as const;

export type MobileChatOpenStageRow = {
  readonly count: number;
  readonly p50Ms: number | null;
  readonly p95Ms: number | null;
  readonly stage: (typeof MOBILE_CHAT_OPEN_STAGES)[number];
};

export function summarizeMobileChatOpenStages(
  samples: readonly MobilePerformanceSummaryInput[],
): readonly MobileChatOpenStageRow[] {
  const buckets = new Map<string, number[]>(MOBILE_CHAT_OPEN_STAGES.map((stage) => [stage, []]));

  for (const sample of samples) {
    if (sample.metric !== "navigation") {
      continue;
    }

    const context = sample.context as { readonly route?: unknown; readonly stage?: unknown };
    if (typeof context.route !== "string" || !CHAT_ROUTES.has(context.route)) {
      continue;
    }

    // The completed span is the last stage: it is the same measurement the
    // budget row reports, listed here so the three add up to the whole open.
    const stage = typeof context.stage === "string" ? context.stage : "content";
    buckets.get(stage)?.push(sample.durationMs);
  }

  return MOBILE_CHAT_OPEN_STAGES.map((stage) => {
    const values = buckets.get(stage) ?? [];
    return {
      count: values.length,
      p50Ms: percentileMs(values, 50),
      p95Ms: percentileMs(values, 95),
      stage,
    };
  });
}

export function summarizeMobilePerformanceSamples(
  samples: readonly MobilePerformanceSummaryInput[],
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
