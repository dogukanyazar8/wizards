import type { NoiseFilterTier } from "@/lib/voice/noise-filter";
import type { VoiceAudioHealthMetric } from "@/lib/voice/audio-health";

type VoicePerformanceRuntime = "client" | "server";
type VoicePerformanceResult = "error" | "success";

export type VoicePerformanceOperation =
  | "krisp_audio_health"
  | "krisp_module_load"
  | "krisp_processor_attach"
  | "livekit_room_connect"
  | "livekit_token"
  | "livekit_token_fetch"
  | "noise_filter_tier_resolved"
  /** Viewer: subscribed to the share → first `framesDecoded > 0` (Ş0.2). */
  | "screen_share_first_remote_frame"
  /** Ş1's live text/motion switch; recorded once the switch exists. */
  | "screen_share_mode_switch"
  /** Sharer: click → local screen track `live` (Ş0.2). */
  | "screen_share_start"
  /** Sharer: stop requested → session back to `idle` (Ş0.2). */
  | "screen_share_stop_cleanup"
  | "voice_join_total"
  | "voice_leave_cleanup_total"
  | "voice_state_delete"
  | "voice_state_post";

/** The operations the screen share telemetry strip records; locked by its test. */
export const SCREEN_SHARE_PERFORMANCE_OPERATIONS = [
  "screen_share_first_remote_frame",
  "screen_share_mode_switch",
  "screen_share_start",
  "screen_share_stop_cleanup",
] as const satisfies readonly VoicePerformanceOperation[];

export type VoicePerformanceMetric = VoiceAudioHealthMetric & {
  durationMs: number;
  errorCode?: string;
  operation: VoicePerformanceOperation;
  result: VoicePerformanceResult;
  runtime: VoicePerformanceRuntime;
  status?: number;
  tier?: NoiseFilterTier;
};

function isBrowserRuntime() {
  return typeof window !== "undefined";
}

function getDefaultRuntime(): VoicePerformanceRuntime {
  return isBrowserRuntime() ? "client" : "server";
}

export function isVoicePerformanceMetricsEnabled(
  runtime: VoicePerformanceRuntime = getDefaultRuntime(),
) {
  if (runtime === "client") {
    return process.env.NEXT_PUBLIC_VOICE_PERFORMANCE_METRICS === "true";
  }

  return process.env.VOICE_PERFORMANCE_METRICS === "true";
}

export function getVoicePerformanceNow() {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

export function getVoicePerformanceDurationMs(
  startedAt: number,
  endedAt = getVoicePerformanceNow(),
) {
  return Math.max(0, Math.round((endedAt - startedAt) * 100) / 100);
}

export function getVoicePerformanceErrorMetadata(error: unknown) {
  const errorWithMetadata = error as {
    code?: unknown;
    status?: unknown;
  };

  return {
    ...(typeof errorWithMetadata?.code === "string" ? { errorCode: errorWithMetadata.code } : {}),
    ...(typeof errorWithMetadata?.status === "number" ? { status: errorWithMetadata.status } : {}),
  };
}

export function formatVoicePerformanceMetric(metric: VoicePerformanceMetric, now = new Date()) {
  return JSON.stringify({
    timestamp: now.toISOString(),
    type: "voice_performance",
    ...metric,
    durationMs: Math.max(0, Math.round(metric.durationMs * 100) / 100),
  });
}

export function recordVoicePerformanceMetric(metric: VoicePerformanceMetric) {
  if (!isVoicePerformanceMetricsEnabled(metric.runtime)) {
    return;
  }

  console.info("[voice-performance]", formatVoicePerformanceMetric(metric));
}

export async function measureVoicePerformance<T>(
  metric: Omit<VoicePerformanceMetric, "durationMs" | "errorCode" | "result" | "status">,
  run: () => Promise<T>,
): Promise<T> {
  const startedAt = getVoicePerformanceNow();

  try {
    const result = await run();
    recordVoicePerformanceMetric({
      ...metric,
      durationMs: getVoicePerformanceDurationMs(startedAt),
      result: "success",
    });
    return result;
  } catch (error) {
    recordVoicePerformanceMetric({
      ...metric,
      ...getVoicePerformanceErrorMetadata(error),
      durationMs: getVoicePerformanceDurationMs(startedAt),
      result: "error",
    });
    throw error;
  }
}
