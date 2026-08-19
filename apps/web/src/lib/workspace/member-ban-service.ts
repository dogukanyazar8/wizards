import { prisma } from "@wizards/db";

import { ApiError } from "@/lib/api";
import { invalidateServerRoomIdsCache } from "@/lib/socket/server-room-cache";
import { getSocketServer } from "@/lib/socket/runtime";
import { getAccessContext, ensureServerPermission } from "@/lib/workspace/access-context";
import { advanceMemberAuthorizationRevision } from "@/lib/workspace/authorization-revision";
import { publishCommittedAuthorizationRevision } from "@/lib/workspace/authorization-revision-publication";
import { writeWorkspaceAuditLog } from "@/lib/workspace/audit-log";
import { assertCanActOnMember } from "@/lib/workspace/member-service";
import { PermissionBits } from "@/lib/workspace/permissions";
import { decrementServerMemberCount } from "@/lib/workspace/server-member-counter";
import { emitServerUnreadUpdatesForServer } from "@/lib/workspace/unread-service";
import { detachUserFromServerSocketRoom } from "@/lib/workspace/workspace-events";

export type MemberBanServiceDependencies = {
  client: typeof prisma;
  detachUserFromServerSocketRoom: typeof detachUserFromServerSocketRoom;
  emitServerUnreadUpdatesForServer: typeof emitServerUnreadUpdatesForServer;
  getAccessContext: typeof getAccessContext;
  getSocketServer: typeof getSocketServer;
  invalidateServerRoomIdsCache: typeof invalidateServerRoomIdsCache;
  publishCommittedAuthorizationRevision: typeof publishCommittedAuthorizationRevision;
};

const defaultDependencies: MemberBanServiceDependencies = {
  client: prisma,
  detachUserFromServerSocketRoom,
  emitServerUnreadUpdatesForServer,
  getAccessContext,
  getSocketServer,
  invalidateServerRoomIdsCache,
  publishCommittedAuthorizationRevision,
};

export async function banWorkspaceMember(
  actorId: string,
  serverId: string,
  memberId: string,
  input: { reason?: string | undefined },
  dependencies: MemberBanServiceDependencies = defaultDependencies,
) {
  const access = await dependencies.getAccessContext(actorId, serverId);
  ensureServerPermission(access, PermissionBits.BAN_MEMBERS);

  const result = await dependencies.client.$transaction(
    async (tx) => {
      const member = await tx.serverMember.findFirst({
        where: { id: memberId, serverId },
        select: {
          id: true,
          roles: {
            select: {
              role: {
                select: {
                  id: true,
                  isDefault: true,
                  managed: true,
                  permissions: true,
                },
              },
            },
          },
          userId: true,
        },
      });
      if (!member) {
        throw new ApiError("Member not found", 404, "MEMBER_NOT_FOUND");
      }
      if (member.userId === actorId) {
        throw new ApiError("You cannot ban yourself", 400, "INVALID_TARGET");
      }
      assertCanActOnMember(access, member);

      const reason = input.reason?.trim() || null;
      await tx.serverBan.upsert({
        where: { serverId_userId: { serverId, userId: member.userId } },
        create: { bannedById: actorId, reason, serverId, userId: member.userId },
        update: { bannedById: actorId, createdAt: new Date(), reason },
      });
      await tx.serverMember.delete({ where: { id: member.id } });
      await decrementServerMemberCount(tx, serverId);
      await writeWorkspaceAuditLog(tx, {
        action: "MEMBER_BANNED",
        actorId,
        ...(reason ? { metadata: { reason } } : {}),
        serverId,
        targetId: member.userId,
        targetType: "USER",
      });
      const authorizationRevision = await advanceMemberAuthorizationRevision(
        tx,
        serverId,
        member.userId,
      );
      return { authorizationRevision, userId: member.userId };
    },
    { isolationLevel: "Serializable" },
  );

  await Promise.all([
    dependencies.publishCommittedAuthorizationRevision(result.authorizationRevision),
    dependencies.invalidateServerRoomIdsCache(result.userId),
  ]);
  const io = await dependencies.detachUserFromServerSocketRoom(result.userId, serverId);
  io?.to(`server:${serverId}`).emit("server:settings:updated", { serverId });
  io?.to(`user:${result.userId}`).emit("server:membership:removed", {
    reason: "banned",
    serverId,
  });
  io?.to(`user:${result.userId}`).emit("server:settings:updated", { serverId });
  await dependencies.emitServerUnreadUpdatesForServer(serverId);

  return { success: true as const, userId: result.userId };
}

export async function unbanWorkspaceMember(
  actorId: string,
  serverId: string,
  targetUserId: string,
  dependencies: MemberBanServiceDependencies = defaultDependencies,
) {
  const access = await dependencies.getAccessContext(actorId, serverId);
  ensureServerPermission(access, PermissionBits.BAN_MEMBERS);

  const authorizationRevision = await dependencies.client.$transaction(async (tx) => {
    const deleted = await tx.serverBan.deleteMany({
      where: { serverId, userId: targetUserId },
    });
    if (deleted.count !== 1) {
      throw new ApiError("Ban not found", 404, "BAN_NOT_FOUND");
    }
    await writeWorkspaceAuditLog(tx, {
      action: "MEMBER_UNBANNED",
      actorId,
      serverId,
      targetId: targetUserId,
      targetType: "USER",
    });
    return advanceMemberAuthorizationRevision(tx, serverId, targetUserId);
  });

  await dependencies.publishCommittedAuthorizationRevision(authorizationRevision);
  dependencies.getSocketServer()?.to(`server:${serverId}`).emit("server:settings:updated", {
    serverId,
  });
  return { success: true as const };
}
