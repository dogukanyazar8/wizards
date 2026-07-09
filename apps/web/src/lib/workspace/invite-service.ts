import { ChannelType, MessageType, prisma } from "@wizards/db";
import type { CreateInviteInput } from "@wizards/types";

import { ApiError } from "@/lib/api";
import { getSocketServer } from "@/lib/socket/runtime";
import { invalidateServerRoomIdsCache } from "@/lib/socket/server-room-cache";
import {
  ensureServerPermission,
  ensureUserNotServerBanned,
  getAccessContext,
} from "@/lib/workspace/access-context";
import { generateInviteCode } from "@/lib/workspace/invite-code";
import { getMessageById } from "@/lib/workspace/message-service";
import {
  invalidateMemberPermissionCache,
} from "@/lib/workspace/permission-cache";
import {
  emitServerUnreadUpdatesForServer,
  getActiveChannelViewerUserIds,
  markChannelReadStates,
} from "@/lib/workspace/unread-service";
import { PermissionBits } from "@/lib/workspace/permissions";

export async function createWorkspaceInvite(
  userId: string,
  serverId: string,
  input: CreateInviteInput,
) {
  const access = await getAccessContext(userId, serverId);
  ensureServerPermission(access, PermissionBits.MANAGE_INVITES);

  let channelId = input.channelId ?? null;

  if (channelId) {
    const channel = await prisma.channel.findFirst({
      where: {
        id: channelId,
        serverId,
      },
      select: {
        id: true,
      },
    });

    if (!channel) {
      throw new ApiError("Channel not found", 404);
    }
  } else {
    const fallbackChannel = await prisma.channel.findFirst({
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
    });

    channelId = fallbackChannel?.id ?? null;
  }

  const code = await generateInviteCode();
  const expiresAt =
    input.expiresInHours != null
      ? new Date(Date.now() + input.expiresInHours * 60 * 60 * 1000)
      : null;

  await prisma.serverInvite.create({
    data: {
      channelId,
      code,
      createdById: userId,
      expiresAt,
      maxUses: input.maxUses ?? null,
      serverId,
    },
  });

  return { code };
}

export async function revokeWorkspaceInvite(userId: string, serverId: string, inviteId: string) {
  const access = await getAccessContext(userId, serverId);
  ensureServerPermission(access, PermissionBits.MANAGE_INVITES);

  await prisma.serverInvite.deleteMany({
    where: {
      id: inviteId,
      serverId,
    },
  });
}

export async function joinWorkspaceServerByInvite(userId: string, code: string) {
  const invite = await prisma.serverInvite.findUnique({
    where: {
      code,
    },
    select: {
      channelId: true,
      expiresAt: true,
      id: true,
      maxUses: true,
      server: {
        select: {
          id: true,
          ownerId: true,
          roles: {
            orderBy: {
              position: "desc",
            },
            select: {
              id: true,
              isDefault: true,
            },
          },
        },
      },
      uses: true,
    },
  });

  if (!invite) {
    throw new ApiError("Invite not found", 404);
  }

  if (invite.expiresAt && invite.expiresAt.getTime() < Date.now()) {
    throw new ApiError("Invite has expired", 400);
  }

  const joiningUser = await prisma.user.findUnique({
    where: {
      id: userId,
    },
    select: {
      displayName: true,
      isBanned: true,
      username: true,
    },
  });

  if (!joiningUser) {
    throw new ApiError("User not found", 404);
  }

  if (joiningUser.isBanned) {
    throw new ApiError("Your account has been suspended", 403);
  }

  await ensureUserNotServerBanned(prisma, invite.server.id, userId);

  const existingMember = await prisma.serverMember.findUnique({
    where: {
      userId_serverId: {
        serverId: invite.server.id,
        userId,
      },
    },
    select: {
      id: true,
    },
  });

  if (!existingMember) {
    const transactionResult = await prisma.$transaction(async (tx) => {
      await ensureUserNotServerBanned(tx, invite.server.id, userId);

      if (invite.maxUses != null) {
        const claimResult = await tx.serverInvite.updateMany({
          where: {
            id: invite.id,
            uses: {
              lt: invite.maxUses,
            },
          },
          data: {
            uses: {
              increment: 1,
            },
          },
        });

        if (claimResult.count !== 1) {
          throw new ApiError("Invite has reached its usage limit", 400);
        }
      } else {
        await tx.serverInvite.update({
          where: {
            id: invite.id,
          },
          data: {
            uses: {
              increment: 1,
            },
          },
        });
      }

      const targetChannelId =
        invite.channelId ??
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
              serverId: invite.server.id,
              type: ChannelType.TEXT,
            },
          })
        )?.id ??
        null;

      const member = await tx.serverMember.create({
        data: {
          serverId: invite.server.id,
          userId,
        },
        select: {
          id: true,
        },
      });

      const defaultRole = invite.server.roles.find((role) => role.isDefault);

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
        const message = await tx.message.create({
          data: {
            channelId: targetChannelId,
            content: `${joiningUser?.displayName ?? joiningUser?.username ?? "A new Whispr user"} joined the server.`,
            type: MessageType.SYSTEM_JOIN,
            userId,
          },
        });

        systemMessage = {
          channelId: targetChannelId,
          createdAt: message.createdAt,
          id: message.id,
        };
      }

      return { message: systemMessage };
    });

    await Promise.all([
      invalidateMemberPermissionCache(invite.server.id, userId),
      invalidateServerRoomIdsCache(userId),
    ]);

    if (transactionResult.message) {
      const activeViewerUserIds = await getActiveChannelViewerUserIds(
        transactionResult.message.channelId,
      );
      await markChannelReadStates({
        channelId: transactionResult.message.channelId,
        lastReadAt: transactionResult.message.createdAt,
        lastReadMessageId: transactionResult.message.id,
        userIds: [userId, ...activeViewerUserIds],
      });
      const message = await getMessageById(transactionResult.message.id, userId);
      if (message) {
        getSocketServer()?.to(transactionResult.message.channelId).emit("message:new", message);
      }
      await emitServerUnreadUpdatesForServer(invite.server.id);
    }

    const io = getSocketServer();

    if (io) {
      const sockets = await io.in(`user:${userId}`).fetchSockets();
      for (const socket of sockets) {
        socket.join(`server:${invite.server.id}`);
      }

      io.to(`server:${invite.server.id}`).emit("server:settings:updated", {
        serverId: invite.server.id,
      });
      io.to(`user:${userId}`).emit("server:settings:updated", {
        serverId: invite.server.id,
      });
    }
  }

  const targetChannel =
    invite.channelId ??
    (
      await prisma.channel.findFirst({
        orderBy: {
          position: "asc",
        },
        select: {
          id: true,
        },
        where: {
          parentId: null,
          serverId: invite.server.id,
          type: ChannelType.TEXT,
        },
      })
    )?.id ??
    null;

  return {
    alreadyMember: Boolean(existingMember),
    channelId: targetChannel,
    serverId: invite.server.id,
  };
}
