import { mobileCopy } from "./mobile-copy";
import { getMobileIntlLocale, type MobileLocale } from "./mobile-locale-preferences";

function toLocalMidnight(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/**
 * Channel/DM date separators (README 1b): show "Bugün"/"Dün" for the current and
 * previous calendar day, "18 Mayıs" for older dates in the current year, and only
 * append the year for other years ("18 Mayıs 2025"). `now` is injectable for tests.
 */
export function formatMobileDateSeparator(
  value: string,
  locale: MobileLocale,
  now: Date = new Date(),
): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const diffDays = Math.round((toLocalMidnight(now) - toLocalMidnight(date)) / 86_400_000);
  if (diffDays === 0) {
    return mobileCopy[locale].messageDateToday;
  }
  if (diffDays === 1) {
    return mobileCopy[locale].messageDateYesterday;
  }

  const includeYear = date.getFullYear() !== now.getFullYear();
  return new Intl.DateTimeFormat(getMobileIntlLocale(locale), {
    day: "numeric",
    month: "long",
    ...(includeYear ? { year: "numeric" } : {}),
  }).format(date);
}
