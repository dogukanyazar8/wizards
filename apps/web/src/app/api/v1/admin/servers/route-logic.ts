import type {
  AdminCreateServerInput,
  AdminUpdateServerInput,
  CreateServerInput,
} from "@wizards/types";
import type { ServerType, VerificationLevel } from "@wizards/db";

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
 *
 * Finding 8 (06-kesif-imleci-ve-audit.md): unlike `updateAdminServer`,
 * `recountAdminServerMembers`, and `deleteAdminServer` below, the mutation
 * and the audit write here are NOT atomic — `dependencies.createServer`
 * (`createWorkspaceServerForAdmin` -> `createWorkspaceServer` in
 * `lib/workspace/server-service.ts`) opens its own `prisma.$transaction`
 * internally, and Prisma does not support nesting an interactive transaction
 * inside another one. Threading the audit write into that existing
 * transaction would require `createWorkspaceServer` to accept an externally
 * supplied transaction client instead of always opening its own — a
 * signature and control-flow change to a function the consumer
 * `POST /api/v1/servers` route also calls (with two arguments, producing a
 * `PERSONAL` server, never audited). That ripples into the consumer create
 * path to fix a gap that is specific to the admin path, so it was left
 * as-is rather than reshaped. A DB hiccup between the two calls here leaves
 * a created server with no audit row — a known, accepted gap.
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

export const SERVER_FEATURE_VERIFIED = "VERIFIED";
export const SERVER_FEATURE_FEATURED = "FEATURED";

export type AdminServerUpdateSource = {
  readonly discoverable: boolean;
  readonly features: readonly string[];
  readonly isPublic: boolean;
  readonly name: string;
  readonly type: ServerType;
  readonly verificationLevel: VerificationLevel;
};

export type AdminServerUpdateData = {
  discoverable: boolean;
  features: string[];
  isPublic: boolean;
  type: ServerType;
  verificationLevel: VerificationLevel;
};

/**
 * Three forcings live here rather than in the console so they hold for every
 * caller of the route. The first two are S4 decision 3:
 *
 * - a server that is `COMMUNITY` is publicly joinable, matching the `.refine()`
 *   the create contract already carries;
 * - demoting to `PERSONAL` clears `discoverable`, because a server that is no
 *   longer a community must not stay in the discovery list.
 *
 * The third closes a gap this admin path had relative to the consumer path:
 * resolving to `isPublic: false` -- whether via demotion, an explicit
 * `isPublic: false`, or it already being off -- clears `discoverable` too,
 * mirroring `resolveVisibilityUpdateData` (`lib/workspace/server-service.ts`).
 * Without it, `{ discoverable: true }` alone against a private server left
 * `discoverable: true` with `isPublic: false`, a combination the public
 * profile gate (`isPublic || discoverable || joined`) treats as visible.
 *
 * `verified` / `featured` are applied as membership edits on the `features`
 * array instead of replacing it — that column also carries the media-settings
 * flags.
 */
export function resolveAdminServerUpdate(
  current: AdminServerUpdateSource,
  input: AdminUpdateServerInput,
): AdminServerUpdateData {
  const type = input.type ?? current.type;
  const isPublic = type === "COMMUNITY" ? true : (input.isPublic ?? current.isPublic);
  const demoted = current.type === "COMMUNITY" && type === "PERSONAL";
  const discoverable = demoted || !isPublic ? false : (input.discoverable ?? current.discoverable);

  const features = new Set(current.features);

  if (input.verified !== undefined) {
    if (input.verified) {
      features.add(SERVER_FEATURE_VERIFIED);
    } else {
      features.delete(SERVER_FEATURE_VERIFIED);
    }
  }

  if (input.featured !== undefined) {
    if (input.featured) {
      features.add(SERVER_FEATURE_FEATURED);
    } else {
      features.delete(SERVER_FEATURE_FEATURED);
    }
  }

  return {
    discoverable,
    features: [...features],
    isPublic,
    type,
    verificationLevel: input.verificationLevel ?? current.verificationLevel,
  };
}

/**
 * The two writes `updateAdminServer` has to make once it knows the server
 * exists, scoped to run inside a single transaction (Finding 8,
 * 06-kesif-imleci-ve-audit.md) so a mutation can never commit without its
 * audit row.
 */
export type AdminServerUpdateTransaction = {
  readonly updateServer: (serverId: string, data: AdminServerUpdateData) => Promise<void>;
  readonly writeAuditLog: (args: AdminAuditLogInput) => Promise<void>;
};

export type AdminServerUpdateDependencies = {
  readonly findServer: (serverId: string) => Promise<AdminServerUpdateSource | null>;
  readonly withTransaction: (
    run: (tx: AdminServerUpdateTransaction) => Promise<void>,
  ) => Promise<void>;
};

