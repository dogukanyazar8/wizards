import { requireApiUserId } from "@/lib/auth/api";
import { jsonError } from "@/lib/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { listFriendSuggestions } from "@/lib/friends/suggestions-service";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const userId = await requireApiUserId();
    await enforceApiRateLimit(userId, "friend:suggestions");

    return Response.json({ suggestions: await listFriendSuggestions(userId) });
  } catch (error) {
    return jsonError(error);
  }
}
