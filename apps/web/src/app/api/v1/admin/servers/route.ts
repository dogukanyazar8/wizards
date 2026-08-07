import type { NextRequest } from "next/server";
import { AdminCreateServerSchema, type CreateServerInput } from "@wizards/types";

import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { jsonError, parseJsonBody } from "@/lib/api";
import { requireAdminCapability } from "@/lib/admin/capabilities";
import { writeAdminAuditLog } from "@/lib/admin/audit-log";
import { listAdminServers } from "@/lib/admin/management";
import {
  createWorkspaceServer,
  type CreateWorkspaceServerOptions,
} from "@/lib/workspace/server-service";
import { createAdminServer } from "@/app/api/v1/admin/servers/route-logic";

/**
 * `createWorkspaceServer` returns `{ channelId, serverId }` for the consumer
 * route's own response shape; the admin dependency contract only needs the
 * new server's id, so this adapts the shape at the transport boundary instead
 * of leaking a second return convention into the service.
 */
async function createWorkspaceServerForAdmin(
  userId: string,
  input: CreateServerInput,
  options: CreateWorkspaceServerOptions,
): Promise<{ id: string }> {
  const created = await createWorkspaceServer(userId, input, options);
  return { id: created.serverId };
}

export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdminCapability("server.read");
    await enforceApiRateLimit(admin.id, "admin:server:list");

    const url = new URL(request.url);
    const payload = await listAdminServers({
      limit: url.searchParams.get("limit"),
      page: url.searchParams.get("page"),
      query: url.searchParams.get("query"),
    });

    return Response.json(payload);
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdminCapability("server.write");
    await enforceApiRateLimit(admin.id, "admin:server:create");

    const body = await parseJsonBody(request, AdminCreateServerSchema);
    const created = await createAdminServer(admin.id, body, request.headers, {
      createServer: createWorkspaceServerForAdmin,
      writeAuditLog: writeAdminAuditLog,
    });

    return Response.json(created, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
