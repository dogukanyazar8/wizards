import { prisma } from "@wizards/db";
import type { ServerMemberTimeoutInput } from "@wizards/types";

import { ApiError } from "@/lib/api";
import { getSocketServer } from "@/lib/socket/runtime";
import { ensureServerPermission, getAccessContext } from "@/lib/workspace/access-context";
import { advanceMemberAuthorizationRevision } from "@/lib/workspace/authorization-revision";
import { publishCommittedAuthorizationRevision } from "@/lib/workspace/authorization-revision-publication";
import { writeWorkspaceAuditLog } from "@/lib/workspace/audit-log";
import { assertCanActOnMember } from "@/lib/workspace/member-service";
import { PermissionBits } from "@/lib/workspace/permissions";

/**
 * Üye zaman aşımı (K3, Ş2 §2).
 *
 * Tek uç iki işi yapar: `until` bir tarihse zaman aşımı **koyar**, `null` ise **kaldırır**.
 * İkinci bir "kaldır" ucu, "hangisi audit satırını yazıyor" sorusunu doğururdu.
 */

export type MemberTimeoutServiceDependencies = {
  client: typeof prisma;
  getAccessContext: typeof getAccessContext;
  getSocketServer: typeof getSocketServer;
  publishCommittedAuthorizationRevision: typeof publishCommittedAuthorizationRevision;
};

const defaultDependencies: MemberTimeoutServiceDependencies = {
  client: prisma,
  getAccessContext,
  getSocketServer,
  publishCommittedAuthorizationRevision,
};

export async function timeoutWorkspaceMember(
  actorId: string,
  serverId: string,
  memberId: string,
  input: ServerMemberTimeoutInput,
  dependencies: MemberTimeoutServiceDependencies = defaultDependencies,
) {
  const access = await dependencies.getAccessContext(actorId, serverId);
  ensureServerPermission(access, PermissionBits.TIMEOUT_MEMBERS);

  const until = input.until === null ? null : new Date(input.until);
  if (until && !Number.isFinite(until.getTime())) {
    throw new ApiError("Invalid timeout date", 400, "INVALID_TIMEOUT");
  }
  // Geçmiş bir tarih sessizce hiçbir şey yapmazdı: kolon dolar, `until > now()` yanlış çıkar
  // ve moderatör "sustur"a bastığını sanır. Kaldırmak istiyorsa `null` gönderir.
  if (until && until.getTime() <= Date.now()) {
    throw new ApiError("Timeout must end in the future", 400, "INVALID_TIMEOUT");
  }

  const reason = input.reason?.trim() || null;

  const result = await dependencies.client.$transaction(async (tx) => {
    const member = await tx.serverMember.findFirst({
      where: { id: memberId, serverId },
      select: {
        id: true,
        roles: {
          select: {
            role: { select: { id: true, isDefault: true, managed: true, permissions: true } },
          },
        },
        userId: true,
      },
    });
    if (!member) {
      throw new ApiError("Member not found", 404, "MEMBER_NOT_FOUND");
    }
    if (member.userId === actorId) {
      throw new ApiError("You cannot time yourself out", 400, "INVALID_TARGET");
    }
    // Sahip hedefi 400: `assertCanActOnMember` bunu 403 `OWNER_PROTECTED` ile karşılardı,
    // ama sahip "yetkin yok" vakası değil, "böyle bir hedef yok" vakasıdır.
    if (member.userId === access.ownerId) {
      throw new ApiError("The server owner cannot be timed out", 400, "INVALID_TARGET");
    }
    assertCanActOnMember(access, member);

    await tx.serverMember.update({
      data: { communicationDisabledUntil: until },
      where: { id: member.id },
    });
    await writeWorkspaceAuditLog(tx, {
      action: until ? "MEMBER_TIMED_OUT" : "MEMBER_TIMEOUT_REMOVED",
      actorId,
      metadata: {
        ...(reason ? { reason } : {}),
        until: until ? until.toISOString() : null,
      },
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
  });

  await dependencies.publishCommittedAuthorizationRevision(result.authorizationRevision);
  const io = dependencies.getSocketServer();
  io?.to(`server:${serverId}`).emit("server:settings:updated", { serverId });
  io?.to(`user:${result.userId}`).emit("server:settings:updated", { serverId });

  return {
    communicationDisabledUntil: until ? until.toISOString() : null,
    success: true as const,
    userId: result.userId,
  };
}
