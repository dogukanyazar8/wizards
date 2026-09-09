import { prisma } from "@wizards/db";
import type { TransferServerOwnershipInput } from "@wizards/types";

import { ApiError } from "@/lib/api";
import { getSocketServer } from "@/lib/socket/runtime";
import { ensureOwner, getAccessContext } from "@/lib/workspace/access-context";
import {
  advanceMemberAuthorizationRevision,
  advanceServerAuthorizationRevision,
} from "@/lib/workspace/authorization-revision";
import { publishCommittedAuthorizationRevision } from "@/lib/workspace/authorization-revision-publication";
import { writeWorkspaceAuditLog } from "@/lib/workspace/audit-log";
import { SERVER_ADMIN_PERMISSIONS } from "@/lib/workspace/permissions";

export type TransferServerOwnershipDependencies = {
  client: typeof prisma;
  getAccessContext: typeof getAccessContext;
  getSocketServer: typeof getSocketServer;
  publishCommittedAuthorizationRevision: typeof publishCommittedAuthorizationRevision;
};

const defaultDependencies: TransferServerOwnershipDependencies = {
  client: prisma,
  getAccessContext,
  getSocketServer,
  publishCommittedAuthorizationRevision,
};

/**
 * The role the departing owner lands on (SPEC-SUNUCU §8.9: "Devir
 * tamamlandığında sen Admin rolüne düşersin").
 *
 * There is no `Sunucu Sahibi` role row in this product -- ownership is the
 * `Server.ownerId` column and `deriveAccessLevel` reads it directly -- so the
 * transfer moves the column, and the only role work left is handing the old
 * owner the Admin row `createWorkspaceServer` seeds. A server whose Admin role
 * was renamed or deleted still has to honour the promise, so the row is created
 * when it is missing rather than silently dropping the old owner to member.
 */
const ADMIN_ROLE_NAME = "Admin";
const ADMIN_ROLE_COLOR = 3_428_765;
const ADMIN_ROLE_POSITION = 2;

async function resolveAdminRoleId(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  serverId: string,
) {
  const existing = await tx.role.findFirst({
    where: {
      serverId,
      isDefault: false,
      permissions: SERVER_ADMIN_PERMISSIONS,
    },
    orderBy: [{ position: "desc" }, { id: "asc" }],
    select: { id: true },
  });

  if (existing) {
    return existing.id;
  }

  const byName = await tx.role.findFirst({
    where: { serverId, isDefault: false, name: ADMIN_ROLE_NAME },
    select: { id: true },
  });

  if (byName) {
    return byName.id;
  }

  const created = await tx.role.create({
    data: {
      color: ADMIN_ROLE_COLOR,
      isDefault: false,
      name: ADMIN_ROLE_NAME,
      permissions: SERVER_ADMIN_PERMISSIONS,
      position: ADMIN_ROLE_POSITION,
      serverId,
    },
    select: { id: true },
  });

  return created.id;
}

/**
 * `POST /api/v1/servers/[serverId]/transfer-ownership` (Ş1 §3, K2).
 *
 * Column move, role hand-off, audit row and revision bumps commit together:
 * a server whose `ownerId` moved but whose audit row did not would be a
 * privilege change with no trail, and one whose revisions did not advance
 * would keep serving the old owner's cached channel permissions -- `ownerId`
 * is part of the cached permission context, so *every* member's snapshot for
 * this server is stale, not just the two people named here.
 */
export async function transferServerOwnership(
  actorId: string,
  serverId: string,
  input: TransferServerOwnershipInput,
  dependencies: TransferServerOwnershipDependencies = defaultDependencies,
) {
  const access = await dependencies.getAccessContext(actorId, serverId);
  ensureOwner(access);

  if (input.newOwnerUserId === actorId) {
    throw new ApiError("You already own this server", 400, "INVALID_TARGET");
  }

  const result = await dependencies.client.$transaction(
    async (tx) => {
      const [targetMember, currentOwnerMember] = await Promise.all([
        tx.serverMember.findFirst({
          where: { serverId, userId: input.newOwnerUserId },
          select: { id: true, userId: true },
        }),
        tx.serverMember.findFirst({
          where: { serverId, userId: actorId },
          select: { id: true },
        }),
      ]);

      if (!targetMember) {
        throw new ApiError(
          "The new owner must already be a member of this server",
          400,
          "MEMBER_NOT_FOUND",
        );
      }
      if (!currentOwnerMember) {
        throw new ApiError("Server not found", 404);
      }

      const adminRoleId = await resolveAdminRoleId(tx, serverId);

      await tx.server.update({
        where: { id: serverId },
        data: { ownerId: targetMember.userId },
      });

      // `skipDuplicates` rather than a read-then-write: an owner who already
      // carries the Admin row is the common case, and the pair is unique.
      await tx.memberRole.createMany({
        data: [{ memberId: currentOwnerMember.id, roleId: adminRoleId }],
        skipDuplicates: true,
      });

      await writeWorkspaceAuditLog(tx, {
        action: "SERVER_OWNERSHIP_TRANSFERRED",
        actorId,
        metadata: { newOwnerUserId: targetMember.userId, previousOwnerUserId: actorId },
        serverId,
        targetId: targetMember.userId,
        targetType: "SERVER",
      });

      // Server first: the two member revisions below read the server counter,
      // so bumping it afterwards would publish member versions stamped with the
      // revision they were meant to supersede.
      const serverRevision = await advanceServerAuthorizationRevision(tx, serverId);
      const previousOwnerRevision = await advanceMemberAuthorizationRevision(tx, serverId, actorId);
      const newOwnerRevision = await advanceMemberAuthorizationRevision(
        tx,
        serverId,
        targetMember.userId,
      );

      return {
        newOwnerRevision,
        newOwnerUserId: targetMember.userId,
        previousOwnerRevision,
        serverRevision,
      };
    },
    { isolationLevel: "Serializable" },
  );

  await Promise.all([
    dependencies.publishCommittedAuthorizationRevision(result.serverRevision),
    dependencies.publishCommittedAuthorizationRevision(result.previousOwnerRevision),
    dependencies.publishCommittedAuthorizationRevision(result.newOwnerRevision),
  ]);

  // The existing server-update event, not a new one: every surface that shows
  // an owner already refetches the detail on this signal.
  dependencies.getSocketServer()?.to(`server:${serverId}`).emit("server:settings:updated", {
    serverId,
  });

  return { newOwnerUserId: result.newOwnerUserId, success: true as const };
}
