import type { MobileLocale } from "./mobile-copy";

/**
 * "Hakkında" handoff §6: `48,2 MB` and `12,4B üye` in Turkish, `48.2 MB` and
 * `12.4K` in English. Both screens that print these numbers (1d download meta,
 * 2g member counts) render them inside sentences the copy dictionary owns, so
 * the formatting lives here rather than in either screen.
 *
 * `Intl.NumberFormat` is not used: Hermes ships without full ICU on Android
 * unless the build opts in, and a locale it cannot resolve silently falls back
 * to `en-US` — which would print `48.2 MB` on a Turkish phone. The two rules
 * this design needs are a decimal separator and a compact suffix, so they are
 * spelled out.
 */
const DECIMAL_SEPARATOR: Record<MobileLocale, string> = { en: ".", tr: "," };

/** Handoff §3.4/§3.6 only ever shows MB; the larger units are for completeness. */
const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB"] as const;

/** Turkish abbreviates "bin"/"milyon"; English uses the K/M/B ladder. */
const COMPACT_SUFFIXES: Record<MobileLocale, readonly string[]> = {
  en: ["", "K", "M", "B"],
  tr: ["", "B", "Mn", "Mr"],
};

function formatDecimal(value: number, fractionDigits: number, locale: MobileLocale): string {
  const fixed = value.toFixed(fractionDigits);

  // `toFixed` can round 999.95 up to "1000.0"; the caller has already chosen the
  // unit by then, so trailing ".0" is dropped rather than re-scaled.
  const trimmed = fixed.endsWith(".0") ? fixed.slice(0, -2) : fixed;
  return trimmed.replace(".", DECIMAL_SEPARATOR[locale]);
}

/**
 * `formatMobileBytes(48_234_496, "tr")` → `"48,2 MB"`.
 * Non-finite or negative inputs collapse to `0 B`: a size the client could not
 * read is not a size it should invent a number for.
 */
export function formatMobileBytes(bytes: number, locale: MobileLocale): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return `0 ${BYTE_UNITS[0]}`;
  }

  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < BYTE_UNITS.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  // Bytes and kilobytes are never shown with a fraction — "1,4 KB" reads as
  // precision the number does not carry.
  const fractionDigits = unitIndex >= 2 && value < 100 ? 1 : 0;
  return `${formatDecimal(value, fractionDigits, locale)} ${BYTE_UNITS[unitIndex]}`;
}

/**
 * `formatMobileCompactCount(12_400, "tr")` → `"12,4B"`, `"12.4K"` in English.
 * Counts below 1000 print as themselves, so "9 makale" never becomes "0,0B".
 */
export function formatMobileCompactCount(count: number, locale: MobileLocale): string {
  if (!Number.isFinite(count)) {
    return "0";
  }

  const sign = count < 0 ? "-" : "";
  let value = Math.abs(Math.trunc(count));
  const suffixes = COMPACT_SUFFIXES[locale];

  if (value < 1000) {
    return `${sign}${value}`;
  }

  let suffixIndex = 0;
  while (value >= 1000 && suffixIndex < suffixes.length - 1) {
    value /= 1000;
    suffixIndex += 1;
  }

  // §6's examples ("12,4B", "1,2B") keep one decimal below 100 and drop it
  // above, so "124B" does not become the wider "124,0B".
  const fractionDigits = value < 100 ? 1 : 0;
  return `${sign}${formatDecimal(value, fractionDigits, locale)}${suffixes[suffixIndex]}`;
}
