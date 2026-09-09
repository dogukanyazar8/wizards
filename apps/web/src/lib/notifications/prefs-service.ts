import { prisma, type Prisma, type PrismaClient } from "@wizards/db";
import {
  LOCKED_NOTIFICATION_TYPE_KEYS,
  NOTIFICATION_SOUND_KEYS,
  NOTIFICATION_TYPE_KEYS,
  NotificationPrefsPatchSchema,
  NotificationPrefsSchema,
  type MuteDuration,
  type NotifLevel,
  type NotificationException,
  type NotificationPrefs,
  type NotificationPrefsPatch,
  type NotificationSoundKey,
  type SoundProfile,
  type SystemNotifMode,
} from "@wizards/types";

import { ApiError } from "@/lib/api";
import { resolveQuietHoursTimeZone } from "@/lib/notifications/quiet-hours";

/**
 * Ayarlar paketi — Dalga 1 / Ş1 §1. **The** door onto `UserNotificationSettings`.
 *
 * Two endpoints write this row: `notification-prefs` (the seven Bildirimler tabs and the 560 px
 * window) and `mention-settings` (the mention modal). Before this module they each held their
 * own Prisma call, and tuzak #3 is what that costs — the second writer's `upsert` silently wins
 * and the first surface's switches reset without anybody touching them.
 *
 * So both go through `readNotificationSettingsRow` / `writeNotificationSettingsRow` here, and
 * the column knowledge that the two share — the inverted pair and the desktop enum — is defined
 * once, in this file, and imported by `mention-settings-service.ts` rather than copied into it.
 *
 * ## Which column is the authority
 *
 * Five preferences exist twice, because the mention modal shipped first and its endpoint's
 * behaviour is frozen (its payload is asserted field-for-field by tests this lane must not
 * touch). For those five the **legacy** column is the authority and the new one is a mirror
 * this service keeps in step:
 *
 * | `NotificationPrefs`         | authority                                   | mirror                |
 * | --------------------------- | ------------------------------------------- | --------------------- |
 * | `types.mentionSelf`         | `mentionSelf`                               | `typeMentionSelf`     |
 * | `types.mentionRole`         | `!suppressRoleMentions`                     | `typeMentionRole`     |
 * | `types.mentionEveryone`     | `!suppressEveryoneMentions`                 | `typeMentionEveryone` |
 * | `types.threadReplies`       | `mentionThreadReplies`                      | `typeThreadReplies`   |
 * | `delivery.system`           | `desktopNotifications ? desktopMentionMode` | `systemMode`          |
 *
 * Reading the mirror instead would mean a mention-modal write moved one column and a
 * notification-prefs read answered from the other — the exact desync tuzak #3 describes, only
 * with the sign flipped. The mirrors are still written on every prefs patch because K3 wants
 * "everyone with push on" answerable in SQL, and a mirror nobody maintains cannot answer it.
 *
 * The remaining legacy columns (`mobileNotifications`, `emailNotifications`,
 * `notificationSound`, `notificationSoundFile`) have no second writer here, so the **new**
 * column is the authority and the legacy one is the mirror — K12's "eski alanlar türetilmiş
 * değer olarak yazılmaya devam eder". The reverse direction lives in
 * `api/v1/users/me/settings/route-logic.ts`, which is where those four are still written from.
 */

// ---------------------------------------------------------------------------
// Column vocabulary shared with `mention-settings-service.ts`
// ---------------------------------------------------------------------------

/** `DesktopMentionMode` and `SystemNotificationMode` share these three members. */
export type NotificationModeColumn = "ALL" | "MENTIONS" | "OFF";

export const NOTIFICATION_MODE_TO_WIRE = {
  ALL: "all",
  MENTIONS: "mentions",
  OFF: "off",
} as const satisfies Record<NotificationModeColumn, SystemNotifMode>;

export const WIRE_TO_NOTIFICATION_MODE = {
  all: "ALL",
  mentions: "MENTIONS",
  off: "OFF",
} as const satisfies Record<SystemNotifMode, NotificationModeColumn>;

/**
 * Tuzak #2 — `suppressEveryoneMentions` and `suppressRoleMentions` are `true` when the switch
 * is **off**. These two functions are the only place in the codebase that knows it. Routes and
 * components never see a `suppress*` name; the two services that do, share these.
 */
export function toMentionSwitch(suppressed: boolean): boolean {
  return !suppressed;
}

