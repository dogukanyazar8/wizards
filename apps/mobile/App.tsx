import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { enableFreeze } from "react-native-screens";
import { MobileAuthProvider } from "./src/auth/mobile-auth-context";

// Freeze (skip re-rendering) screens that are not on top of the stack or the
// focused tab. Blurred screens keep their state but stop reacting to realtime,
// voice-level, and typing ticks — the main source of app-wide re-render churn.
enableFreeze(true);
import { mobileAppLockPreferenceStore } from "./src/auth/expo-mobile-app-lock-preference-store";
import { MobileBootstrapErrorBoundary, MobileErrorBoundary } from "./src/app/mobile-error-boundary";
import { MobileQueryProvider } from "./src/app/providers/mobile-query-provider";
import { MobileThemeProvider } from "./src/app/providers/mobile-theme-provider";
import { MobileThemeSystemSurfaces } from "./src/app/providers/mobile-theme-system-surfaces";
import { MobileHapticsProvider } from "./src/app/providers/mobile-haptics-provider";
import { MobileNetworkProvider } from "./src/app/providers/mobile-network-provider";
import { ToastProvider } from "./src/app/components/kit/toast";
import { MobilePrivacyShield } from "./src/app/components/mobile-privacy-shield";
import { MobileStartupPerformanceMarker } from "./src/app/components/mobile-startup-performance-marker";
import { WhisprMobileRoot } from "./src/app/whispr-mobile-root";
import { expoMobileBiometricAuthenticator } from "./src/security/expo-mobile-app-lock";
import { expoMobileDeviceIntegrityDetector } from "./src/security/expo-mobile-device-integrity";
import { mobileSecuritySignalLogger } from "./src/security/mobile-security-signal-logger";

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        {/* Tracks the IME per frame. Android runs edge-to-edge, so the window is
            never resized for the keyboard and every avoiding surface below reads
            its height from here. */}
        <KeyboardProvider>
          <MobileBootstrapErrorBoundary>
            <MobileQueryProvider>
              <MobileThemeProvider>
                <ToastProvider>
                  <MobileHapticsProvider>
                    <MobileNetworkProvider>
                      <MobileStartupPerformanceMarker />
                      <MobileErrorBoundary>
                        <MobileAuthProvider
                          appLockPreferenceStore={mobileAppLockPreferenceStore}
                          biometricAuthenticator={expoMobileBiometricAuthenticator}
                          deviceIntegrityDetector={expoMobileDeviceIntegrityDetector}
                          securitySignalLogger={mobileSecuritySignalLogger}
                        >
                          <WhisprMobileRoot />
                        </MobileAuthProvider>
                        <MobileThemeSystemSurfaces />
                      </MobileErrorBoundary>
                      <MobilePrivacyShield />
                    </MobileNetworkProvider>
                  </MobileHapticsProvider>
                </ToastProvider>
              </MobileThemeProvider>
            </MobileQueryProvider>
          </MobileBootstrapErrorBoundary>
        </KeyboardProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
