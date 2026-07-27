"use client";

import { useEffect } from "react";

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
