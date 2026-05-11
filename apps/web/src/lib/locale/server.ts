import { cookies, headers } from "next/headers";
import {
  APP_LOCALE_COOKIE_NAME,
  DEFAULT_APP_LOCALE,
  normalizeAppLocale,
  translate,
  type AppLocale,
} from "@/lib/locale";

function getHeaderLocale(acceptLanguage: string | null): AppLocale | null {
  if (!acceptLanguage) {
    return null;
  }

  const requestedLocales = acceptLanguage
    .split(",")
    .map((part) => part.trim().split(";")[0]?.toLowerCase())
    .filter(Boolean);

  for (const locale of requestedLocales) {
    if (locale === "tr" || locale?.startsWith("tr-")) {
      return "tr";
    }

    if (locale === "en" || locale?.startsWith("en-")) {
      return "en";
    }
  }

  return null;
}

export async function getRequestLocale(preferredLocale?: string | null): Promise<AppLocale> {
  if (preferredLocale) {
    return normalizeAppLocale(preferredLocale);
  }

  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get(APP_LOCALE_COOKIE_NAME)?.value;
  const headerStore = await headers();
  const headerLocale = getHeaderLocale(headerStore.get("accept-language"));

  return cookieLocale ? normalizeAppLocale(cookieLocale) : (headerLocale ?? DEFAULT_APP_LOCALE);
}

export async function getServerTranslator(preferredLocale?: string | null) {
  const locale = await getRequestLocale(preferredLocale);

  return {
    locale,
    t: (key: string, values?: Record<string, number | string>) => translate(locale, key, values),
  };
}
