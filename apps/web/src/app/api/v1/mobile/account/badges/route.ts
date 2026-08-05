import { jsonError } from "@/lib/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { requireMobileApiUserId } from "@/lib/auth/api";
import { handleReadOwnBadges } from "@/lib/badges/badge-route-logic";

export async function GET(request: Request) {
  try {
    const userId = await requireMobileApiUserId(request);
    await enforceApiRateLimit(userId, "user:badges:self");

    return Response.json(await handleReadOwnBadges({ userId }));
  } catch (error) {
    return jsonError(error);
  }
}
