import { requireApiUserId } from "@/lib/auth/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { jsonError, parseJsonBody } from "@/lib/api";
import { logError } from "@/lib/logger";
import {
  getVoicePerformanceDurationMs,
  getVoicePerformanceErrorMetadata,
  getVoicePerformanceNow,
  recordVoicePerformanceMetric,
} from "@/lib/voice/performance";
import { clearVoiceState, emitVoiceStateUpdate, upsertVoiceState } from "@/lib/voice/service";
import { DeleteVoiceStateBodySchema, UpsertVoiceStateBodySchema } from "@/lib/voice/types";

export async function POST(request: Request) {
  const startedAt = getVoicePerformanceNow();

  try {
    const userId = await requireApiUserId();
    await enforceApiRateLimit(userId, "voice:state");
    const input = await parseJsonBody(request, UpsertVoiceStateBodySchema);
    const state = await upsertVoiceState(userId, input);

    void emitVoiceStateUpdate({
      action: "join",
      channelId: state.channelId,
      participants: state.participants,
      serverId: state.serverId,
      userId,
    }).catch((error) => {
      logError("[voice] Voice state join emit failed in background", error);
    });

    recordVoicePerformanceMetric({
      durationMs: getVoicePerformanceDurationMs(startedAt),
      operation: "voice_state_post",
      result: "success",
      runtime: "server",
    });

    return Response.json(state);
  } catch (error) {
    recordVoicePerformanceMetric({
      ...getVoicePerformanceErrorMetadata(error),
      durationMs: getVoicePerformanceDurationMs(startedAt),
      operation: "voice_state_post",
      result: "error",
      runtime: "server",
    });

    return jsonError(error);
  }
}

export async function DELETE(request: Request) {
  const startedAt = getVoicePerformanceNow();

  try {
    const userId = await requireApiUserId();
    await enforceApiRateLimit(userId, "voice:state");
    const input = await parseJsonBody(request, DeleteVoiceStateBodySchema);
    const existingState = await clearVoiceState(userId, {
      ...(input.sessionId ? { expectedSessionId: input.sessionId } : {}),
    });

    if (existingState) {
      void emitVoiceStateUpdate({
        action: "leave",
        channelId: existingState.channelId,
        serverId: existingState.serverId,
        userId,
      }).catch((error) => {
        logError("[voice] Voice state leave emit failed in background", error);
      });
    }

    recordVoicePerformanceMetric({
      durationMs: getVoicePerformanceDurationMs(startedAt),
      operation: "voice_state_delete",
      result: "success",
      runtime: "server",
    });

    return Response.json({ success: true });
  } catch (error) {
    recordVoicePerformanceMetric({
      ...getVoicePerformanceErrorMetadata(error),
      durationMs: getVoicePerformanceDurationMs(startedAt),
      operation: "voice_state_delete",
      result: "error",
      runtime: "server",
    });

    return jsonError(error);
  }
}
