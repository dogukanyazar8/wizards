import { ChannelType, MessageType, prisma } from "@wizards/db";
import type { Prisma } from "@wizards/db";
import type { AddServerMemberInput, UpdateWorkspaceMemberRolesInput } from "@wizards/types";

import { ApiError } from "@/lib/api";
import { normalizeAppLocale, translate } from "@/lib/locale";
import { getSocketServer } from "@/lib/socket/runtime";
import { invalidateServerRoomIdsCache } from "@/lib/socket/server-room-cache";
import { getWorkspaceServerDetail } from "@/lib/workspace/server-service";
import {
  canAddMembers,
  ensureServerPermission,
  ensureUserNotServerBanned,
  getAccessContext,
} from "@/lib/workspace/access-context";
import { getMessageById } from "@/lib/workspace/message-service";
import { invalidateMemberPermissionCache } from "@/lib/workspace/permission-cache";
import {
  emitServerUnreadUpdatesForServer,
  getActiveChannelViewerUserIds,
  markChannelReadStates,
} from "@/lib/workspace/unread-service";
import { getServerMediaSettings } from "@/lib/workspace/server-features";
import { PermissionBits } from "@/lib/workspace/permissions";
import {
  ensureCanWriteRolePermissions,
  isOwnerAccess,
  isProtectedRole,
} from "@/lib/workspace/role-helpers";
import {
  detachUserFromServerSocketRoom,
  formatRoleNameList,
  serializeWorkspaceNotification,
} from "@/lib/workspace/workspace-events";

export async function updateWorkspaceMemberRoles(
  userId: string,
  serverId: string,
  memberId: string,
  input: UpdateWorkspaceMemberRolesInput,
) {
  const access = await getAccessContext(userId, serverId);
  ensureServerPermission(access, PermissionBits.MANAGE_ROLES);

  const member = await prisma.serverMember.findFirst({
    select: {
      id: true,
      roles: {
        select: {
          role: {
            select: {
              id: true,
              isDefault: true,
              managed: true,
              name: true,
              permissions: true,
            },
          },
        },
      },
      user: {
        select: {
          locale: true,
        },
      },
      userId: true,
    },
    where: {
      id: memberId,
      serverId,
    },
  });

  if (!member) {
    throw new ApiError("Member not found", 404);
  }

  if (member.userId === access.ownerId) {
    throw new ApiError("The server owner cannot be role-modified.", 403, "OWNER_PROTECTED");
  }

  if (!isOwnerAccess(access) && member.roles.some((entry) => isProtectedRole(entry.role))) {
    throw new ApiError("You cannot modify a member with an elevated role.", 403, "ROLE_HIERARCHY");
  }

  const requestedRoleIds = Array.from(new Set(input.roleIds));
  const roles = await prisma.role.findMany({
    select: {
      id: true,
      isDefault: true,
      managed: true,
      name: true,
      permissions: true,
    },
    where: {
      id: {
        in: requestedRoleIds,
      },
      serverId,
    },
  });

  if (roles.length !== requestedRoleIds.length) {
    throw new ApiError("One or more roles could not be found.", 404, "ROLE_NOT_FOUND");
  }

  const currentManagedRoleIds = new Set(
    member.roles
      .map((entry) => entry.role)
      .filter((role) => !role.isDefault && role.managed)
      .map((role) => role.id),
  );

  if (
    roles.some((role) => role.isDefault || (role.managed && !currentManagedRoleIds.has(role.id)))
  ) {
    throw new ApiError("Protected roles cannot be assigned manually.", 403, "PROTECTED_ROLE");
  }

  const requestedMutableRoles = roles.filter((role) => !role.isDefault && !role.managed);

  for (const role of requestedMutableRoles) {
    ensureCanWriteRolePermissions(access, role.permissions);
  }

  const existingMutableRoleIds = member.roles
    .map((entry) => entry.role)
    .filter((role) => !role.isDefault && !role.managed)
    .map((role) => role.id);
  const requestedMutableRoleIds = requestedMutableRoles.map((role) => role.id);
  const addedRoleIds = requestedMutableRoleIds.filter(
    (roleId) => !existingMutableRoleIds.includes(roleId),
  );
  const addedRoles = requestedMutableRoles.filter((role) => addedRoleIds.includes(role.id));

  const mutations: Prisma.PrismaPromise<unknown>[] = [
    prisma.memberRole.deleteMany({
      where: {
        memberId,
        roleId: {
          in: existingMutableRoleIds,
        },
      },
    }),
  ];

  if (requestedMutableRoleIds.length > 0) {
    mutations.push(
      prisma.memberRole.createMany({
        data: requestedMutableRoleIds.map((roleId) => ({
          memberId,
          roleId,
        })),
        skipDuplicates: true,
      }),
    );
  }

  await prisma.$transaction(mutations);

  await invalidateMemberPermissionCache(serverId, member.userId);

  const io = getSocketServer();
  io?.to(`server:${serverId}`).emit("server:settings:updated", {
    serverId,
  });

  if (member.userId !== userId && addedRoles.length > 0) {
    const locale = normalizeAppLocale(member.user.locale);
    const roleList = formatRoleNameList(addedRoles.map((role) => role.name));
    const notification = await prisma.notification.create({
      data: {
        actionUrl: `/channels/${serverId}`,
        body: translate(locale, "workspace.notification.rolesAssigned.body", {
          roles: roleList,
          server: access.serverName,
        }),
        metadata: {
          roleIds: addedRoleIds,
          roles: addedRoles.map((role) => role.name),
          senderId: userId,
          serverId,
          serverName: access.serverName,
        },
        title: translate(locale, "workspace.notification.rolesAssigned.title", {
          server: access.serverName,
        }),
        type: "MODERATION",
        userId: member.userId,
      },
      select: {
        actionUrl: true,
        body: true,
        createdAt: true,
        id: true,
        imageUrl: true,
        metadata: true,
        read: true,
        readAt: true,
        title: true,
        type: true,
        userId: true,
      },
    });

    io?.to(`user:${member.userId}`).emit(
      "notification:new",
      serializeWorkspaceNotification(notification),
    );
  }

  return { success: true as const };
}

