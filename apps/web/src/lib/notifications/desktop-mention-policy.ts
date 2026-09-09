import type { MentionSettings, NotificationPrefs } from "@wizards/types";

import {
  MENTION_FAMILY,
  notificationKindFromType,
  resolveNotificationDelivery,
} from "@/lib/notifications/prefs-policy";
import { isWithinQuietHours } from "@/lib/notifications/quiet-hours";
import type { NotificationSocketPayload } from "@/lib/socket/events";

/**
 * Native/web desktop toast policy. Counters are updated before this policy is consulted.
 *
 * Ayarlar Ş1 §5 — the level, type and channel decisions are **not** repeated here. Which types
 * `Sadece bahsetmeler` covers is `MENTION_FAMILY` in `prefs-policy.ts`, and the full ladder is
 * `resolveNotificationDelivery`. A second copy on this side is how the toast and the push end up
 * disagreeing about what "important" means.
 */
export function shouldDeliverDesktopNotification(
  type: NotificationSocketPayload["type"],
  settings: MentionSettings,
  at = new Date(),
): boolean {
  if (settings.desktop === "off" || isWithinQuietHours(settings, at)) {
    return false;
  }

  return settings.desktop === "all" || MENTION_FAMILY.has(notificationKindFromType(type));
}

/**
 * The same question asked with the full preference object — what the Bildirimler screen writes
 * and what the desktop client will read once `notification-prefs` is wired into it.
 *
 * `systemWhileOpen` is the right gate: this fires while the app is running but hidden, which is
 * exactly the surface `na2` names.
 */
export function shouldDeliverDesktopNotificationFromPrefs(
  type: NotificationSocketPayload["type"],
  prefs: NotificationPrefs,
  at = new Date(),
): boolean {
  return resolveNotificationDelivery(prefs, notificationKindFromType(type), at).systemWhileOpen;
}
