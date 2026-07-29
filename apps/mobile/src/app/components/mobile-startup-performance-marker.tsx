import { useEffect, useState } from "react";
import { AppState, type AppStateStatus, View } from "react-native";

import {
  createMobilePerformanceSamplePersistence,
  setActiveMobilePerformanceSamplePersistence,
} from "../../performance/mobile-performance-sample-persistence";
import { beginMobileNavigationSpan } from "../../performance/mobile-navigation-timing";
import { createMobileResumeLifecycle } from "../../performance/mobile-resume-lifecycle";
import { markMobileStartupPhase } from "../../performance/mobile-startup-phases";
import { installMobileTelemetryInstruments } from "../../performance/mobile-telemetry-instruments";
import { mobileMessageStore } from "../../storage/mobile-message-store-database";

type CheckpointState = "idle" | "pending" | "persisted";

function isRetainedColdStartSample(sample: {
  readonly context: Readonly<Record<string, unknown>>;
  readonly metric: string;
}): boolean {
  return (
    sample.metric === "startup" &&
    sample.context.phase === "content-visible" &&
    sample.context.authenticated === true
  );
}

function isRetainedResumeSample(sample: {
  readonly context: Readonly<Record<string, unknown>>;
  readonly metric: string;
}): boolean {
  return sample.metric === "navigation" && sample.context.route === "Resume";
}

/**
 * Marks the first frame the root managed to draw. This component sits above the
 * font gate and the auth provider, so that frame is a shell — the phases that
 * carry the headline (`auth-resolved`, `content-visible`, `interactive`) are
 * marked from below those gates.
 */
export function MobileStartupPerformanceMarker() {
  const [startupCheckpoint, setStartupCheckpoint] = useState<CheckpointState>("pending");
  const [resumeCheckpoint, setResumeCheckpoint] = useState<CheckpointState>("idle");

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
    let mounted = true;
    const resumeLifecycle = createMobileResumeLifecycle();
    const persistence = createMobilePerformanceSamplePersistence({
      persist: async (samples) => {
        await mobileMessageStore.appendPerformanceSamples({ samples });
        if (!mounted) {
          return;
        }
        if (samples.some(isRetainedColdStartSample)) {
          setStartupCheckpoint("persisted");
        }
        if (samples.some(isRetainedResumeSample)) {
          setResumeCheckpoint("persisted");
        }
      },
    });
    const detach = persistence.observe();
    setActiveMobilePerformanceSamplePersistence(persistence);

    const subscription = AppState.addEventListener("change", (state: AppStateStatus) => {
      if (state === "background" || state === "inactive") {
        setResumeCheckpoint("idle");
        void persistence.flush();
      }
      if (resumeLifecycle.observe(state)) {
        setResumeCheckpoint("pending");
        beginMobileNavigationSpan("Resume");
      }
    });

    return () => {
      mounted = false;
      detach();
      setActiveMobilePerformanceSamplePersistence(null);
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

  return (
    <>
      <View
        accessible
        accessibilityLabel={`mobile-performance-startup-${startupCheckpoint}`}
        collapsable={false}
        style={{ height: 1, opacity: 0.01, width: 1 }}
        testID={`mobile-performance-startup-${startupCheckpoint}`}
      />
      <View
        accessible
        accessibilityLabel={`mobile-performance-resume-${resumeCheckpoint}`}
        collapsable={false}
        style={{ height: 1, opacity: 0.01, width: 1 }}
        testID={`mobile-performance-resume-${resumeCheckpoint}`}
      />
    </>
  );
}
