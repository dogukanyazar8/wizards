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

type RevocableJwtToken = {
  authStatusHydrated?: boolean;
  avatarUrl?: string | null;
  deletedAt?: string | null;
  displayName?: string | null;
  email?: string | null;
  emailVerified?: boolean;
  iat?: number;
  id?: string;
  image?: string | null;
  isBanned?: boolean;
  locale?: string | null;
  name?: string | null;
  picture?: string | null;
  profileHydrated?: boolean;
  rememberMe?: boolean;
  revoked?: boolean;
  revocationCheckedAt?: number;
  sessionStartedAt?: number;
  sub?: string;
  theme?: string | null;
  username?: string | null;
};

export type SessionRevocationResult = {
  ok: boolean;
  revokedAfter: Date;
  revokedAfterSeconds: number;
};

export function getSessionRevocationKey(userId: string) {
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

export function ensureSessionStartedAt(token: RevocableJwtToken, nowSeconds: number) {
  if (typeof token.sessionStartedAt !== "number") {
    // Auth.js rewrites `iat` while re-encoding a read session. Freeze its decoded
    // value once so a later encode can never move the session past a revocation.
    token.sessionStartedAt = typeof token.iat === "number" ? token.iat : nowSeconds;
  }

  return token.sessionStartedAt;
}

export function completeSessionRevocationCheck(
  token: RevocableJwtToken,
  revoked: boolean | undefined,
  nowSeconds: number,
) {
  if (revoked === undefined) {
    // An infrastructure failure is not a completed negative check. Keeping the
    // old timestamp forces the next request to retry instead of granting 60s.
    return false;
  }

  token.revocationCheckedAt = nowSeconds;
  return revoked;
}

export function applyRevokedJwtUserState(
  token: RevocableJwtToken,
  user: { deletedAt: Date | null; isBanned: boolean } | null,
) {
  if (user?.isBanned && !user.deletedAt) {
    // Suspension uses the same global revocation marker, but the appeal door
    // still needs the stable user id. Keep identity while blocking normal APIs.
    token.revoked = false;
    token.isBanned = true;
    token.deletedAt = null;
    token.authStatusHydrated = true;
    return "banned" as const;
  }

  token.revoked = true;
  token.id = "";
  token.sub = "";
  token.email = null;
  token.name = null;
  token.image = null;
  token.picture = null;
  token.username = null;
  token.displayName = null;
  token.avatarUrl = null;
  token.locale = null;
  token.theme = null;
  token.deletedAt = null;
  token.emailVerified = false;
  token.isBanned = true;
  token.authStatusHydrated = true;
  token.profileHydrated = true;
  return "revoked" as const;
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
  sessionStartedAtSeconds: number | null | undefined,
  options: {
    loadDurableRevokedAfter?: DurableSessionRevocationLookup;
    redis?: SessionRevocationRedis;
  } = {},
) {
  const trimmedUserId = userId.trim();
  if (!trimmedUserId || typeof sessionStartedAtSeconds !== "number") {
    return false;
  }

  const redis = options.redis ?? getRedis();
  const key = getSessionRevocationKey(trimmedUserId);

  try {
    const value = await redis.get(key);
    const revokedAfterSeconds = value ? Number.parseInt(value, 10) : NaN;

    if (Number.isInteger(revokedAfterSeconds) && revokedAfterSeconds > 0) {
      return sessionStartedAtSeconds <= revokedAfterSeconds;
    }
    if (revokedAfterSeconds === 0 && !options.loadDurableRevokedAfter) {
      return false;
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

    return sessionStartedAtSeconds <= durableRevokedAfterSeconds;
  } catch (error) {
    logError("[auth] Failed to check durable session revocation", error);
    return undefined;
  }
}
