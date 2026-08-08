import { Prisma, prisma } from "@wizards/db";
import type { PrismaClient } from "@wizards/db";
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

/**
 * `client` defaults to the base singleton, but every caller in
 * `admin/servers/route-logic.ts` passes the same `Prisma.TransactionClient`
 * the mutation itself ran on (Finding 8, 06-kesif-imleci-ve-audit.md) so the
 * row this writes commits or rolls back atomically with the mutation it is
 * auditing. `Pick<PrismaClient, "adminAuditLog">` is satisfied by both the
 * base client and a transaction client structurally, so this stays a single
 * optional parameter rather than a union or an overload.
 */
export async function writeAdminAuditLog(
  args: AdminAuditLogInput,
  client: Pick<PrismaClient, "adminAuditLog"> = prisma,
) {
  await client.adminAuditLog.create({
    data: buildAdminAuditLogEntry(args),
  });
}
