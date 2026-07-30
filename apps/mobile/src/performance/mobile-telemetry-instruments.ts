import { AppState, type AppStateStatus } from "react-native";

import { scheduleMobileIdleTask } from "./mobile-idle-task";
import { observeMobileListLoads } from "./mobile-performance-metrics";
import {
  beginMobileNavigationSpan,
  completeMobileNavigationSpan,
} from "./mobile-navigation-timing";
import { markMobileStartupPhase } from "./mobile-startup-phases";

let installed = false;

/**
 * Schedules the frame that closes the resume span. Injected so the wiring can be
 * driven by a test without waiting on real vsync.
 */
export type MobileFrameScheduler = (callback: () => void) => () => void;

const scheduleTwoFrames: MobileFrameScheduler = (callback) => {
  let second: number | null = null;
  const first = requestAnimationFrame(() => {
    second = requestAnimationFrame(callback);
  });

  return () => {
    cancelAnimationFrame(first);
    if (second !== null) {
      cancelAnimationFrame(second);
    }
  };
};

/**
 * Connects "content is on screen" to the two instruments that need it: the launch
 * timeline closes at the first meaningful content, and the tap that opened a route
 * closes when that route's content lands.
 *
 * Installed once, from the app root, so a screen does not have to know it is being
 * measured.
 */
export function installMobileTelemetryInstruments(
  scheduleFrame: MobileFrameScheduler = scheduleTwoFrames,
): () => void {
  if (installed) {
    return () => undefined;
  }

  installed = true;
  let interactiveHandle: { cancel(): void } | null = null;
  let cancelResumeFrame: (() => void) | null = null;

  /**
   * Warm resume, closed by the frame that ends it.
   *
   * The span used to close on the next list load, on the assumption that coming
   * back to the foreground re-renders one. It does not: Android hands the app
   * back with its views intact, so the span stayed open until the reader
   * navigated somewhere — often minutes later. A device run reported ten resumes
   * as one 60000ms sample, which is the clamp, not a measurement.
   *
   * The first frame painted after the transition is both what the reader feels
   * as the app coming back and something that always happens.
   */
  let previousAppState: AppStateStatus = AppState.currentState;
  const appStateSubscription = AppState.addEventListener("change", (nextState) => {
    if (nextState === "active" && previousAppState !== "active") {
      cancelResumeFrame?.();
      beginMobileNavigationSpan("Resume");
      cancelResumeFrame = scheduleFrame(() => {
        cancelResumeFrame = null;
        completeMobileNavigationSpan("Resume");
      });
    } else if (nextState !== "active") {
      // Leaving the foreground before the frame lands makes the pending span a
      // measurement of nothing.
      cancelResumeFrame?.();
      cancelResumeFrame = null;
    }

    previousAppState = nextState;
  });

  const unobserve = observeMobileListLoads((route) => {
    const contentPhase = markMobileStartupPhase("content-visible");
    if (route) {
      completeMobileNavigationSpan(route);
    }

    // Interactive is the first idle *after* content: the queue draining is what
    // says the JS thread is free to answer a tap.
    if (contentPhase !== null && !interactiveHandle) {
      interactiveHandle = scheduleMobileIdleTask(() => {
        interactiveHandle = null;
        markMobileStartupPhase("interactive");
      });
    }
  });

  return () => {
    installed = false;
    interactiveHandle?.cancel();
    interactiveHandle = null;
    cancelResumeFrame?.();
    cancelResumeFrame = null;
    appStateSubscription.remove();
    unobserve();
  };
}
