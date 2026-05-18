import { requireApiUserId } from "@/lib/auth/api";
import { ApiError, jsonError, parseJsonBody } from "@/lib/api";
import { createLiveKitToken } from "@/lib/livekit/server";
import { CreateLiveKitTokenBodySchema } from "@/lib/livekit/types";
import { checkRateLimit } from "@/lib/rate-limit";
import { getRedisRate } from "@/lib/redis";
import {
  getVoicePerformanceDurationMs,
  getVoicePerformanceErrorMetadata,
  getVoicePerformanceNow,
  recordVoicePerformanceMetric,
} from "@/lib/voice/performance";

const LIVEKIT_TOKEN_LIMIT = 20;
const LIVEKIT_TOKEN_WINDOW_SECONDS = 60;

export async function POST(request: Request) {
  const startedAt = getVoicePerformanceNow();

  try {
    const userId = await requireApiUserId();
    const isAllowed = await checkRateLimit(
      getRedisRate(),
      `rate:livekit-token:${userId}`,
      LIVEKIT_TOKEN_LIMIT,
      LIVEKIT_TOKEN_WINDOW_SECONDS,
    );

    if (!isAllowed) {
      throw new ApiError("Too many voice token requests. Please try again shortly.", 429, "RATE_LIMITED");
    }

    const input = await parseJsonBody(request, CreateLiveKitTokenBodySchema);
    const response = await createLiveKitToken(userId, input);

    recordVoicePerformanceMetric({
      durationMs: getVoicePerformanceDurationMs(startedAt),
      operation: "livekit_token",
      result: "success",
      runtime: "server",
    });

    return Response.json(response);
  } catch (error) {
    recordVoicePerformanceMetric({
      ...getVoicePerformanceErrorMetadata(error),
      durationMs: getVoicePerformanceDurationMs(startedAt),
      operation: "livekit_token",
      result: "error",
      runtime: "server",
    });

    return jsonError(error);
  }
}
