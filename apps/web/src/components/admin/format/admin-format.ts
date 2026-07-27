/**
 * The admin console is Turkish, so every number in it is grouped with dots and
 * separated with a comma. Keeping the helpers here means a module never reaches
 * for `toLocaleString()` and quietly renders `1,204` on an English runtime.
 */
const LOCALE = "tr-TR";

const integerFormatter = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 });
const decimalFormatter = new Intl.NumberFormat(LOCALE, {
  maximumFractionDigits: 2,
  minimumFractionDigits: 0,
});
const singleDecimalFormatter = new Intl.NumberFormat(LOCALE, {
  maximumFractionDigits: 1,
  minimumFractionDigits: 0,
});

/** U+2212. The hyphen reads as a stray dash next to a percent sign. */
const MINUS = "−";

export function formatAdminInt(value: number) {
  return integerFormatter.format(Math.trunc(value));
}

/**
 * Abbreviates only above a million: `86.420` stays legible, `4.210.000` does
 * not, and the KPI row has room for four values at 30px.
 */
export function formatAdminNumber(value: number) {
  const magnitude = Math.abs(value);

  if (magnitude >= 1_000_000) {
    return `${decimalFormatter.format(value / 1_000_000)}M`;
  }

  if (magnitude >= 100_000) {
    return `${decimalFormatter.format(value / 1000)}K`;
  }

  return formatAdminInt(value);
}

export function formatAdminPercent(value: number, options: { signed?: boolean } = {}) {
  const magnitude = singleDecimalFormatter.format(Math.abs(value));

  if (value < 0) {
    return `${MINUS}%${magnitude}`;
  }

  return `${options.signed && value > 0 ? "+" : ""}%${magnitude}`;
}

export function formatAdminBytes(bytes: number) {
  const safeBytes = Math.max(0, bytes);

  if (safeBytes < 1024) {
    return `${formatAdminInt(safeBytes)} B`;
  }

  const units = ["KB", "MB", "GB", "TB", "PB"];
  let value = safeBytes / 1024;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${singleDecimalFormatter.format(value)} ${units[unitIndex]}`;
}

export function formatAdminDuration(seconds: number) {
  const safeSeconds = Math.max(0, Math.trunc(seconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);

  if (hours > 0) {
    return minutes > 0
      ? `${formatAdminInt(hours)} sa ${formatAdminInt(minutes)} dk`
      : `${formatAdminInt(hours)} sa`;
  }

  return `${formatAdminInt(minutes)} dk`;
}