export function toSuppressColumn(enabled: boolean): boolean {
  return !enabled;
}

/**
 * `SoundProfile` ↔ the legacy `notificationSoundFile` key.
 *
 * The legacy column holds a `SoundProfileKey` from `store/sound-store.ts`, not a path:
 * `"default"` **is** the Whispr pack (`/sounds/notification-whispr.mp3`) and everything else is
 * the classic one. Ş0's backfill matched `LIKE '%whispr%'` against these keys, which no stored
 * value contains — see sapma #S1.3 in the report.
 */
export const LEGACY_SOUND_FILE_BY_PROFILE = {
  CLASSIC: "legacyNotification",
  WHISPR: "default",
} as const satisfies Record<SoundProfileColumn, string>;

export type SoundProfileColumn = "CLASSIC" | "WHISPR";

export function toSoundProfile(column: SoundProfileColumn): SoundProfile {
  return column === "WHISPR" ? "whispr" : "classic";
}

export function toSoundProfileColumn(profile: SoundProfile): SoundProfileColumn {
  return profile === "whispr" ? "WHISPR" : "CLASSIC";
}

/** The reverse of `LEGACY_SOUND_FILE_BY_PROFILE`, for the legacy endpoint's writes. */
export function soundProfileColumnFromLegacyFile(file: string): SoundProfileColumn {
  return file === LEGACY_SOUND_FILE_BY_PROFILE.WHISPR ? "WHISPR" : "CLASSIC";
}

// ---------------------------------------------------------------------------
// The shared door
// ---------------------------------------------------------------------------

export interface NotificationSettingsDependencies {
  readonly database: PrismaClient;
}

export const defaultNotificationSettingsDependencies: NotificationSettingsDependencies = {
  database: prisma,
};

export interface NotificationSettingsRead<TRow> {
  /** `UserSettings.timeZone`, the second link of the quiet-hours fallback chain. */
  accountTimeZone: string | null;
  row: TRow | null;
}

/**
 * One query for the row **and** the account zone. Two queries would be two round trips on the
 * send path, and the zone is needed for every quiet-hours answer anyway.
 *
 * A user who has never opened either surface has no row: the caller fills in defaults and
 * **nothing is written**. A read that writes turns every settings fetch into an insert and
 * makes "has this person ever chosen anything" unanswerable.
 */
export async function readNotificationSettingsRow<TRow>(
  userId: string,
  select: Prisma.UserNotificationSettingsSelect,
  dependencies: NotificationSettingsDependencies = defaultNotificationSettingsDependencies,
): Promise<NotificationSettingsRead<TRow>> {
  const user = await dependencies.database.user.findUnique({
    select: {
      notificationSettings: { select },
      settings: { select: { timeZone: true } },
    },
    where: { id: userId },
  });

  return {
    accountTimeZone: user?.settings?.timeZone ?? null,
    row: (user?.notificationSettings as TRow | undefined) ?? null,
  };
}

/**
 * The single write. `create` spells the whole row out rather than leaning on Prisma's column
 * defaults: the defaults already match the design, but a create that leans on them disagrees
 * silently the day one of them moves in only one of the two places.
 */
export async function writeNotificationSettingsRow<TRow>(args: {
  create: object;
  dependencies?: NotificationSettingsDependencies;
  select: Prisma.UserNotificationSettingsSelect;
  update: object;
  userId: string;
}): Promise<TRow> {
  const dependencies = args.dependencies ?? defaultNotificationSettingsDependencies;

  const saved = await dependencies.database.userNotificationSettings.upsert({
    // `Unchecked…` rather than the relation form: this writer only ever holds scalar columns
    // and a `userId`, and the checked input would demand a `user: { connect }` it has no reason
    // to build.
    create: {
      ...args.create,
      userId: args.userId,
    } as Prisma.UserNotificationSettingsUncheckedCreateInput,
    select: args.select,
    update: args.update as Prisma.UserNotificationSettingsUncheckedUpdateInput,
    where: { userId: args.userId },
  });

  return saved as TRow;
}

// ---------------------------------------------------------------------------
// The row this service reads
// ---------------------------------------------------------------------------

