import { requireApiUserId } from "@/lib/auth/api";
import { jsonError } from "@/lib/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { listBlockedUsers } from "@/lib/friends/queries";

export async function GET(request: Request) {
  try {
    const userId = await requireApiUserId();
    await enforceApiRateLimit(userId, "friend:blocked:list");
    const params = new URL(request.url).searchParams;
    const blocked = await listBlockedUsers(userId, {
      ...(params.get("cursor") ? { cursor: params.get("cursor")! } : {}),
      limit: Number.parseInt(params.get("limit") ?? "100", 10),
    });

    return Response.json(blocked);
  } catch (error) {
    return jsonError(error);
  }
}
