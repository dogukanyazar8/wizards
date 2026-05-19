export type AppStartupRuntime = "desktop" | "web";
export type AppStartupResult = "success" | "timeout";

export type AppStartupReadyMetric = {
  durationMs: number;
  result: AppStartupResult;
  runtime: AppStartupRuntime;
};

const APP_STARTUP_LOG_PREFIX = "[app-startup]";
const APP_STARTUP_METRIC_TYPE = "app_startup";
const APP_STARTUP_READY_OPERATION = "app_startup_ready";

function isEnabledValue(value: string | undefined): boolean {
  return value === "1" || value === "true";
}

export function isAppStartupMetricsEnabled(): boolean {
  return (
    isEnabledValue(process.env.NEXT_PUBLIC_APP_STARTUP_METRICS) ||
    isEnabledValue(process.env.APP_STARTUP_METRICS)
  );
}

export function getAppStartupRuntime(): AppStartupRuntime {
  if (typeof window === "undefined") {
    return "web";
  }

  const runtimeWindow = window as Window & {
    __WHISPR_DESKTOP__?: {
      shell?: string;
    };
  };

  return runtimeWindow.__WHISPR_DESKTOP__?.shell === "desktop" ? "desktop" : "web";
}

export function getAppStartupDurationMs(startMs: number, endMs: number): number {
  return Math.max(0, Math.round((endMs - startMs) * 100) / 100);
}

export function formatAppStartupMetric(
  metric: AppStartupReadyMetric,
  now = new Date(),
): string {
  return JSON.stringify({
    durationMs: getAppStartupDurationMs(0, metric.durationMs),
    operation: APP_STARTUP_READY_OPERATION,
    result: metric.result,
    runtime: metric.runtime,
    timestamp: now.toISOString(),
    type: APP_STARTUP_METRIC_TYPE,
  });
}

export function recordAppStartupReadyMetric(metric: AppStartupReadyMetric) {
  if (!isAppStartupMetricsEnabled()) {
    return;
  }

  console.info(APP_STARTUP_LOG_PREFIX, formatAppStartupMetric(metric));
}
