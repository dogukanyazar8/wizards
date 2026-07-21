import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AppState } from "react-native";
import { useMobileAuth } from "../../auth/mobile-auth-context";
import {
  createCheckingMobileNotificationRuntimeState,
  createInitialMobileNotificationRuntimeState,
  type MobileNotificationRuntimeState,
} from "../../notifications/mobile-notification-contract";
import {
  requestMobileNotificationsAfterUserAction,
  syncMobileNotificationPermissionState,
} from "../../notifications/mobile-notification-runtime";

interface MobileNotificationRuntime {
  readonly refreshPermission: () => Promise<void>;
  readonly requestPermission: () => Promise<void>;
  readonly state: MobileNotificationRuntimeState;
}

const MobileNotificationRuntimeContext = createContext<MobileNotificationRuntime | null>(null);

export function MobileNotificationProvider({ children }: PropsWithChildren) {
  const { apiClient, status } = useMobileAuth();
  const [state, setState] = useState(createInitialMobileNotificationRuntimeState);
  const stateRef = useRef(state);
  const isRequestingRef = useRef(false);
  const isRefreshingRef = useRef(false);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const requestPermission = useCallback(async () => {
    isRequestingRef.current = true;
    setState((current) => createCheckingMobileNotificationRuntimeState(current));

    try {
      setState(await requestMobileNotificationsAfterUserAction(apiClient));
    } finally {
      isRequestingRef.current = false;
    }
  }, [apiClient]);

  const refreshPermission = useCallback(async () => {
    if (isRequestingRef.current || isRefreshingRef.current) {
      return;
    }

    isRefreshingRef.current = true;

    try {
      const nextState = await syncMobileNotificationPermissionState(
        status === "signed-in" ? apiClient : null,
        stateRef.current,
      );

      if (!isRequestingRef.current) {
        setState(nextState);
      }
    } finally {
      isRefreshingRef.current = false;
    }
  }, [apiClient, status]);

  useEffect(() => {
    void refreshPermission();

    const subscription = AppState.addEventListener("change", (nextAppState) => {
      if (nextAppState === "active") {
        void refreshPermission();
      }
    });

    return () => subscription.remove();
  }, [refreshPermission]);

  const value = useMemo(
    () => ({ refreshPermission, requestPermission, state }),
    [refreshPermission, requestPermission, state],
  );

  return (
    <MobileNotificationRuntimeContext.Provider value={value}>
      {children}
    </MobileNotificationRuntimeContext.Provider>
  );
}

export function useMobileNotificationRuntime(): MobileNotificationRuntime {
  const runtime = useContext(MobileNotificationRuntimeContext);
  if (!runtime) {
    throw new Error("Mobile notification provider is missing.");
  }

  return runtime;
}
