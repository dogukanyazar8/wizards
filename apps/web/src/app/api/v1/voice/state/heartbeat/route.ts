import { requireApiUserId } from "@/lib/auth/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { jsonError, parseJsonBody } from "@/lib/api";
import { heartbeatVoiceState } from "@/lib/voice/service";
import { HeartbeatVoiceStateBodySchema } from "@/lib/voice/types";

export async function PATCH(request: Request) {
  try {
    const userId = await requireApiUserId();
    await enforceApiRateLimit(userId, "voice:heartbeat");
    const input = await parseJsonBody(request, HeartbeatVoiceStateBodySchema);
    const state = await heartbeatVoiceState(userId, input);

    return Response.json({
      channelId: state.channelId,
      serverId: state.serverId,
      success: true,
    });
  } catch (error) {
    return jsonError(error);
  }
}
