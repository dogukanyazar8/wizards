export type MobileServerTimingBreakdown = {
  readonly authMs: number | null;
  readonly dbMs: number | null;
  readonly totalMs: number | null;
};

export type MobileRequestLatencySample = {
  readonly clientMs: number;
  readonly route: string;
  readonly server: MobileServerTimingBreakdown;
  /** Round trip the server did not account for: transport, TLS, JSON, parsing. */
  readonly transportMs: number | null;
};

const EMPTY_BREAKDOWN: MobileServerTimingBreakdown = { authMs: null, dbMs: null, totalMs: null };

const MAX_DURATION_MS = 120_000;
const MAX_TRACKED_ROUTES = 40;

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

const latencyByRoute = new Map<string, MobileRequestLatencySample>();

export function recordMobileRequestLatency(input: {
  readonly clientMs: number;
  readonly path: string;
  readonly serverTimingHeader: string | null | undefined;
}): MobileRequestLatencySample {
  const clientMs = normalizeDuration(input.clientMs) ?? 0;
  const server = parseMobileServerTiming(input.serverTimingHeader);
  const route = toMobileMetricRoute(input.path);
  const sample: MobileRequestLatencySample = {
    clientMs,
    route,
    server,
    transportMs: server.totalMs === null ? null : Math.max(0, clientMs - server.totalMs),
  };

  if (!latencyByRoute.has(route) && latencyByRoute.size >= MAX_TRACKED_ROUTES) {
    // Bounded so a pathological id that escapes templating cannot grow the map.
    latencyByRoute.delete(latencyByRoute.keys().next().value ?? "");
  }
  latencyByRoute.set(route, sample);

  if (clientMs >= MOBILE_SLOW_REQUEST_THRESHOLD_MS) {
    reportSlowRequest(sample);
  }

  return sample;
}

export function getMobileRequestLatencySnapshot(): readonly MobileRequestLatencySample[] {
  return Object.freeze([...latencyByRoute.values()]);
}

export function resetMobileRequestLatencyForTests(): void {
  latencyByRoute.clear();
}
