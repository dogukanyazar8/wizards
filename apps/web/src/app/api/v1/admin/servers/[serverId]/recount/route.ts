import { prisma } from "@wizards/db";
import type { NextRequest } from "next/server";

import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { jsonError } from "@/lib/api";
import { requireAdminCapability } from "@/lib/admin/capabilities";
import { writeAdminAuditLog } from "@/lib/admin/audit-log";
import { recountAdminServerMembers } from "@/app/api/v1/admin/servers/route-logic";
import { recomputeServerMemberCount } from "@/lib/workspace/server-member-counter";

/**
 * Bodyless on purpose — the server id is the whole request — so this path is
 * registered in `BODYLESS_MUTATING_METHOD_PATHS` in the route contract test.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ serverId: string }> },
) {
  try {
    const admin = await requireAdminCapability("server.write");
    await enforceApiRateLimit(admin.id, "admin:server:recount");

    const { serverId } = await context.params;
    const result = await recountAdminServerMembers(admin.id, serverId, request.headers, {
      findServer: (id) =>
        prisma.server.findUnique({ select: { memberCount: true, name: true }, where: { id } }),
      // Same reasoning as the other two admin server mutations: the recompute
      // and its audit row share one transaction (Finding 8,
      // 06-kesif-imleci-ve-audit.md).
      withTransaction: (run) =>
        prisma.$transaction((tx) =>
          run({
            recomputeMemberCount: async (id) => {
              await recomputeServerMemberCount(tx, id);
              const repaired = await tx.server.findUnique({
                select: { memberCount: true },
                where: { id },
              });

              return repaired?.memberCount ?? 0;
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
