import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { MobileAuthProvider } from "./src/auth/mobile-auth-context";
import { mobileAppLockPreferenceStore } from "./src/auth/expo-mobile-app-lock-preference-store";
import { MobileBootstrapErrorBoundary, MobileErrorBoundary } from "./src/app/mobile-error-boundary";
import { MobileQueryProvider } from "./src/app/providers/mobile-query-provider";
import { MobileThemeProvider } from "./src/app/providers/mobile-theme-provider";
import { MobileThemeSystemSurfaces } from "./src/app/providers/mobile-theme-system-surfaces";
import { MobileHapticsProvider } from "./src/app/providers/mobile-haptics-provider";
import { MobileNetworkProvider } from "./src/app/providers/mobile-network-provider";
import { ToastProvider } from "./src/app/components/kit/toast";
import { WhisprMobileRoot } from "./src/app/whispr-mobile-root";
import { expoMobileBiometricAuthenticator } from "./src/security/expo-mobile-app-lock";
import { expoMobileDeviceIntegrityDetector } from "./src/security/expo-mobile-device-integrity";
import { mobileSecuritySignalLogger } from "./src/security/mobile-security-signal-logger";

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <MobileBootstrapErrorBoundary>
          <MobileQueryProvider>
            <MobileThemeProvider>
              <ToastProvider>
                <MobileHapticsProvider>
                  <MobileNetworkProvider>
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
                  </MobileNetworkProvider>
                </MobileHapticsProvider>
              </ToastProvider>
            </MobileThemeProvider>
          </MobileQueryProvider>
        </MobileBootstrapErrorBoundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