const TYPE_COLUMN_BY_KEY = {
  announcements: "typeAnnouncements",
  badges: "typeBadges",
  dm: "typeDm",
  events: "typeEvents",
  friendRequest: "typeFriendRequest",
  incomingCall: "typeIncomingCall",
  mentionEveryone: "typeMentionEveryone",
  mentionRole: "typeMentionRole",
  mentionSelf: "typeMentionSelf",
  messageReplies: "typeMessageReplies",
  productUpdates: "typeProductUpdates",
  serverInvite: "typeServerInvite",
  threadReplies: "typeThreadReplies",
  voiceInvite: "typeVoiceInvite",
} as const satisfies Record<(typeof NOTIFICATION_TYPE_KEYS)[number], string>;

const SOUND_COLUMN_PREFIX = {
  call: "soundCall",
  join: "soundJoin",
  leave: "soundLeave",
  notification: "soundNotification",
} as const satisfies Record<NotificationSoundKey, string>;

export const NOTIFICATION_PREFS_SELECT = {
  appBadge: true,
  defaultMuteDuration: true,
  deliveryEmail: true,
  deliveryInApp: true,
  deliveryPush: true,
  // The five legacy authorities plus the four legacy mirrors.
  desktopMentionMode: true,
  desktopNotifications: true,
  emailNotifications: true,
  inAppToast: true,
  level: true,
  mentionSelf: true,
  mentionThreadReplies: true,
  mobileNotifications: true,
  notificationSound: true,
  notificationSoundFile: true,
  panelAutoClose: true,
  panelCount: true,
  panelDurationSec: true,
  panelShowContent: true,
  panelShowSource: true,
  quietHoursAllowCalls: true,
  quietHoursEnabled: true,
  quietHoursFrom: true,
  quietHoursTimeZone: true,
  quietHoursTo: true,
  soundCallEnabled: true,
  soundCallProfile: true,
  soundCallVolume: true,
  soundJoinEnabled: true,
  soundJoinProfile: true,
  soundJoinVolume: true,
  soundLeaveEnabled: true,
  soundLeaveProfile: true,
  soundLeaveVolume: true,
  soundNotificationEnabled: true,
  soundNotificationProfile: true,
  soundNotificationVolume: true,
  suppressEveryoneMentions: true,
  suppressRoleMentions: true,
  systemMode: true,
  systemPreview: true,
  systemWhileOpen: true,
  typeAnnouncements: true,
  typeBadges: true,
  typeDm: true,
  typeEvents: true,
  typeFriendRequest: true,
  typeIncomingCall: true,
  typeMentionEveryone: true,
  typeMentionRole: true,
  typeMentionSelf: true,
  typeMessageReplies: true,
  typeProductUpdates: true,
  typeServerInvite: true,
  typeThreadReplies: true,
  typeVoiceInvite: true,
} as const satisfies Prisma.UserNotificationSettingsSelect;

/** The columns `NOTIFICATION_PREFS_SELECT` asks for, as a plain shape the tests can build. */
export interface NotificationPrefsRow {
  readonly appBadge: boolean;
  readonly defaultMuteDuration: string;
  readonly deliveryEmail: boolean;
  readonly deliveryInApp: boolean;
  readonly deliveryPush: boolean;
  readonly desktopMentionMode: NotificationModeColumn;
  readonly desktopNotifications: boolean;
  readonly emailNotifications: boolean;
  readonly inAppToast: boolean;
  readonly level: "ALL" | "IMPORTANT" | "OFF";
  readonly mentionSelf: boolean;
  readonly mentionThreadReplies: boolean;
  readonly mobileNotifications: boolean;
  readonly notificationSound: boolean;
  readonly notificationSoundFile: string;
  readonly panelAutoClose: boolean;
  readonly panelCount: number;
  readonly panelDurationSec: number;
  readonly panelShowContent: boolean;
  readonly panelShowSource: boolean;
  readonly quietHoursAllowCalls: boolean;
  readonly quietHoursEnabled: boolean;
  readonly quietHoursFrom: string | null;
  readonly quietHoursTimeZone: string | null;
  readonly quietHoursTo: string | null;
  readonly soundCallEnabled: boolean;
  readonly soundCallProfile: SoundProfileColumn;
  readonly soundCallVolume: number;
  readonly soundJoinEnabled: boolean;
  readonly soundJoinProfile: SoundProfileColumn;
  readonly soundJoinVolume: number;
  readonly soundLeaveEnabled: boolean;
  readonly soundLeaveProfile: SoundProfileColumn;
  readonly soundLeaveVolume: number;
  readonly soundNotificationEnabled: boolean;
  readonly soundNotificationProfile: SoundProfileColumn;
  readonly soundNotificationVolume: number;
  readonly suppressEveryoneMentions: boolean;
  readonly suppressRoleMentions: boolean;
  readonly systemMode: NotificationModeColumn;
  readonly systemPreview: boolean;
  readonly systemWhileOpen: boolean;
  readonly typeAnnouncements: boolean;
  readonly typeBadges: boolean;
  readonly typeDm: boolean;
  readonly typeEvents: boolean;
  readonly typeFriendRequest: boolean;
  readonly typeIncomingCall: boolean;
  readonly typeMentionEveryone: boolean;
  readonly typeMentionRole: boolean;
  readonly typeMentionSelf: boolean;
  readonly typeMessageReplies: boolean;
  readonly typeProductUpdates: boolean;
  readonly typeServerInvite: boolean;
  readonly typeThreadReplies: boolean;
  readonly typeVoiceInvite: boolean;
}

