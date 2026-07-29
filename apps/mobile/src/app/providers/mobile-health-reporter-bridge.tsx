import { useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { useMobileAuth } from "../../auth/mobile-auth-context";
import {
  createMobileHealthReporter,
  MOBILE_HEALTH_FLUSH_INTERVAL_MS,
  type MobileHealthReporter,
} from "../../performance/mobile-health-reporter";
import { drainMobilePerformanceSamples } from "../../performance/mobile-performance-metrics";
import { resolveMobileTelemetryDimensions } from "../../performance/mobile-telemetry-dimensions";

const CLIENT_HEALTH_PATH = "/api/v1/telemetry/client-health";

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
