"use client";

import { useEffect } from "react";
import { APP_LOCALE_STORAGE_KEY, normalizeAppLocale } from "@/lib/locale/core";
import { useI18n } from "@/components/providers/locale-provider";

type LocaleSessionSyncProps = {
  preferredLocale?: string | null;
};

export function LocaleSessionSync({ preferredLocale }: LocaleSessionSyncProps) {
  const { locale, setLocale } = useI18n();

  useEffect(() => {
    if (!preferredLocale) {
      return;
    }

    const nextLocale = normalizeAppLocale(preferredLocale);
    const storedLocale =
      typeof window === "undefined"
        ? null
        : window.localStorage.getItem(APP_LOCALE_STORAGE_KEY);

    if (storedLocale && normalizeAppLocale(storedLocale) !== nextLocale) {
      return;
    }

    if (nextLocale !== locale) {
      setLocale(nextLocale);
    }
  }, [locale, preferredLocale, setLocale]);

  return null;
}
