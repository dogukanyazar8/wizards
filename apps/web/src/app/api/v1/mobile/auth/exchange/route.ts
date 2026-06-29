import { createHash } from "node:crypto";

import { MobileAuthExchangeRequestSchema } from "@wizards/types";

import { getApiRateLimitConfig } from "@/lib/api-rate-limit";
import { ApiError, jsonError, parseJsonBody } from "@/lib/api";
import { checkRateLimit } from "@/lib/rate-limit";
import { getRedisRate } from "@/lib/redis";
import { exchangeMobileAuthHandoffToken } from "@/lib/mobile/auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getClientRateLimitKey(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
  const realIp = request.headers.get("x-real-ip")?.trim() ?? "";
  const userAgent = request.headers.get("user-agent")?.trim() ?? "";
  const keyMaterial = `${forwardedFor || realIp || "unknown"}:${userAgent || "unknown"}`;

  return createHash("sha256").update(keyMaterial).digest("base64url");
}

async function enforceMobileAuthExchangeRateLimit(request: Request) {
  const config = getApiRateLimitConfig("mobile:auth-exchange");
  const isAllowed = await checkRateLimit(
    getRedisRate(),
    `rate:api:mobile:auth-exchange:${getClientRateLimitKey(request)}`,
    config.limit,
    config.windowSeconds,
  );

  if (!isAllowed) {
    throw new ApiError("Too many requests. Please try again shortly.", 429, "RATE_LIMITED");
  }
}

export async function POST(request: Request) {
  try {
    await enforceMobileAuthExchangeRateLimit(request);

    const body = await parseJsonBody(request, MobileAuthExchangeRequestSchema);
    const response = await exchangeMobileAuthHandoffToken(body.handoffToken, {
      expectedCallbackPath: body.callbackPath,
    });

    if (!response) {
      throw new ApiError("Mobile sign-in handoff is invalid or expired.", 401, "INVALID_HANDOFF");
    }

    return Response.json(response, {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
