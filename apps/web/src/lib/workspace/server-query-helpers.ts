import { ChannelType } from "@wizards/db";
import type {
  WorkspaceAccessLevel,
  WorkspaceCategory,
  WorkspaceChannel,
  WorkspaceInvite,
  WorkspaceMember,
  WorkspaceServerSummary,
} from "@wizards/types";

import { readPresenceMap } from "@/lib/presence";
import { getRedis } from "@/lib/redis";
import {
  PermissionBits,
  canUseLockedChannelPermission,
  hasPermission,
  resolveChannelPermissions,
} from "@/lib/workspace/permissions";
import { deriveAccessLevel } from "@/lib/workspace/role-helpers";
import type { AccessContext, ChannelRecord, RoleRecord } from "@/lib/workspace/workspace-types";

export function toWorkspaceChannel(
  channel: ChannelRecord,
  unreadCounts?: Map<string, { mentionCount: number; unreadCount: number }>,
): WorkspaceChannel {
  const canAccess = channel.canAccess ?? true;
  const counts = canAccess ? unreadCounts?.get(channel.id) : undefined;

  return {
    canAccess,
    categoryId: channel.categoryId,
    id: channel.id,
    locked: channel.locked,
    mentionCount: counts?.mentionCount ?? 0,
    name: channel.name,
    position: channel.position,
    readOnly: channel.readOnly ?? false,
    topic: canAccess ? channel.topic : null,
    type: channel.type === ChannelType.VOICE ? "VOICE" : "TEXT",
    unreadCount: counts?.unreadCount ?? 0,
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

export function mapServerSummary(args: {
  accessLevel: WorkspaceAccessLevel;
  allowFileUploads: boolean;
  allowGifs: boolean;
  allowMemberAdds: boolean;
  defaultChannelId: string | null;
  iconUrl: string | null;
  id: string;
  inviteCode: string | null;
  memberCount: number;
  messageCharacterLimit: number;
  deletedMessageNoticeMinutes: number;
  mentionCount: number;
  name: string;
  shortName: string | null;
  unreadCount: number;
}): WorkspaceServerSummary {
  return {
    accessLevel: args.accessLevel,
    allowFileUploads: args.allowFileUploads,
    allowGifs: args.allowGifs,
    allowMemberAdds: args.allowMemberAdds,
    defaultChannelId: args.defaultChannelId,
    iconUrl: args.iconUrl,
    id: args.id,
    inviteCode: args.inviteCode,
    memberCount: args.memberCount,
    messageCharacterLimit: args.messageCharacterLimit,
    deletedMessageNoticeMinutes: args.deletedMessageNoticeMinutes,
    mentionCount: args.mentionCount,
    name: args.name,
    shortName: args.shortName,
    unreadCount: args.unreadCount,
  };
}

export async function mapMembers(
  ownerId: string,
  members: Array<{
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
  const presenceByUserId = await readPresenceMap(
    getRedis(),
    members.map((member) => ({
      customStatus: member.user.customStatus,
      status: "OFFLINE",
      userId: member.user.id,
    })),
  );

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
