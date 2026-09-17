"use client";

import { useEffect } from "react";
import { SCREEN_SHARE_HEALTH_EVENT } from "@/lib/telemetry/screen-share-health-events";
import type { ScreenShareTelemetryEvent } from "@/lib/telemetry/screen-share-health-events";

const CLIENT_HEALTH_PATH = "/api/v1/telemetry/client-health";
/** Per page load. A render loop that throws must not become a request loop. */
const MAX_REPORTS_PER_LOAD = 10;

function summarize(value: unknown) {
  if (value instanceof Error) {
    return `${value.name}: ${value.message}`.slice(0, 200);
  }

  return String(value).slice(0, 200);
}

/**
 * Uncaught web errors become ERROR health events. The endpoint takes the
 * platform from the request headers, so nothing about the client is asserted
 * here beyond what failed.
 */
export function WebHealthReporter() {
  useEffect(() => {
    function reportSummary(event: Event) {
      const events = (event as CustomEvent<ScreenShareTelemetryEvent[]>).detail;
      if (!Array.isArray(events) || events.length === 0 || events.length > 50) return;
      const body = JSON.stringify({ events });
      if (new TextEncoder().encode(body).byteLength > 32 * 1024) return;
      void fetch(CLIENT_HEALTH_PATH, {
        body,
        headers: { "Content-Type": "application/json" },
        keepalive: true,
        method: "POST",
      }).catch(() => undefined);
    }
    window.addEventListener(SCREEN_SHARE_HEALTH_EVENT, reportSummary);
    return () => window.removeEventListener(SCREEN_SHARE_HEALTH_EVENT, reportSummary);
  }, []);

  useEffect(() => {
    let reported = 0;

    function report(message: string, surface: string) {
      if (reported >= MAX_REPORTS_PER_LOAD) {
        return;
      }

      reported += 1;

      void fetch(CLIENT_HEALTH_PATH, {
        body: JSON.stringify({
          events: [{ context: { message }, kind: "ERROR", surface }],
        }),
        headers: { "Content-Type": "application/json" },
        keepalive: true,
        method: "POST",
      }).catch(() => undefined);
    }

    function onError(event: ErrorEvent) {
      report(summarize(event.error ?? event.message), "window-error");
    }

    function onRejection(event: PromiseRejectionEvent) {
      report(summarize(event.reason), "unhandled-rejection");
    }

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);

    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}
