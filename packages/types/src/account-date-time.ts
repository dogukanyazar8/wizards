import type {
  InterfaceDensity,
  TimeZonePreference,
  UserDateFormat,
  UserTimeFormat,
} from "./account-preferences";

export const ACCOUNT_FORMAT_PREVIEW_INSTANT = "2026-08-13T17:05:00.000Z";
export const ACCOUNT_DATE_TIME_PLACEHOLDER = "—";

const FALLBACK_TIME_ZONES = Object.freeze([
  "Africa/Cairo",
  "America/Chicago",
  "America/Los_Angeles",
  "America/New_York",
  "Asia/Dubai",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Europe/Berlin",
  "Europe/Istanbul",
  "Europe/London",
  "UTC",
] as const);

const IANA_TIME_ZONE_CACHE_MAX_ENTRIES = 512;
const ACCOUNT_TIME_FORMATTER_CACHE_MAX_ENTRIES = 32;
const ianaTimeZoneValidity = new Map<string, boolean>();
const accountTimeFormatters = new Map<string, Intl.DateTimeFormat>();
let cachedSystemTimeZone: string | null = null;

function setBoundedCache<K, V>(cache: Map<K, V>, key: K, value: V, maxEntries: number): void {
  if (cache.size >= maxEntries) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey !== undefined) cache.delete(oldestKey);
  }
  cache.set(key, value);
}

export interface AccountDateTimeFormatOptions {
  readonly dateFormat?: UserDateFormat;
  readonly locale: string;
  readonly systemTimeZone?: string | null;
  readonly timeFormat?: UserTimeFormat;
  readonly timeZone: TimeZonePreference | string;
}

export interface AccountTimeZoneOptionInput {
  readonly selectedTimeZone?: string | null;
  readonly supportedTimeZones?: readonly string[];
  readonly systemTimeZone?: string | null;
}

export interface InterfaceDensityMetrics {
  readonly controlMinHeight: number;
  readonly rowGap: number;
  readonly sectionGap: number;
  readonly verticalPadding: number;
}

const DENSITY_METRICS: Readonly<Record<InterfaceDensity, InterfaceDensityMetrics>> = Object.freeze({
  COMFORTABLE: Object.freeze({
    controlMinHeight: 48,
    rowGap: 12,
    sectionGap: 16,
    verticalPadding: 12,
  }),
  COMPACT: Object.freeze({
    controlMinHeight: 44,
    rowGap: 8,
    sectionGap: 12,
    verticalPadding: 8,
  }),
});

function toDate(input: Date | number | string): Date | null {
  const date = input instanceof Date ? input : new Date(input);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function isValidIanaTimeZone(value: string | null | undefined): value is string {
  const candidate = value?.trim();
  if (!candidate) {
    return false;
  }

  const cached = ianaTimeZoneValidity.get(candidate);
  if (cached !== undefined) return cached;

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: candidate }).format(0);
    setBoundedCache(ianaTimeZoneValidity, candidate, true, IANA_TIME_ZONE_CACHE_MAX_ENTRIES);
    return true;
  } catch {
    setBoundedCache(ianaTimeZoneValidity, candidate, false, IANA_TIME_ZONE_CACHE_MAX_ENTRIES);
    return false;
  }
}

export function getSystemTimeZone(): string {
  if (cachedSystemTimeZone !== null) return cachedSystemTimeZone;
  const resolved = new Intl.DateTimeFormat().resolvedOptions().timeZone;
  cachedSystemTimeZone = isValidIanaTimeZone(resolved) ? resolved : "UTC";
  return cachedSystemTimeZone;
}

export function resolveAccountTimeZone(
  preference: TimeZonePreference | string,
  systemTimeZone: string | null | undefined = getSystemTimeZone(),
): string {
  const candidate = preference === "AUTO" ? systemTimeZone : preference;
  return isValidIanaTimeZone(candidate) ? candidate : "UTC";
}

