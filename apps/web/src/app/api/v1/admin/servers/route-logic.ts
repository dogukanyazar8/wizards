import type { AdminCreateServerInput, CreateServerInput } from "@wizards/types";
import type { ServerType } from "@wizards/db";

import { ApiError } from "@/lib/api";
import type { AdminAuditLogInput } from "@/lib/admin/audit-log";
import type { CreateWorkspaceServerOptions } from "@/lib/workspace/server-service";

export type AdminServerCreateDependencies = {
  readonly createServer: (
    userId: string,
    input: CreateServerInput,
    options: CreateWorkspaceServerOptions,
  ) => Promise<{ id: string }>;
  readonly writeAuditLog: (args: AdminAuditLogInput) => Promise<void>;
};

/**
 * The only path that can write `type: COMMUNITY`. Kept transport-free so the
 * gate and the audit trail can be asserted without a database or a session.
 *
 * `input` is already validated and defaulted by `AdminCreateServerSchema` —
 * the route parses the request body through the shared `parseJsonBody`
 * helper before calling this function, so there is no second validation
 * pass here.
 */
export async function createAdminServer(
  adminUserId: string,
  input: AdminCreateServerInput,
  headers: Headers | null,
  dependencies: AdminServerCreateDependencies,
): Promise<{ id: string }> {
  const { discoverable, isPublic, type, verificationLevel, ...rest } = input;

  const created = await dependencies.createServer(adminUserId, rest, {
    discoverable,
    isPublic,
    type,
    verificationLevel,
  });

  await dependencies.writeAuditLog({
    action: "server.create",
    adminUserId,
    headers,
    metadata: { discoverable, isPublic, type },
    targetId: created.id,
    targetType: "Server",
  });

  return created;
}

export type AdminServerDeleteDependencies = {
  readonly deleteServer: (serverId: string) => Promise<void>;
  readonly findServer: (serverId: string) => Promise<{ name: string; type: ServerType } | null>;
  readonly writeAuditLog: (args: AdminAuditLogInput) => Promise<void>;
};

/**
 * Community servers refuse deletion through the consumer route, so this is
 * the only path that can remove one. Personal servers may also be deleted
 * here for moderation, which is why the audit entry records the type. Kept
 * transport-free, mirroring `createAdminServer`, so the 404-before-delete
 * ordering and the audit entry's contents can be asserted without a
 * database.
 */
export async function deleteAdminServer(
  adminUserId: string,
  serverId: string,
  headers: Headers | null,
  dependencies: AdminServerDeleteDependencies,
): Promise<{ success: true }> {
  const server = await dependencies.findServer(serverId);

  if (!server) {
    throw new ApiError("Server not found", 404, "SERVER_NOT_FOUND");
  }

  await dependencies.deleteServer(serverId);

  await dependencies.writeAuditLog({
    action: "server.delete",
    adminUserId,
    headers,
    metadata: { name: server.name, type: server.type },
    targetId: serverId,
    targetType: "Server",
  });

  return { success: true };
}
