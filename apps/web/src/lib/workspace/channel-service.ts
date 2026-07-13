import { ChannelType, Prisma, prisma } from "@wizards/db";
import type { CreateChannelInput, UpdateChannelInput } from "@wizards/types";

import { ApiError } from "@/lib/api";
import { getSocketServer } from "@/lib/socket/runtime";
import { disconnectUnauthorizedVoiceParticipants } from "@/lib/voice/service";
import { ensureServerPermission, getAccessContext } from "@/lib/workspace/access-context";
import {
  applyChannelPermissionMutation,
  prepareChannelPermissionMutation,
} from "@/lib/workspace/channel-permission-logic";
import { invalidateServerPermissionCache } from "@/lib/workspace/permission-cache";
import { PermissionBits } from "@/lib/workspace/permissions";
import { normalizeWorkspaceLabel } from "@/lib/workspace/workspace-label";

export async function createWorkspaceChannel(
  userId: string,
  serverId: string,
  input: CreateChannelInput,
) {
  const access = await getAccessContext(userId, serverId);
  ensureServerPermission(access, PermissionBits.MANAGE_CHANNELS);

  const normalizedName = normalizeWorkspaceLabel(input.name);

  if (!normalizedName) {
    throw new ApiError("Channel name must include at least one letter or number", 400);
  }

  if (input.categoryId) {
    const category = await prisma.channelCategory.findFirst({
      where: {
        id: input.categoryId,
        serverId,
      },
      select: {
        id: true,
      },
    });

    if (!category) {
      throw new ApiError("Category not found", 404);
    }
  }

  const lastChannel = await prisma.channel.findFirst({
    orderBy: {
      position: "desc",
    },
    select: {
      position: true,
    },
    where: {
      categoryId: input.categoryId ?? null,
      parentId: null,
      serverId,
    },
  });

  const channelType = input.type === "VOICE" ? ChannelType.VOICE : ChannelType.TEXT;
  const channelPermissionMutation = input.permissions
    ? prepareChannelPermissionMutation({
        input: input.permissions,
        roles: await prisma.role.findMany({
          select: {
            id: true,
            isDefault: true,
            managed: true,
            permissions: true,
          },
          where: {
            serverId,
          },
        }),
        type: channelType,
      })
    : null;

  const channel = await prisma.$transaction(async (tx) => {
    const createdChannel = await tx.channel.create({
      data: {
        categoryId: input.categoryId ?? null,
        locked: channelPermissionMutation?.nextLocked ?? false,
        name: normalizedName,
        position: (lastChannel?.position ?? -1) + 1,
        serverId,
        topic: input.topic ?? null,
        type: channelType,
      },
      select: {
        id: true,
      },
    });

    if (channelPermissionMutation) {
      await applyChannelPermissionMutation(tx, {
        allowedRoleIds: channelPermissionMutation.allowedRoleIds,
        channelId: createdChannel.id,
        defaultRoleId: channelPermissionMutation.defaultRole.id,
        existingRoleOverrides: [],
        presetPermissions: channelPermissionMutation.presetPermissions,
      });
    }

    return createdChannel;
  });

  await invalidateServerPermissionCache(serverId);

  getSocketServer()?.to(`server:${serverId}`).emit("server:settings:updated", {
    serverId,
  });

  return channel;
}

export async function updateWorkspaceChannel(
  userId: string,
  channelId: string,
  input: UpdateChannelInput,
  options: { expectedServerId?: string } = {},
) {
  const existingChannel = await prisma.channel.findUnique({
    where: {
      id: channelId,
    },
    select: {
      categoryId: true,
      id: true,
      locked: true,
      serverId: true,
      type: true,
    },
  });

  if (
    !existingChannel?.serverId ||
    (options.expectedServerId !== undefined &&
      existingChannel.serverId !== options.expectedServerId)
  ) {
    throw new ApiError("Channel not found", 404);
  }

  const access = await getAccessContext(userId, existingChannel.serverId);
  ensureServerPermission(access, PermissionBits.MANAGE_CHANNELS);

  let nextPosition: number | undefined;

  if (input.categoryId !== undefined && input.categoryId !== existingChannel.categoryId) {
    if (input.categoryId) {
      const targetCategory = await prisma.channelCategory.findFirst({
        where: {
          id: input.categoryId,
          serverId: existingChannel.serverId,
        },
        select: {
          id: true,
        },
      });

      if (!targetCategory) {
        throw new ApiError("Category not found", 404);
      }
    }

    const lastChannel = await prisma.channel.findFirst({
      orderBy: {
        position: "desc",
      },
      select: {
        position: true,
      },
      where: {
        categoryId: input.categoryId ?? null,
        parentId: null,
        serverId: existingChannel.serverId,
      },
    });

    nextPosition = (lastChannel?.position ?? -1) + 1;
  }

  const data: Prisma.ChannelUpdateInput = {};

  if (input.name !== undefined) {
    const normalizedName = normalizeWorkspaceLabel(input.name);

    if (!normalizedName) {
      throw new ApiError("Channel name must include at least one letter or number", 400);
    }

    data.name = normalizedName;
  }

  if (input.topic !== undefined) {
    data.topic = input.topic;
  }

  if (input.locked !== undefined) {
    data.locked = input.locked;
  }

  if (input.categoryId !== undefined) {
    data.category = input.categoryId ? { connect: { id: input.categoryId } } : { disconnect: true };
  }

  if (nextPosition !== undefined) {
    data.position = nextPosition;
  }

  const shouldInvalidateChannelPermissionMetadata =
    input.locked !== undefined || input.name !== undefined;

  await prisma.channel.update({
    where: {
      id: channelId,
    },
    data,
  });

  if (shouldInvalidateChannelPermissionMetadata) {
    await invalidateServerPermissionCache(existingChannel.serverId);
  }

  if (
    existingChannel.type === ChannelType.VOICE &&
    input.locked === true &&
    existingChannel.locked !== true
  ) {
    await disconnectUnauthorizedVoiceParticipants(channelId);
  }

  getSocketServer()?.to(`server:${existingChannel.serverId}`).emit("server:settings:updated", {
    serverId: existingChannel.serverId,
  });
}

