import { useEffect, useState, type PropsWithChildren } from "react";
import NetInfo from "@react-native-community/netinfo";
import { onlineManager } from "@tanstack/react-query";
import { View } from "react-native";

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
    const unsubscribeNetwork = NetInfo.addEventListener((state) => {
      const next = toMobileNetworkStatus({
        isConnected: state.isConnected ?? null,
        isInternetReachable: state.isInternetReachable ?? null,
      });
      setStatus(next);
      setMobileNetworkStatusSnapshot(next);
      onlineManager.setOnline(next !== "offline");
    });
    const unsubscribeAttempts = subscribeMobileOfflineMutationAttempt(() => {
      showToast({ message: copy.offlineMutationMessage, tone: "warning" });
    });
    return () => {
      unsubscribeAttempts();
      unsubscribeNetwork();
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
