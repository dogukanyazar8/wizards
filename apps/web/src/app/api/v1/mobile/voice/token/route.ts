import {
  MobileVoiceTokenRequestSchema,
  MobileVoiceTokenResponseSchema,
} from "@wizards/types";

import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { jsonError, parseJsonBody } from "@/lib/api";
import { requireMobileApiSession } from "@/lib/auth/api";
import { createLiveKitToken } from "@/lib/livekit/server";
import {
  getVoicePerformanceDurationMs,
  getVoicePerformanceErrorMetadata,
  getVoicePerformanceNow,
  recordVoicePerformanceMetric,
} from "@/lib/voice/performance";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: Request) {
  const startedAt = getVoicePerformanceNow();

  try {
    const session = await requireMobileApiSession(request);
    await enforceApiRateLimit(session.userId, "mobile:voice:token");

    const body = await parseJsonBody(request, MobileVoiceTokenRequestSchema);
    const tokenResponse = await createLiveKitToken(session.userId, {
      channelId: body.channelId,
    });
    const response = MobileVoiceTokenResponseSchema.parse({
      channelId: body.channelId,
      provider: "livekit",
      token: tokenResponse.token,
      url: tokenResponse.url,
    });

    recordVoicePerformanceMetric({
      durationMs: getVoicePerformanceDurationMs(startedAt),
      operation: "livekit_token",
      result: "success",
      runtime: "server",
    });

    return Response.json(response, {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
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
