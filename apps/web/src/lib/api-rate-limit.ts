import { ApiError } from "@/lib/api";
import { logError } from "@/lib/logger";
import { checkRateLimit } from "@/lib/rate-limit";
import { getRedisRate } from "@/lib/redis";

export const API_RATE_LIMITS = {
  "admin:campaign:create": { limit: 12, windowSeconds: 60 },
  "admin:campaign:preview": { limit: 60, windowSeconds: 60 },
  "admin:campaign:send": { limit: 6, windowSeconds: 60 },
  "admin:dashboard": { limit: 120, windowSeconds: 60 },
  "admin:report:export": { limit: 20, windowSeconds: 60 },
  "admin:server:list": { limit: 120, windowSeconds: 60 },
  "admin:user:list": { limit: 120, windowSeconds: 60 },
  "admin:user:update": { limit: 20, windowSeconds: 60 },
  "auth:reauth": { limit: 10, windowSeconds: 10 * 60 },
  "auth:reauth-email-challenge": { limit: 3, windowSeconds: 15 * 60 },
  "auth:reauth-email-confirm": { limit: 10, windowSeconds: 10 * 60 },
  "category:create": { limit: 30, windowSeconds: 60 },
  "category:delete": { limit: 30, windowSeconds: 60 },
  "category:reorder": { limit: 20, windowSeconds: 60 },
  "category:update": { limit: 30, windowSeconds: 60 },
  "channel:clear-history": { limit: 10, windowSeconds: 60 },
  "channel:create": { limit: 30, windowSeconds: 60 },
  "channel:delete": { limit: 30, windowSeconds: 60 },
  "channel:mark-read": { limit: 180, windowSeconds: 60 },
  "channel:messages:list": { limit: 120, windowSeconds: 60 },
  "channel:permissions:read": { limit: 120, windowSeconds: 60 },
  "channel:permissions:update": { limit: 30, windowSeconds: 60 },
  "channel:reorder": { limit: 20, windowSeconds: 60 },
  "channel:update": { limit: 30, windowSeconds: 60 },
  "dm:conversation:read": { limit: 120, windowSeconds: 60 },
  "dm:conversations:list": { limit: 120, windowSeconds: 60 },
  "dm:create": { limit: 30, windowSeconds: 60 },
  "dm:hide": { limit: 60, windowSeconds: 60 },
  "dm:mark-unread": { limit: 180, windowSeconds: 60 },
  "dm:mark-read": { limit: 180, windowSeconds: 60 },
  "dm:messages:list": { limit: 30, windowSeconds: 60 },
  "dm:messages:send": { limit: 120, windowSeconds: 60 },
  "dm:mute": { limit: 60, windowSeconds: 60 },
  "dm:mutual-servers:list": { limit: 120, windowSeconds: 60 },
  "friend:block": { limit: 30, windowSeconds: 10 * 60 },
  "friend:remove": { limit: 30, windowSeconds: 10 * 60 },
  "friend:request": { limit: 20, windowSeconds: 10 * 60 },
  "friend:request-action": { limit: 60, windowSeconds: 10 * 60 },
  "giphy:attachment": { limit: 60, windowSeconds: 60 },
  "invite:create": { limit: 20, windowSeconds: 10 * 60 },
  "invite:revoke": { limit: 60, windowSeconds: 10 * 60 },
  "link-preview": { limit: 30, windowSeconds: 60 },
  "member:add": { limit: 30, windowSeconds: 10 * 60 },
  "member:kick": { limit: 30, windowSeconds: 10 * 60 },
  "member:leave": { limit: 20, windowSeconds: 10 * 60 },
  "member:roles:update": { limit: 40, windowSeconds: 10 * 60 },
  "message:search": { limit: 80, windowSeconds: 60 },
  "mobile:auth-exchange": { limit: 20, windowSeconds: 10 * 60 },
  "mobile:auth-forgot-password": { limit: 5, windowSeconds: 60 * 60 },
  "mobile:auth-login": { limit: 5, windowSeconds: 15 * 60 },
  "mobile:auth-register": { limit: 8, windowSeconds: 60 * 60 },
  "mobile:auth-refresh": { limit: 30, windowSeconds: 10 * 60 },
  "mobile:auth-revoke": { limit: 60, windowSeconds: 10 * 60 },
  "mobile:auth-verification-email": { limit: 5, windowSeconds: 60 * 60 },
  "mobile:bootstrap": { limit: 120, windowSeconds: 60 },
  "mobile:account:presence": { limit: 60, windowSeconds: 60 },
  "mobile:account:profile": { limit: 30, windowSeconds: 60 },
  "mobile:account:two-factor": { limit: 10, windowSeconds: 10 * 60 },
  "mobile:channel:messages:list": { limit: 60, windowSeconds: 60 },
  "mobile:channel:messages:edit": { limit: 30, windowSeconds: 60 },
  "mobile:channel:messages:delete": { limit: 30, windowSeconds: 60 },
  "mobile:channel:messages:reactions": { limit: 60, windowSeconds: 60 },
  "mobile:channel:messages:send": { limit: 120, windowSeconds: 60 },
  "mobile:channel:messages:thread": { limit: 60, windowSeconds: 60 },
  "mobile:dm:messages:edit": { limit: 30, windowSeconds: 60 },
  "mobile:dm:messages:delete": { limit: 30, windowSeconds: 60 },
  "mobile:dm:messages:reactions": { limit: 60, windowSeconds: 60 },
  "mobile:dm:messages:thread": { limit: 30, windowSeconds: 60 },
  "mobile:dm:details": { limit: 60, windowSeconds: 60 },
  "mobile:dm:create": { limit: 30, windowSeconds: 10 * 60 },
  "mobile:friends:block": { limit: 30, windowSeconds: 10 * 60 },
  "mobile:friends:list": { limit: 120, windowSeconds: 60 },
  "mobile:friends:remove": { limit: 30, windowSeconds: 10 * 60 },
  "mobile:friends:request": { limit: 20, windowSeconds: 10 * 60 },
  "mobile:friends:request-action": { limit: 60, windowSeconds: 10 * 60 },
  "mobile:giphy:search": { limit: 60, windowSeconds: 60 },
  "mobile:message:search": { limit: 40, windowSeconds: 60 },
  "mobile:notifications:register": { limit: 20, windowSeconds: 60 * 60 },
  "mobile:notifications:revoke": { limit: 60, windowSeconds: 10 * 60 },
  "mobile:voice:heartbeat": { limit: 240, windowSeconds: 60 },
  "mobile:voice:state": { limit: 60, windowSeconds: 60 },
  "mobile:voice:states:list": { limit: 30, windowSeconds: 60 },
  "mobile:voice:token": { limit: 20, windowSeconds: 60 },
  "mobile:server:detail": { limit: 120, windowSeconds: 60 },
  "notification:clear": { limit: 30, windowSeconds: 60 },
  "notification:mark-read": { limit: 120, windowSeconds: 60 },
  "server:create": { limit: 10, windowSeconds: 60 * 60 },
  "server:delete": { limit: 5, windowSeconds: 60 * 60 },
  "server:detail": { limit: 240, windowSeconds: 60 },
  "server:list": { limit: 240, windowSeconds: 60 },
  "server:update": { limit: 30, windowSeconds: 60 },
  "settings:update": { limit: 60, windowSeconds: 60 },
  "user:profile": { limit: 60, windowSeconds: 60 },
  "user:data-export": { limit: 3, windowSeconds: 60 * 60 },
  "user:delete": { limit: 3, windowSeconds: 60 * 60 },
  "roles:create": { limit: 30, windowSeconds: 60 },
  "roles:delete": { limit: 20, windowSeconds: 60 },
  "roles:list": { limit: 120, windowSeconds: 60 },
  "roles:update": { limit: 40, windowSeconds: 60 },
  "message:pin": { limit: 60, windowSeconds: 60 },
  "voice:heartbeat": { limit: 240, windowSeconds: 60 },
  "voice:state": { limit: 60, windowSeconds: 60 },
  "voice:states:list": { limit: 30, windowSeconds: 60 },
} as const;

