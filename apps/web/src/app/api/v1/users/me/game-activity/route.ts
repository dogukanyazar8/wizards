import { GameActivityUpdateSchema, GameSharingSettingsSchema } from "@wizards/types";
import { jsonError, parseJsonBody } from "@/lib/api";
import { requireApiUserId } from "@/lib/auth/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import {
  getGameSharingSettings,
  publishGameActivity,
  updateGameSharingSettings,
} from "@/lib/game-activity/service";

const headers = { "Cache-Control": "no-store" };
export async function GET() {
  try {
    const userId = await requireApiUserId();
    await enforceApiRateLimit(userId, "game-activity:read");
    return Response.json(await getGameSharingSettings(userId), { headers });
  } catch (error) {
    return jsonError(error);
  }
}
export async function PATCH(request: Request) {
  try {
    const userId = await requireApiUserId();
    await enforceApiRateLimit(userId, "game-activity:settings");
    const input = await parseJsonBody(request, GameSharingSettingsSchema);
    return Response.json(await updateGameSharingSettings(userId, input.enabled), { headers });
  } catch (error) {
    return jsonError(error);
  }
}
export async function PUT(request: Request) {
  try {
    const userId = await requireApiUserId();
    await enforceApiRateLimit(userId, "game-activity:publish");
    await publishGameActivity(userId, await parseJsonBody(request, GameActivityUpdateSchema));
    return new Response(null, { status: 204, headers });
  } catch (error) {
    return jsonError(error);
  }
}
