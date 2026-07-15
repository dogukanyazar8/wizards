import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { getLocales } from "expo-localization";
import { AppState } from "react-native";
import { mobileLocalePreferenceRepository } from "../../locale/expo-mobile-locale-preferences";
import {
  DEFAULT_MOBILE_LOCALE,
  resolveMobileLocaleFromDeviceLocales,
  setActiveMobileLocale,
  type MobileLocale,
  type MobileLocalePreference,
} from "../../locale/mobile-locale-preferences";

interface MobileLocaleRuntime {
  readonly locale: MobileLocale;
  readonly selectLocale: (locale: MobileLocale) => void;
  readonly setUseDeviceLocale: (enabled: boolean) => void;
  readonly usingDeviceLocale: boolean;
}

const MobileLocaleRuntimeContext = createContext<MobileLocaleRuntime | null>(null);

const INITIAL_LOCALE_PREFERENCE: MobileLocalePreference = {
  locale: DEFAULT_MOBILE_LOCALE,
  mode: "manual",
};

function resolveRuntimeLocale(preference: MobileLocalePreference): MobileLocale {
  return preference.mode === "device"
    ? resolveMobileLocaleFromDeviceLocales(getLocales())
    : preference.locale;
}

export function MobileLocaleProvider({ children }: PropsWithChildren) {
  const [locale, setLocale] = useState<MobileLocale>(DEFAULT_MOBILE_LOCALE);
  const [preference, setPreference] = useState<MobileLocalePreference>(INITIAL_LOCALE_PREFERENCE);

  const applyPreference = useCallback((nextPreference: MobileLocalePreference) => {
    setPreference(nextPreference);
    setLocale(setActiveMobileLocale(resolveRuntimeLocale(nextPreference)));
  }, []);

  useEffect(() => {
    let isMounted = true;

    mobileLocalePreferenceRepository
      .load()
      .then((storedLocale) => {
        if (!isMounted) {
          return;
        }

        applyPreference(storedLocale);
      })
      .catch(() => {
        if (!isMounted) {
          return;
        }

        applyPreference(INITIAL_LOCALE_PREFERENCE);
      });

    return () => {
      isMounted = false;
    };
  }, [applyPreference]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active" && preference.mode === "device") {
        setLocale(setActiveMobileLocale(resolveRuntimeLocale(preference)));
      }
    });

    return () => subscription.remove();
  }, [preference]);

  const selectLocale = useCallback((nextLocale: MobileLocale) => {
    const nextPreference: MobileLocalePreference = {
      locale: nextLocale,
      mode: "manual",
    };
    applyPreference(nextPreference);
    void mobileLocalePreferenceRepository.save(nextPreference).catch(() => undefined);
  }, [applyPreference]);

  const setUseDeviceLocale = useCallback((enabled: boolean) => {
    const manualLocale = preference.mode === "device" ? preference.manualLocale : preference.locale;
    const nextPreference: MobileLocalePreference = enabled
      ? { manualLocale, mode: "device" }
      : { locale: manualLocale, mode: "manual" };
    applyPreference(nextPreference);
    void mobileLocalePreferenceRepository.save(nextPreference).catch(() => undefined);
  }, [applyPreference, preference]);

  const value = useMemo(
    () => ({
      locale,
      selectLocale,
      setUseDeviceLocale,
      usingDeviceLocale: preference.mode === "device",
    }),
    [locale, preference.mode, selectLocale, setUseDeviceLocale],
  );

  return (
    <MobileLocaleRuntimeContext.Provider value={value}>
      {children}
    </MobileLocaleRuntimeContext.Provider>
  );
}

export function useMobileLocaleRuntime(): MobileLocaleRuntime {
  const runtime = useContext(MobileLocaleRuntimeContext);
  if (!runtime) {
    throw new Error("Mobile locale provider is missing.");
  }

  return runtime;
}
