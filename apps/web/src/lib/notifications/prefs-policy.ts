import {
  LOCKED_NOTIFICATION_TYPE_KEYS,
  NOTIFICATION_TYPE_KEYS,
  type NotifLevel,
  type NotificationPrefs,
  type NotificationTypeKey,
} from "@wizards/types";

import { isWithinQuietHours } from "@/lib/notifications/quiet-hours";

/**
 * Ayarlar paketi — Dalga 1 / Ş1 §3. The level ↔ type ↔ channel decision, in one place.
 *
 * Two surfaces show the same data: the 560 px window's three radio cards and Bildirimler ›
 * Genel's `b1` row (SPEC_DEVIATIONS #6 — two labels, one `level` key). A second copy of "what
 * does `Yalnızca önemli` actually include" would let the pill and the send path disagree, and
 * the disagreement would only ever surface as a notification somebody did not get.
 *
 * Nothing here reads the database and nothing here composes text. It answers yes/no and says
 * why; `prefs-service.ts` supplies the preferences and `message-notification-service.ts` acts
 * on the answer.
 */

/** Why a notification was refused. `channel` is the per-server / per-channel mute (K4). */
export type NotificationBlockReason = "channel" | "level" | "quietHours" | "type";

export interface NotificationAllowance {
  allowed: boolean;
  reason?: NotificationBlockReason;
}

/**
 * §3 — `IMPORTANT` means these and nothing else.
 *
 * `security` and `moderation` are on the list because the design's own sentence puts them there
 * ("Doğrudan bahsetmeler, yanıtlar, çağrılar, güvenlik ve moderasyon"), even though they can
 * never be off anyway.
 *
 * **`dm` — Ş13.** The two label sets disagree (SPEC_DEVIATIONS #6): the 560 px window's body
 * sentence enumerates the list above and leaves direct messages out, while Ayarlar › Genel names
 * the same `level` value **"Yalnız DM ve bahsetmeler"**. Ş1 followed the enumerated sentence and
 * the mismatch stayed invisible: the only gated send path was the channel one, and DM pushes went
 * out through an ungated caller. Ş13 moved the gate into `sendMobilePushForNotifications` (debt
 * B1) and the disagreement became a real behaviour — every account defaults to `IMPORTANT`, so
 * direct messages would have gone silent for everyone without anyone choosing that.
 *
 * The option the user actually picks from carries the promise, so the promise wins: at
 * `IMPORTANT` a direct message still notifies. Neither string is rewritten (both come from the
 * reference); what changed is which one the behaviour follows, and the deviation record says so.
 */
export const IMPORTANT_NOTIFICATION_TYPE_KEYS = [
  "dm",
  "mentionSelf",
  "messageReplies",
  "incomingCall",
] as const satisfies readonly NotificationTypeKey[];

const IMPORTANT_TYPE_SET: ReadonlySet<string> = new Set<string>([
  ...IMPORTANT_NOTIFICATION_TYPE_KEYS,
  ...LOCKED_NOTIFICATION_TYPE_KEYS,
]);

const LOCKED_TYPE_SET: ReadonlySet<string> = new Set<string>(LOCKED_NOTIFICATION_TYPE_KEYS);

/** Every key the read schema answers for — the fourteen writable rows plus the two locked ones. */
export type NotificationKindKey =
  NotificationTypeKey | (typeof LOCKED_NOTIFICATION_TYPE_KEYS)[number];

export function isLockedNotificationType(kind: NotificationKindKey): boolean {
  return LOCKED_TYPE_SET.has(kind);
}

/**
 * The type set a level implies when the user has touched nothing. `isCustomLevel` compares the
 * stored set against this one, and the 560 px window's `Özel` pill reads the comparison.
 */
export function impliedTypeSet(level: NotifLevel): Record<NotificationTypeKey, boolean> {
  return Object.fromEntries(
    NOTIFICATION_TYPE_KEYS.map((key) => [
      key,
      level === "all" ? true : level === "important" ? IMPORTANT_TYPE_SET.has(key) : false,
    ]),
  ) as Record<NotificationTypeKey, boolean>;
}

