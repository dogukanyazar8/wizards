import { createHash, randomBytes } from "node:crypto";

import { prisma } from "@wizards/db";

import { getSafeAuthRedirectPath } from "@/lib/auth/redirect";
import { getRedis } from "@/lib/redis";

export const DESKTOP_OAUTH_HANDOFF_TTL_SECONDS = 120;

const DESKTOP_OAUTH_HANDOFF_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;
const DESKTOP_OAUTH_HANDOFF_KEY_PREFIX = "auth:desktop-oauth-handoff:";

interface DesktopOAuthHandoffPayload {
  callbackUrl: string;
  createdAt: number;
  userId: string;
}

interface DesktopOAuthHandoffRedis {
  eval(
    script: string,
    keyCount: number,
    ...args: string[]
  ): Promise<Buffer | number | string | null>;
  set(
    key: string,
    value: string,
    mode: "EX",
    ttlSeconds: number,
    condition: "NX",
  ): Promise<"OK" | null>;
}

interface DesktopOAuthHandoffUser {
  avatarUrl: string | null;
  deletedAt: Date | null;
  displayName: string | null;
  email: string;
  emailVerified: Date | null;
  id: string;
  isBanned: boolean;
  locale: string | null;
  theme: string | null;
  username: string;
}

interface DesktopOAuthHandoffOptions {
  loadUser?: (userId: string) => Promise<DesktopOAuthHandoffUser | null>;
  nowMs?: number;
  redis?: DesktopOAuthHandoffRedis;
}

function hashDesktopOAuthHandoffToken(token: string) {
  return createHash("sha256").update(token).digest("base64url");
}

function getDesktopOAuthHandoffKey(token: string) {
  return `${DESKTOP_OAUTH_HANDOFF_KEY_PREFIX}${hashDesktopOAuthHandoffToken(token)}`;
}

export function isDesktopOAuthHandoffToken(value: unknown): value is string {
  return typeof value === "string" && DESKTOP_OAUTH_HANDOFF_TOKEN_PATTERN.test(value);
}

function parseDesktopOAuthHandoffPayload(value: unknown): DesktopOAuthHandoffPayload | null {
  if (typeof value !== "string" || !value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as Partial<DesktopOAuthHandoffPayload>;
    if (
      typeof parsed.userId !== "string" ||
      !parsed.userId ||
      typeof parsed.callbackUrl !== "string" ||
      getSafeAuthRedirectPath(parsed.callbackUrl) !== parsed.callbackUrl ||
      typeof parsed.createdAt !== "number" ||
      !Number.isFinite(parsed.createdAt)
    ) {
      return null;
    }

    return {
      callbackUrl: parsed.callbackUrl,
      createdAt: parsed.createdAt,
      userId: parsed.userId,
    };
  } catch {
    return null;
  }
}

function redisValueToString(value: Buffer | number | string | null) {
  if (typeof value === "string") {
    return value;
  }

  if (Buffer.isBuffer(value)) {
    return value.toString("utf8");
  }

  return null;
}

async function loadDesktopOAuthHandoffUser(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      avatarUrl: true,
      deletedAt: true,
      displayName: true,
      email: true,
      emailVerified: true,
      isBanned: true,
      locale: true,
      theme: true,
      username: true,
      id: true,
    },
  });
}

export async function createDesktopOAuthHandoffToken(
  input: {
    callbackUrl: string;
    userId: string;
  },
  options: DesktopOAuthHandoffOptions = {},
) {
  const safeCallbackUrl = getSafeAuthRedirectPath(input.callbackUrl);
  const token = randomBytes(32).toString("base64url");
  const payload: DesktopOAuthHandoffPayload = {
    callbackUrl: safeCallbackUrl,
    createdAt: Math.trunc(options.nowMs ?? Date.now()),
    userId: input.userId,
  };

  const redis = options.redis ?? getRedis();
  const stored = await redis.set(
    getDesktopOAuthHandoffKey(token),
    JSON.stringify(payload),
    "EX",
    DESKTOP_OAUTH_HANDOFF_TTL_SECONDS,
    "NX",
  );

  if (stored !== "OK") {
    throw new Error("Desktop OAuth handoff token could not be created.");
  }

  return {
    callbackUrl: safeCallbackUrl,
    expiresInSeconds: DESKTOP_OAUTH_HANDOFF_TTL_SECONDS,
    token,
  };
}

export async function consumeDesktopOAuthHandoffToken(
  token: string,
  input: {
    expectedCallbackUrl: string;
  },
  options: DesktopOAuthHandoffOptions = {},
) {
  if (!isDesktopOAuthHandoffToken(token)) {
    return null;
  }

  const redis = options.redis ?? getRedis();
  const rawRedisValue = await redis.eval(
    "local value = redis.call('GET', KEYS[1]); if value then redis.call('DEL', KEYS[1]); end; return value",
    1,
    getDesktopOAuthHandoffKey(token),
  );
  const rawPayload = redisValueToString(
    typeof rawRedisValue === "string" ||
      typeof rawRedisValue === "number" ||
      Buffer.isBuffer(rawRedisValue)
      ? rawRedisValue
      : null,
  );
  const payload = parseDesktopOAuthHandoffPayload(rawPayload);
  const expectedCallbackUrl = getSafeAuthRedirectPath(input.expectedCallbackUrl);

  if (!payload || payload.callbackUrl !== expectedCallbackUrl) {
    return null;
  }

  const user = await (options.loadUser ?? loadDesktopOAuthHandoffUser)(payload.userId);

  if (!user || user.deletedAt || user.isBanned || !user.emailVerified) {
    return null;
  }

  return user;
}
