import { requireApiUserId } from "@/lib/auth/api";
import { jsonError, parseJsonBody } from "@/lib/api";
import {
  clearVoiceState,
  emitVoiceStateUpdate,
  upsertVoiceState,
} from "@/lib/voice/service";
import { UpsertVoiceStateBodySchema } from "@/lib/voice/types";

export async function POST(request: Request) {
  try {
    const userId = await requireApiUserId();
    const input = await parseJsonBody(request, UpsertVoiceStateBodySchema);
    const previousState = await clearVoiceState(userId);
    const state = await upsertVoiceState(userId, input);

    if (
      previousState &&
      (previousState.channelId !== state.channelId || previousState.serverId !== state.serverId)
    ) {
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