function readSupportedTimeZones(): readonly string[] {
  const intl = Intl as typeof Intl & {
    supportedValuesOf?: (key: "timeZone") => string[];
  };

  try {
    return intl.supportedValuesOf?.("timeZone") ?? FALLBACK_TIME_ZONES;
  } catch {
    return FALLBACK_TIME_ZONES;
  }
}

export function getAccountTimeZoneOptions({
  selectedTimeZone,
  supportedTimeZones = readSupportedTimeZones(),
  systemTimeZone = getSystemTimeZone(),
}: AccountTimeZoneOptionInput = {}): readonly string[] {
  const zones = new Set<string>();
  for (const value of ["UTC", systemTimeZone, selectedTimeZone, ...supportedTimeZones]) {
    if (isValidIanaTimeZone(value)) {
      zones.add(value);
    }
  }

  return Object.freeze([
    "AUTO",
    ...Array.from(zones).sort((left, right) => left.localeCompare(right)),
  ]);
}

function dateParts(
  date: Date,
  locale: string,
  timeZone: string,
): Readonly<Record<"day" | "month" | "year", string>> {
  const values: Partial<Record<"day" | "month" | "year", string>> = {};
  for (const part of new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).formatToParts(date)) {
    if (part.type === "day" || part.type === "month" || part.type === "year") {
      values[part.type] = part.value;
    }
  }

  return {
    day: values.day ?? "",
    month: values.month ?? "",
    year: values.year ?? "",
  };
}

export function formatAccountDate(
  input: Date | number | string,
  options: Pick<
    AccountDateTimeFormatOptions,
    "dateFormat" | "locale" | "systemTimeZone" | "timeZone"
  >,
): string {
  const date = toDate(input);
  if (!date) {
    return ACCOUNT_DATE_TIME_PLACEHOLDER;
  }

  const timeZone = resolveAccountTimeZone(options.timeZone, options.systemTimeZone);
  if (!options.dateFormat || options.dateFormat === "LOCALE") {
    return new Intl.DateTimeFormat(options.locale, { dateStyle: "medium", timeZone }).format(date);
  }

  const parts = dateParts(date, options.locale, timeZone);
  const order =
    options.dateFormat === "DMY"
      ? [parts.day, parts.month, parts.year]
      : options.dateFormat === "MDY"
        ? [parts.month, parts.day, parts.year]
        : [parts.year, parts.month, parts.day];
  return order.join("/");
}

export function formatAccountTime(
  input: Date | number | string,
  options: Pick<
    AccountDateTimeFormatOptions,
    "locale" | "systemTimeZone" | "timeFormat" | "timeZone"
  >,
): string {
  const date = toDate(input);
  if (!date) {
    return ACCOUNT_DATE_TIME_PLACEHOLDER;
  }

  const timeZone = resolveAccountTimeZone(options.timeZone, options.systemTimeZone);
  const hourCycle =
    options.timeFormat === "H12" ? "h12" : options.timeFormat === "H24" ? "h23" : undefined;
  const formatterKey = `${options.locale}\u0000${timeZone}\u0000${hourCycle ?? "locale"}`;
  let formatter = accountTimeFormatters.get(formatterKey);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(options.locale, {
      hour: "2-digit",
      ...(hourCycle ? { hourCycle } : {}),
      minute: "2-digit",
      timeZone,
    });
    setBoundedCache(
      accountTimeFormatters,
      formatterKey,
      formatter,
      ACCOUNT_TIME_FORMATTER_CACHE_MAX_ENTRIES,
    );
  }
  return formatter.format(date);
}

export function formatAccountDateTime(
  input: Date | number | string,
  options: AccountDateTimeFormatOptions,
): string {
  const date = toDate(input);
  if (!date) {
    return ACCOUNT_DATE_TIME_PLACEHOLDER;
  }

  return `${formatAccountDate(date, options)} · ${formatAccountTime(date, options)}`;
}

export function getInterfaceDensityMetrics(density: InterfaceDensity): InterfaceDensityMetrics {
  return DENSITY_METRICS[density];
}
