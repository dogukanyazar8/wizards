import { ChannelType } from "@wizards/db";
import type Redis from "ioredis";
import { SERVER_ICON_TONES } from "@wizards/types";
import type {
  ServerIconTone,
  WorkspaceAccessLevel,
  WorkspaceCategory,
  WorkspaceChannel,
  WorkspaceInvite,
  WorkspaceMember,
  WorkspaceServerSummary,
} from "@wizards/types";

import { readPresenceState } from "@/lib/presence";
import {
  redactPresenceCollectionForViewer,
  resolveVisibilityDecisions,
  type VisibilityDecision,
} from "@/lib/privacy/visibility-policy";
import { getRedis } from "@/lib/redis";
import {
  PermissionBits,
  canUseLockedChannelPermission,
  hasPermission,
  resolveChannelPermissions,
} from "@/lib/workspace/permissions";
import { deriveAccessLevel } from "@/lib/workspace/role-helpers";
import type { AccessContext, ChannelRecord, RoleRecord } from "@/lib/workspace/workspace-types";

let serverMemberPresenceRedisForTest: Redis | null = null;
let serverMemberVisibilityResolverForTest:
  | ((viewerId: string, subjectIds: readonly string[]) => Promise<Map<string, VisibilityDecision>>)
  | null = null;

export function setServerMemberPresenceRedisForTest(redis: Redis | null) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("setServerMemberPresenceRedisForTest is not available in production.");
  }
  serverMemberPresenceRedisForTest = redis;
}

export function setServerMemberVisibilityResolverForTest(
  resolver:
    | ((
        viewerId: string,
        subjectIds: readonly string[],
      ) => Promise<Map<string, VisibilityDecision>>)
    | null,
) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("setServerMemberVisibilityResolverForTest is not available in production.");
  }
  serverMemberVisibilityResolverForTest = resolver;
}

export function toWorkspaceChannel(
  channel: ChannelRecord,
  unreadCounts?: Map<string, { mentionCount: number; unreadCount: number }>,
): WorkspaceChannel {
  const canAccess = channel.canAccess ?? true;
  const counts = canAccess ? unreadCounts?.get(channel.id) : undefined;

  return {
    bitrate: channel.bitrate ?? 64_000,
    canAccess,
    categoryId: channel.categoryId,
    id: channel.id,
    locked: channel.locked,
    mentionCount: counts?.mentionCount ?? 0,
    name: channel.name,
    position: channel.position,
    readOnly: channel.readOnly ?? false,
    rtcRegion: channel.rtcRegion ?? null,
    slowModeDelay: channel.slowModeDelay ?? 0,
    topic: canAccess ? channel.topic : null,
    type: channel.type === ChannelType.VOICE ? "VOICE" : "TEXT",
    unreadCount: counts?.unreadCount ?? 0,
    userLimit: channel.userLimit ?? 0,
    videoQualityMode: channel.videoQualityMode ?? "AUTO",
  };
}

function serializeDate(date: Date | null) {
  return date ? date.toISOString() : null;
}

function getDisplayName(
  user: {
    avatarUrl: string | null;
    displayName: string | null;
    username: string;
  },
  nickname?: string | null,
) {
  return nickname ?? user.displayName ?? user.username;
}

/**
 * `Server.iconColor` düz metin bir kolondur; sözleşme ise altı tonluk bir enum (Ş0, K2).
 *
 * Tanınmayan bir değeri `null`'a düşürmek, tonu geri alan bir sürüm sonrası satırın hâlâ
 * okunabilmesini sağlar: `null` zaten "kısa addan türet" demek, yani en kötü ihtimalle
 * ikon migration öncesindeki görünümüne döner — yanıtın tamamı ayrıştırılamaz hâle gelmez.
 */
export function parseServerIconTone(value: string | null): ServerIconTone | null {
  return SERVER_ICON_TONES.includes(value as ServerIconTone) ? (value as ServerIconTone) : null;
}

