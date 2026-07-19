import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";

import {
  DEFAULT_MOBILE_NOTIFICATION_PREFERENCES,
  loadMobileNotificationPreferences,
  saveMobileNotificationPreferences,
  type MobileNotificationPreferenceStorage,
  type MobileNotificationPreferences,
} from "../../notifications/mobile-notification-preferences";

interface MobileNotificationPreferencesRuntime {
  readonly preferences: MobileNotificationPreferences;
  updatePreferences(patch: Partial<MobileNotificationPreferences>): void;
}

const MobileNotificationPreferencesContext =
  createContext<MobileNotificationPreferencesRuntime | null>(null);

const asyncStorageAdapter: MobileNotificationPreferenceStorage = {
  getItemAsync(key) {
    return AsyncStorage.getItem(key);
  },
  async setItemAsync(key, value) {
    await AsyncStorage.setItem(key, value);
  },
};

export function MobileNotificationPreferencesProvider({
  children,
  storage = asyncStorageAdapter,
}: PropsWithChildren<{ readonly storage?: MobileNotificationPreferenceStorage }>) {
  const [preferences, setPreferences] = useState<MobileNotificationPreferences>(
    DEFAULT_MOBILE_NOTIFICATION_PREFERENCES,
  );
  const userSelectionVersion = useRef(0);

  useEffect(() => {
    let active = true;
    const selectionVersionAtStart = userSelectionVersion.current;

    void loadMobileNotificationPreferences(storage).then((stored) => {
      if (active && userSelectionVersion.current === selectionVersionAtStart) {
        setPreferences(stored);
      }
    });

    return () => {
      active = false;
    };
  }, [storage]);

  const updatePreferences = useCallback(
    (patch: Partial<MobileNotificationPreferences>) => {
      userSelectionVersion.current += 1;
      setPreferences((current) => {
        const next = { ...current, ...patch };
        void saveMobileNotificationPreferences(storage, next).catch(() => undefined);
        return next;
      });
    },
    [storage],
  );

  const value = useMemo<MobileNotificationPreferencesRuntime>(
    () => ({ preferences, updatePreferences }),
    [preferences, updatePreferences],
  );

  return (
    <MobileNotificationPreferencesContext.Provider value={value}>
      {children}
    </MobileNotificationPreferencesContext.Provider>
  );
}

export function useMobileNotificationPreferences(): MobileNotificationPreferencesRuntime {
  const runtime = useContext(MobileNotificationPreferencesContext);

  if (!runtime) {
    throw new Error(
      "useMobileNotificationPreferences must be used within MobileNotificationPreferencesProvider",
    );
  }

  return runtime;
}
