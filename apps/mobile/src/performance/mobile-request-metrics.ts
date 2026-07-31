import { percentileMs } from "./mobile-performance-summary";

export type MobileServerTimingBreakdown = {
  readonly authMs: number | null;
  readonly dbMs: number | null;
  readonly totalMs: number | null;
};

/**
 * Fixed set, because the method becomes part of a metric key. Anything else is
 * folded into `OTHER` rather than allowed to mint keys from a call site.
 */
export const MOBILE_REQUEST_METHODS = ["DELETE", "GET", "PATCH", "POST", "PUT"] as const;

export type MobileRequestMethod = (typeof MOBILE_REQUEST_METHODS)[number] | "OTHER";

export type MobileRequestLatencySample = {
  /**
   * Response headers on the device. This is the number the server's `total`
   * bucket lines up with — everything after it is the client's own cost.
   */
  readonly headersMs: number;
  readonly method: MobileRequestMethod;
  readonly requestId: string | null;
  readonly route: string;
  readonly server: MobileServerTimingBreakdown;
  /**
   * Body downloaded and parsed, which is when the caller actually has data.
   *
   * A GET measured at the header was declaring itself finished before ~21KB of
   * gzipped JSON had been read and turned into objects on the JS thread; the gap
   * between the two numbers is exactly that cost, and it was invisible.
   */
  readonly settledMs: number;
  /** Round trip the server did not account for: transport, TLS, JSON, parsing. */
  readonly transportMs: number | null;
};

/**
 * What a route+method looked like over the session, rather than whatever its
 * last call happened to cost.
 *
 * The store used to keep one sample per route, so the panel reported a single
 * arbitrary request as if it were the route's latency — and `GET /messages`
 * shared that slot with `POST /messages`, which is a read and a write with
 * different budgets pooled into one number.
 */
export type MobileRequestLatencyStats = {
  readonly count: number;
  readonly headersP50Ms: number | null;
  readonly headersP95Ms: number | null;
  readonly key: string;
  readonly lastRequestId: string | null;
  /** The most recent breakdown; the split between auth and db is stable enough. */
  readonly lastServer: MobileServerTimingBreakdown;
  readonly method: MobileRequestMethod;
  readonly route: string;
  readonly serverP50Ms: number | null;
  readonly serverP95Ms: number | null;
  readonly settledP50Ms: number | null;
  readonly settledP95Ms: number | null;
  readonly transportP95Ms: number | null;
};

const EMPTY_BREAKDOWN: MobileServerTimingBreakdown = { authMs: null, dbMs: null, totalMs: null };

const MAX_DURATION_MS = 120_000;
const MAX_TRACKED_ROUTES = 40;
/**
 * Samples kept per route+method. Enough for a p95 that means something over a
 * baseline run, small enough that forty tracked keys stay a bounded cost.
 */
const MAX_SAMPLES_PER_KEY = 60;
const SAFE_OPAQUE_REQUEST_ID = /^[0-9a-f]{32}$/i;

/**
 * Requests slower than this get a Sentry breadcrumb. Every request would drown
 * the 100-entry breadcrumb buffer and bury the context around an actual error.
 */
export const MOBILE_SLOW_REQUEST_THRESHOLD_MS = 1_000;

function normalizeDuration(value: number): number | null {
  if (!Number.isFinite(value) || value < 0) {
    return null;
  }

  return Math.round(Math.min(value, MAX_DURATION_MS) * 10) / 10;
}

/**
 * Reads `Server-Timing: auth;dur=12.3, db;dur=88.1, total;dur=101.2`. Unknown
 * metrics are ignored rather than surfaced — the header is attacker-influencable
 * in principle, and nothing downstream should grow keys from a response.
 */
export function parseMobileServerTiming(
  header: string | null | undefined,
): MobileServerTimingBreakdown {
  if (!header) {
    return EMPTY_BREAKDOWN;
  }

  let authMs: number | null = null;
  let dbMs: number | null = null;
  let totalMs: number | null = null;

  for (const entry of header.split(",")) {
    const [rawName, ...rest] = entry.split(";");
    const name = rawName?.trim().toLowerCase();
    if (name !== "auth" && name !== "db" && name !== "total") {
      continue;
    }

    const duration = rest
      .map((part) => part.trim())
      .find((part) => part.toLowerCase().startsWith("dur="));
    if (!duration) {
      continue;
    }

    const parsed = normalizeDuration(Number.parseFloat(duration.slice(4)));
    if (parsed === null) {
      continue;
    }

    if (name === "auth") authMs = parsed;
    else if (name === "db") dbMs = parsed;
    else totalMs = parsed;
  }

  return { authMs, dbMs, totalMs };
}

const OPAQUE_SEGMENT = /^(?:[0-9a-f-]{16,}|[A-Za-z0-9_-]{16,}|\d+)$/;

/**
 * Collapses identifiers out of a request path before it is grouped or sent to
 * Sentry. `/api/v1/mobile/channels/<uuid>/messages` becomes
 * `/api/v1/mobile/channels/:id/messages`, which both aggregates usefully and
 * keeps channel, server, and conversation ids out of telemetry.
 */