/**
 * The row a user who has never chosen anything behaves as. Mirrors the Prisma column defaults,
 * which mirror the referans `SET` array — the three lists are checked against each other by
 * `prefs-service.test.ts` rather than by eye.
 */
export const NOTIFICATION_PREFS_ROW_DEFAULTS: NotificationPrefsRow = {
  appBadge: true,
  defaultMuteDuration: "8h",
  deliveryEmail: false,
  deliveryInApp: true,
  deliveryPush: true,
  desktopMentionMode: "MENTIONS",
  desktopNotifications: true,
  emailNotifications: false,
  inAppToast: true,
  level: "IMPORTANT",
  mentionSelf: true,
  mentionThreadReplies: false,
  mobileNotifications: true,
  notificationSound: true,
  notificationSoundFile: "default",
  panelAutoClose: true,
  panelCount: 5,
  panelDurationSec: 10,
  panelShowContent: false,
  panelShowSource: true,
  quietHoursAllowCalls: true,
  quietHoursEnabled: false,
  quietHoursFrom: null,
  quietHoursTimeZone: null,
  quietHoursTo: null,
  soundCallEnabled: true,
  soundCallProfile: "CLASSIC",
  soundCallVolume: 80,
  soundJoinEnabled: true,
  soundJoinProfile: "WHISPR",
  soundJoinVolume: 50,
  soundLeaveEnabled: true,
  soundLeaveProfile: "WHISPR",
  soundLeaveVolume: 50,
  soundNotificationEnabled: true,
  soundNotificationProfile: "WHISPR",
  soundNotificationVolume: 60,
  suppressEveryoneMentions: false,
  suppressRoleMentions: false,
  systemMode: "MENTIONS",
  systemPreview: false,
  systemWhileOpen: false,
  typeAnnouncements: true,
  typeBadges: false,
  typeDm: true,
  typeEvents: true,
  typeFriendRequest: true,
  typeIncomingCall: true,
  // Derived from the authority above rather than copied from the Prisma default, which says
  // `false` here while `suppressEveryoneMentions` says the switch is on. Sapma #S1.1: the
  // referans `SET` default loses to the mention modal's shipped default, because moving the
  // authority would change the mention endpoint's behaviour and this lane may not.
  typeMentionEveryone: true,
  typeMentionRole: true,
  typeMentionSelf: true,
  typeMessageReplies: true,
  typeProductUpdates: false,
  typeServerInvite: true,
  // Same story with the sign the other way round: `typeThreadReplies` defaults to `true`,
  // `mentionThreadReplies` to `false`, and K6 chose `false` on purpose so nobody wakes up to a
  // wave of thread notifications they never asked for.
  typeThreadReplies: false,
  typeVoiceInvite: true,
};

/**
 * SPEC §7 `quietHours.start` / `end` are `HH:mm`. A row that carries something else was written
 * by an older client; the design's own window is the fallback, because a half-parsed range
 * silences a stretch of the day nobody chose.
 */
const DEFAULT_QUIET_HOURS_START = "23:00";
const DEFAULT_QUIET_HOURS_END = "08:00";
const QUIET_HOUR_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/u;

function readQuietHourTime(value: string | null, fallback: string): string {
  return value !== null && QUIET_HOUR_PATTERN.test(value) ? value : fallback;
}

const MUTE_DURATIONS: readonly MuteDuration[] = ["1h", "8h", "24h", "forever"];

function readMuteDuration(value: string): MuteDuration {
  return (MUTE_DURATIONS as readonly string[]).includes(value) ? (value as MuteDuration) : "8h";
}

