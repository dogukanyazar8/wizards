import { AppState, InteractionManager, type AppStateStatus } from "react-native";

import { observeMobileListLoads } from "./mobile-performance-metrics";
import {
  beginMobileNavigationSpan,
  completeMobileNavigationSpan,
} from "./mobile-navigation-timing";
import { markMobileStartupPhase } from "./mobile-startup-phases";

let installed = false;

/**
 * Connects "content is on screen" to the two instruments that need it: the launch
 * timeline closes at the first meaningful content, and the tap that opened a route
 * closes when that route's content lands.
 *
 * Installed once, from the app root, so a screen does not have to know it is being
 * measured.
 */
export function installMobileTelemetryInstruments(): () => void {
  if (installed) {
    return () => undefined;
  }

  installed = true;
  let interactiveHandle: { cancel(): void } | null = null;

  /**
   * Warm resume had no instrument at all: the budget named it and nothing measured
   * it. The span opens when the app comes back to the foreground and closes on the
   * first content that renders after it — which is exactly what the reader waits
   * for when they switch back.
   */
  let previousAppState: AppStateStatus = AppState.currentState;
  const appStateSubscription = AppState.addEventListener("change", (nextState) => {
    if (nextState === "active" && previousAppState !== "active") {
      beginMobileNavigationSpan("Resume");
    }
    previousAppState = nextState;
  });

  const unobserve = observeMobileListLoads((route) => {
    const contentPhase = markMobileStartupPhase("content-visible");
    completeMobileNavigationSpan("Resume");
    if (route) {
      completeMobileNavigationSpan(route);
    }

    // Interactive is the first idle *after* content: the queue draining is what
    // says the JS thread is free to answer a tap.
    if (contentPhase !== null && !interactiveHandle) {
      interactiveHandle = InteractionManager.runAfterInteractions(() => {
        interactiveHandle = null;
        markMobileStartupPhase("interactive");
      });
    }
  });

  return () => {
    installed = false;
    interactiveHandle?.cancel();
    interactiveHandle = null;
    appStateSubscription.remove();
    unobserve();
  };
}
