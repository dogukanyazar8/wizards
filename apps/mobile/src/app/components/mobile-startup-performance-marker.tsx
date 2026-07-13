import { useEffect } from "react";

import { recordMobilePerformanceMetric } from "../../performance/mobile-performance-metrics";

const startupStartedAtMs = globalThis.performance.now();

export function MobileStartupPerformanceMarker() {
  useEffect(() => {
    let firstFrame = 0;
    let secondFrame = 0;
    firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        recordMobilePerformanceMetric("startup", globalThis.performance.now() - startupStartedAtMs);
      });
    });
    return () => {
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
    };
  }, []);

  return null;
}
