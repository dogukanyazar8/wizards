import { prisma } from "@wizards/db";
import type { AdminSnapshotClient, AdminSnapshotInput } from "@/lib/admin/snapshots/client";
import { getDisplayName } from "@/lib/admin/snapshots/shared";

/**
 * Admin audit trail. Reads nothing but `AdminAuditLog` — the isolation test
 * pins that, because the audit module must not pull user, server or media
 * queries along for the ride.
 */
export async function loadAdminAuditSnapshot(
  _input: AdminSnapshotInput,
  client: AdminSnapshotClient = prisma,
) {
  const recentAuditLogs = await client.adminAuditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 10,
    select: {
      action: true,
      adminUser: {
        select: {
          displayName: true,
          id: true,
          username: true,
        },
      },
      createdAt: true,
      id: true,
      ipHash: true,
      targetId: true,
      targetType: true,
    },
  });

  return {
    recentAuditLogs: recentAuditLogs.map((log) => ({
      action: log.action,
      actor: log.adminUser
        ? {
            displayName: getDisplayName(log.adminUser),
            id: log.adminUser.id,
            username: log.adminUser.username,
          }
        : null,
      createdAt: log.createdAt.toISOString(),
      id: log.id,
      ipHash: log.ipHash ?? null,
      targetId: log.targetId,
      targetType: log.targetType,
    })),
  };
}

export type AdminAuditSnapshot = Awaited<ReturnType<typeof loadAdminAuditSnapshot>>;
