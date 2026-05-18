import { requireApiUserId } from "@/lib/auth/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { jsonError, parseJsonBody } from "@/lib/api";
import {
  clearVoiceState,
  emitVoiceStateUpdate,
  upsertVoiceState,
} from "@/lib/voice/service";
import { DeleteVoiceStateBodySchema, UpsertVoiceStateBodySchema } from "@/lib/voice/types";

export async function POST(request: Request) {
  try {
    const userId = await requireApiUserId();
    await enforceApiRateLimit(userId, "voice:state");
    const input = await parseJsonBody(request, UpsertVoiceStateBodySchema);
    const state = await upsertVoiceState(userId, input);

    await emitVoiceStateUpdate({
      action: "join",
      channelId: state.channelId,
      serverId: state.serverId,
      userId,
    });

    return Response.json(state);
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const userId = await requireApiUserId();
    await enforceApiRateLimit(userId, "voice:state");
    const input = await parseJsonBody(request, DeleteVoiceStateBodySchema);
    const existingState = await clearVoiceState(userId, {
      ...(input.sessionId ? { expectedSessionId: input.sessionId } : {}),
    });

    if (existingState) {
      await emitVoiceStateUpdate({
        action: "leave",
        channelId: existingState.channelId,
        serverId: existingState.serverId,
        userId,
      });
    }

    return Response.json({ success: true });
  } catch (error) {
    return jsonError(error);
  }
}
