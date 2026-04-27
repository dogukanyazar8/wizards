"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  APP_LOCALE_COOKIE_NAME,
  APP_LOCALE_STORAGE_KEY,
  detectBrowserLocale,
  normalizeAppLocale,
  translate,
  type AppLocale,
} from "@/lib/locale";

type LocaleContextValue = {
  locale: AppLocale;
  setLocale: (locale: AppLocale) => void;
  t: (key: string, values?: Record<string, number | string>) => string;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

function writeLocalePersistence(locale: AppLocale) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(APP_LOCALE_STORAGE_KEY, locale);
  document.cookie = `${APP_LOCALE_COOKIE_NAME}=${locale}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
  document.documentElement.lang = locale;
}

export function LocaleProvider({
  children,
  initialLocale,
}: {
  children: ReactNode;
  initialLocale?: string | null;
}) {
  const [locale, setLocaleState] = useState<AppLocale>(() => normalizeAppLocale(initialLocale));

  useEffect(() => {
    if (initialLocale) {
      const nextLocale = normalizeAppLocale(initialLocale);

      setLocaleState((currentLocale) => {
        const resolvedLocale = currentLocale === nextLocale ? currentLocale : nextLocale;
        writeLocalePersistence(resolvedLocale);
        return resolvedLocale;
      });

      return;
    }

    const storedLocale =
      typeof window === "undefined"
        ? null
        : window.localStorage.getItem(APP_LOCALE_STORAGE_KEY);
    const nextLocale = storedLocale
      ? normalizeAppLocale(storedLocale)
      : detectBrowserLocale();

    setLocaleState((currentLocale) => {
      if (currentLocale === nextLocale) {
        writeLocalePersistence(currentLocale);
        return currentLocale;
      }

      writeLocalePersistence(nextLocale);
      return nextLocale;
    });
  }, [initialLocale]);

  useEffect(() => {
    writeLocalePersistence(locale);
  }, [locale]);

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      setLocale: (nextLocale) => setLocaleState(normalizeAppLocale(nextLocale)),
      t: (key, values) => translate(locale, key, values),
    }),
    [locale],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useI18n() {
  const context = useContext(LocaleContext);

  if (!context) {
    throw new Error("useI18n must be used within LocaleProvider.");
  }

  return context;
}
