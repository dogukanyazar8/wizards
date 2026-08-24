import type { MentionSettings } from "@wizards/types";

import { isWithinQuietHours } from "@/lib/notifications/quiet-hours";
import type { NotificationSocketPayload } from "@/lib/socket/events";

/** Native/web desktop toast policy. Counters are updated before this policy is consulted. */
export function shouldDeliverDesktopNotification(
  type: NotificationSocketPayload["type"],
  settings: MentionSettings,
  at = new Date(),
): boolean {
  if (settings.desktop === "off" || isWithinQuietHours(settings, at)) {
    return false;
  }

  return settings.desktop === "all" || type === "MENTION";
}
