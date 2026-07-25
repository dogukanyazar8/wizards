import { mobileCopy } from "./mobile-copy";
import { getMobileIntlLocale, type MobileLocale } from "./mobile-locale-preferences";

const DAY_MS = 86_400_000;

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

  const diffDays = Math.round((toLocalMidnight(now) - toLocalMidnight(date)) / DAY_MS);
  if (diffDays === 0) {
    return mobileCopy[locale].messageDateToday;
  }
  if (diffDays === 1) {
    return mobileCopy[locale].messageDateYesterday;
  }

  return formatMobileCalendarDate(date, locale, now);
}

function formatMobileCalendarDate(date: Date, locale: MobileLocale, now: Date): string {
  const includeYear = date.getFullYear() !== now.getFullYear();
  return new Intl.DateTimeFormat(getMobileIntlLocale(locale), {
    day: "numeric",
    month: "long",
    ...(includeYear ? { year: "numeric" } : {}),
  }).format(date);
}

/**
 * Right-column stamp on the 1a/1b channel rows: today collapses to the clock
 * time ("13:59"), yesterday to the relative label ("Dün"), anything older to the
 * calendar date. `now` is injectable for tests.
 */
export function formatMobileChannelRowTimestamp(
  value: string,
  locale: MobileLocale,
  now: Date = new Date(),
): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const diffDays = Math.round((toLocalMidnight(now) - toLocalMidnight(date)) / DAY_MS);
  if (diffDays === 0) {
    return new Intl.DateTimeFormat(getMobileIntlLocale(locale), {
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  }
  if (diffDays === 1) {
    return mobileCopy[locale].messageDateYesterday;
  }

  return formatMobileCalendarDate(date, locale, now);
}