export async function leaveWorkspaceServer(userId: string, serverId: string) {
  const access = await getAccessContext(userId, serverId);

  if (access.accessLevel === "OWNER") {
    throw new ApiError("Transfer ownership or delete the server instead", 400);
  }

  await prisma.serverMember.delete({
    where: {
      userId_serverId: {
        serverId,
        userId,
      },
    },
  });

  await Promise.all([
    invalidateMemberPermissionCache(serverId, userId),
    invalidateServerRoomIdsCache(userId),
  ]);

  const io = await detachUserFromServerSocketRoom(userId, serverId);
  io?.to(`server:${serverId}`).emit("server:settings:updated", { serverId });
  io?.to(`user:${userId}`).emit("server:membership:removed", {
    reason: "left",
    serverId,
  });
  io?.to(`user:${userId}`).emit("server:settings:updated", { serverId });
  await emitServerUnreadUpdatesForServer(serverId);
}

export async function addWorkspaceServerMemberByUsername(
  userId: string,
  serverId: string,
  input: AddServerMemberInput,
) {
  const access = await getAccessContext(userId, serverId);
  const username = input.username.trim().replace(/^@+/, "");

  if (username.length < 2) {
    throw new ApiError("Username must be at least 2 characters", 400, "VALIDATION_ERROR");
  }
  const server = await prisma.server.findUnique({
    where: { id: serverId },
    select: {
      features: true,
      id: true,
      name: true,
      roles: {
        orderBy: {
          position: "desc",
        },
        select: {
          id: true,
          isDefault: true,
        },
      },
      systemChannelId: true,
    },
  });

  if (!server) {
    throw new ApiError("Server not found", 404, "NOT_FOUND");
  }

  const settings = getServerMediaSettings(server.features);
  if (!canAddMembers(access.accessLevel, settings.allowMemberAdds)) {
    throw new ApiError("Members are not allowed to add users to this server", 403, "FORBIDDEN");
  }

  const [targetUser, actor] = await Promise.all([
    prisma.user.findFirst({
      where: {
        username: {
          equals: username,
          mode: "insensitive",
        },
      },
      select: {
        avatarUrl: true,
        displayName: true,
        id: true,
        isBanned: true,
        locale: true,
        username: true,
      },
    }),
    prisma.user.findUnique({
      where: {
        id: userId,
      },
      select: {
        displayName: true,
        username: true,
      },
    }),
  ]);

  if (!targetUser) {
    throw new ApiError("User not found", 404, "USER_NOT_FOUND");
  }

  if (targetUser.isBanned) {
    throw new ApiError("This user cannot be added", 403, "FORBIDDEN");
  }

  await ensureUserNotServerBanned(
    prisma,
    serverId,
    targetUser.id,
    "This user is banned from this server",
  );

  if (targetUser.id === userId) {
    throw new ApiError("You are already in this server", 400, "ALREADY_MEMBER");
  }

  const existingMember = await prisma.serverMember.findUnique({
    where: {
      userId_serverId: {
        serverId,
        userId: targetUser.id,
      },
    },
    select: {
      id: true,
    },
  });

  if (existingMember) {
    throw new ApiError("User is already a member of this server", 400, "ALREADY_MEMBER");
  }

  const result = await prisma.$transaction(async (tx) => {
    await ensureUserNotServerBanned(
      tx,
      serverId,
      targetUser.id,
      "This user is banned from this server",
    );

    const targetChannelId =
      server.systemChannelId ??
      (
        await tx.channel.findFirst({
          orderBy: {
            position: "asc",
          },
          select: {
            id: true,
          },
          where: {
            parentId: null,
            serverId,
            type: ChannelType.TEXT,
          },
        })
      )?.id ??
      null;

    const member = await tx.serverMember.create({
      data: {
        serverId,
        userId: targetUser.id,
      },
      select: {
        id: true,
      },
    });

    const defaultRole = server.roles.find((role) => role.isDefault);
    if (defaultRole) {
      await tx.memberRole.create({
        data: {
          memberId: member.id,
          roleId: defaultRole.id,
        },
      });
    }

    let systemMessage: {
      channelId: string;
      createdAt: Date;
      id: string;
    } | null = null;

    if (targetChannelId) {
      const displayName = targetUser.displayName ?? targetUser.username;
      const message = await tx.message.create({
        data: {
          channelId: targetChannelId,
          content: `${displayName} joined the server.`,
          type: MessageType.SYSTEM_JOIN,
          userId: targetUser.id,
        },
      });

      systemMessage = {
        channelId: targetChannelId,
        createdAt: message.createdAt,
        id: message.id,
      };
    }

    const locale = normalizeAppLocale(targetUser.locale);
    const actorName = actor?.displayName ?? actor?.username ?? "A teammate";
    const notification = await tx.notification.create({
      data: {
        actionUrl: targetChannelId
          ? `/channels/${serverId}/${targetChannelId}`
          : `/channels/${serverId}`,
        body: translate(locale, "workspace.notification.memberAdded.body", {
          actor: actorName,
          server: server.name,
        }),
        metadata: {
          senderId: userId,
          serverId,
          serverName: server.name,
        },
        title: translate(locale, "workspace.notification.memberAdded.title", {
          server: server.name,
        }),
        type: "SERVER_INVITE",
        userId: targetUser.id,
      },
      select: {
        actionUrl: true,
        body: true,
        createdAt: true,
        id: true,
        imageUrl: true,
        metadata: true,
        read: true,
        readAt: true,
        title: true,
        type: true,
        userId: true,
      },
    });

    return {
      message: systemMessage,
      notification,
      targetChannelId,
    };
  });

  await Promise.all([
    invalidateMemberPermissionCache(serverId, targetUser.id),
    invalidateServerRoomIdsCache(targetUser.id),
  ]);

  const io = getSocketServer();

  if (io) {
    const targetSockets = await io.in(`user:${targetUser.id}`).fetchSockets();
    for (const targetSocket of targetSockets) {
      targetSocket.join(`server:${serverId}`);
    }
  }

  if (result.message) {
    const activeViewerUserIds = await getActiveChannelViewerUserIds(result.message.channelId);
    await markChannelReadStates({
      channelId: result.message.channelId,
      lastReadAt: result.message.createdAt,
      lastReadMessageId: result.message.id,
      userIds: [userId, ...activeViewerUserIds],
    });
    const message = await getMessageById(result.message.id, userId);
    if (message) {
      io?.to(result.message.channelId).emit("message:new", message);
    }
  }

  io?.to(`user:${targetUser.id}`).emit(
    "notification:new",
    serializeWorkspaceNotification(result.notification),
  );
  io?.to(`user:${targetUser.id}`).emit("server:membership:added", { serverId });
  io?.to(`user:${targetUser.id}`).emit("server:settings:updated", { serverId });
  io?.to(`server:${serverId}`).emit("server:settings:updated", { serverId });
  await emitServerUnreadUpdatesForServer(serverId);

  const detail = await getWorkspaceServerDetail(userId, serverId);

  return {
    addedUser: {
      avatarUrl: targetUser.avatarUrl,
      displayName: targetUser.displayName,
      id: targetUser.id,
      username: targetUser.username,
    },
    detail,
  };
}

