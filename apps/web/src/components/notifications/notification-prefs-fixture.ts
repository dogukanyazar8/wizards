import {
  LOCKED_NOTIFICATION_TYPE_KEYS,
  NOTIFICATION_TYPE_KEYS,
  type NotificationPrefs,
  type NotificationTypes,
} from "@wizards/types";

/**
 * Ş11 testlerinin ortak `NotificationPrefs` fikstürü.
 *
 * Tam nesne kuruluyor, kısmi bir nesne `as` ile zorlanmıyor: panel ve pencere aynı önbellek
 * girişini okuyor ve alan eksik bırakılırsa test, üründe olmayan bir şekli doğrulamaya başlar.
 */

function typeSet(value: boolean): NotificationTypes {
  return {
    ...(Object.fromEntries(NOTIFICATION_TYPE_KEYS.map((key) => [key, value])) as Record<
      (typeof NOTIFICATION_TYPE_KEYS)[number],
      boolean
    >),
    ...(Object.fromEntries(LOCKED_NOTIFICATION_TYPE_KEYS.map((key) => [key, true])) as Record<
      (typeof LOCKED_NOTIFICATION_TYPE_KEYS)[number],
      true
    >),
  };
}

const SOUND = { enabled: true, profile: "whispr", volume: 70 } as const;

export function notificationPrefsFixture(
  overrides: Partial<NotificationPrefs> = {},
): NotificationPrefs {
  return {
    defaultMuteDuration: "8h",
    delivery: { email: false, inApp: true, push: true, system: "all" },
    exceptions: [],
    level: "all",
    panel: { autoClose: true, count: 4, durationSec: 12, showContent: true, showSource: true },
    permission: "unknown",
    quietHours: {
      allowCalls: true,
      enabled: true,
      end: "08:00",
      start: "23:00",
      tz: "Europe/Istanbul",
    },
    sounds: { call: SOUND, join: SOUND, leave: SOUND, notification: SOUND },
    surfaces: { badge: true, inAppToast: true, systemWhileOpen: true },
    systemPreview: false,
    types: typeSet(true),
    ...overrides,
  };
}

export { typeSet as notificationTypeSetFixture };
