import { createHash } from "node:crypto";

import { getApiRateLimitConfig, type ApiRateLimitAction } from "@/lib/api-rate-limit";
import { ApiError } from "@/lib/api";
import { checkRateLimit } from "@/lib/rate-limit";
import { getRedisRate } from "@/lib/redis";

export function getMobileAuthRequestIp(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
  const realIp = request.headers.get("x-real-ip")?.trim() ?? "";

  return forwardedFor || realIp || "unknown";
}

function getClientRateLimitKey(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
  const realIp = request.headers.get("x-real-ip")?.trim() ?? "";
  const userAgent = request.headers.get("user-agent")?.trim() ?? "";
  const keyMaterial = `${forwardedFor || realIp || "unknown"}:${userAgent || "unknown"}`;

  return createHash("sha256").update(keyMaterial).digest("base64url");
}

export async function enforceMobileAuthRateLimit(
  request: Request,
  action: Extract<
    ApiRateLimitAction,
    | "mobile:auth-exchange"
    | "mobile:auth-forgot-password"
    | "mobile:auth-login"
    | "mobile:auth-refresh"
    | "mobile:auth-register"
    | "mobile:auth-revoke"
    | "mobile:auth-verification-email"
  >,
) {
  const config = getApiRateLimitConfig(action);
  const isAllowed = await checkRateLimit(
    getRedisRate(),
    `rate:api:${action}:${getClientRateLimitKey(request)}`,
    config.limit,
    config.windowSeconds,
  );

  if (!isAllowed) {
    throw new ApiError("Too many requests. Please try again shortly.", 429, "RATE_LIMITED");
  }
}
