import { ChannelType, prisma } from "@wizards/db";
import type { Prisma } from "@wizards/db";
import type {
  CreateServerInput,
  DeleteServerInput,
  UpdateServerInput,
  WorkspaceServerDetail,
} from "@wizards/types";

import { ApiError } from "@/lib/api";
import { getSocketServer } from "@/lib/socket/runtime";
import { invalidateServerRoomIdsCache } from "@/lib/socket/server-room-cache";
import {
  ensureOwner,
  ensureServerPermission,
  getAccessContext,
} from "@/lib/workspace/access-context";
import { generateInviteCode } from "@/lib/workspace/invite-code";
import { invalidateServerPermissionCache } from "@/lib/workspace/permission-cache";
import {
  getServerChannelUnreadCounts,
  getServerMentionCount,
  getServerUnreadAndMentionCounts,
  getServerUnreadCount,
} from "@/lib/workspace/unread-service";
import { applyServerMediaSettings, getServerMediaSettings } from "@/lib/workspace/server-features";
import {
  MEMBER_BASE_PERMISSIONS,
  MODERATOR_PERMISSIONS,
  PermissionBits,
  SERVER_ADMIN_PERMISSIONS,
  hasPermission,
  resolveChannelPermissions,
  resolveServerPermissions,
} from "@/lib/workspace/permissions";
import {
  deriveAccessLevel,
  mergeRoleRecords,
  toWorkspaceRole,
} from "@/lib/workspace/role-helpers";
import {
  mapCategories,
  mapInvites,
  mapMembers,
  mapServerSummary,
  pickDefaultChannelId,
  toWorkspaceChannel,
  withVisibleChannelAccess,
} from "@/lib/workspace/server-query-helpers";
import {
  MODERATOR_ROLE_COLOR,
  SERVER_DETAIL_MEMBER_LIMIT,
  SERVER_MEMBERS_PAGE_LIMIT,
} from "@/lib/workspace/workspace-constants";
import type { ChannelRecord } from "@/lib/workspace/workspace-types";

export async function listWorkspaceServers(userId: string) {
  const memberships = await prisma.serverMember.findMany({
    orderBy: {
      joinedAt: "asc",
    },
    where: {
      server: {
        bans: {
          none: {
            userId,
          },
        },
      },
      userId,
    },
    select: {
      id: true,
      roles: {
        select: {
          role: {
            select: {
              color: true,
              id: true,
              isDefault: true,
              name: true,
              permissions: true,
            },
          },
        },
      },
      server: {
        select: {
          _count: {
            select: {
              members: true,
            },
          },
          channels: {
            orderBy: {
              position: "asc",
            },
            select: {
              id: true,
              permissionOverrides: {
                select: {
                  allow: true,
                  deny: true,
                  targetId: true,
                  targetType: true,
                },
              },
            },
            where: {
              parentId: null,
              type: ChannelType.TEXT,
            },
          },
          iconUrl: true,
          features: true,
          id: true,
          inviteCode: true,
          messageCharacterLimit: true,
          deletedMessageNoticeMinutes: true,
          name: true,
          ownerId: true,
          roles: {
            where: { isDefault: true },
            select: {
              color: true,
              id: true,
              isDefault: true,
              name: true,
              permissions: true,
            },
          },
          shortName: true,
        },
      },
    },
  });

  const serverIds = memberships.map((membership) => membership.server.id);
  const { mentionCounts, unreadCounts } = await getServerUnreadAndMentionCounts(userId, serverIds);

  return memberships.map((membership) => {
    const mediaSettings = getServerMediaSettings(membership.server.features);
    const roles = mergeRoleRecords(
      membership.server.roles,
      membership.roles.map((entry) => entry.role),
    );
    const defaultChannelId =
      membership.server.channels.find((channel) =>
        hasPermission(
          resolveChannelPermissions({
            memberId: membership.id,
            ownerId: membership.server.ownerId,
            roles,
            userId,
            overrides: channel.permissionOverrides,
          }),
          PermissionBits.VIEW_CHANNEL,
        ),
      )?.id ?? null;

    return mapServerSummary({
      accessLevel: deriveAccessLevel(membership.server.ownerId, userId, roles),
      allowFileUploads: mediaSettings.allowFileUploads,
      allowGifs: mediaSettings.allowGifs,
      allowMemberAdds: mediaSettings.allowMemberAdds,
      defaultChannelId,
      iconUrl: membership.server.iconUrl,
      id: membership.server.id,
      inviteCode: membership.server.inviteCode,
      memberCount: membership.server._count.members,
      messageCharacterLimit: membership.server.messageCharacterLimit,
      deletedMessageNoticeMinutes: membership.server.deletedMessageNoticeMinutes,
      mentionCount: mentionCounts.get(membership.server.id) ?? 0,
      name: membership.server.name,
      shortName: membership.server.shortName,
      unreadCount: unreadCounts.get(membership.server.id) ?? 0,
    });
  });
}