/**
 * §3 — the `Özel` pill. True when the stored type set differs from the one the level implies.
 *
 * The locked pair is deliberately excluded: it is `true` under every level, so including it
 * would make `off` permanently "custom" and the pill would stop meaning anything.
 */
export function isCustomLevel(prefs: NotificationPrefs): boolean {
  const implied = impliedTypeSet(prefs.level);

  return NOTIFICATION_TYPE_KEYS.some((key) => prefs.types[key] !== implied[key]);
}

export interface NotificationAllowanceContext {
  /** K4 — this recipient muted the server, the channel or the conversation. */
  channelMuted?: boolean;
}

/**
 * §3 + §4 — may this kind reach this recipient right now?
 *
 * Order matters and is the contract:
 *
 *   1. **Locked types bypass everything.** Security and moderation are not optional, so no
 *      level, no quiet window and no muted channel can hold them (tuzak #5, §4's last line).
 *   2. `level` — `off` refuses every optional kind, `important` refuses everything outside
 *      `IMPORTANT_NOTIFICATION_TYPE_KEYS`.
 *   3. `types` — the per-row switch, which only gets a say once the level allowed the kind.
 *   4. `quietHours` — a window silences delivery, never the record; `allowCalls` lets
 *      `incomingCall` through.
 *   5. `channel` — the caller's mute filter, reported here so every refusal has one shape.
 *
 * **`off` does not silence the notification centre.** This function answers for delivery —
 * push, system notification, sound, toast. The `Notification` row is written before it is
 * consulted, which is what the 560 px window's own sentence promises.
 */
export function isNotificationAllowed(
  prefs: NotificationPrefs,
  kind: NotificationKindKey,
  at: Date,
  context: NotificationAllowanceContext = {},
): NotificationAllowance {
  if (isLockedNotificationType(kind)) {
    return { allowed: true };
  }

  if (prefs.level === "off") {
    return { allowed: false, reason: "level" };
  }

  if (prefs.level === "important" && !IMPORTANT_TYPE_SET.has(kind)) {
    return { allowed: false, reason: "level" };
  }

  if (prefs.types[kind] === false) {
    return { allowed: false, reason: "type" };
  }

  if (isWithinQuietHours({ quietHours: toQuietHoursCarrier(prefs) }, at)) {
    const ringsAnyway = kind === "incomingCall" && prefs.quietHours.allowCalls;
    if (!ringsAnyway) {
      return { allowed: false, reason: "quietHours" };
    }
  }

  if (context.channelMuted) {
    return { allowed: false, reason: "channel" };
  }

  return { allowed: true };
}

/**
 * `NotifQuietHours` carries `start`/`end`/`tz`; `isWithinQuietHours` speaks `from`/`to`/
 * `timeZone`. The rename is the whole adapter — the window arithmetic itself stays in
 * `quiet-hours.ts`, so the zone is resolved exactly once (tuzak #7).
 */
function toQuietHoursCarrier(prefs: NotificationPrefs) {
  return {
    enabled: prefs.quietHours.enabled,
    from: prefs.quietHours.start,
    timeZone: prefs.quietHours.tz,
    to: prefs.quietHours.end,
  };
}

/**
 * §5 — every channel's answer for one notification, decided together.
 *
 * Returned as one object rather than seven predicates because the send path has to make all
 * seven decisions about the same notification at the same instant: seven calls would each
 * re-resolve the quiet window, and a notification written at 22:59:59.9 could be inside it for
 * the push and outside it for the toast.
 */
export interface NotificationDelivery {
  allowed: boolean;
  appBadge: boolean;
  email: boolean;
  inAppToast: boolean;
  push: boolean;
  reason?: NotificationBlockReason;
  sound: boolean;
  /** `false` masks the sender and the message out of the **system** notification (`na6`). */
  systemPreview: boolean;
  systemWhileClosed: boolean;
  systemWhileOpen: boolean;
}

const BLOCKED_DELIVERY = {
  appBadge: false,
  email: false,
  inAppToast: false,
  push: false,
  sound: false,
  systemPreview: false,
  systemWhileClosed: false,
  systemWhileOpen: false,
} as const;

