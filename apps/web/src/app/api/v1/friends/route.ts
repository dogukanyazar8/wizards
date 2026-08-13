import { requireApiUserId } from "@/lib/auth/api";
import { jsonError } from "@/lib/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { listFriends } from "@/lib/friends/queries";

export async function GET(request: Request) {
  try {
    const userId = await requireApiUserId();
    await enforceApiRateLimit(userId, "friend:list");
    const params = new URL(request.url).searchParams;
    const friends = await listFriends(userId, {
      ...(params.get("cursor") ? { cursor: params.get("cursor")! } : {}),
      limit: Number.parseInt(params.get("limit") ?? "100", 10),
    });

    return Response.json(friends);
  } catch (error) {
    return jsonError(error);
  }
}
