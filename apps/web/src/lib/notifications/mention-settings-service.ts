import {
  MENTION_SETTINGS_DEFAULTS,
  MentionSettingsPatchSchema,
  MentionSettingsSchema,
  type MentionDesktopMode,
  type MentionSettings,
  type MentionSettingsPatch,
} from "@wizards/types";

import { ApiError } from "@/lib/api";
import {
  NOTIFICATION_MODE_TO_WIRE,
  WIRE_TO_NOTIFICATION_MODE,
  defaultNotificationSettingsDependencies,
  listNotificationSettingsRows,
  readNotificationSettingsRow,
  toMentionSwitch,
  toSuppressColumn,
  writeNotificationSettingsRow,
  type NotificationModeColumn,
  type NotificationSettingsDependencies,
} from "@/lib/notifications/prefs-service";
import { parseQuietHourMinutes, resolveQuietHoursTimeZone } from "@/lib/notifications/quiet-hours";

/**
 * Bahsedilmeler Ş4 — SPEC-BAHSEDILMELER §7, karar K6.
 *
 * The mention switches live on `UserNotificationSettings`, and two of them were there before this
 * screen existed — inverted. `suppressRoleMentions` / `suppressEveryoneMentions` are true when the
 * switch is **off**. That inversion is resolved here and nowhere else: neither the route nor a
 * component writes `!suppress…`, so the two surfaces that show these switches (the mention modal
 * and the Settings page) cannot drift apart by disagreeing about the sign.
 *
 * `desktopNotifications` is the same story from the other end. `desktopMentionMode` replaced it
 * (Ş0.2 backfilled the enum from the boolean), but the boolean stays for one version and the older
 * settings endpoint still writes it. This service therefore reads the boolean as a gate over the
 * enum and writes both whenever the mode changes, so neither surface can show a stale answer.
 *
 * Ayarlar Ş1 — this service no longer holds its own Prisma calls. `notification-prefs` writes the
 * same row, and two independent upserts mean the second one wins and resets the first surface's
 * switches (tuzak #3). Both now go through the door in `prefs-service.ts`; the inversion above is
 * still resolved on this side of it, through the two helpers that module defines so the sign is
 * written down exactly once. The endpoint's behaviour and its payload are unchanged.
 */

type DesktopMentionModeColumn = NotificationModeColumn;

const DESKTOP_MODE_TO_COLUMN = WIRE_TO_NOTIFICATION_MODE satisfies Record<
  MentionDesktopMode,
  DesktopMentionModeColumn
>;

const DESKTOP_COLUMN_TO_MODE = NOTIFICATION_MODE_TO_WIRE satisfies Record<
  DesktopMentionModeColumn,
  MentionDesktopMode
>;

/** The columns §7 needs. Deliberately narrow: nothing else on the row belongs to this screen. */
export interface MentionSettingsRow {
  readonly desktopMentionMode: DesktopMentionModeColumn;
  readonly desktopNotifications: boolean;
  readonly mentionSelf: boolean;
  readonly mentionThreadReplies: boolean;
  readonly quietHoursEnabled: boolean;
  readonly quietHoursFrom: string | null;
  readonly quietHoursTimeZone: string | null;
  readonly quietHoursTo: string | null;
  readonly suppressEveryoneMentions: boolean;
  readonly suppressRoleMentions: boolean;
}

/** The scalar half of a write. Both the `create` and the `update` branch are built from this. */
export interface MentionSettingsWriteData {
  desktopMentionMode?: DesktopMentionModeColumn;
  desktopNotifications?: boolean;
  mentionSelf?: boolean;
  mentionThreadReplies?: boolean;
  quietHoursEnabled?: boolean;
  quietHoursFrom?: string | null;
  quietHoursTimeZone?: string | null;
  quietHoursTo?: string | null;
  suppressEveryoneMentions?: boolean;
  suppressRoleMentions?: boolean;
}

/** The same dependency bag `prefs-service` takes: one row, one door, one fake in the tests. */
export type MentionSettingsDependencies = NotificationSettingsDependencies;

export const defaultMentionSettingsDependencies: MentionSettingsDependencies =
  defaultNotificationSettingsDependencies;

