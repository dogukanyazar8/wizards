import { CreateServerSchema } from "@wizards/types";
import { requireApiUserId } from "@/lib/auth/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { jsonError, parseJsonBody } from "@/lib/api";
import {
  createWorkspaceServer,
  listWorkspaceServers,
} from "@/lib/workspace/service";

export async function GET() {
  try {
    const userId = await requireApiUserId();
    await enforceApiRateLimit(userId, "server:list");
    const servers = await listWorkspaceServers(userId);

    return Response.json({ servers });
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
