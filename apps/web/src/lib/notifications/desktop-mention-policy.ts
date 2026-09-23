import type { MentionSettings } from "@wizards/types";

import { MENTION_FAMILY, notificationKindFromType } from "@/lib/notifications/prefs-policy";
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
