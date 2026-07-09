import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { useMobileAuth } from "../../auth/mobile-auth-context";
import {
  createCheckingMobileNotificationRuntimeState,
  createInitialMobileNotificationRuntimeState,
  type MobileNotificationRuntimeState,
} from "../../notifications/mobile-notification-contract";
import { requestMobileNotificationsAfterUserAction } from "../../notifications/mobile-notification-runtime";

interface MobileNotificationRuntime {
  readonly requestPermission: () => Promise<void>;
  readonly state: MobileNotificationRuntimeState;
}

const MobileNotificationRuntimeContext = createContext<MobileNotificationRuntime | null>(null);

export function MobileNotificationProvider({ children }: PropsWithChildren) {
  const { apiClient } = useMobileAuth();
  const [state, setState] = useState(createInitialMobileNotificationRuntimeState);

  const requestPermission = useCallback(async () => {
    setState((current) => createCheckingMobileNotificationRuntimeState(current));
    setState(await requestMobileNotificationsAfterUserAction(apiClient));
  }, [apiClient]);

  const value = useMemo(() => ({ requestPermission, state }), [requestPermission, state]);

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