export function toMobileMetricRoute(path: string): string {
  const [pathname = ""] = path.split("?");

  return (
    pathname
      .split("/")
      .map((segment) => (OPAQUE_SEGMENT.test(segment) ? ":id" : segment))
      .join("/")
      .slice(0, 120) || "/"
  );
}

export type MobileLatencyReporter = (sample: MobileRequestLatencySample) => void;

let reportSlowRequest: MobileLatencyReporter = () => {};

/**
 * Kept as an injected reporter rather than a direct Sentry import: the API
 * client pulls this module on every request, and importing the native Sentry
 * SDK here would drag React Native into plain-Node contexts (tests, scripts).
 */
export function setMobileLatencyReporter(reporter: MobileLatencyReporter): void {
  reportSlowRequest = reporter;
}

export function resetMobileLatencyReporterForTests(): void {
  reportSlowRequest = () => {};
}

/**
 * A read and a write to the same path are different operations with different
 * budgets. They shared one key, so `/messages` reported a number that was
 * neither.
 */
export function toMobileRequestMethod(value: string | null | undefined): MobileRequestMethod {
  const normalized = value?.trim().toUpperCase() ?? "";

  return MOBILE_REQUEST_METHODS.some((method) => method === normalized)
    ? (normalized as MobileRequestMethod)
    : "OTHER";
}

const samplesByKey = new Map<string, MobileRequestLatencySample[]>();

export function recordMobileRequestLatency(input: {
  readonly headersMs: number;
  readonly method?: string | null;
  readonly path: string;
  readonly requestId?: string | null;
  readonly serverTimingHeader: string | null | undefined;
  /** Defaults to the header timing for the paths that never read a body. */
  readonly settledMs?: number;
}): MobileRequestLatencySample {
  const headersMs = normalizeDuration(input.headersMs) ?? 0;
  const server = parseMobileServerTiming(input.serverTimingHeader);
  const method = toMobileRequestMethod(input.method);
  const route = toMobileMetricRoute(input.path);
  const sample: MobileRequestLatencySample = {
    headersMs,
    method,
    requestId:
      typeof input.requestId === "string" && SAFE_OPAQUE_REQUEST_ID.test(input.requestId)
        ? input.requestId.toLowerCase()
        : null,
    route,
    server,
    // Never earlier than the headers: a clock that went backwards must not
    // report the body as having arrived before the response did.
    settledMs: Math.max(headersMs, normalizeDuration(input.settledMs ?? headersMs) ?? headersMs),
    transportMs: server.totalMs === null ? null : Math.max(0, headersMs - server.totalMs),
  };

  const key = `${method} ${route}`;
  let samples = samplesByKey.get(key);
  if (!samples) {
    if (samplesByKey.size >= MAX_TRACKED_ROUTES) {
      // Bounded so a pathological id that escapes templating cannot grow the map.
      samplesByKey.delete(samplesByKey.keys().next().value ?? "");
    }
    samples = [];
    samplesByKey.set(key, samples);
  }

  samples.push(sample);
  if (samples.length > MAX_SAMPLES_PER_KEY) {
    samples.splice(0, samples.length - MAX_SAMPLES_PER_KEY);
  }

  // The settled number is what the caller waited for, so it is what decides
  // whether a request was slow enough to leave a breadcrumb.
  if (sample.settledMs >= MOBILE_SLOW_REQUEST_THRESHOLD_MS) {
    reportSlowRequest(sample);
  }

  return sample;
}

function summarizeKey(key: string, samples: readonly MobileRequestLatencySample[]) {
  const last = samples[samples.length - 1];
  const serverTotals = samples.flatMap((sample) =>
    sample.server.totalMs === null ? [] : [sample.server.totalMs],
  );
  const transports = samples.flatMap((sample) =>
    sample.transportMs === null ? [] : [sample.transportMs],
  );

  return {
    count: samples.length,
    headersP50Ms: percentileMs(
      samples.map((sample) => sample.headersMs),
      50,
    ),
    headersP95Ms: percentileMs(
      samples.map((sample) => sample.headersMs),
      95,
    ),
    key,
    lastRequestId: last?.requestId ?? null,
    lastServer: last?.server ?? EMPTY_BREAKDOWN,
    method: last?.method ?? "OTHER",
    route: last?.route ?? "/",
    serverP50Ms: percentileMs(serverTotals, 50),
    serverP95Ms: percentileMs(serverTotals, 95),
    settledP50Ms: percentileMs(
      samples.map((sample) => sample.settledMs),
      50,
    ),
    settledP95Ms: percentileMs(
      samples.map((sample) => sample.settledMs),
      95,
    ),
    transportP95Ms: percentileMs(transports, 95),
  } satisfies MobileRequestLatencyStats;
}

export function getMobileRequestLatencySnapshot(): readonly MobileRequestLatencyStats[] {
  return Object.freeze(
    [...samplesByKey.entries()].map(([key, samples]) => summarizeKey(key, samples)),
  );
}

export function resetMobileRequestLatencyForTests(): void {
  samplesByKey.clear();
}
