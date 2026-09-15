import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { StyleSheet, useColorScheme, View } from "react-native";
import {
  formatSplashVersionLine,
  getSplashState,
  getSplashStep,
  isSplashComplete,
  resolveSplashEnvironment,
  SPLASH_FADE_OUT_MS,
  SPLASH_MIN_VISIBLE_MS,
  type SplashStateId,
  type SplashStepId,
} from "@wizards/types";

import {
  getMobileAppCodename,
  getMobileAppReleaseChannel,
  getMobileAppVersion,
} from "../about/mobile-app-identity";
import { useMobileAuth } from "../auth/mobile-auth-context";
import { getMobileTheme } from "../design/mobile-theme-runtime";
import { activeMobileCopy } from "../locale/mobile-locale-preferences";
import { getMobileNetworkStatusSnapshot } from "../network/mobile-network-events";
import { useMobileBootstrapQuery } from "../query/mobile-bootstrap-query";
import { useMobileRealtimeRuntime } from "./providers/mobile-realtime-provider";
import {
  advanceMobileSplashStep,
  toMobileSplashRuntime,
  type MobileSplashSignals,
} from "./screens/splash/mobile-splash-model";
import { MobileSplashScreen } from "./screens/splash/mobile-splash-screen";

/**
 * Mobil açılış ekranının sürücüsü — SPEC-SPLASH §8.
 *
 * Sağlayıcıların **içinde** durur çünkü adımların gerçek sinyalleri (oturum, bootstrap,
 * soket) orada. Fontlar yüklenene kadarki ilk kareyi `MobileFontGate` çiziyor; bu kapı
 * onun devamıdır.
 */

const TICK_MS = 1_000;

export function MobileSplashGate({ children }: { readonly children: ReactNode }) {
  const auth = useMobileAuth();
  const realtime = useMobileRealtimeRuntime();
  const colorScheme = useColorScheme();
  const bootstrapQuery = useMobileBootstrapQuery(auth.apiClient, auth.status === "signed-in");

  const [visible, setVisible] = useState(true);
  const [mounted, setMounted] = useState(true);
  const [step, setStep] = useState<SplashStepId>("connecting");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [networkStatus, setNetworkStatus] = useState(getMobileNetworkStatusSnapshot);
  const wasSignedInRef = useRef(false);
  const startedAtRef = useRef(Date.now());

  // Oturumun **bittiğini** ancak bir kez açılmış olmasından anlarız: soğuk açılışta
  // "signed-out" hiç giriş yapılmamış demek de olabilir ve ona "Oturumun sona erdi"
  // demek yanlış olurdu.
  if (auth.status === "signed-in" && !wasSignedInRef.current) {
    wasSignedInRef.current = true;
  }

  const sessionExpired = wasSignedInRef.current && auth.status === "signed-out";

  useEffect(() => {
    if (!mounted) {
      return undefined;
    }

    const interval = setInterval(() => {
      setElapsedMs(Date.now() - startedAtRef.current);
      setNetworkStatus(getMobileNetworkStatusSnapshot());
    }, TICK_MS);

    return () => clearInterval(interval);
  }, [mounted]);

  const signals: MobileSplashSignals = useMemo(
    () => ({
      authStatus: auth.status,
      bootstrapSettled: bootstrapQuery.isFetched,
      elapsedMs,
      networkStatus,
      realtimeStatus: realtime.connection.status,
      sessionExpired,
      // Açılış anında yürüyen bir APK indirmesi yok; alan sözleşmede duruyor ve
      // indirme akışı bağlandığında doldurulacak.
      update: null,
      workspaceLoaded: bootstrapQuery.isSuccess,
    }),
    [
      auth.status,
      bootstrapQuery.isFetched,
      bootstrapQuery.isSuccess,
      elapsedMs,
      networkStatus,
      realtime.connection.status,
      sessionExpired,
    ],
  );

  const runtime = useMemo(() => toMobileSplashRuntime(signals), [signals]);
  const nextStep = advanceMobileSplashStep(step, getSplashStep(runtime));

  if (nextStep !== step) {
    setStep(nextStep);
  }

  const state: SplashStateId = getSplashState(runtime);
  const isReady = isSplashComplete(runtime);

  useEffect(() => {
    if (!isReady || !visible) {
      return undefined;
    }

    const remaining = Math.max(0, SPLASH_MIN_VISIBLE_MS - (Date.now() - startedAtRef.current));
    const hideTimer = setTimeout(() => setVisible(false), remaining);

    return () => clearTimeout(hideTimer);
  }, [isReady, visible]);

  useEffect(() => {
    if (visible) {
      return undefined;
    }

    const unmountTimer = setTimeout(() => setMounted(false), SPLASH_FADE_OUT_MS);

    return () => clearTimeout(unmountTimer);
  }, [visible]);

  const theme = getMobileTheme("system", colorScheme);
  const environment = resolveSplashEnvironment(getMobileAppReleaseChannel());
  const version = getMobileAppVersion();
  const versionLine = formatSplashVersionLine({ version, codename: getMobileAppCodename(version) });

  return (
    <View style={styles.root}>
      {children}
      {mounted ? (
        <View
          pointerEvents={visible ? "auto" : "none"}
          style={[StyleSheet.absoluteFill, { opacity: visible ? 1 : 0 }]}
        >
          <MobileSplashScreen
            environmentLabel={
              environment === "prod"
                ? activeMobileCopy.splashEnvProd
                : activeMobileCopy.splashEnvUat
            }
            environmentTone={environment}
            state={state}
            step={step}
            theme={theme}
            versionLine={versionLine}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
