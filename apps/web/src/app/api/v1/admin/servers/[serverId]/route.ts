import { prisma } from "@wizards/db";
import type { NextRequest } from "next/server";
import { AdminUpdateServerSchema } from "@wizards/types";

import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { jsonError, parseJsonBody } from "@/lib/api";
import { requireAdminCapability } from "@/lib/admin/capabilities";
import { writeAdminAuditLog } from "@/lib/admin/audit-log";
import { deleteAdminServer, updateAdminServer } from "@/app/api/v1/admin/servers/route-logic";

/**
 * Promotion, demotion, verification and featuring all land on the same handler
 * because they are the same write: the privileged columns of an existing
 * server. The forcings live in `updateAdminServer`, not here.
 */
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ serverId: string }> },
) {
  try {
    const admin = await requireAdminCapability("server.write");
    await enforceApiRateLimit(admin.id, "admin:server:update");

    const { serverId } = await context.params;
    const body = await parseJsonBody(request, AdminUpdateServerSchema);
    const result = await updateAdminServer(admin.id, serverId, body, request.headers, {
      findServer: (id) =>
        prisma.server.findUnique({
          select: {
            discoverable: true,
            features: true,
            isPublic: true,
            name: true,
            type: true,
            verificationLevel: true,
          },
          where: { id },
        }),
      // The update and its audit row share one transaction (Finding 8,
      // 06-kesif-imleci-ve-audit.md) so a failure between them rolls both back
      // instead of leaving a committed mutation with no audit entry.
      withTransaction: (run) =>
        prisma.$transaction((tx) =>
          run({
            updateServer: async (id, data) => {
              await tx.server.update({ data, where: { id } });
            },
            writeAuditLog: (args) => writeAdminAuditLog(args, tx),
          }),
        ),
    });

    return Response.json(result);
  } catch (error) {
    return jsonError(error);
  }
}

/**
 * Community servers refuse deletion through the consumer route, so this is the
 * only way one can be removed. Personal servers may also be deleted here for
 * moderation, which is why the audit entry records the type. Business logic
 * (the 404-before-delete ordering and the audit-metadata composition) lives
 * in `deleteAdminServer`; this handler is transport only.
 */
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ serverId: string }> },
) {
  try {
    const admin = await requireAdminCapability("server.write");
    await enforceApiRateLimit(admin.id, "admin:server:delete");

    const { serverId } = await context.params;
    const result = await deleteAdminServer(admin.id, serverId, request.headers, {
      findServer: (id) =>
        prisma.server.findUnique({ select: { name: true, type: true }, where: { id } }),
      // Same reasoning as PATCH above: the delete and its audit row share one
      // transaction so an unaudited deletion cannot happen.
      withTransaction: (run) =>
        prisma.$transaction((tx) =>
          run({
            deleteServer: async (id) => {
              await tx.server.delete({ where: { id } });
            },
            writeAuditLog: (args) => writeAdminAuditLog(args, tx),
          }),
        ),
    });

    return Response.json(result);
  } catch (error) {
    return jsonError(error);
  }
}
