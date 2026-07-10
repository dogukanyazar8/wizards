import { getMobileIntlLocale, type MobileLocale } from "./mobile-locale-preferences";

export function formatMobileDateSeparator(value: string, locale: MobileLocale): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat(getMobileIntlLocale(locale), {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);
}
