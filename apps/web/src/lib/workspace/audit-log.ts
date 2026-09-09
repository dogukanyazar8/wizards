import type { Prisma } from "@wizards/db";

export type WorkspaceAuditAction =
  | "MEMBER_BANNED"
  | "MEMBER_KICKED"
  | "MEMBER_ROLES_UPDATED"
  /** Ş2 / K3: zaman aşımı koyma ve kaldırma ayrı satırlar — biri diğerinin geri alınması. */
  | "MEMBER_TIMED_OUT"
  | "MEMBER_TIMEOUT_REMOVED"
  | "MEMBER_UNBANNED"
  /** Ş1 §3 — sahiplik devri. `AuditLog.action` serbest metin, yeni enum değeri gerekmiyor. */
  | "SERVER_OWNERSHIP_TRANSFERRED";

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
