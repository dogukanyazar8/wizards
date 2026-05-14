import { logError } from "@/lib/logger";
import { getRedis } from "@/lib/redis";

const SESSION_REVOCATION_TTL_SECONDS = 60 * 60 * 24 * 8;
export const SESSION_REVOCATION_CHECK_INTERVAL_SECONDS = 60;

type SessionRevocationRedis = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: "EX", ttlSeconds: number): Promise<unknown>;
};

function getSessionRevocationKey(userId: string) {
  return `auth:session-revoked-after:${userId}`;
}

function toUnixSeconds(value: Date) {
  return Math.floor(value.getTime() / 1000);
}

export function shouldCheckSessionRevocation(
  lastCheckedAtSeconds: number | null | undefined,
  nowSeconds: number,
) {
  return (
    typeof lastCheckedAtSeconds !== "number" ||
    nowSeconds - lastCheckedAtSeconds >= SESSION_REVOCATION_CHECK_INTERVAL_SECONDS
  );
}

export async function revokeUserSessions(
  userId: string,
  options: { now?: Date; redis?: SessionRevocationRedis } = {},
) {
  const trimmedUserId = userId.trim();
  if (!trimmedUserId) {
    return;
  }

  const redis = options.redis ?? getRedis();
  const revokedAfterSeconds = toUnixSeconds(options.now ?? new Date());

  try {
    await redis.set(
      getSessionRevocationKey(trimmedUserId),
      String(revokedAfterSeconds),
      "EX",
      SESSION_REVOCATION_TTL_SECONDS,
    );
  } catch (error) {
    logError("[auth] Failed to mark user sessions revoked", error);
  }
}

export async function isUserSessionRevoked(
  userId: string,
  issuedAtSeconds: number | null | undefined,
  options: { redis?: Pick<SessionRevocationRedis, "get"> } = {},
) {
  const trimmedUserId = userId.trim();
  if (!trimmedUserId || typeof issuedAtSeconds !== "number") {
    return false;
  }

  const redis = options.redis ?? getRedis();

  try {
    const value = await redis.get(getSessionRevocationKey(trimmedUserId));
    const revokedAfterSeconds = value ? Number.parseInt(value, 10) : NaN;

    return Number.isInteger(revokedAfterSeconds) && issuedAtSeconds <= revokedAfterSeconds;
  } catch (error) {
    logError("[auth] Failed to check user session revocation", error);
    return false;
  }
}
