import { type ReactNode, useEffect, useRef, useState } from "react";
import { useColorScheme } from "react-native";
import { formatSplashVersionLine, resolveSplashEnvironment } from "@wizards/types";

import {
  getMobileAppCodename,
  getMobileAppReleaseChannel,
  getMobileAppVersion,
} from "../about/mobile-app-identity";
import { activeMobileCopy } from "../locale/mobile-locale-preferences";
import { MobileSplashScreen } from "../app/screens/splash/mobile-splash-screen";
import { getMobileTheme } from "./mobile-theme-runtime";

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

  if (state !== "loading") {
    return children;
  }

  // Fontlar gelene kadarki ilk kare boş bırakılmaz: açılış ekranının aynısı, sistem
  // yüzüyle çizilir (SPEC-SPLASH §6). Ölçüler yüz ailesine değil sabit px değerlerine
  // bağlı olduğu için kare fallback yüzde de kırılmaz.
  return <MobileFontGateSplash />;
}

function MobileFontGateSplash() {
  const colorScheme = useColorScheme();
  const version = getMobileAppVersion();
  const environment = resolveSplashEnvironment(getMobileAppReleaseChannel());

  return (
    <MobileSplashScreen
      environmentLabel={
        environment === "prod" ? activeMobileCopy.splashEnvProd : activeMobileCopy.splashEnvUat
      }
      environmentTone={environment}
      step="connecting"
      theme={getMobileTheme("system", colorScheme)}
      versionLine={formatSplashVersionLine({ version, codename: getMobileAppCodename(version) })}
    />
  );
}