export function mapServerSummary(args: {
  accessLevel: WorkspaceAccessLevel;
  allowFileUploads: boolean;
  allowGifs: boolean;
  allowMemberAdds: boolean;
  defaultChannelId: string | null;
  /** `null` = kısa addan deterministik türetme (Ş0, K2). Geri doldurma yok. */
  iconColor: ServerIconTone | null;
  iconUrl: string | null;
  id: string;
  inviteCode: string | null;
  memberCount: number;
  messageCharacterLimit: number;
  deletedMessageNoticeMinutes: number;
  mentionCount: number;
  name: string;
  shortName: string | null;
  /** Sunucu geneli yavaş mod, saniye; kanal ayarıyla `max(...)` (Ş0, K2). */
  slowModeDelay: number;
  /** 6c "Yıldızla"; absent when the lazy `UserServerSettings` row does not exist. */
  starred?: boolean;
  unreadCount: number;
}): WorkspaceServerSummary {
  return {
    accessLevel: args.accessLevel,
    allowFileUploads: args.allowFileUploads,
    allowGifs: args.allowGifs,
    allowMemberAdds: args.allowMemberAdds,
    defaultChannelId: args.defaultChannelId,
    iconColor: args.iconColor,
    iconUrl: args.iconUrl,
    id: args.id,
    inviteCode: args.inviteCode,
    memberCount: args.memberCount,
    messageCharacterLimit: args.messageCharacterLimit,
    deletedMessageNoticeMinutes: args.deletedMessageNoticeMinutes,
    mentionCount: args.mentionCount,
    name: args.name,
    shortName: args.shortName,
    slowModeDelay: args.slowModeDelay,
    starred: args.starred ?? false,
    unreadCount: args.unreadCount,
  };
}

/**
 * `online`/`offline` çipinin geçireceği kullanıcı kümesi (Ş2, SPEC-SUNUCU §8.6).
 *
 * Presence Redis'te yaşar ve **izleyiciye göre gizlenir**: görünmez moddaki bir üye herkese
 * `OFFLINE` görünür. Bu yüzden çevrimiçi kümesi ham Redis setinden değil, üye satırıyla aynı
 * gizlilik kararından üretiliyor — aksi hâlde `online` çipi, listede `Çevrimdışı` yazan bir
 * satırı geçirirdi.
 */
export async function readVisibleOnlineMemberUserIds(
  viewerId: string,
  members: ReadonlyArray<{ customStatus: string | null; userId: string }>,
): Promise<string[]> {
  if (members.length === 0) {
    return [];
  }

  const userIds = members.map((member) => member.userId);
  const [presenceState, visibilityDecisions] = await Promise.all([
    readPresenceState(
      serverMemberPresenceRedisForTest ?? getRedis(),
      members.map((member) => ({
        customStatus: member.customStatus,
        status: "OFFLINE",
        userId: member.userId,
      })),
    ),
    (serverMemberVisibilityResolverForTest ?? resolveVisibilityDecisions)(viewerId, userIds),
  ]);
  const { presenceByUserId } = redactPresenceCollectionForViewer({
    decisions: visibilityDecisions,
    invisibleUserIds: presenceState.hiddenUserIds,
    lastSeenByUserId: new Map(),
    presenceByUserId: presenceState.presenceByUserId,
    subjectIds: userIds,
  });

  return userIds.filter(
    (userId) => (presenceByUserId.get(userId)?.status ?? "OFFLINE") !== "OFFLINE",
  );
}

