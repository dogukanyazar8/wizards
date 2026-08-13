import {
  MobileVoiceTokenRequestSchema,
  MobileVoiceTokenResponseSchema,
  type MobileVoiceTokenRequest,
} from "@wizards/types";

import { jsonError, parseJsonBody } from "@/lib/api";
import { enforceApiRateLimit, type ApiRateLimitAction } from "@/lib/api-rate-limit";
import { requireMobileApiSession } from "@/lib/auth/api";
import { createLiveKitToken } from "@/lib/livekit/server";
import type { LiveKitTokenResponse } from "@/lib/livekit/types";
import {
  getVoicePerformanceDurationMs,
  getVoicePerformanceErrorMetadata,
  getVoicePerformanceNow,
  recordVoicePerformanceMetric,
  type VoicePerformanceMetric,
} from "@/lib/voice/performance";

type MobileVoiceTokenSession = { userId: string };

export type MobileVoiceTokenRouteDependencies = {
  authenticate(request: Request): Promise<MobileVoiceTokenSession>;
  createToken(userId: string, input: MobileVoiceTokenRequest): Promise<LiveKitTokenResponse>;
  enforceRateLimit(userId: string, action: ApiRateLimitAction): Promise<void>;
  getDurationMs(startedAt: number): number;
  getErrorMetadata(error: unknown): ReturnType<typeof getVoicePerformanceErrorMetadata>;
  getNow(): number;
  parseBody(request: Request): Promise<MobileVoiceTokenRequest>;
  recordMetric(metric: VoicePerformanceMetric): void;
};

const defaultDependencies: MobileVoiceTokenRouteDependencies = {
  authenticate: (request) => requireMobileApiSession(request),
  createToken: createLiveKitToken,
  enforceRateLimit: enforceApiRateLimit,
  getDurationMs: getVoicePerformanceDurationMs,
  getErrorMetadata: getVoicePerformanceErrorMetadata,
  getNow: getVoicePerformanceNow,
  parseBody: (request) => parseJsonBody(request, MobileVoiceTokenRequestSchema),
  recordMetric: recordVoicePerformanceMetric,
};

export async function mobileVoiceTokenPostRoute(
  request: Request,
  dependencies: MobileVoiceTokenRouteDependencies = defaultDependencies,
) {
  const startedAt = dependencies.getNow();

  try {
    const session = await dependencies.authenticate(request);
    await dependencies.enforceRateLimit(session.userId, "mobile:voice:token");

    const body = await dependencies.parseBody(request);
    const target = body.channelId
      ? { channelId: body.channelId }
      : { conversationId: body.conversationId! };
    const tokenResponse = await dependencies.createToken(session.userId, target);
    const response = MobileVoiceTokenResponseSchema.parse({
      ...target,
      mediaPolicy: tokenResponse.mediaPolicy,
      provider: "livekit",
      token: tokenResponse.token,
      url: tokenResponse.url,
    });

    dependencies.recordMetric({
      durationMs: dependencies.getDurationMs(startedAt),
      operation: "livekit_token",
      result: "success",
      runtime: "server",
    });

    return Response.json(response, {
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
    });
  } catch (error) {
    dependencies.recordMetric({
      ...dependencies.getErrorMetadata(error),
      durationMs: dependencies.getDurationMs(startedAt),
      operation: "livekit_token",
      result: "error",
      runtime: "server",
    });

    return jsonError(error);
  }
}