const MENTION_SETTINGS_SELECT = {
  desktopMentionMode: true,
  desktopNotifications: true,
  mentionSelf: true,
  mentionThreadReplies: true,
  quietHoursEnabled: true,
  quietHoursFrom: true,
  quietHoursTimeZone: true,
  quietHoursTo: true,
  suppressEveryoneMentions: true,
  suppressRoleMentions: true,
} as const;

/**
 * A stored range that is not `HH:mm` is read as no range. The endpoint refuses to write one, so
 * this only fires on a row an older client left behind — and a half-parsed range is worse than
 * none: it would silence a stretch of the day nobody chose.
 */
function readQuietHourTime(value: string | null): string | null {
  return parseQuietHourMinutes(value) === null ? null : value;
}

/**
 * §7 read path. `accountTimeZone` is `UserSettings.timeZone`; the returned zone is always
 * resolved, so no caller has to repeat the fallback chain.
 */
export function toMentionSettings(
  row: MentionSettingsRow | null,
  accountTimeZone: string | null,
): MentionSettings {
  if (!row) {
    return MentionSettingsSchema.parse({
      ...MENTION_SETTINGS_DEFAULTS,
      quietHours: {
        ...MENTION_SETTINGS_DEFAULTS.quietHours,
        timeZone: resolveQuietHoursTimeZone(null, accountTimeZone),
      },
    });
  }

  const desktop: MentionDesktopMode = row.desktopNotifications
    ? DESKTOP_COLUMN_TO_MODE[row.desktopMentionMode]
    : "off";

  return MentionSettingsSchema.parse({
    desktop,
    everyone: toMentionSwitch(row.suppressEveryoneMentions),
    me: row.mentionSelf,
    quietHours: {
      enabled: row.quietHoursEnabled,
      from: readQuietHourTime(row.quietHoursFrom),
      timeZone: resolveQuietHoursTimeZone(row.quietHoursTimeZone, accountTimeZone),
      to: readQuietHourTime(row.quietHoursTo),
    },
    role: toMentionSwitch(row.suppressRoleMentions),
    threadReplies: row.mentionThreadReplies,
  });
}

/**
 * §7 write path — the mirror of `toMentionSettings`, and the only other place the two inverted
 * columns are named. Fields the patch does not carry are left out entirely, so a partial `PATCH`
 * never rewrites a switch the caller did not touch.
 */
export function buildMentionSettingsWriteData(
  patch: MentionSettingsPatch,
): MentionSettingsWriteData {
  const data: MentionSettingsWriteData = {};

  if (patch.me !== undefined) {
    data.mentionSelf = patch.me;
  }

  if (patch.role !== undefined) {
    data.suppressRoleMentions = toSuppressColumn(patch.role);
  }

  if (patch.everyone !== undefined) {
    data.suppressEveryoneMentions = toSuppressColumn(patch.everyone);
  }

  if (patch.threadReplies !== undefined) {
    data.mentionThreadReplies = patch.threadReplies;
  }

  if (patch.desktop !== undefined) {
    data.desktopMentionMode = DESKTOP_MODE_TO_COLUMN[patch.desktop];
    // K6 back-compat: the boolean keeps its meaning for one more version, and a reader still
    // consulting it must not see `true` while the enum says `OFF`.
    data.desktopNotifications = patch.desktop !== "off";
  }

  if (patch.quietHours?.enabled !== undefined) {
    data.quietHoursEnabled = patch.quietHours.enabled;
  }

  if (patch.quietHours?.from !== undefined) {
    data.quietHoursFrom = patch.quietHours.from;
  }

  if (patch.quietHours?.to !== undefined) {
    data.quietHoursTo = patch.quietHours.to;
  }

  if (patch.quietHours?.timeZone !== undefined) {
    data.quietHoursTimeZone = patch.quietHours.timeZone;
  }

  return data;
}

/**
 * The range is validated on the **merged** result, not on the patch alone: switching quiet hours
 * on is a one-field patch, and the range it needs is already on the row.
 */
