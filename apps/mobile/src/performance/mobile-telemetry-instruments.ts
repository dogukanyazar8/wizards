import { InteractionManager } from "react-native";

import { signalMobileContentVisible } from "./mobile-content-visible";
import { completeMobileNavigationSpan } from "./mobile-navigation-timing";
import { observeMobileListLoads } from "./mobile-performance-metrics";
import { markMobileStartupPhase } from "./mobile-startup-phases";

let installed = false;

/**
 * Connects visible content to launch and tap-to-content instruments. AppState
 * owns list-driven content timing. The visible overview foreground checkpoint
 * owns warm-resume timing because a list may stay mounted after foregrounding.
 */
export function installMobileTelemetryInstruments(): () => void {
  if (installed) {
    return () => undefined;
  }

  installed = true;
  let interactiveHandle: { cancel(): void } | null = null;
  const unobserve = observeMobileListLoads((route) => {
    const { startupElapsedMs: contentPhase } = signalMobileContentVisible();
    if (route) {
      completeMobileNavigationSpan(route);
    }

    // Interactive is the first idle after content: the queue draining says the
    // JS thread is free to answer a tap.
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
