import { jsonError } from "@/lib/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { requireApiUserId } from "@/lib/auth/api";
import { handleReadOwnBadges } from "@/lib/badges/badge-route-logic";

export async function GET() {
  try {
    const userId = await requireApiUserId();
    await enforceApiRateLimit(userId, "user:badges:self");

    return Response.json(await handleReadOwnBadges({ userId }));
  } catch (error) {
    return jsonError(error);
  }
}
