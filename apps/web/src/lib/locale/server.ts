import { cookies } from "next/headers";
import {
  APP_LOCALE_COOKIE_NAME,
  DEFAULT_APP_LOCALE,
  normalizeAppLocale,
  translate,
  type AppLocale,
} from "@/lib/locale";

export async function getRequestLocale(preferredLocale?: string | null): Promise<AppLocale> {
  if (preferredLocale) {
    return normalizeAppLocale(preferredLocale);
  }

  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get(APP_LOCALE_COOKIE_NAME)?.value;

  return cookieLocale ? normalizeAppLocale(cookieLocale) : DEFAULT_APP_LOCALE;
}

export async function getServerTranslator(preferredLocale?: string | null) {
  const locale = await getRequestLocale(preferredLocale);

  return {
    locale,
    t: (key: string, values?: Record<string, number | string>) =>
      translate(locale, key, values),
  };
}
