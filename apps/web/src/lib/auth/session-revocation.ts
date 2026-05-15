import { logError } from "@/lib/logger";
import { getRedis } from "@/lib/redis";

const SESSION_REVOCATION_TTL_SECONDS = 60 * 60 * 24 * 8;
const SESSION_REVOCATION_NEGATIVE_CACHE_SECONDS = 60;
export const SESSION_REVOCATION_CHECK_INTERVAL_SECONDS = 60;

type SessionRevocationRedis = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: "EX", ttlSeconds: number): Promise<unknown>;
};

type DurableSessionRevocationLookup = (userId: string) => Promise<Date | null | undefined>;

export type SessionRevocationResult = {
  ok: boolean;
  revokedAfter: Date;
  revokedAfterSeconds: number;
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
): Promise<SessionRevocationResult> {
  const revokedAfter = options.now ?? new Date();
  const revokedAfterSeconds = toUnixSeconds(revokedAfter);
  const trimmedUserId = userId.trim();
  if (!trimmedUserId) {
    return { ok: false, revokedAfter, revokedAfterSeconds };
  }

  const redis = options.redis ?? getRedis();

  try {
    await redis.set(
      getSessionRevocationKey(trimmedUserId),
      String(revokedAfterSeconds),
      "EX",
      SESSION_REVOCATION_TTL_SECONDS,
    );
    return { ok: true, revokedAfter, revokedAfterSeconds };
  } catch (error) {
    logError("[auth] Failed to mark user sessions revoked", error);
    return { ok: false, revokedAfter, revokedAfterSeconds };
  }
}

async function cacheRevocationValue(
  redis: SessionRevocationRedis,
  key: string,
  value: string,
  ttlSeconds: number,
) {
  try {
    await redis.set(key, value, "EX", ttlSeconds);
  } catch (error) {
    logError("[auth] Failed to refresh session revocation cache", error);
  }
}

export async function isUserSessionRevoked(
  userId: string,
  issuedAtSeconds: number | null | undefined,
  options: {
    loadDurableRevokedAfter?: DurableSessionRevocationLookup;
    redis?: SessionRevocationRedis;
  } = {},
) {
  const trimmedUserId = userId.trim();
  if (!trimmedUserId || typeof issuedAtSeconds !== "number") {
    return false;
  }

  const redis = options.redis ?? getRedis();
  const key = getSessionRevocationKey(trimmedUserId);

  try {
    const value = await redis.get(key);
    const revokedAfterSeconds = value ? Number.parseInt(value, 10) : NaN;

    if (Number.isInteger(revokedAfterSeconds)) {
      return revokedAfterSeconds > 0 && issuedAtSeconds <= revokedAfterSeconds;
    }
  } catch (error) {
    logError("[auth] Failed to check user session revocation", error);
  }

  if (!options.loadDurableRevokedAfter) {
    return false;
  }

  try {
    const durableRevokedAfter = await options.loadDurableRevokedAfter(trimmedUserId);
    if (!durableRevokedAfter) {
      await cacheRevocationValue(redis, key, "0", SESSION_REVOCATION_NEGATIVE_CACHE_SECONDS);
      return false;
    }

    const durableRevokedAfterSeconds = toUnixSeconds(durableRevokedAfter);
    await cacheRevocationValue(
      redis,
      key,
      String(durableRevokedAfterSeconds),
      SESSION_REVOCATION_TTL_SECONDS,
    );

    return issuedAtSeconds <= durableRevokedAfterSeconds;
  } catch (error) {
    logError("[auth] Failed to check durable session revocation", error);
    return false;
  }
}
