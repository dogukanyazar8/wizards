import { requireApiUserId } from "@/lib/auth/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { jsonError } from "@/lib/api";
import { listDirectMessageMutualServers } from "@/lib/dm/service";
import { z } from "zod";

const MutualServersParamsSchema = z.object({
  userId: z.string().min(1),
});

type RouteContext = {
  params: Promise<{
    userId: string;
  }>;
};

export async function GET(_: Request, context: RouteContext) {
  try {
    const requesterId = await requireApiUserId();
    await enforceApiRateLimit(requesterId, "dm:mutual-servers:list");
    const { userId } = MutualServersParamsSchema.parse(await context.params);
    const servers = await listDirectMessageMutualServers(requesterId, userId);

    return Response.json({ servers });
  } catch (error) {
    return jsonError(error);
  }
}
