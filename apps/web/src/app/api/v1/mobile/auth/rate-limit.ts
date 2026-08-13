import { createHash } from "node:crypto";
import { getApiRateLimitConfig, type ApiRateLimitAction } from "@/lib/api-rate-limit";
import { ApiError } from "@/lib/api";
import { checkRateLimit } from "@/lib/rate-limit";
import { getRedisRate } from "@/lib/redis";
import {
  createNetworkRateLimitIdentity,
  createSubjectRateLimitIdentity,
} from "@/lib/security/client-ip";

type MobileAuthRateLimitAction = Extract<
  ApiRateLimitAction,
  | "mobile:auth-exchange"
  | "mobile:auth-forgot-password"
  | "mobile:auth-google"
  | "mobile:auth-login"
  | "mobile:auth-refresh"
  | "mobile:auth-register"
  | "mobile:auth-revoke"
  | "mobile:auth-verification-email"
>;

export type MobileAuthRateLimitSubject = {
  namespace: string;
  value: string;
};

export function createMobileAuthCredentialSubject(
  namespace: string,
  credential: string,
): MobileAuthRateLimitSubject {
  return {
    namespace,
    value: createHash("sha256").update(credential).digest("base64url"),
  };
}

export function getMobileAuthRateLimitKeys(
  request: Request,
  action: MobileAuthRateLimitAction,
  subject: MobileAuthRateLimitSubject,
) {
  const networkIdentity = createNetworkRateLimitIdentity({
    headers: request.headers,
  });
  const subjectIdentity = createSubjectRateLimitIdentity(subject.namespace, subject.value);

  return [
    `rate:api:${action}:network:${networkIdentity}`,
    `rate:api:${action}:subject:${subjectIdentity}`,
  ];
}

export async function enforceMobileAuthRateLimit(
  request: Request,
  action: MobileAuthRateLimitAction,
  subject: MobileAuthRateLimitSubject,
) {
  const config = getApiRateLimitConfig(action);
  const redis = getRedisRate();
  const results = await Promise.all(
    getMobileAuthRateLimitKeys(request, action, subject).map((key) =>
      checkRateLimit(redis, key, config.limit, config.windowSeconds),
    ),
  );

  if (results.some((isAllowed) => !isAllowed)) {
    throw new ApiError("Too many requests. Please try again shortly.", 429, "RATE_LIMITED");
  }
}
