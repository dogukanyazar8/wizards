import { Prisma, prisma } from "@wizards/db";
import { getAnalyticsClientInfo } from "@/lib/analytics/client-info";

export type AdminAuditLogInput = {
  action: string;
  adminUserId?: string | null;
  headers?: Headers | Record<string, string | string[] | undefined> | null;
  metadata?: Record<string, unknown> | null;
  reason?: string | null;
  targetId?: string | null;
  targetType?: string | null;
};

/**
 * The caller fingerprint comes from the analytics reader so audit rows carry the
 * same hashed address the session tables do — the admin console shows a prefix
 * of `ipHash`, and a raw address never enters the trail.
 */
export function buildAdminAuditLogEntry(args: AdminAuditLogInput) {
  const clientInfo = getAnalyticsClientInfo(args.headers ?? null);

  return {
    action: args.action,
    adminUserId: args.adminUserId ?? null,
    ...(args.metadata !== undefined
      ? {
          metadata:
            args.metadata === null ? Prisma.JsonNull : (args.metadata as Prisma.InputJsonValue),
        }
      : {}),
    ipHash: clientInfo.ipHash,
    reason: args.reason ?? null,
    targetId: args.targetId ?? null,
    targetType: args.targetType ?? null,
    userAgentHash: clientInfo.userAgentHash,
  };
}

export async function writeAdminAuditLog(args: AdminAuditLogInput) {
  await prisma.adminAuditLog.create({
    data: buildAdminAuditLogEntry(args),
  });
}