export async function getWorkspaceServerDetail(
  userId: string,
  serverId: string,
): Promise<WorkspaceServerDetail> {
  const access = await getAccessContext(userId, serverId);
  const isAdmin = access.accessLevel !== "MEMBER";
  const canManageInvites = hasPermission(
    resolveServerPermissions(access),
    PermissionBits.MANAGE_INVITES,
  );

  const [server, invites, unreadCount, mentionCount, channelUnreadCounts] = await Promise.all([
    prisma.server.findUnique({
      where: {
        id: serverId,
      },
      select: {
        _count: {
          select: {
            members: true,
          },
        },
        categories: {
          orderBy: {
            position: "asc",
          },
          select: {
            channels: {
              orderBy: {
                position: "asc",
              },
              select: {
                categoryId: true,
                id: true,
                locked: true,
                name: true,
                permissionOverrides: {
                  select: {
                    allow: true,
                    deny: true,
                    targetId: true,
                    targetType: true,
                  },
                },
                position: true,
                topic: true,
                type: true,
              },
              where: {
                parentId: null,
                type: {
                  in: [ChannelType.TEXT, ChannelType.VOICE],
                },
              },
            },
            id: true,
            name: true,
            position: true,
          },
        },
        channels: {
          orderBy: {
            position: "asc",
          },
          select: {
            categoryId: true,
            id: true,
            locked: true,
            name: true,
            permissionOverrides: {
              select: {
                allow: true,
                deny: true,
                targetId: true,
                targetType: true,
              },
            },
            position: true,
            topic: true,
            type: true,
          },
          where: {
            categoryId: null,
            parentId: null,
            type: {
              in: [ChannelType.TEXT, ChannelType.VOICE],
            },
          },
        },
        description: true,
        features: true,
        iconUrl: true,
        id: true,
        inviteCode: true,
        messageCharacterLimit: true,
        deletedMessageNoticeMinutes: true,
        members: {
          orderBy: [
            {
              joinedAt: "asc",
            },
            {
              id: "asc",
            },
          ],
          select: {
            id: true,
            nickname: true,
            roles: {
              select: {
                role: {
                  select: {
                    color: true,
                    id: true,
                    name: true,
                    permissions: true,
                  },
                },
              },
            },
            user: {
              select: {
                avatarUrl: true,
                customStatus: true,
                displayName: true,
                id: true,
                status: true,
                username: true,
              },
            },
          },
          take: SERVER_DETAIL_MEMBER_LIMIT + 1,
        },
        name: true,
        ownerId: true,
        roles: {
          orderBy: [
            {
              position: "desc",
            },
            {
              createdAt: "asc",
            },
          ],
          select: {
            color: true,
            id: true,
            isDefault: true,
            managed: true,
            mentionable: true,
            name: true,
            permissions: true,
            position: true,
          },
        },
        shortName: true,
      },
    }),
    canManageInvites
      ? prisma.serverInvite.findMany({
          orderBy: {
            createdAt: "desc",
          },
          select: {
            channelId: true,
            code: true,
            createdAt: true,
            creator: {
              select: {
                displayName: true,
                username: true,
              },
            },
            expiresAt: true,
            id: true,
            maxUses: true,
            uses: true,
          },
          where: {
            serverId,
          },
        })
      : Promise.resolve([]),
    getServerUnreadCount(userId, serverId),
    getServerMentionCount(userId, serverId),
    getServerChannelUnreadCounts(userId, serverId),
  ]);

  if (!server) {
    throw new ApiError("Server not found", 404);
  }

  const visibleCategories = server.categories.map((category) => ({
    ...category,
    channels: category.channels
      .map((channel) => withVisibleChannelAccess(access, channel))
      .filter((channel): channel is ChannelRecord => channel !== null),
  }));
  const visibleUngroupedChannelRows = server.channels
    .map((channel) => withVisibleChannelAccess(access, channel))
    .filter((channel): channel is ChannelRecord => channel !== null);
  const categories = mapCategories(visibleCategories, channelUnreadCounts);
  const ungroupedChannels = visibleUngroupedChannelRows.map((channel) =>
    toWorkspaceChannel(channel, channelUnreadCounts),
  );
  const mediaSettings = getServerMediaSettings(server.features);
  const defaultChannelId = pickDefaultChannelId({
    categories,
    ungroupedChannels,
  });

  const memberRows = server.members.slice(0, SERVER_DETAIL_MEMBER_LIMIT);
  const members = await mapMembers(server.ownerId, memberRows);
  const roles = server.roles.map(toWorkspaceRole);

  return {
    categories,
    invites: mapInvites(invites),
    memberPage: {
      limit: SERVER_DETAIL_MEMBER_LIMIT,
      nextCursor:
        server.members.length > SERVER_DETAIL_MEMBER_LIMIT ? (memberRows.at(-1)?.id ?? null) : null,
    },
    members,
    roles,
    server: {
      accessLevel: access.accessLevel,
      allowFileUploads: mediaSettings.allowFileUploads,
      allowGifs: mediaSettings.allowGifs,
      allowMemberAdds: mediaSettings.allowMemberAdds,
      defaultChannelId,
      description: server.description,
      iconUrl: server.iconUrl,
      id: server.id,
      inviteCode: server.inviteCode,
      isAdmin,
      isOwner: access.accessLevel === "OWNER",
      memberCount: server._count.members,
      messageCharacterLimit: server.messageCharacterLimit,
      deletedMessageNoticeMinutes: server.deletedMessageNoticeMinutes,
      mentionCount,
      name: server.name,
      shortName: server.shortName,
      unreadCount,
    },
    ungroupedChannels,
  };
}

