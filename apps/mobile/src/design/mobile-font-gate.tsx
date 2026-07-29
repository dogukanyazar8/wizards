import { type ReactNode, useEffect, useRef, useState } from "react";

import { installMobileFontDefaults, useMobileFonts } from "./mobile-fonts";

export const MOBILE_FONT_FALLBACK_DIAGNOSTIC =
  "[mobile-fonts] vendored font load failed; using system fallback";

/**
 * How long the first frame may wait for the vendored faces.
 *
 * Holding the tree until they resolve is the right default: it is what stops the
 * app from redrawing itself in a different face a moment after launch. Holding it
 * *indefinitely* was not — a slow font read showed a blank window for as long as
 * it took. Past this deadline the app draws with the system face, and the load is
 * still running: whenever it lands the effect below installs the real faces.
 */
export const MOBILE_FONT_GATE_DEADLINE_MS = 600;

type MobileFontGateState = "fallback" | "loading" | "ready";

export function MobileFontGate({ children }: { readonly children: ReactNode }) {
  const [fontsLoaded, fontError] = useMobileFonts();
  const [state, setState] = useState<MobileFontGateState>("loading");
  const fallbackReported = useRef(false);

  useEffect(() => {
    if (fontsLoaded) {
      installMobileFontDefaults();
      setState("ready");
      return;
    }

    if (fontError) {
      if (!fallbackReported.current) {
        fallbackReported.current = true;
        console.warn(MOBILE_FONT_FALLBACK_DIAGNOSTIC);
      }
      setState("fallback");
    }
  }, [fontError, fontsLoaded]);

  useEffect(() => {
    if (fontsLoaded || fontError) {
      return;
    }

    const deadline = setTimeout(() => {
      setState((current) => (current === "loading" ? "fallback" : current));
    }, MOBILE_FONT_GATE_DEADLINE_MS);

    return () => {
      clearTimeout(deadline);
    };
  }, [fontError, fontsLoaded]);

  return state === "loading" ? null : children;
}
