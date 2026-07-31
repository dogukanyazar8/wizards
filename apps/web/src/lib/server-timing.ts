import { readRequestId } from "@/lib/request-id";

/**
 * Coarse `Server-Timing` instrumentation for the mobile read routes.
 *
 * Deliberately bucketed (`auth`, `db`, `total`) rather than per-query: the
 * point is to tell client-side latency apart from server work when a screen
 * feels slow, not to publish the query plan to anyone holding a token.
 */
export type ServerTimingRecorder = {
  header(): string;
  headers(extra?: Record<string, string>): Record<string, string>;
  measure<T>(name: string, work: () => Promise<T>): Promise<T>;
  /** The caller's correlation id, so the failure path can log it too. */
  readonly requestId: string | null;
  /**
   * Manual variant for calls that must stay syntactically plain. The route
   * contract test statically traces `authorizeMobileApiRequest(request, action)`
   * to prove every route is rate limited with the right action, and it cannot
   * see through a callback — so auth is timed with `start`/stop rather than
   * being wrapped in `measure`.
   */
  start(name: string): () => void;
};

const MAX_METRIC_NAME_LENGTH = 32;
const SAFE_METRIC_NAME = /^[a-z][a-z0-9_-]*$/;

function normalizeMetricName(name: string): string {
  const normalized = name.trim().toLowerCase().slice(0, MAX_METRIC_NAME_LENGTH);
  return SAFE_METRIC_NAME.test(normalized) ? normalized : "unknown";
}

function formatDuration(durationMs: number): string {
  return (Math.round(durationMs * 10) / 10).toFixed(1);
}

export function createServerTiming(
  now: () => number = () => performance.now(),
  /**
   * Echoed back so a slow sample on a device can be found in the edge's own
   * record of the same request. Validated by `readRequestId` before it gets
   * here; anything else is absent rather than reflected.
   */
  requestId: string | null = null,
): ServerTimingRecorder {
  const startedAt = now();
  const durations = new Map<string, number>();

  return {
    requestId,
    header() {
      const total = now() - startedAt;
      const entries = [...durations.entries()].map(
        ([name, duration]) => `${name};dur=${formatDuration(duration)}`,
      );

      return [...entries, `total;dur=${formatDuration(total)}`].join(", ");
    },
    headers(extra = {}) {
      return {
        ...extra,
        ...(requestId ? { "X-Request-Id": requestId } : {}),
        "Server-Timing": this.header(),
      };
    },
    start(name) {
      const metric = normalizeMetricName(name);
      const startedMeasureAt = now();
      let stopped = false;

      return () => {
        if (stopped) {
          return;
        }

        stopped = true;
        durations.set(metric, (durations.get(metric) ?? 0) + (now() - startedMeasureAt));
      };
    },
    async measure(name, work) {
      const metric = normalizeMetricName(name);
      const startedMeasureAt = now();

      try {
        return await work();
      } finally {
        // Accumulate rather than overwrite so repeated buckets (two db reads in
        // one handler) report combined time instead of only the last one.
        durations.set(metric, (durations.get(metric) ?? 0) + (now() - startedMeasureAt));
      }
    },
  };
}

/**
 * The variant every request-handling route should use: it carries the client's
 * correlation id through to the response and, via `jsonError`, to the log line a
 * failure leaves behind.
 */
export function createServerTimingForRequest(request: Request): ServerTimingRecorder {
  return createServerTiming(undefined, readRequestId(request.headers));
}
