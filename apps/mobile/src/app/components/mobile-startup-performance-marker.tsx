import { useEffect } from "react";

import { markMobileStartupPhase } from "../../performance/mobile-startup-phases";
import { installMobileTelemetryInstruments } from "../../performance/mobile-telemetry-instruments";

/**
 * Marks the first frame the root managed to draw. This component sits above the
 * font gate and the auth provider, so that frame is a shell — the phases that
 * carry the headline (`auth-resolved`, `content-visible`, `interactive`) are
 * marked from below those gates.
 */
export function MobileStartupPerformanceMarker() {
  useEffect(() => installMobileTelemetryInstruments(), []);

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
