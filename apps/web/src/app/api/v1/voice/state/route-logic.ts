import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { jsonError, parseJsonBody } from "@/lib/api";
import { requireApiUserId } from "@/lib/auth/api";
import { readRequestAttribution } from "@/lib/analytics/client-attribution";
import { logError } from "@/lib/logger";
import {
  getVoicePerformanceDurationMs,
  getVoicePerformanceErrorMetadata,
  getVoicePerformanceNow,
  recordVoicePerformanceMetric,
} from "@/lib/voice/performance";
import { clearVoiceState, emitVoiceStateUpdate, upsertVoiceState } from "@/lib/voice/service";
import { DeleteVoiceStateBodySchema, UpsertVoiceStateBodySchema } from "@/lib/voice/types";

export type VoiceStateRouteDependencies = {
  clearVoiceState: typeof clearVoiceState;
  emitVoiceStateUpdate: typeof emitVoiceStateUpdate;
  enforceApiRateLimit: typeof enforceApiRateLimit;
  getVoicePerformanceDurationMs: typeof getVoicePerformanceDurationMs;
  getVoicePerformanceErrorMetadata: typeof getVoicePerformanceErrorMetadata;
  getVoicePerformanceNow: typeof getVoicePerformanceNow;
  jsonError: typeof jsonError;
  logError: typeof logError;
  parseJsonBody: typeof parseJsonBody;
  readRequestAttribution: typeof readRequestAttribution;
  recordVoicePerformanceMetric: typeof recordVoicePerformanceMetric;
  requireApiUserId: typeof requireApiUserId;
  upsertVoiceState: typeof upsertVoiceState;
};

export type VoiceStatePostRouteDependencies = VoiceStateRouteDependencies;
export type VoiceStateDeleteRouteDependencies = VoiceStateRouteDependencies;

const defaultVoiceStateRouteDependencies: VoiceStateRouteDependencies = {
  clearVoiceState,
  emitVoiceStateUpdate,
  enforceApiRateLimit,
  getVoicePerformanceDurationMs,
  getVoicePerformanceErrorMetadata,
  getVoicePerformanceNow,
  jsonError,
  logError,
  parseJsonBody,
  readRequestAttribution,
  recordVoicePerformanceMetric,
  requireApiUserId,
  upsertVoiceState,
};

export async function postVoiceStateRoute(
  request: Request,
  dependencies: VoiceStatePostRouteDependencies = defaultVoiceStateRouteDependencies,
) {
  const startedAt = dependencies.getVoicePerformanceNow();

  try {
    const userId = await dependencies.requireApiUserId();
    await dependencies.enforceApiRateLimit(userId, "voice:state");
    const input = await dependencies.parseJsonBody(request, UpsertVoiceStateBodySchema);
    const state = await dependencies.upsertVoiceState(
      userId,
      input,
      dependencies.readRequestAttribution(request.headers),
    );

    void dependencies
      .emitVoiceStateUpdate({
        action: "join",
        channelId: state.channelId,
        participants: state.participants,
        serverId: state.serverId,
        userId,
      })
      .catch((error) => {
        dependencies.logError("[voice] Voice state join emit failed in background", error);
      });

    dependencies.recordVoicePerformanceMetric({
      durationMs: dependencies.getVoicePerformanceDurationMs(startedAt),
      operation: "voice_state_post",
      result: "success",
      runtime: "server",
    });

    return Response.json(state);
  } catch (error) {
    dependencies.recordVoicePerformanceMetric({
      ...dependencies.getVoicePerformanceErrorMetadata(error),
      durationMs: dependencies.getVoicePerformanceDurationMs(startedAt),
      operation: "voice_state_post",
      result: "error",
      runtime: "server",
    });

    return dependencies.jsonError(error);
  }
}

export async function deleteVoiceStateRoute(
  request: Request,
  dependencies: VoiceStateDeleteRouteDependencies = defaultVoiceStateRouteDependencies,
) {
  const startedAt = dependencies.getVoicePerformanceNow();

  try {
    const userId = await dependencies.requireApiUserId();
    await dependencies.enforceApiRateLimit(userId, "voice:state");
    const input = await dependencies.parseJsonBody(request, DeleteVoiceStateBodySchema);
    const existingState = await dependencies.clearVoiceState(userId, {
      ...(input.sessionId ? { expectedSessionId: input.sessionId } : {}),
    });

    if (existingState) {
      void dependencies
        .emitVoiceStateUpdate({
          action: "leave",
          channelId: existingState.channelId,
          serverId: existingState.serverId,
          userId,
        })
        .catch((error) => {
          dependencies.logError("[voice] Voice state leave emit failed in background", error);
        });
    }

    dependencies.recordVoicePerformanceMetric({
      durationMs: dependencies.getVoicePerformanceDurationMs(startedAt),
      operation: "voice_state_delete",
      result: "success",
      runtime: "server",
    });

    return Response.json({ success: true });
  } catch (error) {
    dependencies.recordVoicePerformanceMetric({
      ...dependencies.getVoicePerformanceErrorMetadata(error),
      durationMs: dependencies.getVoicePerformanceDurationMs(startedAt),
      operation: "voice_state_delete",
      result: "error",
      runtime: "server",
    });

    return dependencies.jsonError(error);
  }
}