/**
 * §5 — the gate table, evaluated once.
 *
 * `delivery.system` is a three-state menu, not a switch: `mentions` lets the mention family
 * through and holds everything else, which is why it cannot be folded into a boolean.
 */
export function resolveNotificationDelivery(
  prefs: NotificationPrefs,
  kind: NotificationKindKey,
  at: Date,
  context: NotificationAllowanceContext = {},
): NotificationDelivery {
  const allowance = isNotificationAllowed(prefs, kind, at, context);

  if (!allowance.allowed) {
    return {
      ...BLOCKED_DELIVERY,
      allowed: false,
      // `exactOptionalPropertyTypes` is on: an explicit `undefined` is not the same as absent.
      ...(allowance.reason ? { reason: allowance.reason } : {}),
      // The badge is a count of unread rows, not a delivery. A refused notification still
      // exists, so the tab counter still moves — provided the user wants a counter at all.
      appBadge: prefs.surfaces.badge,
    };
  }

  return {
    allowed: true,
    appBadge: prefs.surfaces.badge,
    email: prefs.delivery.email,
    inAppToast: prefs.surfaces.inAppToast && prefs.delivery.inApp,
    push: prefs.delivery.push,
    sound: prefs.sounds.notification.enabled && prefs.sounds.notification.volume > 0,
    systemPreview: prefs.systemPreview,
    systemWhileClosed: isSystemModeAllowed(prefs, kind),
    systemWhileOpen: prefs.surfaces.systemWhileOpen && isSystemModeAllowed(prefs, kind),
  };
}

/**
 * `NotificationType` (the nine-member column) → the type row that governs it.
 *
 * The column is coarser than the Türler tab on purpose — nine values, sixteen rows — so the send
 * sites that know exactly which kind they are producing (`mentionEveryone` vs `mentionSelf`,
 * `threadReplies` vs `messageReplies`) pass the key straight in. This map is for the readers that
 * only have the stored row: the desktop toast and the notification panel.
 */
const KIND_BY_NOTIFICATION_TYPE = {
  BADGE: "badges",
  DM: "dm",
  FEEDBACK: "announcements",
  FRIEND_ACCEPTED: "friendRequest",
  FRIEND_REQUEST: "friendRequest",
  MENTION: "mentionSelf",
  MODERATION: "moderation",
  SERVER_INVITE: "serverInvite",
  SYSTEM: "announcements",
} as const satisfies Record<string, NotificationKindKey>;

export function notificationKindFromType(type: string): NotificationKindKey {
  return (
    (KIND_BY_NOTIFICATION_TYPE as Record<string, NotificationKindKey>)[type] ?? "announcements"
  );
}

/**
 * The mention family `delivery.system = "mentions"` lets through — the three rows the label
 * actually names.
 *
 * A DM is **not** on this list. `Sadece bahsetmeler` has shipped meaning exactly "MENTION" since
 * the mention modal, and widening it here would start sending desktop notifications for direct
 * messages to everybody who chose that option — a behaviour change nobody asked for, on a
 * surface this lane is required to leave alone. Replies are absent for the same reason: the
 * Türler tab gives them their own rows.
 */
export const MENTION_FAMILY: ReadonlySet<string> = new Set<string>([
  "mentionEveryone",
  "mentionRole",
  "mentionSelf",
]);

function isSystemModeAllowed(prefs: NotificationPrefs, kind: NotificationKindKey): boolean {
  if (prefs.delivery.system === "off") {
    return false;
  }

  return (
    prefs.delivery.system === "all" || MENTION_FAMILY.has(kind) || isLockedNotificationType(kind)
  );
}

/**
 * §5 last row — `systemPreview = false` hides the sender and the message from the **system**
 * notification. The in-app card is a different surface with a different switch
 * (`panel.showContent`, `np4`), so it is not touched here (tuzak #4).
 *
 * The replacement text is not composed here: this returns the i18n keys, and the caller — which
 * already knows the recipient's locale — translates them. A masked notification that arrived in
 * the wrong language would be its own kind of leak.
 */
export const MASKED_NOTIFICATION_KEYS = {
  body: "notif.masked.body",
  title: "notif.masked.title",
} as const;
