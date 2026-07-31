import {
  MOBILE_CHAT_TRANSITION_VARIANTS,
  type MobileChatTransitionVariant,
} from "../navigation/mobile-chat-transition";
import {
  MOBILE_MESSAGE_STREAM_SOURCES,
  type MobileMessageStreamSource,
} from "../query/mobile-message-stream-source";
import { MOBILE_NAVIGATION_PHASES, type MobileNavigationPhase } from "./mobile-navigation-timing";

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

export type MobileChatOpenRouteRow = {
  readonly cacheHit: boolean;
  readonly count: number;
  readonly p50Ms: number | null;
  readonly p95Ms: number | null;
  readonly route: MobileChatRoute;
};

/** The two chat surfaces, which are two different screens with two different lists. */
const MOBILE_CHAT_ROUTES = ["DirectMessage", "ChannelChat"] as const;
export type MobileChatRoute = (typeof MOBILE_CHAT_ROUTES)[number];

/**
 * The chat-open budget, split by the surface that produced it.
 *
 * The pooled `chat-open-*` rows were channel numbers wearing both names: the DM
 * transcript had no span closer at all, so every DM open in the first device
 * baseline landed in the abandoned counter. With both surfaces measured, pooling
 * them again would hide whichever one is slower behind the other's sample count.
 */
export function summarizeMobileChatOpenRoutes(
  samples: readonly MobilePerformanceSummaryInput[],
): readonly MobileChatOpenRouteRow[] {
  const buckets = new Map<string, number[]>();
  for (const route of MOBILE_CHAT_ROUTES) {
    buckets.set(`${route}:cached`, []);
    buckets.set(`${route}:network`, []);
  }

  for (const sample of samples) {
    if (sample.metric !== "navigation") {
      continue;
    }

    const context = sample.context as {
      readonly cacheHit?: unknown;
      readonly route?: unknown;
      readonly stage?: unknown;
    };
    if (
      typeof context.stage === "string" ||
      typeof context.route !== "string" ||
      !CHAT_ROUTES.has(context.route)
    ) {
      continue;
    }

    buckets
      .get(`${context.route}:${context.cacheHit === true ? "cached" : "network"}`)
      ?.push(sample.durationMs);
  }

  return MOBILE_CHAT_ROUTES.flatMap((route) =>
    [true, false].map((cacheHit) => {
      const values = buckets.get(`${route}:${cacheHit ? "cached" : "network"}`) ?? [];
      return {
        cacheHit,
        count: values.length,
        p50Ms: percentileMs(values, 50),
        p95Ms: percentileMs(values, 95),
        route,
      };
    }),
  );
}

export type MobileChatOpenSourceRow = {
  /** How stale the local page was, when there was one. */
  readonly cacheAgeP50Ms: number | null;
  readonly count: number;
  readonly p50Ms: number | null;
  readonly p95Ms: number | null;
  readonly source: MobileMessageStreamSource;
};

/**
 * Where each chat open's first screenful came from, and what it cost.
 *
 * The restore path is only worth its complexity if `sqlcipher` opens land near
 * `memory` opens rather than near `network` ones, and one pooled "cached" number
 * could not show that either way.
 */
export function summarizeMobileChatOpenSources(
  samples: readonly MobilePerformanceSummaryInput[],
): readonly MobileChatOpenSourceRow[] {
  const durations = new Map<MobileMessageStreamSource, number[]>(
    MOBILE_MESSAGE_STREAM_SOURCES.map((source) => [source, []]),
  );
  const ages = new Map<MobileMessageStreamSource, number[]>(
    MOBILE_MESSAGE_STREAM_SOURCES.map((source) => [source, []]),
  );

  for (const sample of samples) {
    if (sample.metric !== "navigation") {
      continue;
    }

    const context = sample.context as {
      readonly cacheAgeMs?: unknown;
      readonly route?: unknown;
      readonly source?: unknown;
      readonly stage?: unknown;
    };
    if (
      typeof context.stage === "string" ||
      typeof context.route !== "string" ||
      !CHAT_ROUTES.has(context.route) ||
      typeof context.source !== "string"
    ) {
      continue;
    }

    const source = context.source as MobileMessageStreamSource;
    durations.get(source)?.push(sample.durationMs);
    if (typeof context.cacheAgeMs === "number") {
      ages.get(source)?.push(context.cacheAgeMs);
    }
  }

  return MOBILE_MESSAGE_STREAM_SOURCES.map((source) => {
    const values = durations.get(source) ?? [];
    return {
      cacheAgeP50Ms: percentileMs(ages.get(source) ?? [], 50),
      count: values.length,
      p50Ms: percentileMs(values, 50),
      p95Ms: percentileMs(values, 95),
      source,
    };
  });
}

