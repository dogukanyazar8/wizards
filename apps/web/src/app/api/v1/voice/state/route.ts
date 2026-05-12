import { requireApiUserId } from "@/lib/auth/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { jsonError, parseJsonBody } from "@/lib/api";
import {
  clearVoiceState,
  emitVoiceStateUpdate,
  removeLiveKitVoiceParticipant,
  upsertVoiceState,
} from "@/lib/voice/service";
import { UpsertVoiceStateBodySchema } from "@/lib/voice/types";

export async function POST(request: Request) {
  try {
    const userId = await requireApiUserId();
    await enforceApiRateLimit(userId, "voice:state");
    const input = await parseJsonBody(request, UpsertVoiceStateBodySchema);
    const previousState = await clearVoiceState(userId, { removeLiveKitParticipant: false });
    const state = await upsertVoiceState(userId, input);

    if (
      previousState &&
      (previousState.channelId !== state.channelId || previousState.serverId !== state.serverId)
    ) {
      await removeLiveKitVoiceParticipant(previousState.channelId, userId);
      await emitVoiceStateUpdate({
        action: "leave",
        channelId: previousState.channelId,
        serverId: previousState.serverId,
        userId,
      });
    }

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

export async function DELETE() {
  try {
    const userId = await requireApiUserId();
    await enforceApiRateLimit(userId, "voice:state");
    const existingState = await clearVoiceState(userId);

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
