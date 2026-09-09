import { prisma } from "@wizards/db";
import type { Prisma } from "@wizards/db";
import type { ServerBanEntry, ServerBanInput } from "@wizards/types";

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

/**
 * Ban penceresi (Ş2 §3, `ServerBanSchema.deleteMessageSeconds`).
 *
 * Mesajlar **yumuşak** silinir — `clearChannelMessages`in sert silmesi değil: o yol yanıt/thread
 * bağlarını çözüp kanal sayaçlarını sıfırlıyor ve tek bir üyenin mesajları için tüm sunucuda
 * koşturulamaz. `placeholderExpiresAt` silme anına eşitlenir, böylece "[deleted]" yer tutucusu
 * hiç görünmez: ban temizliği bir iz bırakmaz, moderatörün tek tek silmesi bırakır.
 */
async function deleteRecentMessagesForBan(
  tx: Prisma.TransactionClient,
  args: { actorId: string; deleteMessageSeconds: number; serverId: string; userId: string },
) {
  if (args.deleteMessageSeconds <= 0) {
    return 0;
  }

  const deletedAt = new Date();
  const since = new Date(deletedAt.getTime() - args.deleteMessageSeconds * 1000);
  const result = await tx.message.updateMany({
    data: { deletedAt, deletedById: args.actorId, placeholderExpiresAt: deletedAt },
    where: {
      channel: { serverId: args.serverId },
      createdAt: { gte: since },
      deletedAt: null,
      userId: args.userId,
    },
  });

  return result.count;
}

export async function banWorkspaceMember(
  actorId: string,
  serverId: string,
  memberId: string,
  input: ServerBanInput,
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
      // Sahip hedefi 400: `assertCanActOnMember` bunu 403 `OWNER_PROTECTED` ile karşılardı,
      // ama sahip "yetkin yok" vakası değil, "böyle bir hedef yok" vakasıdır (Ş2 §3).
      if (member.userId === access.ownerId) {
        throw new ApiError("The server owner cannot be banned", 400, "INVALID_TARGET");
      }
      assertCanActOnMember(access, member);

      const reason = input.reason?.trim() || null;
      const deletedMessageCount = await deleteRecentMessagesForBan(tx, {
        actorId,
        deleteMessageSeconds: input.deleteMessageSeconds ?? 0,
        serverId,
        userId: member.userId,
      });
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
        metadata: {
          deletedMessageCount,
          ...(reason ? { reason } : {}),
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
      return { authorizationRevision, deletedMessageCount, userId: member.userId };
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

  return {
    deletedMessageCount: result.deletedMessageCount,
    success: true as const,
    userId: result.userId,
  };
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

/** Ban listesi sayfa boyu. Sunucu ayarlarının tehlike bölümü tek seferde bu kadarını çizer. */
export const SERVER_BANS_PAGE_LIMIT = 50;

/**
 * Ban listesi (Ş2 §3). Yetki `BAN_MEMBERS`: banı kaldırabilen listeyi de görebilmeli, tersi
 * "kaldır düğmesi var ama kimi kaldıracağını bilmiyorsun" demekti.
 *
 * İmleç `id`: `createdAt` benzersiz değil (bir moderatörün art arda attığı iki ban aynı
 * saniyeye düşebilir) ve eşitlik hâlinde sayfa sınırında satır atlanırdı.
 */
export async function listWorkspaceServerBans(
  actorId: string,
  serverId: string,
  options: { cursor?: string; limit?: number } = {},
  dependencies: Pick<MemberBanServiceDependencies, "client" | "getAccessContext"> = {
    client: prisma,
    getAccessContext,
  },
): Promise<{ bans: ServerBanEntry[]; nextCursor: string | null; total: number }> {
  const access = await dependencies.getAccessContext(actorId, serverId);
  ensureServerPermission(access, PermissionBits.BAN_MEMBERS);

  const limit = Math.min(
    Math.max(options.limit ?? SERVER_BANS_PAGE_LIMIT, 1),
    SERVER_BANS_PAGE_LIMIT,
  );
  const [rows, total] = await Promise.all([
    dependencies.client.serverBan.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        bannedBy: { select: { displayName: true, id: true } },
        createdAt: true,
        id: true,
        reason: true,
        user: { select: { avatarUrl: true, displayName: true, id: true, username: true } },
      },
      skip: options.cursor ? 1 : 0,
      take: limit + 1,
      ...(options.cursor ? { cursor: { id: options.cursor } } : {}),
      where: { serverId },
    }),
    dependencies.client.serverBan.count({ where: { serverId } }),
  ]);
  const pageRows = rows.slice(0, limit);

  return {
    bans: pageRows.map((row) => ({
      avatarUrl: row.user.avatarUrl,
      bannedAt: row.createdAt.toISOString(),
      bannedByDisplayName: row.bannedBy.displayName,
      bannedByUserId: row.bannedBy.id,
      // Görünen ad boşsa kullanıcı adı düşer: liste satırı hiçbir zaman adsız çizilmez.
      displayName: row.user.displayName ?? row.user.username,
      reason: row.reason,
      userId: row.user.id,
      username: row.user.username,
    })),
    nextCursor: rows.length > limit ? (pageRows.at(-1)?.id ?? null) : null,
    total,
  };
}
