import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";

import {
  createInitialMobileConnectivityPresentation,
  planMobileConnectivityPresentation,
  type MobileConnectivityHealth,
  type MobileConnectivityPhase,
} from "../mobile-connectivity-presentation";

/**
 * The phase the one connectivity bar is currently in, readable from anywhere
 * below the realtime provider.
 *
 * The bar renders as a sibling of the screens, so it cannot tell them anything
 * on its own — and that is exactly how the app ended up saying the same outage
 * twice: the global bar announced "İnternet yok" while the per-screen sync bar
 * added "Bağlantı toparlanamadı" underneath it. Publishing the phase lets the
 * screen-level surfaces stand down while the bar owns the story.
 *
 * Defaults to "hidden" so a surface rendered in isolation keeps behaving as it
 * did before the provider existed.
 */
const MobileConnectivityPhaseContext = createContext<MobileConnectivityPhase>("hidden");

export function useMobileConnectivityPhase(): MobileConnectivityPhase {
  return useContext(MobileConnectivityPhaseContext);
}

export function MobileConnectivityPhaseProvider({
  children,
  phase,
}: {
  children: ReactNode;
  phase: MobileConnectivityPhase;
}) {
  return (
    <MobileConnectivityPhaseContext.Provider value={phase}>
      {children}
    </MobileConnectivityPhaseContext.Provider>
  );
}

/**
 * Turns a health verdict into the phase the bar should be in *right now*.
 *
 * Timing is the whole point and it lives here rather than in the bar, because
 * the phase is shared state: the bar draws it and the screens below read it, so
 * two copies of the same timer would eventually disagree.
 */
export function useMobileConnectivityPhaseState(
  health: MobileConnectivityHealth,
): MobileConnectivityPhase {
  const [presentation, setPresentation] = useState(createInitialMobileConnectivityPresentation);
  const healthSinceRef = useRef(Date.now());
  const lastHealthRef = useRef(health);

  useEffect(() => {
    if (lastHealthRef.current !== health) {
      lastHealthRef.current = health;
      healthSinceRef.current = Date.now();
    }

    const replan = () =>
      setPresentation((current) =>
        planMobileConnectivityPresentation({
          health,
          healthSince: healthSinceRef.current,
          now: Date.now(),
          previous: current,
        }),
      );

    replan();

    if (presentation.nextCheckInMs === null) {
      return;
    }

    const timer = setTimeout(replan, presentation.nextCheckInMs);
    return () => clearTimeout(timer);
  }, [health, presentation]);

  return presentation.phase;
}
