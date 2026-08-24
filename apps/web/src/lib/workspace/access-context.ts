import { prisma, type Prisma } from "@wizards/db";
import type { WorkspaceAccessLevel } from "@wizards/types";

import { ApiError } from "@/lib/api";
import { requireEventPermission, requireServerPermission } from "@/lib/workspace/permissions";
import { deriveAccessLevel, mergeRoleRecords } from "@/lib/workspace/role-helpers";
import type { AccessContext } from "@/lib/workspace/workspace-types";

export async function getAccessContext(userId: string, serverId: string): Promise<AccessContext> {
  return getAccessContextWithClient(prisma, userId, serverId);
}

export async function getAccessContextWithClient(
  client: Pick<Prisma.TransactionClient, "serverBan" | "serverMember">,
  userId: string,
  serverId: string,
): Promise<AccessContext> {
  const [membership, serverBan] = await Promise.all([
    client.serverMember.findFirst({
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
            isPublic: true,
            name: true,
            ownerId: true,
            type: true,
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
    client.serverBan.findUnique({
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
    isPublic: membership.server.isPublic,
    memberId: membership.id,
    ownerId: membership.server.ownerId,
    roles,
    serverId: membership.server.id,
    serverName: membership.server.name,
    type: membership.server.type,
    userId,
  };
}

export function ensureServerPermission(
  context: AccessContext,
  permission: Parameters<typeof requireServerPermission>[1],
) {
  requireServerPermission(context, permission);
}

/**
 * Etkinlik yazma kapısı — K4. `MANAGE_SERVER` yerine üç kapılı `requireEventPermission`e
 * bakar, böylece bugün etkinlik yazan roller yetkilerini kaybetmeden yeni bit dağıtılabilir.
 */
export function ensureEventPermission(context: AccessContext) {
  requireEventPermission(context);
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
