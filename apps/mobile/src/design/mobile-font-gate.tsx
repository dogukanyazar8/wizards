import { type ReactNode, useEffect, useRef, useState } from "react";

import { installMobileFontDefaults, useMobileFonts } from "./mobile-fonts";

export const MOBILE_FONT_FALLBACK_DIAGNOSTIC =
  "[mobile-fonts] vendored font load failed; using system fallback";

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

  return state === "loading" ? null : children;
}
