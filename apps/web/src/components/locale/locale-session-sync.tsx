"use client";

import { useEffect } from "react";
import { normalizeAppLocale } from "@/lib/locale/core";
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

    if (nextLocale !== locale) {
      setLocale(nextLocale);
    }
  }, [locale, preferredLocale, setLocale]);

  return null;
}
