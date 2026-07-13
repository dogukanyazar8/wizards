export type MobilePerformanceSurface =
  | "channel-messages"
  | "dm-inbox"
  | "dm-messages"
  | "startup"
  | "workspace-channels"
  | "workspace-servers";

export interface MobilePerformanceMetric {
  readonly durationMs: number;
  readonly metric: "list-load" | "startup";
  readonly surface: MobilePerformanceSurface;
}

interface MobileListLoadInfo {
  readonly elapsedTimeInMs: number;
}

const MAX_MOBILE_PERFORMANCE_DURATION_MS = 60_000;
const metrics = new Map<MobilePerformanceSurface, MobilePerformanceMetric>();

function normalizeDurationMs(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    return 0;
  }
  return Math.round(Math.min(value, MAX_MOBILE_PERFORMANCE_DURATION_MS) * 100) / 100;
}

export function createMobilePerformanceMetric(
  surface: MobilePerformanceSurface,
  durationMs: number,
): MobilePerformanceMetric {
  return Object.freeze({
    durationMs: normalizeDurationMs(durationMs),
    metric: surface === "startup" ? "startup" : "list-load",
    surface,
  });
}

export function recordMobilePerformanceMetric(
  surface: MobilePerformanceSurface,
  durationMs: number,
): MobilePerformanceMetric {
  const metric = createMobilePerformanceMetric(surface, durationMs);
  metrics.set(surface, metric);
  return metric;
}

export function getMobilePerformanceMetricsSnapshot(): readonly MobilePerformanceMetric[] {
  return Object.freeze([...metrics.values()]);
}

export function resetMobilePerformanceMetricsForTests(): void {
  metrics.clear();
}

export const mobileListLoadHandlers = Object.freeze({
  channelMessages: ({ elapsedTimeInMs }: MobileListLoadInfo) =>
    recordMobilePerformanceMetric("channel-messages", elapsedTimeInMs),
  dmInbox: ({ elapsedTimeInMs }: MobileListLoadInfo) =>
    recordMobilePerformanceMetric("dm-inbox", elapsedTimeInMs),
  dmMessages: ({ elapsedTimeInMs }: MobileListLoadInfo) =>
    recordMobilePerformanceMetric("dm-messages", elapsedTimeInMs),
  workspaceChannels: ({ elapsedTimeInMs }: MobileListLoadInfo) =>
    recordMobilePerformanceMetric("workspace-channels", elapsedTimeInMs),
  workspaceServers: ({ elapsedTimeInMs }: MobileListLoadInfo) =>
    recordMobilePerformanceMetric("workspace-servers", elapsedTimeInMs),
});