export async function listWorkspaceServerMembers(
  userId: string,
  serverId: string,
  options: {
    cursor?: string;
    limit?: number;
  } = {},
) {
  const access = await getAccessContext(userId, serverId);
  const limit = Math.min(
    Math.max(options.limit ?? SERVER_MEMBERS_PAGE_LIMIT, 1),
    SERVER_MEMBERS_PAGE_LIMIT,
  );
  let cursorFilter: Prisma.ServerMemberWhereInput = {};

  if (options.cursor) {
    const cursorMember = await prisma.serverMember.findFirst({
      where: {
        id: options.cursor,
        serverId,
      },
      select: {
        id: true,
        joinedAt: true,
      },
    });

    if (!cursorMember) {
      throw new ApiError("Member cursor not found", 404, "NOT_FOUND");
    }

    cursorFilter = {
      OR: [
        {
          joinedAt: {
            gt: cursorMember.joinedAt,
          },
        },
        {
          id: {
            gt: cursorMember.id,
          },
          joinedAt: cursorMember.joinedAt,
        },
      ],
    };
  }

  const rows = await prisma.serverMember.findMany({
    orderBy: [
      {
        joinedAt: "asc",
      },
      {
        id: "asc",
      },
    ],
    select: {
      id: true,
      nickname: true,
      roles: {
        select: {
          role: {
            select: {
              color: true,
              id: true,
              name: true,
              permissions: true,
            },
          },
        },
      },
      user: {
        select: {
          avatarUrl: true,
          customStatus: true,
          displayName: true,
          id: true,
          status: true,
          username: true,
        },
      },
    },
    take: limit + 1,
    where: {
      serverId,
      ...cursorFilter,
    },
  });
  const pageRows = rows.slice(0, limit);

  return {
    memberPage: {
      limit,
      nextCursor: rows.length > limit ? (pageRows.at(-1)?.id ?? null) : null,
    },
    members: await mapMembers(access.ownerId, pageRows),
  };
}

export async function createWorkspaceServer(userId: string, input: CreateServerInput) {
  const createdServer = await prisma.$transaction(async (tx) => {
    const inviteCode = await generateInviteCode(tx);

    const server = await tx.server.create({
      data: {
        description: input.description ?? null,
        features: applyServerMediaSettings([], {
          allowFileUploads: input.allowFileUploads,
          allowGifs: input.allowGifs,
          allowMemberAdds: input.allowMemberAdds,
        }),
        iconUrl: input.iconUrl ?? null,
        inviteCode,
        name: input.name.trim(),
        ownerId: userId,
        shortName: input.shortName ?? null,
      },
      select: {
        id: true,
      },
    });

    const [adminRole, member] = await Promise.all([
      tx.role.create({
        data: {
          color: 3_428_765,
          isDefault: false,
          name: "Admin",
          permissions: SERVER_ADMIN_PERMISSIONS,
          position: 2,
          serverId: server.id,
        },
        select: {
          id: true,
        },
      }),
      tx.serverMember.create({
        data: {
          serverId: server.id,
          userId,
        },
        select: {
          id: true,
        },
      }),
    ]);

    await tx.role.createMany({
      data: [
        {
          color: MODERATOR_ROLE_COLOR,
          isDefault: false,
          name: "Moderator",
          permissions: MODERATOR_PERMISSIONS,
          position: 1,
          serverId: server.id,
        },
        {
          color: 0,
          isDefault: true,
          name: "@everyone",
          permissions: MEMBER_BASE_PERMISSIONS,
          position: 0,
          serverId: server.id,
        },
      ],
    });

    await tx.memberRole.create({
      data: {
        memberId: member.id,
        roleId: adminRole.id,
      },
    });

    const lobby = await tx.channelCategory.create({
      data: {
        name: "Lobby",
        position: 0,
        serverId: server.id,
      },
      select: {
        id: true,
      },
    });

    const generalChannel = await tx.channel.create({
      data: {
        categoryId: lobby.id,
        name: "welcome-chat",
        position: 0,
        serverId: server.id,
        topic: null,
        type: ChannelType.TEXT,
      },
      select: {
        id: true,
      },
    });

    await tx.channel.create({
      data: {
        categoryId: lobby.id,
        name: "live-room",
        position: 1,
        serverId: server.id,
        type: ChannelType.VOICE,
      },
    });

    await tx.server.update({
      where: {
        id: server.id,
      },
      data: {
        systemChannelId: generalChannel.id,
      },
    });

    await tx.serverInvite.create({
      data: {
        channelId: generalChannel.id,
        code: inviteCode,
        createdById: userId,
        serverId: server.id,
      },
    });

    return {
      channelId: generalChannel.id,
      serverId: server.id,
    };
  });

  await invalidateServerRoomIdsCache(userId);

  return createdServer;
}