export async function kickWorkspaceMember(userId: string, serverId: string, memberId: string) {
  const access = await getAccessContext(userId, serverId);
  ensureServerPermission(access, PermissionBits.KICK_MEMBERS);

  const member = await prisma.serverMember.findFirst({
    where: {
      id: memberId,
      serverId,
    },
    select: {
      id: true,
      userId: true,
    },
  });

  if (!member) {
    throw new ApiError("Member not found", 404);
  }

  if (member.userId === userId) {
    throw new ApiError("Use leave server instead of kicking yourself", 400);
  }

  if (member.userId === access.ownerId) {
    throw new ApiError("The server owner cannot be kicked", 403, "OWNER_PROTECTED");
  }

  await prisma.serverMember.delete({
    where: {
      id: member.id,
    },
  });

  await Promise.all([
    invalidateMemberPermissionCache(serverId, member.userId),
    invalidateServerRoomIdsCache(member.userId),
  ]);

  const io = await detachUserFromServerSocketRoom(member.userId, serverId);
  io?.to(`server:${serverId}`).emit("server:settings:updated", { serverId });
  io?.to(`user:${member.userId}`).emit("server:membership:removed", {
    reason: "kicked",
    serverId,
  });
  io?.to(`user:${member.userId}`).emit("server:settings:updated", { serverId });
  await emitServerUnreadUpdatesForServer(serverId);
}
