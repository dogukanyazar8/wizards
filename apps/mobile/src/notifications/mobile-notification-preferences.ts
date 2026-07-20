export const MOBILE_NOTIFICATION_PREFERENCES_KEY = "whispr.mobile.notification-preferences";

/** Default routing for server (channel) messages when no per-channel override exists. */
export const MOBILE_SERVER_NOTIFICATION_MODES = ["all", "mentions", "none"] as const;
export type MobileServerNotificationMode = (typeof MOBILE_SERVER_NOTIFICATION_MODES)[number];

export interface MobileNotificationPreferences {
  /** Master switch. When off, every other push channel is suppressed. */
  readonly allowNotifications: boolean;
  readonly directMessages: boolean;
  readonly serverMessages: MobileServerNotificationMode;
  readonly calls: boolean;
  readonly notificationSounds: boolean;
  readonly vibration: boolean;
  readonly quietHoursEnabled: boolean;
  /** "HH:MM" 24h. Start may be later than end (overnight range). */
  readonly quietHoursStart: string;
  readonly quietHoursEnd: string;
  /** Exception: DM calls ring through even during quiet hours. */
  readonly dmCallsAlwaysRing: boolean;
}

export const DEFAULT_MOBILE_NOTIFICATION_PREFERENCES: MobileNotificationPreferences = {
  allowNotifications: true,
  directMessages: true,
  serverMessages: "mentions",
  calls: true,
  notificationSounds: true,
  vibration: true,
  quietHoursEnabled: false,
  quietHoursStart: "23:00",
  quietHoursEnd: "08:00",
  dmCallsAlwaysRing: true,
};

export interface MobileNotificationPreferenceStorage {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
}

/** Every half hour of the day as "HH:MM", used by the quiet-hours pickers. */
export const MOBILE_QUIET_HOURS_TIME_OPTIONS: readonly string[] = Array.from(
  { length: 48 },
  (_unused, index) => {
    const hour = Math.floor(index / 2)
      .toString()
      .padStart(2, "0");
    const minute = index % 2 === 0 ? "00" : "30";
    return `${hour}:${minute}`;
  },
);

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

function normalizeMobileQuietHoursTime(value: unknown, fallback: string): string {
  return typeof value === "string" && TIME_PATTERN.test(value) ? value : fallback;
}

function normalizeMobileServerNotificationMode(value: unknown): MobileServerNotificationMode {
  return MOBILE_SERVER_NOTIFICATION_MODES.includes(value as MobileServerNotificationMode)
    ? (value as MobileServerNotificationMode)
    : DEFAULT_MOBILE_NOTIFICATION_PREFERENCES.serverMessages;
}

function normalizeMobileBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export function normalizeMobileNotificationPreferences(
  value: unknown,
): MobileNotificationPreferences {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return DEFAULT_MOBILE_NOTIFICATION_PREFERENCES;
  }

  const record = value as Record<string, unknown>;
  const defaults = DEFAULT_MOBILE_NOTIFICATION_PREFERENCES;

  return {
    allowNotifications: normalizeMobileBoolean(
      record.allowNotifications,
      defaults.allowNotifications,
    ),
    directMessages: normalizeMobileBoolean(record.directMessages, defaults.directMessages),
    serverMessages: normalizeMobileServerNotificationMode(record.serverMessages),
    calls: normalizeMobileBoolean(record.calls, defaults.calls),
    notificationSounds: normalizeMobileBoolean(
      record.notificationSounds,
      defaults.notificationSounds,
    ),
    vibration: normalizeMobileBoolean(record.vibration, defaults.vibration),
    quietHoursEnabled: normalizeMobileBoolean(
      record.quietHoursEnabled,
      defaults.quietHoursEnabled,
    ),
    quietHoursStart: normalizeMobileQuietHoursTime(
      record.quietHoursStart,
      defaults.quietHoursStart,
    ),
    quietHoursEnd: normalizeMobileQuietHoursTime(record.quietHoursEnd, defaults.quietHoursEnd),
    dmCallsAlwaysRing: normalizeMobileBoolean(
      record.dmCallsAlwaysRing,
      defaults.dmCallsAlwaysRing,
    ),
  };
}

export function formatMobileQuietHoursRange(start: string, end: string): string {
  return `${start} – ${end}`;
}

export async function loadMobileNotificationPreferences(
  storage: MobileNotificationPreferenceStorage,
): Promise<MobileNotificationPreferences> {
  try {
    const raw = await storage.getItemAsync(MOBILE_NOTIFICATION_PREFERENCES_KEY);
    if (!raw) {
      return DEFAULT_MOBILE_NOTIFICATION_PREFERENCES;
    }
    return normalizeMobileNotificationPreferences(JSON.parse(raw));
  } catch {
    return DEFAULT_MOBILE_NOTIFICATION_PREFERENCES;
  }
}

export async function saveMobileNotificationPreferences(
  storage: MobileNotificationPreferenceStorage,
  preferences: MobileNotificationPreferences,
): Promise<void> {
  await storage.setItemAsync(
    MOBILE_NOTIFICATION_PREFERENCES_KEY,
    JSON.stringify(normalizeMobileNotificationPreferences(preferences)),
  );
}

function parseMobileQuietHourMinutes(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) {
    return null;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) {
    return null;
  }

  return hours * 60 + minutes;
}

/** True while "now" falls inside the configured quiet-hours window (may wrap midnight). */
export function isWithinMobileQuietHours(
  preferences: MobileNotificationPreferences,
  now: Date,
): boolean {
  if (!preferences.quietHoursEnabled) {
    return false;
  }

  const start = parseMobileQuietHourMinutes(preferences.quietHoursStart);
  const end = parseMobileQuietHourMinutes(preferences.quietHoursEnd);
  if (start === null || end === null || start === end) {
    return false;
  }

  const current = now.getHours() * 60 + now.getMinutes();
  return start < end ? current >= start && current < end : current >= start || current < end;
}

/**
 * Whether an incoming DM call may alert the user right now. Quiet hours silence calls
 * unless the "DM calls always ring" exception is on.
 */
export function shouldAlertMobileIncomingCall(
  preferences: MobileNotificationPreferences,
  now: Date,
): boolean {
  if (!preferences.allowNotifications || !preferences.calls) {
    return false;
  }

  return preferences.dmCallsAlwaysRing || !isWithinMobileQuietHours(preferences, now);
}
