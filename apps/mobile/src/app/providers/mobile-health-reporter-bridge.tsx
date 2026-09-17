import { useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { useMobileAuth } from "../../auth/mobile-auth-context";
import {
  createMobileHealthReporter,
  MOBILE_HEALTH_FLUSH_INTERVAL_MS,
  type MobileHealthReporter,
} from "../../performance/mobile-health-reporter";
import { drainMobilePerformanceSamples } from "../../performance/mobile-performance-metrics";
import {
  resolveMobileTelemetryDimensions,
  type MobileTelemetryDimensionsResolver,
} from "../../performance/mobile-telemetry-dimensions";
import {
  drainMobileScreenShareHealthEvents,
  type MobileScreenShareHealthEvent,
} from "../../voice/mobile-screen-share-health";

const CLIENT_HEALTH_PATH = "/api/v1/telemetry/client-health";

/**
 * Screen share summaries (Ş0.2, K16) carry the same build / platform / network
 * slices as the performance samples, so a p95 of the send fps can be split the
 * same way. Best effort like `toHealthEvents`: a native read that fails must
 * not cost the measurement.
 */
function withTelemetryDimensions(
  events: readonly MobileScreenShareHealthEvent[],
  resolveDimensions: MobileTelemetryDimensionsResolver,
): readonly MobileScreenShareHealthEvent[] {
  if (events.length === 0) {
    return events;
  }

  let dimensions: Readonly<Record<string, unknown>> = {};
  try {
    dimensions = resolveDimensions();
  } catch {
    dimensions = {};
  }

  return events.map((event) => ({ ...event, context: { ...dimensions, ...event.context } }));
}

/**
 * Mounts the health queue: startup and screen-load measurements ride the
 * interval, and backgrounding flushes early because a process that is about to
 * be frozen may never come back.
 */
export function MobileHealthReporterBridge() {
  const { apiClient } = useMobileAuth();
  const reporterRef = useRef<MobileHealthReporter | null>(null);

  useEffect(() => {
    const reporter = createMobileHealthReporter({
      send: async (events) => {
        await apiClient.requestJson(CLIENT_HEALTH_PATH, {
          body: { events },
          method: "POST",
        });
      },
    });

    reporterRef.current = reporter;

    function collectAndFlush() {
      // Draining, not snapshotting: the old snapshot was re-enqueued on every
      // tick, so the backend received the same measurement once a minute for as
      // long as the app stayed open.
      reporter.enqueueMetrics(drainMobilePerformanceSamples(), resolveMobileTelemetryDimensions);
      // Screen share health summaries ride this same 60 s flush (K16): the
      // ≈2 s samples stay on the device, only the window summary is shipped.
      reporter.enqueue(
        ...withTelemetryDimensions(
          drainMobileScreenShareHealthEvents(),
          resolveMobileTelemetryDimensions,
        ),
      );
      void reporter.flush();
    }

    const interval = setInterval(collectAndFlush, MOBILE_HEALTH_FLUSH_INTERVAL_MS);
    const subscription = AppState.addEventListener("change", (state: AppStateStatus) => {
      if (state === "background" || state === "inactive") {
        collectAndFlush();
      }
    });

    return () => {
      clearInterval(interval);
      subscription.remove();
      reporterRef.current = null;
    };
  }, [apiClient]);

  return null;
}