export async function mapMembers(
  ownerId: string,
  viewerId: string,
  members: Array<{
    communicationDisabledUntil: Date | null;
    id: string;
    nickname: string | null;
    roles: Array<{
      role: RoleRecord;
    }>;
    user: {
      avatarUrl: string | null;
      customStatus: string | null;
      displayName: string | null;
      id: string;
      status: string;
      username: string;
    };
  }>,
): Promise<WorkspaceMember[]> {
  const userIds = members.map((member) => member.user.id);
  const [presenceState, visibilityDecisions] = await Promise.all([
    readPresenceState(
      serverMemberPresenceRedisForTest ?? getRedis(),
      members.map((member) => ({
        customStatus: member.user.customStatus,
        status: "OFFLINE",
        userId: member.user.id,
      })),
    ),
    (serverMemberVisibilityResolverForTest ?? resolveVisibilityDecisions)(viewerId, userIds),
  ]);
  const { presenceByUserId } = redactPresenceCollectionForViewer({
    decisions: visibilityDecisions,
    invisibleUserIds: presenceState.hiddenUserIds,
    lastSeenByUserId: new Map(),
    presenceByUserId: presenceState.presenceByUserId,
    subjectIds: userIds,
  });

  return members.map((member) => {
    const roles = member.roles.map((entry) => ({
      color: entry.role.color,
      id: entry.role.id,
      name: entry.role.name,
    }));
    const presence = presenceByUserId.get(member.user.id) ?? {
      customStatus: member.user.customStatus,
      status: "OFFLINE" as const,
    };

    return {
      accessLevel: deriveAccessLevel(
        ownerId,
        member.user.id,
        member.roles.map((entry) => entry.role),
      ),
      avatarUrl: member.user.avatarUrl,
      communicationDisabledUntil: serializeDate(member.communicationDisabledUntil),
      customStatus: presence.customStatus,
      displayName: getDisplayName(member.user, member.nickname),
      id: member.id,
      roles,
      status: presence.status,
      userId: member.user.id,
      username: member.user.username,
    };
  });
}

export function mapInvites(
  invites: Array<{
    channelId: string | null;
    code: string;
    createdAt: Date;
    creator: {
      displayName: string | null;
      username: string;
    };
    expiresAt: Date | null;
    id: string;
    maxUses: number | null;
    targetUserId: string | null;
    uses: number;
  }>,
): WorkspaceInvite[] {
  return invites.map((invite) => ({
    channelId: invite.channelId,
    code: invite.code,
    createdAt: invite.createdAt.toISOString(),
    createdByDisplayName: invite.creator.displayName ?? invite.creator.username,
    expiresAt: serializeDate(invite.expiresAt),
    id: invite.id,
    maxUses: invite.maxUses,
    targetUserId: invite.targetUserId,
    uses: invite.uses,
  }));
}

export function mapCategories(
  categories: Array<{
    channels: ChannelRecord[];
    id: string;
    name: string;
    position: number;
  }>,
  unreadCounts?: Map<string, { mentionCount: number; unreadCount: number }>,
): WorkspaceCategory[] {
  return categories.map((category) => ({
    channels: category.channels.map((channel) => toWorkspaceChannel(channel, unreadCounts)),
    id: category.id,
    name: category.name,
    position: category.position,
  }));
}

export function withVisibleChannelAccess(
  access: AccessContext,
  channel: ChannelRecord,
): ChannelRecord | null {
  const context = {
    memberId: access.memberId,
    ownerId: access.ownerId,
    roles: access.roles,
    userId: access.userId,
    overrides: channel.permissionOverrides ?? [],
  };
  const permissions = resolveChannelPermissions(context);
  const canView = hasPermission(permissions, PermissionBits.VIEW_CHANNEL);

  if (!canView) {
    return null;
  }

  const canConnectVoice =
    hasPermission(permissions, PermissionBits.CONNECT_VOICE) &&
    (!channel.locked || canUseLockedChannelPermission(context, PermissionBits.CONNECT_VOICE));
  const canSendMessages = hasPermission(permissions, PermissionBits.SEND_MESSAGES);

  return {
    ...channel,
    canAccess: channel.type === ChannelType.VOICE ? canConnectVoice : true,
    readOnly: channel.type === ChannelType.TEXT ? !canSendMessages : false,
  };
}

export function pickDefaultChannelId(args: {
  categories: WorkspaceCategory[];
  ungroupedChannels: WorkspaceChannel[];
}) {
  const canOpenChannel = (channel: WorkspaceChannel) => channel.canAccess !== false;
  const firstGroupedChannel = args.categories
    .flatMap((category) => category.channels)
    .find(canOpenChannel);
  return firstGroupedChannel?.id ?? args.ungroupedChannels.find(canOpenChannel)?.id ?? null;
}