const LEVEL_TO_WIRE = {
  ALL: "all",
  IMPORTANT: "important",
  OFF: "off",
} as const satisfies Record<NotificationPrefsRow["level"], NotifLevel>;

const WIRE_TO_LEVEL = {
  all: "ALL",
  important: "IMPORTANT",
  off: "OFF",
} as const satisfies Record<NotifLevel, NotificationPrefsRow["level"]>;

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export interface NotificationPrefsReadOptions {
  /** K4 — Ş4 owns the union over the three mute tables; until it lands the list is empty. */
  exceptions?: readonly NotificationException[];
}

/**
 * Row → `NotificationPrefs`. Enums and numbers only: the server never sends the sentence the
 * screen prints, because the `en` dictionary could never be right if it did.
 *
 * `permission` is always `unknown` from here. It is the browser's answer, not a stored column,
 * and reporting `denied` for something the server cannot see would put "İzin verilmedi" on the
 * permission strip of somebody who granted it.
 */
export function toNotificationPrefs(
  row: Partial<NotificationPrefsRow> | null,
  accountTimeZone: string | null,
  options: NotificationPrefsReadOptions = {},
): NotificationPrefs {
  // Merged rather than substituted. A caller may hand over a **narrower** select than
  // `NOTIFICATION_PREFS_SELECT` — the send path does, and so do the fixtures that stand in for
  // it — and a missing column has to read as its default instead of failing the whole mapping.
  const source: NotificationPrefsRow = { ...NOTIFICATION_PREFS_ROW_DEFAULTS, ...definedOnly(row) };

  return NotificationPrefsSchema.parse({
    defaultMuteDuration: readMuteDuration(source.defaultMuteDuration),
    delivery: {
      email: source.deliveryEmail,
      inApp: source.deliveryInApp,
      push: source.deliveryPush,
      // The legacy pair is the authority: the mention modal still writes it, and the modal's
      // `Kapalı` has to mean `Kapalı` here too.
      system: source.desktopNotifications
        ? NOTIFICATION_MODE_TO_WIRE[source.desktopMentionMode]
        : "off",
    },
    exceptions: options.exceptions ?? [],
    level: LEVEL_TO_WIRE[source.level],
    panel: {
      autoClose: source.panelAutoClose,
      count: clampPanelCount(source.panelCount),
      durationSec: clamp(source.panelDurationSec, 5, 30),
      showContent: source.panelShowContent,
      showSource: source.panelShowSource,
    },
    permission: "unknown",
    quietHours: {
      allowCalls: source.quietHoursAllowCalls,
      enabled: source.quietHoursEnabled,
      end: readQuietHourTime(source.quietHoursTo, DEFAULT_QUIET_HOURS_END),
      start: readQuietHourTime(source.quietHoursFrom, DEFAULT_QUIET_HOURS_START),
      tz: resolveQuietHoursTimeZone(source.quietHoursTimeZone, accountTimeZone),
    },
    sounds: {
      call: readSound(source, "call"),
      join: readSound(source, "join"),
      leave: readSound(source, "leave"),
      notification: readSound(source, "notification"),
    },
    surfaces: {
      badge: source.appBadge,
      inAppToast: source.inAppToast,
      systemWhileOpen: source.systemWhileOpen,
    },
    systemPreview: source.systemPreview,
    types: readTypes(source),
  });
}

/** `{ a: undefined }` must not beat a default; only keys that carry a value are merged. */
function definedOnly(row: Partial<NotificationPrefsRow> | null): Partial<NotificationPrefsRow> {
  if (!row) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(row).filter(([, value]) => value !== undefined),
  ) as Partial<NotificationPrefsRow>;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

/** `panel.count` is a literal union of 3–6; anything else came from an older client. */
function clampPanelCount(value: number): 3 | 4 | 5 | 6 {
  return clamp(value, 3, 6) as 3 | 4 | 5 | 6;
}

function readSound(row: NotificationPrefsRow, key: NotificationSoundKey) {
  const prefix = SOUND_COLUMN_PREFIX[key];
  const record = row as unknown as Record<string, unknown>;

  return {
    enabled: record[`${prefix}Enabled`] as boolean,
    profile: toSoundProfile(record[`${prefix}Profile`] as SoundProfileColumn),
    volume: clamp(record[`${prefix}Volume`] as number, 0, 100),
  };
}

