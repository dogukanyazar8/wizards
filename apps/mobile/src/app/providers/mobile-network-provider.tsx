import { useEffect, useState, type PropsWithChildren } from "react";
import NetInfo from "@react-native-community/netinfo";
import { onlineManager } from "@tanstack/react-query";
import { AppState, View } from "react-native";

import { activeMobileCopy as copy } from "../../locale/mobile-locale-preferences";
import {
  toMobileNetworkStatus,
  type MobileNetworkStatus,
} from "../../network/mobile-network-contract";
import {
  setMobileNetworkStatusSnapshot,
  subscribeMobileOfflineMutationAttempt,
} from "../../network/mobile-network-events";
import { MobileOfflineBanner } from "../components/mobile-offline-banner";
import { useToast } from "../components/kit/toast";

export function MobileNetworkProvider({ children }: PropsWithChildren) {
  const [status, setStatus] = useState<MobileNetworkStatus>("unknown");
  const { showToast } = useToast();

  useEffect(() => {
    const applyNetworkState = (state: {
      readonly isConnected: boolean | null;
      readonly isInternetReachable: boolean | null;
    }) => {
      const next = toMobileNetworkStatus({
        isConnected: state.isConnected ?? null,
        isInternetReachable: state.isInternetReachable ?? null,
      });
      setStatus(next);
      setMobileNetworkStatusSnapshot(next);
      onlineManager.setOnline(next !== "offline");
    };
    const unsubscribeNetwork = NetInfo.addEventListener(applyNetworkState);
    const appStateSubscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        void NetInfo.refresh().then(applyNetworkState, () => {
          // Keep the last known state when the OS snapshot itself is unavailable.
        });
      }
    });
    const unsubscribeAttempts = subscribeMobileOfflineMutationAttempt(() => {
      showToast({ message: copy.offlineMutationMessage, tone: "warning" });
    });
    return () => {
      unsubscribeAttempts();
      unsubscribeNetwork();
      appStateSubscription.remove();
      setMobileNetworkStatusSnapshot("unknown");
      onlineManager.setOnline(true);
    };
  }, [showToast]);

  return (
    <View style={{ flex: 1 }}>
      {status === "offline" ? <MobileOfflineBanner /> : null}
      {children}
    </View>
  );
}
