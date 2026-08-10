import type { MessageNotification, PrismaClient } from "@wizards/db";
import type { ServerNotificationLevel, ServerUserSettings } from "@wizards/types";

import { getAccessContext } from "@/lib/workspace/access-context";

export type ServerUserSettingsRow = {
  readonly messageNotifications: MessageNotification;
  readonly muted: boolean;
  readonly mutedUntil: Date | null;
  readonly starred: boolean;
};

/**
 * `MessageNotification` has four members and the client contract has three:
 * `DEFAULT` means "inherit the server's own default", which 6c renders as
 * "Tümü" because that default is `ALL_MESSAGES`. The mapping lives here, once,
 * and is asserted in both directions -- a second copy inside a route is how
 * "sessize al" and "bildirim ayarları" would start disagreeing.
 */
export function toServerNotificationLevel(value: MessageNotification): ServerNotificationLevel {
  switch (value) {
    case "MENTIONS":
      return "mentions";
    case "NOTHING":
      return "none";
    default:
      return "all";
  }
}

export function toMessageNotification(value: ServerNotificationLevel): MessageNotification {
  switch (value) {
    case "mentions":
      return "MENTIONS";
    case "none":
      return "NOTHING";
    default:
      return "ALL";
  }
}

export const DEFAULT_SERVER_USER_SETTINGS: ServerUserSettings = {
  muted: false,
  mutedUntil: null,
  notificationLevel: "all",
  starred: false,
};

/** Pure: the row is created lazily, so "no row" is the default, not an error. */
export function buildServerUserSettings(row: ServerUserSettingsRow | null): ServerUserSettings {
  if (!row) {
    return DEFAULT_SERVER_USER_SETTINGS;
  }

  return {
    muted: row.muted,
    mutedUntil: row.mutedUntil?.toISOString() ?? null,
    notificationLevel: toServerNotificationLevel(row.messageNotifications),
    starred: row.starred,
  };
}

export type UpdateServerUserSettingsFields = {
  readonly muted?: boolean | undefined;
  readonly mutedUntil?: string | null | undefined;
  readonly notificationLevel?: ServerNotificationLevel | undefined;
  readonly starred?: boolean | undefined;
};

/**
 * Pure so the "only the fields the caller sent" rule is assertable without a
 * database: an update that carries `starred` alone must not reset the mute.
 */
export function buildServerUserSettingsUpdateData(input: UpdateServerUserSettingsFields): {
  messageNotifications?: MessageNotification;
  muted?: boolean;
  mutedUntil?: Date | null;
  starred?: boolean;
} {
  const data: {
    messageNotifications?: MessageNotification;
    muted?: boolean;
    mutedUntil?: Date | null;
    starred?: boolean;
  } = {};

  if (input.muted !== undefined) {
    data.muted = input.muted;
  }

  if (input.mutedUntil !== undefined) {
    data.mutedUntil = input.mutedUntil === null ? null : new Date(input.mutedUntil);
  }

  if (input.notificationLevel !== undefined) {
    data.messageNotifications = toMessageNotification(input.notificationLevel);
  }

  if (input.starred !== undefined) {
    data.starred = input.starred;
  }

  return data;
}

const SERVER_USER_SETTINGS_SELECT = {
  messageNotifications: true,
  muted: true,
  mutedUntil: true,
  starred: true,
} as const;

export async function updateServerUserSettingsWithDatabase(
  database: PrismaClient,
  userId: string,
  serverId: string,
  input: UpdateServerUserSettingsFields,
): Promise<ServerUserSettings> {
  const data = buildServerUserSettingsUpdateData(input);

  const row = await database.userServerSettings.upsert({
    create: { serverId, userId, ...data },
    select: SERVER_USER_SETTINGS_SELECT,
    update: data,
    where: { userId_serverId: { serverId, userId } },
  });

  return buildServerUserSettings(row);
}

export async function updateServerUserSettings(
  userId: string,
  serverId: string,
  input: UpdateServerUserSettingsFields,
): Promise<ServerUserSettings> {
  const { prisma } = await import("@wizards/db");
  // Membership is the gate: these are the viewer's own preferences about a
  // server they are in, not a server-wide setting.
  await getAccessContext(userId, serverId);

  return updateServerUserSettingsWithDatabase(prisma, userId, serverId, input);
}

/**
 * A0.3: the mobile bootstrap carries up to 50 servers and 6c reads three
 * preferences off each of them. One `IN` query for the whole list — a lookup
 * per server would put 50 round trips on the app's cold-start path.
 *
 * Servers without a row are simply absent from the map; the caller applies
 * `DEFAULT_SERVER_USER_SETTINGS`, because the row is created lazily on first
 * write and "no row" is the default rather than a miss.
 */
export async function listServerUserSettingsWithDatabase(
  database: PrismaClient,
  userId: string,
  serverIds: readonly string[],
): Promise<Map<string, ServerUserSettings>> {
  if (serverIds.length === 0) {
    return new Map();
  }

  const rows = await database.userServerSettings.findMany({
    select: { ...SERVER_USER_SETTINGS_SELECT, serverId: true },
    where: { serverId: { in: [...serverIds] }, userId },
  });

  return new Map(rows.map((row) => [row.serverId, buildServerUserSettings(row)]));
}

export async function getServerUserSettingsWithDatabase(
  database: PrismaClient,
  userId: string,
  serverId: string,
): Promise<ServerUserSettings> {
  const row = await database.userServerSettings.findUnique({
    select: SERVER_USER_SETTINGS_SELECT,
    where: { userId_serverId: { serverId, userId } },
  });

  return buildServerUserSettings(row);
}
