import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

import { prisma } from "@wizards/db";
import { MobileAuthExchangeResponseSchema } from "@wizards/types";

import { getSafeAuthRedirectPath } from "@/lib/auth/redirect";
import { getRedis } from "@/lib/redis";

export const MOBILE_AUTH_HANDOFF_TTL_SECONDS = 120;
export const MOBILE_ACCESS_TOKEN_TTL_SECONDS = 12 * 60 * 60;

const MOBILE_AUTH_HANDOFF_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;
const MOBILE_AUTH_HANDOFF_KEY_PREFIX = "auth:mobile-handoff:";
const MOBILE_ACCESS_TOKEN_ISSUER = "whispr-api";
const MOBILE_ACCESS_TOKEN_AUDIENCE = "whispr-mobile";
const MOBILE_ACCESS_TOKEN_TYPE = "whispr-mobile-access";
const MOBILE_ACCESS_TOKEN_SCOPES = ["mobile:bootstrap"] as const;

interface MobileAuthHandoffPayload {
  callbackPath: string;
  createdAt: number;
  userId: string;
}

interface MobileAuthRedis {
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

interface MobileAuthUser {
  avatarUrl: string | null;
  deletedAt: Date | null;
  displayName: string | null;
  emailVerified: boolean;
  id: string;
  isBanned: boolean;
  username: string;
}

interface MobileAuthOptions {
  env?: NodeJS.ProcessEnv;
  loadUser?: (userId: string) => Promise<MobileAuthUser | null>;
  nowMs?: number;
  redis?: MobileAuthRedis;
}

interface MobileAccessTokenClaims {
  scopes: string[];
  userId: string;
}

interface MobileAccessTokenPayload {
  aud: string;
  exp: number;
  iat: number;
  iss: string;
  jti: string;
  scopes: string[];
  sub: string;
  typ: string;
  v: 1;
}

function hashMobileAuthHandoffToken(token: string) {
  return createHash("sha256").update(token).digest("base64url");
}

function getMobileAuthHandoffKey(token: string) {
  return `${MOBILE_AUTH_HANDOFF_KEY_PREFIX}${hashMobileAuthHandoffToken(token)}`;
}

function encodeBase64UrlJson(value: unknown) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function decodeBase64UrlJson(value: string): unknown {
  return JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
}

function signInput(input: string, secret: string) {
  return createHmac("sha256", secret).update(input).digest("base64url");
}

function safeEqualBase64Url(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function getMobileAuthSecret(env: NodeJS.ProcessEnv = process.env) {
  const authSecret = env.AUTH_SECRET?.trim();
  const nextAuthSecret = env.NEXTAUTH_SECRET?.trim();

  if (authSecret && nextAuthSecret && authSecret !== nextAuthSecret) {
    throw new Error("AUTH_SECRET and NEXTAUTH_SECRET must match for mobile auth signing.");
  }

  const secret = authSecret || nextAuthSecret;
  if (!secret) {
    throw new Error("AUTH_SECRET or NEXTAUTH_SECRET is required for mobile auth signing.");
  }

  return secret;
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

function parseMobileAuthHandoffPayload(value: unknown): MobileAuthHandoffPayload | null {
  if (typeof value !== "string" || !value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as Partial<MobileAuthHandoffPayload>;
    if (
      typeof parsed.userId !== "string" ||
      !parsed.userId ||
      typeof parsed.callbackPath !== "string" ||
      getSafeAuthRedirectPath(parsed.callbackPath, "/channels/@me") !== parsed.callbackPath ||
      typeof parsed.createdAt !== "number" ||
      !Number.isFinite(parsed.createdAt)
    ) {
      return null;
    }

    return {
      callbackPath: parsed.callbackPath,
      createdAt: parsed.createdAt,
      userId: parsed.userId,
    };
  } catch {
    return null;
  }
}

function normalizeHttpsUrl(value: string | null) {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function normalizeDisplayName(value: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function isMobileAccessTokenPayload(value: unknown): value is MobileAccessTokenPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const payload = value as Partial<MobileAccessTokenPayload>;
  return (
    payload.v === 1 &&
    payload.typ === MOBILE_ACCESS_TOKEN_TYPE &&
    payload.iss === MOBILE_ACCESS_TOKEN_ISSUER &&
    payload.aud === MOBILE_ACCESS_TOKEN_AUDIENCE &&
    typeof payload.sub === "string" &&
    payload.sub.length > 0 &&
    typeof payload.jti === "string" &&
    payload.jti.length > 0 &&
    typeof payload.iat === "number" &&
    Number.isFinite(payload.iat) &&
    typeof payload.exp === "number" &&
    Number.isFinite(payload.exp) &&
    Array.isArray(payload.scopes) &&
    payload.scopes.every((scope) => typeof scope === "string" && scope.length > 0)
  );
}

function createMobileAccessToken(userId: string, options: MobileAuthOptions = {}) {
  const nowMs = Math.trunc(options.nowMs ?? Date.now());
  const issuedAtSeconds = Math.floor(nowMs / 1000);
  const expiresAtSeconds = issuedAtSeconds + MOBILE_ACCESS_TOKEN_TTL_SECONDS;
  const payload: MobileAccessTokenPayload = {
    aud: MOBILE_ACCESS_TOKEN_AUDIENCE,
    exp: expiresAtSeconds,
    iat: issuedAtSeconds,
    iss: MOBILE_ACCESS_TOKEN_ISSUER,
    jti: randomBytes(16).toString("base64url"),
    scopes: [...MOBILE_ACCESS_TOKEN_SCOPES],
    sub: userId,
    typ: MOBILE_ACCESS_TOKEN_TYPE,
    v: 1,
  };
  const header = {
    alg: "HS256",
    typ: "JWT",
  };
  const signingInput = `${encodeBase64UrlJson(header)}.${encodeBase64UrlJson(payload)}`;
  const signature = signInput(signingInput, getMobileAuthSecret(options.env));

  return {
    expiresAt: expiresAtSeconds * 1000,
    issuedAt: issuedAtSeconds * 1000,
    scopes: payload.scopes,
    token: `${signingInput}.${signature}`,
  };
}

async function loadMobileAuthUser(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      avatarUrl: true,
      deletedAt: true,
      displayName: true,
      emailVerified: true,
      id: true,
      isBanned: true,
      username: true,
    },
  });
}

function isActiveMobileAuthUser(user: MobileAuthUser | null | undefined): user is MobileAuthUser {
  return Boolean(user && !user.deletedAt && !user.isBanned && user.emailVerified);
}

export function isMobileAuthHandoffToken(value: unknown): value is string {
  return typeof value === "string" && MOBILE_AUTH_HANDOFF_TOKEN_PATTERN.test(value);
}

export async function createMobileAuthHandoffToken(
  input: {
    callbackPath: string;
    userId: string;
  },
  options: MobileAuthOptions = {},
) {
  const safeCallbackPath = getSafeAuthRedirectPath(input.callbackPath, "/channels/@me");
  const token = randomBytes(32).toString("base64url");
  const payload: MobileAuthHandoffPayload = {
    callbackPath: safeCallbackPath,
    createdAt: Math.trunc(options.nowMs ?? Date.now()),
    userId: input.userId,
  };

  const redis = options.redis ?? getRedis();
  const stored = await redis.set(
    getMobileAuthHandoffKey(token),
    JSON.stringify(payload),
    "EX",
    MOBILE_AUTH_HANDOFF_TTL_SECONDS,
    "NX",
  );

  if (stored !== "OK") {
    throw new Error("Mobile auth handoff token could not be created.");
  }

  return {
    callbackPath: safeCallbackPath,
    expiresInSeconds: MOBILE_AUTH_HANDOFF_TTL_SECONDS,
    token,
  };
}

export async function exchangeMobileAuthHandoffToken(
  handoffToken: string,
  input: {
    expectedCallbackPath: string;
  },
  options: MobileAuthOptions = {},
) {
  if (!isMobileAuthHandoffToken(handoffToken)) {
    return null;
  }

  const redis = options.redis ?? getRedis();
  const rawRedisValue = await redis.eval(
    "local value = redis.call('GET', KEYS[1]); if value then redis.call('DEL', KEYS[1]); end; return value",
    1,
    getMobileAuthHandoffKey(handoffToken),
  );
  const rawPayload = redisValueToString(
    typeof rawRedisValue === "string" ||
      typeof rawRedisValue === "number" ||
      Buffer.isBuffer(rawRedisValue)
      ? rawRedisValue
      : null,
  );
  const payload = parseMobileAuthHandoffPayload(rawPayload);
  const expectedCallbackPath = getSafeAuthRedirectPath(
    input.expectedCallbackPath,
    "/channels/@me",
  );

  if (!payload || payload.callbackPath !== expectedCallbackPath) {
    return null;
  }

  const user = await (options.loadUser ?? loadMobileAuthUser)(payload.userId);
  if (!isActiveMobileAuthUser(user)) {
    return null;
  }

  const accessToken = createMobileAccessToken(user.id, options);
  return MobileAuthExchangeResponseSchema.parse({
    session: {
      lastValidatedAt: Math.trunc(options.nowMs ?? Date.now()),
      schemaVersion: 1,
      tokens: {
        accessToken: accessToken.token,
        expiresAt: accessToken.expiresAt,
        issuedAt: accessToken.issuedAt,
        refreshToken: null,
        scopes: accessToken.scopes,
        tokenType: "Bearer",
      },
      user: {
        avatarUrl: normalizeHttpsUrl(user.avatarUrl),
        displayName: normalizeDisplayName(user.displayName),
        id: user.id,
        username: user.username,
      },
    },
  });
}

export function verifyMobileAccessToken(
  token: string,
  options: Pick<MobileAuthOptions, "env" | "nowMs"> = {},
): MobileAccessTokenClaims | null {
  if (
    typeof token !== "string" ||
    token.length < 16 ||
    token.length > 8192 ||
    /\s/.test(token)
  ) {
    return null;
  }

  const parts = token.split(".");
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) {
    return null;
  }

  const signingInput = `${parts[0]}.${parts[1]}`;
  const expectedSignature = signInput(signingInput, getMobileAuthSecret(options.env));
  if (!safeEqualBase64Url(parts[2], expectedSignature)) {
    return null;
  }

  let payload: unknown;
  try {
    payload = decodeBase64UrlJson(parts[1]);
  } catch {
    return null;
  }

  if (!isMobileAccessTokenPayload(payload)) {
    return null;
  }

  const nowSeconds = Math.floor((options.nowMs ?? Date.now()) / 1000);
  if (payload.iat > nowSeconds + 30 || payload.exp <= nowSeconds) {
    return null;
  }

  return {
    scopes: payload.scopes,
    userId: payload.sub,
  };
}

export function getBearerTokenFromRequest(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const [scheme, token, extra] = authorization.trim().split(/\s+/);

  if (extra || scheme?.toLowerCase() !== "bearer" || !token) {
    return null;
  }

  return token;
}