/**
 * Promotion and demotion both run through here, both behind `server.write`,
 * and both land in the audit trail with the before/after pair the console
 * renders. Kept transport-free like its two siblings.
 *
 * `findServer` runs before `withTransaction` (unchanged from before Finding
 * 8) -- the 404 check is a read with no side effect, so it does not need the
 * same-transaction guarantee the write and its audit entry do.
 */
export async function updateAdminServer(
  adminUserId: string,
  serverId: string,
  input: AdminUpdateServerInput,
  headers: Headers | null,
  dependencies: AdminServerUpdateDependencies,
): Promise<{ success: true }> {
  const current = await dependencies.findServer(serverId);

  if (!current) {
    throw new ApiError("Server not found", 404, "SERVER_NOT_FOUND");
  }

  const data = resolveAdminServerUpdate(current, input);

  await dependencies.withTransaction(async (tx) => {
    await tx.updateServer(serverId, data);

    await tx.writeAuditLog({
      action: "server.update",
      adminUserId,
      headers,
      metadata: {
        after: {
          discoverable: data.discoverable,
          featured: data.features.includes(SERVER_FEATURE_FEATURED),
          isPublic: data.isPublic,
          type: data.type,
          verificationLevel: data.verificationLevel,
          verified: data.features.includes(SERVER_FEATURE_VERIFIED),
        },
        before: {
          discoverable: current.discoverable,
          featured: current.features.includes(SERVER_FEATURE_FEATURED),
          isPublic: current.isPublic,
          type: current.type,
          verificationLevel: current.verificationLevel,
          verified: current.features.includes(SERVER_FEATURE_VERIFIED),
        },
        name: current.name,
      },
      targetId: serverId,
      targetType: "Server",
    });
  });

  return { success: true };
}

export type AdminServerRecountTransaction = {
  readonly recomputeMemberCount: (serverId: string) => Promise<number>;
  readonly writeAuditLog: (args: AdminAuditLogInput) => Promise<void>;
};

export type AdminServerRecountDependencies = {
  readonly findServer: (serverId: string) => Promise<{ memberCount: number; name: string } | null>;
  readonly withTransaction: (
    run: (tx: AdminServerRecountTransaction) => Promise<void>,
  ) => Promise<void>;
};

/**
 * `memberCount` is a denormalized column written from five call sites, so it
 * can drift. The repair itself is a single SQL statement in
 * `recomputeServerMemberCount`; this wraps it in the 404 check and the audit
 * entry so a correction is attributable.
 *
 * The recompute and its audit entry share one transaction (Finding 8,
 * 06-kesif-imleci-ve-audit.md): a correction that lands without an audit row
 * would be indistinguishable from silent, unattributed drift repair.
 */
export async function recountAdminServerMembers(
  adminUserId: string,
  serverId: string,
  headers: Headers | null,
  dependencies: AdminServerRecountDependencies,
): Promise<{ after: number; before: number; success: true }> {
  const server = await dependencies.findServer(serverId);

  if (!server) {
    throw new ApiError("Server not found", 404, "SERVER_NOT_FOUND");
  }

  let after = 0;

  await dependencies.withTransaction(async (tx) => {
    after = await tx.recomputeMemberCount(serverId);

    await tx.writeAuditLog({
      action: "server.recount",
      adminUserId,
      headers,
      metadata: { after, before: server.memberCount, name: server.name },
      targetId: serverId,
      targetType: "Server",
    });
  });

  return { after, before: server.memberCount, success: true };
}

export type AdminServerDeleteTransaction = {
  readonly deleteServer: (serverId: string) => Promise<void>;
  readonly writeAuditLog: (args: AdminAuditLogInput) => Promise<void>;
};

export type AdminServerDeleteDependencies = {
  readonly findServer: (serverId: string) => Promise<{ name: string; type: ServerType } | null>;
  readonly withTransaction: (
    run: (tx: AdminServerDeleteTransaction) => Promise<void>,
  ) => Promise<void>;
};

/**
 * Community servers refuse deletion through the consumer route, so this is
 * the only path that can remove one. Personal servers may also be deleted
 * here for moderation, which is why the audit entry records the type. Kept
 * transport-free, mirroring `createAdminServer`, so the 404-before-delete
 * ordering and the audit entry's contents can be asserted without a
 * database.
 *
 * The delete and its audit entry share one transaction (Finding 8,
 * 06-kesif-imleci-ve-audit.md): an unaudited deletion is the worst version of
 * this bug, since the row that would explain who removed the server and why
 * is gone along with it.
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

  await dependencies.withTransaction(async (tx) => {
    await tx.deleteServer(serverId);

    await tx.writeAuditLog({
      action: "server.delete",
      adminUserId,
      headers,
      metadata: { name: server.name, type: server.type },
      targetId: serverId,
      targetType: "Server",
    });
  });

  return { success: true };
}
