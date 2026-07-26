import { createContext, useContext, useEffect, useState, type PropsWithChildren } from "react";
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
import { useToast } from "../components/kit/toast";

/**
 * Read-only view of the network status. The module-level
 * snapshot in `mobile-network-events` stays the source for non-React callers
 * (the API client); surfaces that have to re-render when connectivity flips —
 * MobileConnectivityBanner, which merges network and socket state into one bar —
 * read this instead.
 *
 * Defaults to "unknown" rather than throwing so a component can be rendered in
 * isolation without standing the provider up.
 */
const MobileNetworkStatusContext = createContext<MobileNetworkStatus>("unknown");

export function useMobileNetworkStatus(): MobileNetworkStatus {
  return useContext(MobileNetworkStatusContext);
}

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
      showToast({ title: copy.offlineMutationMessage, variant: "warning" });
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
    <MobileNetworkStatusContext.Provider value={status}>
      {/* The offline bar itself lives in MobileConnectivityBanner, below the
          realtime provider, so network and socket state cannot render two
          competing bars. */}
      <View style={{ flex: 1 }}>{children}</View>
    </MobileNetworkStatusContext.Provider>
  );
}