export async function reorderWorkspaceChannels(
  userId: string,
  serverId: string,
  items: Array<{
    categoryId: string | null;
    id: string;
    position: number;
  }>,
) {
  const access = await getAccessContext(userId, serverId);
  ensureServerPermission(access, PermissionBits.MANAGE_CHANNELS);

  const existingChannels = await prisma.channel.findMany({
    where: {
      id: {
        in: items.map((item) => item.id),
      },
      serverId,
    },
    select: {
      id: true,
    },
  });

  if (existingChannels.length !== items.length) {
    throw new ApiError("One or more channels could not be found", 404);
  }

  const categoryIds = Array.from(
    new Set(items.flatMap((item) => (item.categoryId ? [item.categoryId] : []))),
  );

  if (categoryIds.length > 0) {
    const existingCategories = await prisma.channelCategory.findMany({
      where: {
        id: {
          in: categoryIds,
        },
        serverId,
      },
      select: {
        id: true,
      },
    });

    if (existingCategories.length !== categoryIds.length) {
      throw new ApiError("One or more categories could not be found", 404);
    }
  }

  await prisma.$transaction(
    items.map((item) =>
      prisma.channel.update({
        where: {
          id: item.id,
        },
        data: {
          categoryId: item.categoryId,
          position: item.position,
        },
      }),
    ),
  );

  getSocketServer()?.to(`server:${serverId}`).emit("server:settings:updated", {
    serverId,
  });
}

export async function deleteWorkspaceChannel(
  userId: string,
  channelId: string,
  options: { expectedServerId?: string } = {},
) {
  const channel = await prisma.channel.findUnique({
    where: {
      id: channelId,
    },
    select: {
      id: true,
      serverId: true,
    },
  });

  if (
    !channel?.serverId ||
    (options.expectedServerId !== undefined && channel.serverId !== options.expectedServerId)
  ) {
    throw new ApiError("Channel not found", 404);
  }

  const access = await getAccessContext(userId, channel.serverId);
  ensureServerPermission(access, PermissionBits.MANAGE_CHANNELS);

  await prisma.channel.delete({
    where: {
      id: channelId,
    },
  });

  await invalidateServerPermissionCache(channel.serverId);

  getSocketServer()?.to(`server:${channel.serverId}`).emit("server:settings:updated", {
    serverId: channel.serverId,
  });
}

export async function clearWorkspaceChannelHistory(userId: string, channelId: string) {
  const channel = await prisma.channel.findUnique({
    where: {
      id: channelId,
    },
    select: {
      id: true,
      serverId: true,
      type: true,
    },
  });

  if (!channel?.serverId) {
    throw new ApiError("Channel not found", 404);
  }

  if (channel.type !== ChannelType.TEXT) {
    throw new ApiError("Only text channels can have their history cleared", 400);
  }

  const access = await getAccessContext(userId, channel.serverId);
  ensureServerPermission(access, PermissionBits.CLEAR_CHANNEL_HISTORY);

  const clearedAt = new Date();

  const deletedCount = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`
      UPDATE "Message"
      SET "replyToId" = NULL,
          "threadParentId" = NULL
      WHERE "replyToId" IN (
        SELECT "id"
        FROM "Message"
        WHERE "channelId" = ${channelId}
      )
      OR "threadParentId" IN (
        SELECT "id"
        FROM "Message"
        WHERE "channelId" = ${channelId}
      )
    `);

    const deletedMessages = await tx.message.deleteMany({
      where: {
        channelId,
      },
    });

    await tx.channelReadState.updateMany({
      where: {
        channelId,
      },
      data: {
        lastReadAt: clearedAt,
        lastReadMessageId: null,
        mentionCount: 0,
      },
    });

    await tx.channel.update({
      where: {
        id: channelId,
      },
      data: {
        lastMessageId: null,
        lastPinAt: null,
        messageCount: 0,
      },
    });

    return deletedMessages.count;
  });

  return {
    channelId,
    clearedAt,
    deletedCount,
    serverId: channel.serverId,
  };
}
