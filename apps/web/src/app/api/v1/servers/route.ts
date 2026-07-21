import { CreateServerSchema } from "@wizards/types";
import { requireApiUserId } from "@/lib/auth/api";
import { createServerTiming } from "@/lib/server-timing";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { jsonError, parseJsonBody } from "@/lib/api";
import { createWorkspaceServer, listWorkspaceServers } from "@/lib/workspace/server-service";

export async function GET() {
  const timing = createServerTiming();

  try {
    const stopAuthTiming = timing.start("auth");
    const userId = await requireApiUserId();
    await enforceApiRateLimit(userId, "server:list");
    stopAuthTiming();
    const servers = await timing.measure("db", () => listWorkspaceServers(userId));

    return Response.json({ servers }, { headers: timing.headers() });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const userId = await requireApiUserId();
    const input = await parseJsonBody(request, CreateServerSchema);
    const created = await createWorkspaceServer(userId, input);

    return Response.json(created, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
