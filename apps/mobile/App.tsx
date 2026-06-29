import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { MobileAuthProvider } from "./src/auth/mobile-auth-context";
import { WhisprMobileRoot } from "./src/app/whispr-mobile-root";

export default function App() {
  return (
    <SafeAreaProvider>
      <MobileAuthProvider>
        <WhisprMobileRoot />
        <StatusBar style="auto" />
      </MobileAuthProvider>
    </SafeAreaProvider>
  );
}