export type MobileChatTransitionRow = {
  readonly count: number;
  readonly p50Ms: number | null;
  readonly p95Ms: number | null;
  readonly variant: MobileChatTransitionVariant;
};

/**
 * The three push animations, measured against each other inside one run.
 *
 * Only completed opens count: a stage is a milestone inside an open, and the
 * transition's whole claim is about what the reader waited for end to end.
 */
export function summarizeMobileChatTransitions(
  samples: readonly MobilePerformanceSummaryInput[],
): readonly MobileChatTransitionRow[] {
  const buckets = new Map<MobileChatTransitionVariant, number[]>(
    MOBILE_CHAT_TRANSITION_VARIANTS.map((variant) => [variant, []]),
  );

  for (const sample of samples) {
    if (sample.metric !== "navigation") {
      continue;
    }

    const context = sample.context as {
      readonly route?: unknown;
      readonly stage?: unknown;
      readonly transition?: unknown;
    };
    if (
      typeof context.stage === "string" ||
      typeof context.route !== "string" ||
      !CHAT_ROUTES.has(context.route)
    ) {
      continue;
    }

    const variant = context.transition;
    if (typeof variant === "string") {
      buckets.get(variant as MobileChatTransitionVariant)?.push(sample.durationMs);
    }
  }

  return MOBILE_CHAT_TRANSITION_VARIANTS.map((variant) => {
    const values = buckets.get(variant) ?? [];
    return {
      count: values.length,
      p50Ms: percentileMs(values, 50),
      p95Ms: percentileMs(values, 95),
      variant,
    };
  });
}

export type MobileChatOpenPhaseRow = {
  readonly count: number;
  readonly p50Ms: number | null;
  readonly p95Ms: number | null;
  readonly phase: MobileNavigationPhase;
};

export function summarizeMobileChatOpenPhases(
  samples: readonly MobilePerformanceSummaryInput[],
): readonly MobileChatOpenPhaseRow[] {
  const buckets = new Map<MobileNavigationPhase, number[]>(
    MOBILE_NAVIGATION_PHASES.map((phase) => [phase, []]),
  );

  for (const sample of samples) {
    if (sample.metric !== "navigation") continue;
    const context = sample.context as { readonly phases?: unknown; readonly route?: unknown };
    if (typeof context.route !== "string" || !CHAT_ROUTES.has(context.route)) continue;
    if (!context.phases || typeof context.phases !== "object") continue;

    for (const phase of MOBILE_NAVIGATION_PHASES) {
      const durationMs = (context.phases as Record<string, unknown>)[phase];
      if (typeof durationMs === "number" && Number.isFinite(durationMs) && durationMs >= 0) {
        buckets.get(phase)?.push(durationMs);
      }
    }
  }

  return MOBILE_NAVIGATION_PHASES.map((phase) => {
    const values = buckets.get(phase) ?? [];
    return {
      count: values.length,
      p50Ms: percentileMs(values, 50),
      p95Ms: percentileMs(values, 95),
      phase,
    };
  });
}

export type MobileChatOpenCohortRow = {
  readonly count: number;
  readonly first5P50Ms: number | null;
  readonly last5P50Ms: number | null;
  readonly p50Ms: number | null;
  readonly p95Ms: number | null;
  readonly route: MobileChatRoute;
  readonly slopeMsPerSample: number | null;
  readonly source: MobileMessageStreamSource;
  readonly transition: MobileChatTransitionVariant;
};

type OrderedDuration = { readonly durationMs: number; readonly ordinal: number };

function slopeMsPerSample(values: readonly OrderedDuration[]): number | null {
  if (values.length < 2) return null;
  const meanX = values.reduce((total, value) => total + value.ordinal, 0) / values.length;
  const meanY = values.reduce((total, value) => total + value.durationMs, 0) / values.length;
  let covariance = 0;
  let variance = 0;
  for (const value of values) {
    const deltaX = value.ordinal - meanX;
    covariance += deltaX * (value.durationMs - meanY);
    variance += deltaX * deltaX;
  }
  return variance === 0 ? null : Math.round((covariance / variance) * 100) / 100;
}

