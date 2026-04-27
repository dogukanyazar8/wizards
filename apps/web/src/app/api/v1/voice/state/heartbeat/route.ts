import { requireApiUserId } from "@/lib/auth/api";
import { jsonError, parseJsonBody } from "@/lib/api";
import { heartbeatVoiceState } from "@/lib/voice/service";
import { HeartbeatVoiceStateBodySchema } from "@/lib/voice/types";

export async function PATCH(request: Request) {
  try {
    const userId = await requireApiUserId();
    const input = await parseJsonBody(request, HeartbeatVoiceStateBodySchema);
    const state = await heartbeatVoiceState(userId, input.sessionId);

    return Response.json({
      channelId: state.channelId,
      serverId: state.serverId,
      success: true,
    });
  } catch (error) {
    return jsonError(error);
  }
}
