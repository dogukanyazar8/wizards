import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { MobileAuthProvider } from "./src/auth/mobile-auth-context";
import { MobileErrorBoundary } from "./src/app/mobile-error-boundary";
import { MobileQueryProvider } from "./src/app/providers/mobile-query-provider";
import { WhisprMobileRoot } from "./src/app/whispr-mobile-root";
import { expoMobileDeviceIntegrityDetector } from "./src/security/expo-mobile-device-integrity";
import { mobileSecuritySignalLogger } from "./src/security/mobile-security-signal-logger";

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <MobileErrorBoundary>
          <MobileAuthProvider
            deviceIntegrityDetector={expoMobileDeviceIntegrityDetector}
            securitySignalLogger={mobileSecuritySignalLogger}
          >
            <MobileQueryProvider>
              <WhisprMobileRoot />
              <StatusBar style="auto" />
            </MobileQueryProvider>
          </MobileAuthProvider>
        </MobileErrorBoundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
