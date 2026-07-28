import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";
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
interface MobileNetworkRuntime {
  /** Asks the OS again, right now. Resolves once the answer has been applied. */
  refresh(): Promise<void>;
  status: MobileNetworkStatus;
}

const MobileNetworkContext = createContext<MobileNetworkRuntime>({
  refresh: async () => {},
  status: "unknown",
});

export function useMobileNetworkStatus(): MobileNetworkStatus {
  return useContext(MobileNetworkContext).status;
}

/**
 * Re-reads the OS network state on demand.
 *
 * NetInfo only publishes when *it* notices a change, and the moment the user is
 * most likely to want an answer — they just turned Wi-Fi back on and tapped the
 * bar — is exactly the moment its listener has not fired yet.
 */
export function useMobileNetworkRefresh(): () => Promise<void> {
  return useContext(MobileNetworkContext).refresh;
}

export function MobileNetworkProvider({ children }: PropsWithChildren) {
  const [status, setStatus] = useState<MobileNetworkStatus>("unknown");
  const { showToast } = useToast();

  const applyNetworkState = useCallback(
    (state: {
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
    },
    [],
  );

  const refresh = useCallback(async () => {
    try {
      applyNetworkState(await NetInfo.refresh());
    } catch {
      // Keep the last known state when the OS snapshot itself is unavailable.
    }
  }, [applyNetworkState]);

  useEffect(() => {
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
  }, [applyNetworkState, showToast]);

  const runtime = useMemo(() => ({ refresh, status }), [refresh, status]);

  return (
    <MobileNetworkContext.Provider value={runtime}>
      {/* The offline bar itself lives in MobileConnectivityBanner, below the
          realtime provider, so network and socket state cannot render two
          competing bars. */}
      <View style={{ flex: 1 }}>{children}</View>
    </MobileNetworkContext.Provider>
  );
}
