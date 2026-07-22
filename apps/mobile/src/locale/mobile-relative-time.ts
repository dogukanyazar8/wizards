type MobileRelativeTimeUnit = "second" | "minute" | "hour" | "day" | "month" | "year";

function formatMobileRelativeTimeFallback(
  value: number,
  unit: MobileRelativeTimeUnit,
  locale: "en" | "tr",
): string {
  if (locale === "tr") {
    if (value === 0) return "şimdi";
    if (value === 1 && unit === "day") return "dün";
    if (value === 1 && unit === "month") return "geçen ay";
    if (value === 1 && unit === "year") return "geçen yıl";

    const unitLabels: Record<MobileRelativeTimeUnit, string> = {
      second: "saniye",
      minute: "dakika",
      hour: "saat",
      day: "gün",
      month: "ay",
      year: "yıl",
    };
    return `${value} ${unitLabels[unit]} önce`;
  }

  if (value === 0) return "now";
  if (value === 1 && unit === "day") return "yesterday";
  if (value === 1 && unit === "month") return "last month";
  if (value === 1 && unit === "year") return "last year";
  return `${value} ${unit}${value === 1 ? "" : "s"} ago`;
}

/** Locale-aware "X önce" formatter shared by 4a last-seen and 8c thread summaries. */
export function formatMobileRelativeTime(
  timestampIso: string,
  locale: "en" | "tr",
  now = Date.now(),
): string {
  const timestamp = Date.parse(timestampIso);
  if (!Number.isFinite(timestamp)) return "";

  const elapsedSeconds = Math.max(0, Math.floor((now - timestamp) / 1_000));
  const elapsedMinutes = Math.floor(elapsedSeconds / 60);
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  const elapsedDays = Math.floor(elapsedHours / 24);
  const elapsedMonths = Math.floor(elapsedDays / 30);
  const [value, unit]: readonly [number, MobileRelativeTimeUnit] =
    elapsedSeconds < 60
      ? [elapsedSeconds, "second"]
      : elapsedMinutes < 60
        ? [elapsedMinutes, "minute"]
        : elapsedHours < 24
          ? [elapsedHours, "hour"]
          : elapsedDays < 30
            ? [elapsedDays, "day"]
            : elapsedMonths < 12
              ? [elapsedMonths, "month"]
              : [Math.floor(elapsedMonths / 12), "year"];

  if (typeof Intl.RelativeTimeFormat !== "function") {
    return formatMobileRelativeTimeFallback(value, unit, locale);
  }

  return new Intl.RelativeTimeFormat(locale === "tr" ? "tr-TR" : "en-US", {
    numeric: "auto",
  }).format(-value, unit);
}
