import type { MobileReleaseChannel } from "@wizards/types";

/**
 * PROMPT.md §5 "Kalıcı yerel değerler". One namespace so a wipe can find them,
 * and one read path so the About screen does not make seven round trips through
 * the AsyncStorage bridge before its first paint.
 */
export const MOBILE_ABOUT_PREFERENCE_KEYS = Object.freeze({
  autoUpdate: "whispr.settings.autoUpdate",
  betaConsentAt: "whispr.settings.betaConsentAt",
  channel: "whispr.settings.channel",
  rateSnoozedUntil: "whispr.rate.snoozedUntil",
  rateSubmittedVersion: "whispr.rate.submittedVersion",
  releaseNotify: "whispr.settings.releaseNotify",
  seenVersion: "whispr.about.seenVersion",
  skippedVersion: "whispr.update.skippedVersion",
} as const);

export type MobileAboutPreferenceKey = keyof typeof MOBILE_ABOUT_PREFERENCE_KEYS;

export interface MobileAboutPreferences {
  /** §3.1: the identity card ships with automatic updates on. */
  readonly autoUpdate: boolean;
  /** §4.16: set once; re-asked only after the user leaves the channel and returns. */
  readonly betaConsentAt: string | null;
  readonly channel: MobileReleaseChannel | null;
  /** §4.20: "Şimdi değil" holds the sheet back for 90 days. */
  readonly rateSnoozedUntil: string | null;
  readonly rateSubmittedVersion: string | null;
  /** 1c: opt-in notification when a new release note is published. */
  readonly releaseNotify: boolean;
  /** §4.5: the newest version the user has actually opened 1c for. */
  readonly seenVersion: string | null;
  readonly skippedVersion: string | null;
}

export const MOBILE_ABOUT_DEFAULT_PREFERENCES: MobileAboutPreferences = Object.freeze({
  autoUpdate: true,
  betaConsentAt: null,
  channel: null,
  rateSnoozedUntil: null,
  rateSubmittedVersion: null,
  releaseNotify: false,
  seenVersion: null,
  skippedVersion: null,
});

/** The slice of AsyncStorage this module needs, so tests do not mount the native module. */
export interface MobileAboutPreferenceStorage {
  readonly multiGet: (
    keys: readonly string[],
  ) => Promise<readonly (readonly [string, string | null])[]>;
  readonly removeItem: (key: string) => Promise<void>;
  readonly setItem: (key: string, value: string) => Promise<void>;
}

const RELEASE_CHANNELS: readonly MobileReleaseChannel[] = ["stable", "beta", "uat"];

function parseBoolean(value: string | null, fallback: boolean): boolean {
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }

  return fallback;
}

function parseChannel(value: string | null): MobileReleaseChannel | null {
  return RELEASE_CHANNELS.includes(value as MobileReleaseChannel)
    ? (value as MobileReleaseChannel)
    : null;
}

/** A timestamp that cannot be parsed is treated as absent, never as "now". */
function parseTimestamp(value: string | null): string | null {
  if (!value || Number.isNaN(Date.parse(value))) {
    return null;
  }

  return value;
}

function parseVersion(value: string | null): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 && trimmed.length <= 32 ? trimmed : null;
}

/**
 * One `multiGet` rather than seven `getItem` calls: each call is a separate
 * bridge round trip, and the About screen reads all seven before it can decide
 * whether to show the "YENİ" dot.
 */
export async function readMobileAboutPreferences(
  storage: MobileAboutPreferenceStorage,
): Promise<MobileAboutPreferences> {
  const keys = Object.values(MOBILE_ABOUT_PREFERENCE_KEYS);

  let entries: readonly (readonly [string, string | null])[];
  try {
    entries = await storage.multiGet(keys);
  } catch {
    // A storage that cannot be read is not a reason to block the screen; the
    // defaults are the same ones a fresh install would use.
    return MOBILE_ABOUT_DEFAULT_PREFERENCES;
  }

  const values = new Map(entries.map(([key, value]) => [key, value] as const));
  const read = (key: MobileAboutPreferenceKey): string | null =>
    values.get(MOBILE_ABOUT_PREFERENCE_KEYS[key]) ?? null;

  return {
    autoUpdate: parseBoolean(read("autoUpdate"), MOBILE_ABOUT_DEFAULT_PREFERENCES.autoUpdate),
    betaConsentAt: parseTimestamp(read("betaConsentAt")),
    channel: parseChannel(read("channel")),
    rateSnoozedUntil: parseTimestamp(read("rateSnoozedUntil")),
    rateSubmittedVersion: parseVersion(read("rateSubmittedVersion")),
    releaseNotify: parseBoolean(
      read("releaseNotify"),
      MOBILE_ABOUT_DEFAULT_PREFERENCES.releaseNotify,
    ),
    seenVersion: parseVersion(read("seenVersion")),
    skippedVersion: parseVersion(read("skippedVersion")),
  };
}

export async function writeMobileAboutPreference(
  storage: MobileAboutPreferenceStorage,
  key: MobileAboutPreferenceKey,
  value: boolean | string | null,
): Promise<void> {
  const storageKey = MOBILE_ABOUT_PREFERENCE_KEYS[key];

  if (value === null) {
    await storage.removeItem(storageKey);
    return;
  }

  await storage.setItem(storageKey, typeof value === "boolean" ? String(value) : value);
}
