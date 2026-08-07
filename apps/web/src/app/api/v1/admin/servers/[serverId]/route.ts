import { prisma } from "@wizards/db";
import type { NextRequest } from "next/server";

import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { jsonError } from "@/lib/api";
import { requireAdminCapability } from "@/lib/admin/capabilities";
import { writeAdminAuditLog } from "@/lib/admin/audit-log";
import { deleteAdminServer } from "@/app/api/v1/admin/servers/route-logic";

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
      deleteServer: async (id) => {
        await prisma.server.delete({ where: { id } });
      },
      findServer: (id) =>
        prisma.server.findUnique({ select: { name: true, type: true }, where: { id } }),
      writeAuditLog: writeAdminAuditLog,
    });

    return Response.json(result);
  } catch (error) {
    return jsonError(error);
  }
}
