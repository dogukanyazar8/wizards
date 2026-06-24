"use client";

import React from "react";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  APP_LOCALE_COOKIE_NAME,
  APP_LOCALE_STORAGE_KEY,
  DEFAULT_APP_LOCALE,
  detectBrowserLocale,
  interpolateMessage,
  normalizeAppLocale,
  type AppLocale,
  type TranslationDictionary,
} from "@/lib/locale/core";

type LocaleContextValue = {
  locale: AppLocale;
  setLocale: (locale: AppLocale) => void;
  t: (key: string, values?: Record<string, number | string>) => string;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

async function loadLocaleMessages(locale: AppLocale): Promise<TranslationDictionary> {
  if (locale === "tr") {
    const { TR_MESSAGES } = await import("@/lib/locale/messages/tr");
    return TR_MESSAGES;
  }

  const { EN_MESSAGES } = await import("@/lib/locale/messages/en");
  return EN_MESSAGES;
}

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
  initialMessages,
  initialLocale,
}: {
  children: ReactNode;
  initialMessages?: TranslationDictionary;
  initialLocale?: string | null;
}) {
  const normalizedInitialLocale = normalizeAppLocale(initialLocale);
  const [locale, setLocaleState] = useState<AppLocale>(() => normalizedInitialLocale);
  const [messagesByLocale, setMessagesByLocale] = useState<
    Partial<Record<AppLocale, TranslationDictionary>>
  >(() => (initialMessages ? { [normalizedInitialLocale]: initialMessages } : {}));

  useEffect(() => {
    let cancelled = false;
    const storedLocale =
      typeof window === "undefined" ? null : window.localStorage.getItem(APP_LOCALE_STORAGE_KEY);
    const nextLocale = storedLocale
      ? normalizeAppLocale(storedLocale)
      : initialLocale
        ? normalizeAppLocale(initialLocale)
        : detectBrowserLocale();

    void loadLocaleMessages(nextLocale)
      .then((messages) => {
        if (cancelled) {
          return;
        }

        setMessagesByLocale((currentMessages) => ({
          ...currentMessages,
          [nextLocale]: messages,
        }));
        setLocaleState((currentLocale) => {
          if (currentLocale === nextLocale) {
            writeLocalePersistence(currentLocale);
            return currentLocale;
          }

          writeLocalePersistence(nextLocale);
          return nextLocale;
        });
      })
      .catch(() => {
        if (cancelled) {
          return;
        }

        setLocaleState((currentLocale) => {
          writeLocalePersistence(currentLocale);
          return currentLocale;
        });
      });

    return () => {
      cancelled = true;
    };
  }, [initialLocale]);

  useEffect(() => {
    if (messagesByLocale[locale]) {
      return;
    }

    let cancelled = false;

    void loadLocaleMessages(locale).then((messages) => {
      if (cancelled) {
        return;
      }

      setMessagesByLocale((currentMessages) => ({
        ...currentMessages,
        [locale]: messages,
      }));
    });

    return () => {
      cancelled = true;
    };
  }, [locale, messagesByLocale]);

  useEffect(() => {
    writeLocalePersistence(locale);
  }, [locale]);

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      setLocale: (nextLocale) => {
        const normalizedLocale = normalizeAppLocale(nextLocale);
        writeLocalePersistence(normalizedLocale);
        setLocaleState(normalizedLocale);
        if (messagesByLocale[normalizedLocale]) {
          return;
        }

        void loadLocaleMessages(normalizedLocale)
          .then((messages) => {
            setMessagesByLocale((currentMessages) => ({
              ...currentMessages,
              [normalizedLocale]: messages,
            }));
          })
          .catch(() => {
            setLocaleState(normalizedLocale);
          });
      },
      t: (key, values) => {
        const messages =
          messagesByLocale[locale] ??
          messagesByLocale[DEFAULT_APP_LOCALE] ??
          initialMessages;
        const template = messages?.[key] ?? key;
        return interpolateMessage(template, values);
      },
    }),
    [initialMessages, locale, messagesByLocale],
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