export async function updateWorkspaceServer(
  userId: string,
  serverId: string,
  input: UpdateServerInput,
) {
  const access = await getAccessContext(userId, serverId);
  ensureServerPermission(access, PermissionBits.MANAGE_SERVER);

  const data: Prisma.ServerUpdateInput = {};

  if (input.name !== undefined) {
    data.name = input.name.trim();
  }

  if (input.description !== undefined) {
    data.description = input.description;
  }

  if (input.shortName !== undefined) {
    data.shortName = input.shortName;
  }

  if (input.iconUrl !== undefined) {
    data.iconUrl = input.iconUrl;
  }

  if (input.messageCharacterLimit !== undefined) {
    data.messageCharacterLimit = input.messageCharacterLimit;
  }

  if (input.deletedMessageNoticeMinutes !== undefined) {
    data.deletedMessageNoticeMinutes = input.deletedMessageNoticeMinutes;
  }

  if (
    input.allowGifs !== undefined ||
    input.allowFileUploads !== undefined ||
    input.allowMemberAdds !== undefined
  ) {
    const server = await prisma.server.findUnique({
      where: { id: serverId },
      select: { features: true },
    });

    data.features = applyServerMediaSettings(server?.features ?? [], {
      allowFileUploads: input.allowFileUploads,
      allowGifs: input.allowGifs,
      allowMemberAdds: input.allowMemberAdds,
    });
  }

  const shouldInvalidateChannelPermissionMetadata =
    input.messageCharacterLimit !== undefined ||
    input.allowGifs !== undefined ||
    input.allowFileUploads !== undefined ||
    input.allowMemberAdds !== undefined;

  await prisma.server.update({
    where: {
      id: serverId,
    },
    data,
  });

  if (input.deletedMessageNoticeMinutes !== undefined) {
    await prisma.$executeRaw`
      UPDATE "Message"
      SET "placeholderExpiresAt" =
        "deletedAt" + (${input.deletedMessageNoticeMinutes}::int * INTERVAL '1 minute')
      WHERE "deletedAt" IS NOT NULL
        AND "placeholderRemovedAt" IS NULL
        AND "channelId" IN (
          SELECT "id" FROM "Channel" WHERE "serverId" = ${serverId}
        )
    `;
  }

  if (shouldInvalidateChannelPermissionMetadata) {
    await invalidateServerPermissionCache(serverId);
  }

  const detail = await getWorkspaceServerDetail(userId, serverId);
  getSocketServer()?.to(`server:${serverId}`).emit("server:settings:updated", {
    serverId,
  });

  return detail;
}

export async function deleteWorkspaceServer(
  userId: string,
  serverId: string,
  input: DeleteServerInput,
) {
  const access = await getAccessContext(userId, serverId);
  ensureOwner(access);

  if (input.confirmationName !== access.serverName) {
    throw new ApiError("Server name confirmation did not match", 400);
  }

  const members = await prisma.serverMember.findMany({
    where: {
      serverId,
    },
    select: {
      userId: true,
    },
  });

  await prisma.server.delete({
    where: {
      id: serverId,
    },
  });

  await invalidateServerPermissionCache(serverId);
  await Promise.all(members.map((member) => invalidateServerRoomIdsCache(member.userId)));

  const io = getSocketServer();
  if (io) {
    for (const member of members) {
      const sockets = await io.in(`user:${member.userId}`).fetchSockets();
      for (const socket of sockets) {
        socket.leave(`server:${serverId}`);
      }
      io.to(`user:${member.userId}`).emit("server:membership:removed", {
        reason: "deleted",
        serverId,
      });
    }
  }
}
