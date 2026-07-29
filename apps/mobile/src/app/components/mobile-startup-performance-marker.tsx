import { useEffect } from "react";
import { AppState, type AppStateStatus } from "react-native";

import { createMobilePerformanceSamplePersistence } from "../../performance/mobile-performance-sample-persistence";
import { markMobileStartupPhase } from "../../performance/mobile-startup-phases";
import { installMobileTelemetryInstruments } from "../../performance/mobile-telemetry-instruments";
import { mobileMessageStore } from "../../storage/mobile-message-store-database";

/**
 * Marks the first frame the root managed to draw. This component sits above the
 * font gate and the auth provider, so that frame is a shell — the phases that
 * carry the headline (`auth-resolved`, `content-visible`, `interactive`) are
 * marked from below those gates.
 */
export function MobileStartupPerformanceMarker() {
  useEffect(() => installMobileTelemetryInstruments(), []);

  /**
   * Copies every measurement to the retained log.
   *
   * Mounted here, above the auth provider, because a launch is measured before
   * any session exists — and because the alternative, reading the in-memory log
   * from the panel, cannot work: the health reporter *drains* that log on a
   * timer and on every background transition, so a ten-launch baseline run had
   * nothing left to read by the time anyone opened the panel.
   *
   * Backgrounding flushes early: a process about to be killed for the next cold
   * start may never get another chance.
   */
  useEffect(() => {
    const persistence = createMobilePerformanceSamplePersistence({
      persist: (samples) => mobileMessageStore.appendPerformanceSamples({ samples }),
    });
    const detach = persistence.observe();
    const subscription = AppState.addEventListener("change", (state: AppStateStatus) => {
      if (state === "background" || state === "inactive") {
        void persistence.flush();
      }
    });

    return () => {
      detach();
      subscription.remove();
      void persistence.flush().finally(() => persistence.dispose());
    };
  }, []);

  useEffect(() => {
    let firstFrame = 0;
    let secondFrame = 0;
    firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        markMobileStartupPhase("root-first-frame");
      });
    });
    return () => {
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
    };
  }, []);

  return null;
}
