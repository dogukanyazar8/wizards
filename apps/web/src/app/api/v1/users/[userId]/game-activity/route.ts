import { jsonError } from "@/lib/api";
import { requireApiUserId } from "@/lib/auth/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { readGameActivity } from "@/lib/game-activity/service";

export async function GET(_request: Request, context: { params: Promise<{ userId: string }> }) {
  try {
    const viewer = await requireApiUserId();
    await enforceApiRateLimit(viewer, "game-activity:read");
    const { userId } = await context.params;
    return Response.json(
      { activity: await readGameActivity(viewer, userId) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return jsonError(error);
  }
}
