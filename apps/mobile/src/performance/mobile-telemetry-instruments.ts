import { InteractionManager } from "react-native";

import { observeMobileListLoads } from "./mobile-performance-metrics";
import { completeMobileNavigationSpan } from "./mobile-navigation-timing";
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
  const unobserve = observeMobileListLoads((route) => {
    const contentPhase = markMobileStartupPhase("content-visible");
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
    unobserve();
  };
}
