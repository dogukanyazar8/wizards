import type { Prisma } from "@wizards/db";

export type WorkspaceAuditAction = "MEMBER_KICKED" | "MEMBER_ROLES_UPDATED";

export type WorkspaceAuditLogInput = {
  action: WorkspaceAuditAction;
  actorId: string;
  metadata?: Record<string, unknown>;
  serverId: string;
  targetId?: string;
  targetType?: "USER" | "CHANNEL" | "ROLE" | "SERVER" | "MESSAGE";
};

/**
 * The transaction is mandatory: a privileged workspace mutation and its trail
 * must commit or roll back together, never leave two competing truths.
 */
export async function writeWorkspaceAuditLog(
  tx: Prisma.TransactionClient,
  input: WorkspaceAuditLogInput,
) {
  await tx.auditLog.create({
    data: {
      action: input.action,
      ...(input.metadata ? { changes: input.metadata as Prisma.InputJsonValue } : {}),
      serverId: input.serverId,
      targetId: input.targetId ?? null,
      targetType: input.targetType ?? null,
      userId: input.actorId,
    },
  });
}
