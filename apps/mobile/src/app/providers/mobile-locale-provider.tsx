import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { mobileLocalePreferenceRepository } from "../../locale/expo-mobile-locale-preferences";
import {
  DEFAULT_MOBILE_LOCALE,
  setActiveMobileLocale,
  type MobileLocale,
} from "../../locale/mobile-locale-preferences";

interface MobileLocaleRuntime {
  readonly locale: MobileLocale;
  readonly selectLocale: (locale: MobileLocale) => void;
}

const MobileLocaleRuntimeContext = createContext<MobileLocaleRuntime | null>(null);

export function MobileLocaleProvider({ children }: PropsWithChildren) {
  const [locale, setLocale] = useState<MobileLocale>(DEFAULT_MOBILE_LOCALE);

  useEffect(() => {
    let isMounted = true;

    mobileLocalePreferenceRepository
      .load()
      .then((storedLocale) => {
        if (!isMounted) {
          return;
        }

        setLocale(setActiveMobileLocale(storedLocale));
      })
      .catch(() => {
        if (!isMounted) {
          return;
        }

        setLocale(setActiveMobileLocale(DEFAULT_MOBILE_LOCALE));
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const selectLocale = useCallback((nextLocale: MobileLocale) => {
    const normalizedLocale = setActiveMobileLocale(nextLocale);
    setLocale(normalizedLocale);
    void mobileLocalePreferenceRepository.save(normalizedLocale).catch(() => undefined);
  }, []);

  const value = useMemo(() => ({ locale, selectLocale }), [locale, selectLocale]);

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