export type ApiRateLimitAction = keyof typeof API_RATE_LIMITS;

export function getApiRateLimitConfig(action: ApiRateLimitAction) {
  return API_RATE_LIMITS[action];
}

export type ApiRateLimitDependencies = {
  checkRateLimit: typeof checkRateLimit;
  getRedisRate: typeof getRedisRate;
  logError: typeof logError;
};

const defaultApiRateLimitDependencies: ApiRateLimitDependencies = {
  checkRateLimit,
  getRedisRate,
  logError,
};

export async function enforceApiRateLimit(
  userId: string,
  action: ApiRateLimitAction,
  dependencies: ApiRateLimitDependencies = defaultApiRateLimitDependencies,
) {
  const config = getApiRateLimitConfig(action);

  try {
    const isAllowed = await dependencies.checkRateLimit(
      dependencies.getRedisRate(),
      `rate:api:${action}:${userId}`,
      config.limit,
      config.windowSeconds,
    );

    if (!isAllowed) {
      throw new ApiError("Too many requests. Please try again shortly.", 429, "RATE_LIMITED");
    }
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    dependencies.logError(`[api-rate-limit] ${action} unavailable`, error);
    throw new ApiError(
      "Request checks are temporarily unavailable. Please try again shortly.",
      503,
      "RATE_LIMIT_UNAVAILABLE",
    );
  }
}
