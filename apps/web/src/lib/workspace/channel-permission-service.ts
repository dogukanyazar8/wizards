import { ChannelType, prisma } from "@wizards/db";
import type {
  UpdateWorkspaceChannelPermissionsInput,
  WorkspaceChannelPermissionSettings,
} from "@wizards/types";

import { ApiError } from "@/lib/api";
import { advanceServerAuthorizationRevision } from "@/lib/workspace/authorization-revision";
import { publishCommittedAuthorizationRevision } from "@/lib/workspace/authorization-revision-publication";
import { getSocketServer } from "@/lib/socket/runtime";
import { disconnectUnauthorizedVoiceParticipants } from "@/lib/voice/service";
import { ensureServerPermission, getAccessContext } from "@/lib/workspace/access-context";
import {
  applyChannelPermissionMutation,
  inferChannelPermissionSettings,
  prepareChannelPermissionMutation,
} from "@/lib/workspace/channel-permission-logic";
import { PermissionBits } from "@/lib/workspace/permissions";

export async function getWorkspaceChannelPermissionSettings(
  userId: string,
  channelId: string,
): Promise<WorkspaceChannelPermissionSettings> {
  const channel = await prisma.channel.findUnique({
    select: {
      id: true,
      locked: true,
      permissionOverrides: {
        select: {
          allow: true,
          deny: true,
          targetId: true,
          targetType: true,
        },
      },
      server: {
        select: {
          roles: {
            select: {
              id: true,
              isDefault: true,
            },
            where: {
              isDefault: true,
            },
          },
        },
      },
      serverId: true,
      type: true,
    },
    where: {
      id: channelId,
    },
  });

  if (!channel?.serverId) {
    throw new ApiError("Channel not found", 404);
  }

  const access = await getAccessContext(userId, channel.serverId);
  ensureServerPermission(access, PermissionBits.MANAGE_CHANNELS);

  const defaultRoleId = channel.server?.roles[0]?.id ?? null;
  return inferChannelPermissionSettings({
    defaultRoleId,
    locked: channel.locked,
    overrides: channel.permissionOverrides,
    type: channel.type,
  });
}

export async function updateWorkspaceChannelPermissions(
  userId: string,
  channelId: string,
  input: UpdateWorkspaceChannelPermissionsInput,
) {
  const channel = await prisma.channel.findUnique({
    select: {
      id: true,
      locked: true,
      permissionOverrides: {
        select: {
          allow: true,
          deny: true,
          targetId: true,
          targetType: true,
        },
      },
      server: {
        select: {
          roles: {
            select: {
              id: true,
              isDefault: true,
              managed: true,
              permissions: true,
            },
          },
        },
      },
      serverId: true,
      type: true,
    },
    where: {
      id: channelId,
    },
  });

  if (!channel?.serverId || !channel.server) {
    throw new ApiError("Channel not found", 404);
  }

  const access = await getAccessContext(userId, channel.serverId);
  ensureServerPermission(access, PermissionBits.MANAGE_CHANNELS);

  const permissionMutation = prepareChannelPermissionMutation({
    input,
    roles: channel.server.roles,
    type: channel.type,
  });
  const existingRoleOverrides = channel.permissionOverrides.filter(
    (override) => override.targetType === "ROLE",
  );

  const authorizationRevision = await prisma.$transaction(async (tx) => {
    await tx.channel.update({
      data: {
        locked: permissionMutation.nextLocked,
      },
      where: {
        id: channelId,
      },
    });

    await applyChannelPermissionMutation(tx, {
      allowedRoleIds: permissionMutation.allowedRoleIds,
      channelId,
      defaultRoleId: permissionMutation.defaultRole.id,
      existingRoleOverrides,
      presetPermissions: permissionMutation.presetPermissions,
    });
    return advanceServerAuthorizationRevision(tx, channel.serverId!);
  });

  await publishCommittedAuthorizationRevision(authorizationRevision);

  if (channel.type === ChannelType.VOICE) {
    await disconnectUnauthorizedVoiceParticipants(channelId);
  }

  getSocketServer()?.to(`server:${channel.serverId}`).emit("server:settings:updated", {
    serverId: channel.serverId,
  });

  return {
    allowedRoleIds: permissionMutation.allowedRoleIds,
    preset: input.preset,
  };
}