function readTypes(row: NotificationPrefsRow): Record<string, boolean> {
  const record = row as unknown as Record<string, boolean>;
  const types: Record<string, boolean> = {};

  for (const key of NOTIFICATION_TYPE_KEYS) {
    types[key] = record[TYPE_COLUMN_BY_KEY[key]] ?? false;
  }

  // The five that exist twice read from the authority, not from the mirror.
  types.mentionSelf = row.mentionSelf;
  types.mentionRole = toMentionSwitch(row.suppressRoleMentions);
  types.mentionEveryone = toMentionSwitch(row.suppressEveryoneMentions);
  types.threadReplies = row.mentionThreadReplies;

  // Tuzak #5 — no column, no storable off state, always true.
  for (const key of LOCKED_NOTIFICATION_TYPE_KEYS) {
    types[key] = true;
  }

  return types;
}

/** §6 `GET`. */
export async function readNotificationPrefs(
  userId: string,
  dependencies: NotificationSettingsDependencies = defaultNotificationSettingsDependencies,
  options: NotificationPrefsReadOptions = {},
): Promise<NotificationPrefs> {
  const { accountTimeZone, row } = await readNotificationSettingsRow<NotificationPrefsRow>(
    userId,
    NOTIFICATION_PREFS_SELECT,
    dependencies,
  );

  return toNotificationPrefs(row, accountTimeZone, options);
}

/**
 * The fan-out read. One query for every recipient of one message; a per-recipient read would
 * turn a 200-member role mention into 200 round trips on the send path.
 */
export async function listNotificationPrefs(
  userIds: readonly string[],
  dependencies: NotificationSettingsDependencies = defaultNotificationSettingsDependencies,
): Promise<Map<string, NotificationPrefs>> {
  const uniqueIds = [...new Set(userIds)];
  const prefs = new Map<string, NotificationPrefs>();

  if (uniqueIds.length === 0) {
    return prefs;
  }

  const users = await dependencies.database.user.findMany({
    select: {
      id: true,
      notificationSettings: { select: NOTIFICATION_PREFS_SELECT },
      settings: { select: { timeZone: true } },
    },
    where: { id: { in: uniqueIds } },
  });

  for (const user of users) {
    prefs.set(
      user.id,
      toNotificationPrefs(
        (user.notificationSettings as NotificationPrefsRow | null) ?? null,
        user.settings?.timeZone ?? null,
      ),
    );
  }

  return prefs;
}

/**
 * The fan-out read for a **narrow** column set — the shape `mention-settings-service` needs on
 * the send path. Shares this module's single query shape so a second reader cannot forget the
 * account zone and quietly fall back to Istanbul for everybody.
 */
export async function listNotificationSettingsRows<TRow>(
  userIds: readonly string[],
  select: Prisma.UserNotificationSettingsSelect,
  dependencies: NotificationSettingsDependencies = defaultNotificationSettingsDependencies,
): Promise<Array<{ accountTimeZone: string | null; id: string; row: TRow | null }>> {
  const uniqueIds = [...new Set(userIds)];
  if (uniqueIds.length === 0) {
    return [];
  }

  const users = await dependencies.database.user.findMany({
    select: {
      id: true,
      notificationSettings: { select },
      settings: { select: { timeZone: true } },
    },
    where: { id: { in: uniqueIds } },
  });

  return users.map((user) => ({
    accountTimeZone: user.settings?.timeZone ?? null,
    id: user.id,
    row: (user.notificationSettings as TRow | undefined) ?? null,
  }));
}

