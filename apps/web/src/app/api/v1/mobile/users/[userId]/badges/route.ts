import { jsonError } from "@/lib/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { requireMobileApiUserId } from "@/lib/auth/api";
import { handleReadUserBadges } from "@/lib/badges/badge-route-logic";

type RouteContext = { params: Promise<{ userId: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    const requesterId = await requireMobileApiUserId(request);
    await enforceApiRateLimit(requesterId, "user:badges");
    const { userId } = await context.params;

    return Response.json(await handleReadUserBadges({ requesterId, userId }));
  } catch (error) {
    return jsonError(error);
  }
}
