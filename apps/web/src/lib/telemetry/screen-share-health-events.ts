import type { ScreenShareHealthMetricEvent } from "@/lib/voice/screen-share-health";
import type { ScreenShareMode } from "@wizards/types";

export const SCREEN_SHARE_HEALTH_EVENT = "whispr:screen-share-health";

export function createScreenShareModeChangeEvent(input: {
  mode: ScreenShareMode;
  durationMs: number;
  result: "success" | "error";
}) {
  return {
    kind: "API_LATENCY" as const,
    surface: "screen-share-mode-change",
    unit: "ms" as const,
    value: Math.min(600_000, Math.max(0, Math.round(input.durationMs))),
    context: { event: "mode_change", mode: input.mode, result: input.result },
  };
}

export type ScreenShareTelemetryEvent =
  ScreenShareHealthMetricEvent | ReturnType<typeof createScreenShareModeChangeEvent>;

/** Only summary rows cross this boundary; no track or participant identity. */
export function publishScreenShareHealthEvents(events: readonly ScreenShareTelemetryEvent[]) {
  if (typeof window !== "undefined" && events.length) {
    window.dispatchEvent(new CustomEvent(SCREEN_SHARE_HEALTH_EVENT, { detail: events }));
  }
}