/** The defaults-aware read over `listNotificationPrefs`. */
export function readPrefs(
  prefs: ReadonlyMap<string, NotificationPrefs>,
  userId: string,
): NotificationPrefs {
  return prefs.get(userId) ?? toNotificationPrefs(null, null);
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

/**
 * Tuzak #5 — the lock is a **server** contract, not a `disabled` attribute the next client
 * forgets to set. `NotificationPrefsPatchSchema` is strict and would already reject these two,
 * but a strict-object failure answers a generic 400 with no code; the screen needs to tell the
 * difference between "you sent nonsense" and "that row cannot be turned off".
 */
export function assertNoLockedTypes(body: unknown): void {
  if (!body || typeof body !== "object") {
    return;
  }

  const types = (body as { types?: unknown }).types;
  if (!types || typeof types !== "object") {
    return;
  }

  const sent = LOCKED_NOTIFICATION_TYPE_KEYS.filter((key) => key in (types as object));
  if (sent.length > 0) {
    throw new ApiError(
      `Notification type is locked: ${sent.join(", ")}`,
      400,
      "LOCKED_NOTIFICATION_TYPE",
    );
  }
}

/**
 * A zero-length window reads as "never quiet" or "always quiet" depending on who wrote the
 * comparison. Refuse the shape rather than pick a side — the same rule the mention endpoint
 * applies, so one row cannot be left in a state one of its two writers rejects.
 */
function assertQuietHoursRange(current: NotificationPrefs, patch: NotificationPrefsPatch): void {
  const merged = { ...current.quietHours, ...patch.quietHours };

  if (merged.start === merged.end) {
    throw new ApiError("Quiet hours must not start and end at the same minute", 400);
  }
}

/**
 * `NotificationPrefsPatch` → columns. Fields the patch does not carry are left out entirely, so
 * a partial `PATCH` never rewrites a switch the caller did not touch.
 *
 * Every legacy mirror is written **beside** its authority, never instead of it. That is K12 in
 * one line: an older reader — the mobile settings endpoint, the sound provider, the Settings
 * page that still reads `mobileNotifications` — keeps getting a true answer.
 */
export function buildNotificationPrefsWriteData(
  patch: NotificationPrefsPatch,
): Record<string, unknown> {
  const data: Record<string, unknown> = {};

  if (patch.level !== undefined) {
    data.level = WIRE_TO_LEVEL[patch.level];
  }

  if (patch.surfaces?.inAppToast !== undefined) {
    data.inAppToast = patch.surfaces.inAppToast;
  }
  if (patch.surfaces?.systemWhileOpen !== undefined) {
    data.systemWhileOpen = patch.surfaces.systemWhileOpen;
  }
  if (patch.surfaces?.badge !== undefined) {
    data.appBadge = patch.surfaces.badge;
  }

  if (patch.delivery?.inApp !== undefined) {
    data.deliveryInApp = patch.delivery.inApp;
  }
  if (patch.delivery?.system !== undefined) {
    data.systemMode = WIRE_TO_NOTIFICATION_MODE[patch.delivery.system];
    // The legacy pair is the authority for reads, so it has to move with the new column or the
    // write would be invisible to the very next GET.
    data.desktopMentionMode = WIRE_TO_NOTIFICATION_MODE[patch.delivery.system];
    data.desktopNotifications = patch.delivery.system !== "off";
  }
  if (patch.delivery?.push !== undefined) {
    data.deliveryPush = patch.delivery.push;
    data.mobileNotifications = patch.delivery.push;
  }
  if (patch.delivery?.email !== undefined) {
    data.deliveryEmail = patch.delivery.email;
    data.emailNotifications = patch.delivery.email;
  }

  if (patch.systemPreview !== undefined) {
    data.systemPreview = patch.systemPreview;
  }

  for (const key of NOTIFICATION_TYPE_KEYS) {
    const value = patch.types?.[key];
    if (value === undefined) {
      continue;
    }

    data[TYPE_COLUMN_BY_KEY[key]] = value;
  }

  // The four that exist twice: authority first, mirror alongside.
  if (patch.types?.mentionSelf !== undefined) {
    data.mentionSelf = patch.types.mentionSelf;
  }
  if (patch.types?.mentionRole !== undefined) {
    data.suppressRoleMentions = toSuppressColumn(patch.types.mentionRole);
  }
  if (patch.types?.mentionEveryone !== undefined) {
    data.suppressEveryoneMentions = toSuppressColumn(patch.types.mentionEveryone);
  }
  if (patch.types?.threadReplies !== undefined) {
    data.mentionThreadReplies = patch.types.threadReplies;
  }

  if (patch.quietHours?.enabled !== undefined) {
    data.quietHoursEnabled = patch.quietHours.enabled;
  }
  if (patch.quietHours?.start !== undefined) {
    data.quietHoursFrom = patch.quietHours.start;
  }
  if (patch.quietHours?.end !== undefined) {
    data.quietHoursTo = patch.quietHours.end;
  }
  if (patch.quietHours?.tz !== undefined) {
    data.quietHoursTimeZone = patch.quietHours.tz;
  }
  if (patch.quietHours?.allowCalls !== undefined) {
    data.quietHoursAllowCalls = patch.quietHours.allowCalls;
  }

  for (const key of NOTIFICATION_SOUND_KEYS) {
    const sound = patch.sounds?.[key];
    if (!sound) {
      continue;
    }

    const prefix = SOUND_COLUMN_PREFIX[key];
    if (sound.enabled !== undefined) {
      data[`${prefix}Enabled`] = sound.enabled;
      if (key === "notification") {
        data.notificationSound = sound.enabled;
      }
    }
    if (sound.profile !== undefined) {
      const column = toSoundProfileColumn(sound.profile);
      data[`${prefix}Profile`] = column;
      if (key === "notification") {
        data.notificationSoundFile = LEGACY_SOUND_FILE_BY_PROFILE[column];
      }
    }
    if (sound.volume !== undefined) {
      data[`${prefix}Volume`] = sound.volume;
    }
  }

  if (patch.panel?.count !== undefined) {
    data.panelCount = patch.panel.count;
  }
  if (patch.panel?.autoClose !== undefined) {
    data.panelAutoClose = patch.panel.autoClose;
  }
  if (patch.panel?.durationSec !== undefined) {
    data.panelDurationSec = patch.panel.durationSec;
  }
  if (patch.panel?.showContent !== undefined) {
    data.panelShowContent = patch.panel.showContent;
  }
  if (patch.panel?.showSource !== undefined) {
    data.panelShowSource = patch.panel.showSource;
  }

  if (patch.defaultMuteDuration !== undefined) {
    data.defaultMuteDuration = patch.defaultMuteDuration;
  }

  return data;
}

/**
 * §6 `PATCH`. Answers the **whole** object, not the patch: the shared keys of tuzak #4 (`nd2`,
 * `na5`, `na6`, `nq1`, `ns1`) appear on two tabs at once, and a client merging a partial answer
 * would leave the second tab showing the value it had a moment ago.
 */
export async function patchNotificationPrefs(
  userId: string,
  patch: NotificationPrefsPatch,
  dependencies: NotificationSettingsDependencies = defaultNotificationSettingsDependencies,
  options: NotificationPrefsReadOptions = {},
): Promise<NotificationPrefs> {
  assertNoLockedTypes(patch);
  const parsedPatch = NotificationPrefsPatchSchema.parse(patch);

  const { accountTimeZone, row } = await readNotificationSettingsRow<NotificationPrefsRow>(
    userId,
    NOTIFICATION_PREFS_SELECT,
    dependencies,
  );
  const current = toNotificationPrefs(row, accountTimeZone, options);

  assertQuietHoursRange(current, parsedPatch);

  const update = buildNotificationPrefsWriteData(parsedPatch);
  if (Object.keys(update).length === 0) {
    return current;
  }

  const saved = await writeNotificationSettingsRow<NotificationPrefsRow>({
    create: { ...NOTIFICATION_PREFS_ROW_DEFAULTS, ...update },
    dependencies,
    select: NOTIFICATION_PREFS_SELECT,
    update,
    userId,
  });

  return toNotificationPrefs(saved, accountTimeZone, options);
}

// ---------------------------------------------------------------------------
// K12 — the legacy endpoint's half of the two-way map
// ---------------------------------------------------------------------------

export interface LegacyNotificationColumns {
  emailNotifications?: boolean;
  mobileNotifications?: boolean;
  notificationSound?: boolean;
  notificationSoundFile?: string;
}

/**
 * K12, the other direction. `api/v1/users/me/settings` still writes the four legacy columns,
 * and without this the new columns would go stale the moment somebody used the old surface —
 * "mobil push kapalı" would be stored in one column and ignored from the other.
 *
 * `desktopNotifications` is deliberately absent: it is the **authority** for `delivery.system`,
 * so it needs no mirror written back.
 */
export function deriveModernNotificationColumns(
  legacy: LegacyNotificationColumns,
): Record<string, unknown> {
  const data: Record<string, unknown> = {};

  if (legacy.mobileNotifications !== undefined) {
    data.deliveryPush = legacy.mobileNotifications;
  }
  if (legacy.emailNotifications !== undefined) {
    data.deliveryEmail = legacy.emailNotifications;
  }
  if (legacy.notificationSound !== undefined) {
    data.soundNotificationEnabled = legacy.notificationSound;
  }
  if (legacy.notificationSoundFile !== undefined) {
    data.soundNotificationProfile = soundProfileColumnFromLegacyFile(legacy.notificationSoundFile);
  }

  return data;
}
