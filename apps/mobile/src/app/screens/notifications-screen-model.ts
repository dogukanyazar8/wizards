import type { MobileNotificationItem } from "@wizards/types";

import { mobileCopy, type MobileLocale } from "../../locale/mobile-copy";
import { getMobileIntlLocale } from "../../locale/mobile-locale-preferences";

export type MobileNotificationPresentationKind =
  | "badge"
  | "direct-message"
  | "feedback"
  | "friend"
  | "mention"
  | "moderation"
  | "reaction"
  | "server-member"
  | "server-invite"
  | "system"
  | "voice";

export type MobileNotificationIcon =
  | "at-outline"
  | "chatbubble-ellipses-outline"
  | "notifications-outline"
  | "people-outline"
  | "person-add-outline"
  | "ribbon-outline"
  | "shield-checkmark-outline"
  | "volume-high-outline";

export type MobileNotificationDayGroup = {
  readonly label: string;
  readonly notifications: readonly MobileNotificationItem[];
};

export type MobileNotificationPresentation = {
  readonly canJoinVoice: boolean;
  readonly icon: MobileNotificationIcon;
  readonly kind: MobileNotificationPresentationKind;
};

const notificationDateFormatters = new Map<MobileLocale, Intl.DateTimeFormat>();

function getMobileNotificationDateFormatter(locale: MobileLocale): Intl.DateTimeFormat {
  const cached = notificationDateFormatters.get(locale);
  if (cached) {
    return cached;
  }

  // Intl formatter construction is expensive on Hermes. Locale changes are
  // rare, so keep one formatter per supported locale and reuse it for rows.
  const formatter = new Intl.DateTimeFormat(getMobileIntlLocale(locale), {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  notificationDateFormatters.set(locale, formatter);
  return formatter;
}

export function groupMobileNotificationsByDay(
  notifications: readonly MobileNotificationItem[],
  now: Date,
  locale: MobileLocale = "tr",
): readonly MobileNotificationDayGroup[] {
  const groups = new Map<string, MobileNotificationItem[]>();

  for (const notification of notifications) {
    const label = getMobileNotificationDayLabel(new Date(notification.createdAt), now, locale);
    const currentGroup = groups.get(label);

    if (currentGroup) {
      currentGroup.push(notification);
    } else {
      groups.set(label, [notification]);
    }
  }

  return [...groups.entries()].map(([label, groupedNotifications]) => ({
    label,
    notifications: groupedNotifications,
  }));
}

export function getMobileNotificationPresentation(
  notification: MobileNotificationItem,
): MobileNotificationPresentation {
  switch (notification.eventKind) {
    case "message-reaction":
      return { canJoinVoice: false, icon: "notifications-outline", kind: "reaction" };
    case "server-member-joined":
      return { canJoinVoice: false, icon: "person-add-outline", kind: "server-member" };
    case "voice-room-started":
      return {
        canJoinVoice: notification.channel !== null && notification.server !== null,
        icon: "volume-high-outline",
        kind: "voice",
      };
    default:
      break;
  }

  switch (notification.type) {
    /**
     * A badge is the one row that already knows what it is about: the catalog
     * on the device turns `badgeId` into the badge's own glyph, name and tint,
     * so it is drawn as the badge rather than as a generic bell (07 §4).
     */
    case "BADGE":
      return { canJoinVoice: false, icon: "ribbon-outline", kind: "badge" };
    case "FEEDBACK":
      return { canJoinVoice: false, icon: "chatbubble-ellipses-outline", kind: "feedback" };
    case "DM":
      return { canJoinVoice: false, icon: "chatbubble-ellipses-outline", kind: "direct-message" };
    case "FRIEND_ACCEPTED":
    case "FRIEND_REQUEST":
      return { canJoinVoice: false, icon: "person-add-outline", kind: "friend" };
    case "MENTION":
      return { canJoinVoice: false, icon: "at-outline", kind: "mention" };
    case "MODERATION":
      return { canJoinVoice: false, icon: "shield-checkmark-outline", kind: "moderation" };
    case "SERVER_INVITE":
      return { canJoinVoice: false, icon: "people-outline", kind: "server-invite" };
    case "SYSTEM":
    default:
      return { canJoinVoice: false, icon: "notifications-outline", kind: "system" };
  }
}

function getMobileNotificationDayLabel(date: Date, now: Date, locale: MobileLocale): string {
  const copy = mobileCopy[locale];
  const intlLocale = getMobileIntlLocale(locale);

  if (isSameLocalDay(date, now)) {
    return copy.notificationsToday.toLocaleUpperCase(intlLocale);
  }

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (isSameLocalDay(date, yesterday)) {
    return copy.notificationsYesterday.toLocaleUpperCase(intlLocale);
  }

  return getMobileNotificationDateFormatter(locale).format(date).toLocaleUpperCase(intlLocale);
}

function isSameLocalDay(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}