function assertQuietHoursRange(current: MentionSettings, patch: MentionSettingsPatch): void {
  const merged = { ...current.quietHours, ...patch.quietHours };

  if (merged.from !== null && merged.to !== null && merged.from === merged.to) {
    // A zero-length range reads as "never quiet" or "always quiet" depending on who wrote the
    // comparison. Refuse the shape rather than pick a side.
    throw new ApiError("Quiet hours must not start and end at the same minute", 400);
  }

  if (merged.enabled && (merged.from === null || merged.to === null)) {
    throw new ApiError("Quiet hours need a start and an end", 400);
  }
}

function loadMentionSettingsRow(userId: string, dependencies: MentionSettingsDependencies) {
  return readNotificationSettingsRow<MentionSettingsRow>(
    userId,
    MENTION_SETTINGS_SELECT,
    dependencies,
  );
}

/**
 * §7 `GET`. A user who has never opened the modal has no row; the defaults are returned and
 * **nothing is written** — a read that writes turns every settings fetch into an insert and makes
 * "has this user ever chosen anything" unanswerable.
 */
export async function getMentionSettings(
  userId: string,
  dependencies: MentionSettingsDependencies = defaultMentionSettingsDependencies,
): Promise<MentionSettings> {
  const { accountTimeZone, row } = await loadMentionSettingsRow(userId, dependencies);

  return toMentionSettings(row, accountTimeZone);
}

/**
 * The fan-out read (Ş2). One query for every recipient of one message — a per-recipient read would
 * turn a 200-member role mention into 200 round trips on the send path.
 *
 * Recipients with no row are simply absent from the map; `readMentionSettings` fills them in with
 * the defaults, so the caller never has to know which shape a missing row has.
 */
export async function listMentionSettings(
  userIds: readonly string[],
  dependencies: MentionSettingsDependencies = defaultMentionSettingsDependencies,
): Promise<Map<string, MentionSettings>> {
  const uniqueIds = [...new Set(userIds)];
  const settings = new Map<string, MentionSettings>();

  if (uniqueIds.length === 0) {
    return settings;
  }

  const rows = await listNotificationSettingsRows<MentionSettingsRow>(
    uniqueIds,
    MENTION_SETTINGS_SELECT,
    dependencies,
  );

  for (const entry of rows) {
    if (!entry.row) {
      continue;
    }

    settings.set(entry.id, toMentionSettings(entry.row, entry.accountTimeZone));
  }

  return settings;
}

/** The defaults-aware read over `listMentionSettings`. */
export function readMentionSettings(
  settings: ReadonlyMap<string, MentionSettings>,
  userId: string,
): MentionSettings {
  return settings.get(userId) ?? toMentionSettings(null, null);
}

/**
 * §7 `PATCH`. Creates the row on first write. The patch is validated here rather than trusted from
 * the route: this service is the single door both surfaces go through.
 */
export async function updateMentionSettings(
  userId: string,
  patch: MentionSettingsPatch,
  dependencies: MentionSettingsDependencies = defaultMentionSettingsDependencies,
): Promise<MentionSettings> {
  const parsedPatch = MentionSettingsPatchSchema.parse(patch);
  const { accountTimeZone, row } = await loadMentionSettingsRow(userId, dependencies);
  const current = toMentionSettings(row, accountTimeZone);

  assertQuietHoursRange(current, parsedPatch);

  const update = buildMentionSettingsWriteData(parsedPatch);
  if (Object.keys(update).length === 0) {
    return current;
  }

  // The create branch spells the whole row out. Prisma's column defaults already match §7, but a
  // create leaning on them would quietly disagree the day a default moves in one place only.
  const create = buildMentionSettingsWriteData({
    ...MENTION_SETTINGS_DEFAULTS,
    ...parsedPatch,
    quietHours: { ...MENTION_SETTINGS_DEFAULTS.quietHours, ...parsedPatch.quietHours },
  });

  const saved = await writeNotificationSettingsRow<MentionSettingsRow>({
    create,
    dependencies,
    select: MENTION_SETTINGS_SELECT,
    update,
    userId,
  });

  return toMentionSettings(saved, accountTimeZone);
}
