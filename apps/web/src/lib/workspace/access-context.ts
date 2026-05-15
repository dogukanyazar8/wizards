import { prisma } from "@wizards/db";
import type { WorkspaceAccessLevel } from "@wizards/types";

import { ApiError } from "@/lib/api";
import { requireServerPermission } from "@/lib/workspace/permissions";
import { deriveAccessLevel, mergeRoleRecords } from "@/lib/workspace/role-helpers";
import type { AccessContext } from "@/lib/workspace/workspace-types";

export async function getAccessContext(
  userId: string,
  serverId: string,
): Promise<AccessContext> {
  const [membership, serverBan] = await Promise.all([
    prisma.serverMember.findFirst({
      where: {
        serverId,
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
            id: true,
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
          },
        },
      },
    }),
    prisma.serverBan.findUnique({
      where: {
        serverId_userId: {
          serverId,
          userId,
        },
      },
      select: { id: true },
    }),
  ]);

  if (serverBan) {
    throw new ApiError("You are banned from this server", 403, "SERVER_BANNED");
  }

  if (!membership) {
    throw new ApiError("Server not found", 404);
  }

  const roles = mergeRoleRecords(
    membership.server.roles,
    membership.roles.map((entry) => entry.role),
  );

  return {
    accessLevel: deriveAccessLevel(membership.server.ownerId, userId, roles),
    memberId: membership.id,
    ownerId: membership.server.ownerId,
    roles,
    serverId: membership.server.id,
    serverName: membership.server.name,
    userId,
  };
}

export function ensureServerPermission(
  context: AccessContext,
  permission: Parameters<typeof requireServerPermission>[1],
) {
  requireServerPermission(context, permission);
}

export function ensureOwner(context: AccessContext) {
  if (context.accessLevel !== "OWNER") {
    throw new ApiError("Only the server owner can perform this action", 403);
  }
}

export function canAddMembers(accessLevel: WorkspaceAccessLevel, allowMemberAdds: boolean) {
  return accessLevel !== "MEMBER" || allowMemberAdds;
}

export async function ensureUserNotServerBanned(
  client: Pick<typeof prisma, "serverBan">,
  serverId: string,
  userId: string,
  message = "You are banned from this server",
) {
  const ban = await client.serverBan.findUnique({
    where: {
      serverId_userId: {
        serverId,
        userId,
      },
    },
    select: { id: true },
  });

  if (ban) {
    throw new ApiError(message, 403, "SERVER_BANNED");
  }
}
