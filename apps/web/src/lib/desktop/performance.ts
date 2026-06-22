export type DesktopMetricRuntime = "desktop";
export type DesktopMetricResult = "failure" | "signature_failure" | "skipped" | "success";
export type DesktopMetricOperation =
  | "desktop_activity_status_updated"
  | "desktop_audio_device_fallback"
  | "desktop_close_cleanup"
  | "desktop_companion_surfaces_hidden"
  | "desktop_companion_surfaces_refreshed"
  | "desktop_diagnostics_export"
  | "desktop_game_overlay_health"
  | "desktop_game_overlay_panic_disabled"
  | "desktop_game_overlay_recovered"
  | "desktop_game_overlay_visible"
  | "desktop_lifecycle_resume"
  | "desktop_network_transition"
  | "desktop_platform_capabilities_loaded"
  | "desktop_push_to_talk_latency"
  | "desktop_runtime_ready"
  | "desktop_shortcut_latency"
  | "desktop_shortcuts_configured"
  | "desktop_startup_duration"
  | "desktop_update_check"
  | "desktop_update_download"
  | "desktop_update_install"
  | "desktop_update_relaunch"
  | "desktop_update_verify"
  | "desktop_update_signature_verification"
  | "desktop_voice_join_timing"
  | "desktop_voice_leave_timing"
  | "desktop_window_state";

export type DesktopPerformanceMetric = {
  durationMs?: number;
  operation: DesktopMetricOperation;
  result: DesktopMetricResult;
  runtime?: DesktopMetricRuntime;
};

const DESKTOP_LOG_PREFIX = "[desktop]";
const DESKTOP_METRIC_TYPE = "desktop";

function isEnabledValue(value: string | undefined): boolean {
  return value === "1" || value === "true";
}

export function isDesktopMetricsEnabled(): boolean {
  return (
    isEnabledValue(process.env.NEXT_PUBLIC_DESKTOP_METRICS) ||
    isEnabledValue(process.env.DESKTOP_METRICS)
  );
}

export function normalizeDesktopDurationMs(value: number | undefined): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }

  return Math.max(0, Math.round(value * 100) / 100);
}

export function formatDesktopPerformanceMetric(
  metric: DesktopPerformanceMetric,
  now = new Date(),
): string {
  return JSON.stringify({
    durationMs: normalizeDesktopDurationMs(metric.durationMs),
    operation: metric.operation,
    result: metric.result,
    runtime: metric.runtime ?? "desktop",
    timestamp: now.toISOString(),
    type: DESKTOP_METRIC_TYPE,
  });
}

export function recordDesktopPerformanceMetric(metric: DesktopPerformanceMetric) {
  if (!isDesktopMetricsEnabled()) {
    return;
  }

  console.info(DESKTOP_LOG_PREFIX, formatDesktopPerformanceMetric(metric));
}