export function summarizeMobileChatOpenCohorts(
  samples: readonly MobilePerformanceSummaryInput[],
): readonly MobileChatOpenCohortRow[] {
  const buckets = new Map<string, OrderedDuration[]>();
  for (const sample of samples) {
    if (sample.metric !== "navigation") continue;
    const context = sample.context as {
      readonly route?: unknown;
      readonly sampleOrdinal?: unknown;
      readonly source?: unknown;
      readonly stage?: unknown;
      readonly transition?: unknown;
    };
    if (
      typeof context.stage === "string" ||
      !MOBILE_CHAT_ROUTES.includes(context.route as MobileChatRoute) ||
      !MOBILE_MESSAGE_STREAM_SOURCES.includes(context.source as MobileMessageStreamSource) ||
      !MOBILE_CHAT_TRANSITION_VARIANTS.includes(context.transition as MobileChatTransitionVariant)
    ) {
      continue;
    }
    const ordinal =
      typeof context.sampleOrdinal === "number" && Number.isFinite(context.sampleOrdinal)
        ? context.sampleOrdinal
        : 0;
    const key = `${context.route}:${context.source}:${context.transition}`;
    const bucket = buckets.get(key) ?? [];
    bucket.push({ durationMs: sample.durationMs, ordinal });
    buckets.set(key, bucket);
  }

  return MOBILE_CHAT_ROUTES.flatMap((route) =>
    MOBILE_MESSAGE_STREAM_SOURCES.flatMap((source) =>
      MOBILE_CHAT_TRANSITION_VARIANTS.map((transition) => {
        const values = [...(buckets.get(`${route}:${source}:${transition}`) ?? [])].sort(
          (left, right) => left.ordinal - right.ordinal,
        );
        const durations = values.map((value) => value.durationMs);
        return {
          count: values.length,
          first5P50Ms: percentileMs(
            values.slice(0, 5).map((value) => value.durationMs),
            50,
          ),
          last5P50Ms: percentileMs(
            values.slice(-5).map((value) => value.durationMs),
            50,
          ),
          p50Ms: percentileMs(durations, 50),
          p95Ms: percentileMs(durations, 95),
          route,
          slopeMsPerSample: slopeMsPerSample(values),
          source,
          transition,
        };
      }),
    ),
  );
}

export type MobileChatContentClassRow = {
  readonly count: number;
  readonly dimension:
    "attachments" | "message-count" | "reactions" | "rich-content" | "visible-rows";
  readonly p50Ms: number | null;
  readonly p95Ms: number | null;
  readonly value: string;
};

function toCountClass(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  if (value === 0) return "0";
  if (value <= 5) return "1-5";
  if (value <= 20) return "6-20";
  if (value <= 50) return "21-50";
  return "51+";
}

export function summarizeMobileChatContentClasses(
  samples: readonly MobilePerformanceSummaryInput[],
): readonly MobileChatContentClassRow[] {
  const buckets = new Map<string, number[]>();
  const dimensions = [
    ["attachments", "attachmentCountClass"],
    ["message-count", "messageCount"],
    ["reactions", "reactionCountClass"],
    ["rich-content", "richContentCountClass"],
    ["visible-rows", "visibleInitialRowCount"],
  ] as const;

  for (const sample of samples) {
    if (sample.metric !== "navigation") continue;
    const context = sample.context as Record<string, unknown>;
    if (!MOBILE_CHAT_ROUTES.includes(context.route as MobileChatRoute) || context.stage) continue;
    for (const [dimension, key] of dimensions) {
      const value = key.endsWith("Class")
        ? typeof context[key] === "string"
          ? context[key]
          : null
        : toCountClass(context[key]);
      if (!value || !["0", "1-5", "6-20", "21-50", "51+"].includes(value)) continue;
      const bucketKey = `${dimension}:${value}`;
      const bucket = buckets.get(bucketKey) ?? [];
      bucket.push(sample.durationMs);
      buckets.set(bucketKey, bucket);
    }
  }

  return [...buckets.entries()].map(([key, values]) => {
    const [dimension, value] = key.split(":") as [MobileChatContentClassRow["dimension"], string];
    return {
      count: values.length,
      dimension,
      p50Ms: percentileMs(values, 50),
      p95Ms: percentileMs(values, 95),
      value,
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
