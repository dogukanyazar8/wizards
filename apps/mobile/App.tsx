import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { MobileAuthProvider } from "./src/auth/mobile-auth-context";
import { MobileBootstrapErrorBoundary, MobileErrorBoundary } from "./src/app/mobile-error-boundary";
import { MobileQueryProvider } from "./src/app/providers/mobile-query-provider";
import { MobileThemeProvider } from "./src/app/providers/mobile-theme-provider";
import { MobileThemeSystemSurfaces } from "./src/app/providers/mobile-theme-system-surfaces";
import { WhisprMobileRoot } from "./src/app/whispr-mobile-root";
import { expoMobileDeviceIntegrityDetector } from "./src/security/expo-mobile-device-integrity";
import { mobileSecuritySignalLogger } from "./src/security/mobile-security-signal-logger";

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <MobileBootstrapErrorBoundary>
          <MobileQueryProvider>
            <MobileThemeProvider>
              <MobileErrorBoundary>
                <MobileAuthProvider
                  deviceIntegrityDetector={expoMobileDeviceIntegrityDetector}
                  securitySignalLogger={mobileSecuritySignalLogger}
                >
                  <WhisprMobileRoot />
                </MobileAuthProvider>
                <MobileThemeSystemSurfaces />
              </MobileErrorBoundary>
            </MobileThemeProvider>
          </MobileQueryProvider>
        </MobileBootstrapErrorBoundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
