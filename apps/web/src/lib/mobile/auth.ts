import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

import { Prisma, prisma } from "@wizards/db";
import {
  MobileAuthExchangeResponseSchema,
  MobileAuthForgotPasswordResponseSchema,
  MobileAuthPasswordLoginResponseSchema,
  MobileAuthRegisterResponseSchema,
  MobileAuthRefreshResponseSchema,
  MobileAuthVerificationEmailResponseSchema,
} from "@wizards/types";
import bcrypt from "bcryptjs";

import { DEFAULT_WIZARDS_THEME } from "@/lib/appearance";
import {
  EmailVerificationError,
  sendVerificationEmail,
} from "@/lib/auth/email-verification";
import {
  PasswordResetError,
  sendPasswordResetEmail,
  type PasswordResetUser,
} from "@/lib/auth/password-reset";
import { rollbackUnverifiedUser } from "@/lib/auth/registration-compensation";
import { getSafeAuthRedirectPath } from "@/lib/auth/redirect";
import { normalizeAppLocale } from "@/lib/locale";
import { persistUserLocale } from "@/lib/locale/persistence";
import { logError } from "@/lib/logger";
import { getRedis } from "@/lib/redis";

export const MOBILE_AUTH_HANDOFF_TTL_SECONDS = 120;
export const MOBILE_ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const MOBILE_REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;

const MOBILE_AUTH_HANDOFF_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;
const MOBILE_REFRESH_TOKEN_PATTERN = /^[A-Za-z0-9_-]{48,192}$/;
const MOBILE_AUTH_HANDOFF_KEY_PREFIX = "auth:mobile-handoff:";
const MOBILE_REFRESH_TOKEN_KEY_PREFIX = "auth:mobile-refresh:";
const MOBILE_SESSION_KEY_PREFIX = "auth:mobile-session:";
const MOBILE_ACCESS_TOKEN_ISSUER = "whispr-api";
const MOBILE_ACCESS_TOKEN_AUDIENCE = "whispr-mobile";
const MOBILE_ACCESS_TOKEN_TYPE = "whispr-mobile-access";
const MOBILE_ACCESS_TOKEN_SCOPES = ["mobile:bootstrap"] as const;

interface MobileAuthHandoffPayload {
  callbackPath: string;
  createdAt: number;
  userId: string;
}

interface MobileRefreshTokenPayload {
  createdAt: number;
  sessionId: string;
  userId: string;
}

interface MobileSessionPayload {
  createdAt: number;
  lastRotatedAt: number;
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

interface MobilePasswordAuthUser extends MobileAuthUser {
  email: string;
  locale: string | null;
  passwordHash: string | null;
}

interface MobileNativeAuthOptions extends MobileAuthOptions {
  comparePassword?: (password: string, passwordHash: string) => Promise<boolean>;
  loadUserByEmail?: (email: string) => Promise<MobilePasswordAuthUser | null>;
}

interface MobileVerificationEmailUser {
  deletedAt: Date | null;
  displayName: string | null;
  email: string;
  emailVerified: boolean;
  id: string;
  isBanned: boolean;
  locale: string | null;
  username: string;
}

interface MobileVerificationEmailOptions {
  loadUserByEmail?: (email: string) => Promise<MobileVerificationEmailUser | null>;
  sendVerification?: typeof sendVerificationEmail;
}

export class MobileNativeAuthError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "MobileNativeAuthError";
  }
}

interface MobileAccessTokenClaims {
  scopes: string[];
  sessionId: string;
  userId: string;
}

interface MobileAccessTokenPayload {
  aud: string;
  exp: number;
  iat: number;
  iss: string;
  jti: string;
  sid: string;
  scopes: string[];
  sub: string;
  typ: string;
  v: 1;
}

function getMobileAuthRedis(options: Pick<MobileAuthOptions, "redis"> = {}) {
  return (options.redis ?? getRedis()) as MobileAuthRedis;
}

function hashMobileAuthHandoffToken(token: string) {
  return createHash("sha256").update(token).digest("base64url");
}

function getMobileAuthHandoffKey(token: string) {
  return `${MOBILE_AUTH_HANDOFF_KEY_PREFIX}${hashMobileAuthHandoffToken(token)}`;
}

function hashMobileRefreshToken(token: string) {
  return createHash("sha256").update(token).digest("base64url");
}

function getMobileRefreshTokenKey(token: string) {
  return `${MOBILE_REFRESH_TOKEN_KEY_PREFIX}${hashMobileRefreshToken(token)}`;
}

function getMobileSessionKey(sessionId: string) {
  return `${MOBILE_SESSION_KEY_PREFIX}${sessionId}`;
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

function parseMobileRefreshTokenPayload(value: unknown): MobileRefreshTokenPayload | null {
  if (typeof value !== "string" || !value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as Partial<MobileRefreshTokenPayload>;
    if (
      typeof parsed.userId !== "string" ||
      !parsed.userId ||
      typeof parsed.sessionId !== "string" ||
      !parsed.sessionId ||
      typeof parsed.createdAt !== "number" ||
      !Number.isFinite(parsed.createdAt)
    ) {
      return null;
    }

    return {
      createdAt: parsed.createdAt,
      sessionId: parsed.sessionId,
      userId: parsed.userId,
    };
  } catch {
    return null;
  }
}

function parseMobileSessionPayload(value: unknown): MobileSessionPayload | null {
  if (typeof value !== "string" || !value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as Partial<MobileSessionPayload>;
    if (
      typeof parsed.userId !== "string" ||
      !parsed.userId ||
      typeof parsed.createdAt !== "number" ||
      !Number.isFinite(parsed.createdAt) ||
      typeof parsed.lastRotatedAt !== "number" ||
      !Number.isFinite(parsed.lastRotatedAt)
    ) {
      return null;
    }

    return {
      createdAt: parsed.createdAt,
      lastRotatedAt: parsed.lastRotatedAt,
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
    typeof payload.sid === "string" &&
    payload.sid.length > 0 &&
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

function createMobileAccessToken(
  input: {
    sessionId: string;
    userId: string;
  },
  options: MobileAuthOptions = {},
) {
  const nowMs = Math.trunc(options.nowMs ?? Date.now());
  const issuedAtSeconds = Math.floor(nowMs / 1000);
  const expiresAtSeconds = issuedAtSeconds + MOBILE_ACCESS_TOKEN_TTL_SECONDS;
  const payload: MobileAccessTokenPayload = {
    aud: MOBILE_ACCESS_TOKEN_AUDIENCE,
    exp: expiresAtSeconds,
    iat: issuedAtSeconds,
    iss: MOBILE_ACCESS_TOKEN_ISSUER,
    jti: randomBytes(16).toString("base64url"),
    sid: input.sessionId,
    scopes: [...MOBILE_ACCESS_TOKEN_SCOPES],
    sub: input.userId,
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

async function loadMobilePasswordAuthUser(email: string) {
  return prisma.user.findUnique({
    where: { email },
    select: {
      avatarUrl: true,
      deletedAt: true,
      displayName: true,
      email: true,
      emailVerified: true,
      id: true,
      isBanned: true,
      locale: true,
      passwordHash: true,
      username: true,
    },
  });
}

async function loadMobileVerificationEmailUser(email: string) {
  return prisma.user.findUnique({
    where: { email },
    select: {
      deletedAt: true,
      displayName: true,
      email: true,
      emailVerified: true,
      id: true,
      isBanned: true,
      locale: true,
      username: true,
    },
  });
}

function normalizeMobileAuthEmail(value: string) {
  return value.trim().toLowerCase();
}

function mapMobileEmailSendError(error: unknown, fallbackCode: string) {
  if (error instanceof EmailVerificationError || error instanceof PasswordResetError) {
    if (error.code === "CONFIGURATION_ERROR" || error.code === "SENDER_RESTRICTED") {
      return new MobileNativeAuthError(fallbackCode, 503, "Mobile auth email is unavailable.");
    }
  }

  return new MobileNativeAuthError(fallbackCode, 503, "Mobile auth email could not be sent.");
}

function isActiveMobileAuthUser(user: MobileAuthUser | null | undefined): user is MobileAuthUser {
  return Boolean(user && !user.deletedAt && !user.isBanned && user.emailVerified);
}

async function readRedisValue(redis: MobileAuthRedis, key: string) {
  const rawRedisValue = await redis.eval("return redis.call('GET', KEYS[1])", 1, key);

  return redisValueToString(
    typeof rawRedisValue === "string" ||
      typeof rawRedisValue === "number" ||
      Buffer.isBuffer(rawRedisValue)
      ? rawRedisValue
      : null,
  );
}

async function takeRedisValue(redis: MobileAuthRedis, key: string) {
  const rawRedisValue = await redis.eval(
    "local value = redis.call('GET', KEYS[1]); if value then redis.call('DEL', KEYS[1]); end; return value",
    1,
    key,
  );

  return redisValueToString(
    typeof rawRedisValue === "string" ||
      typeof rawRedisValue === "number" ||
      Buffer.isBuffer(rawRedisValue)
      ? rawRedisValue
      : null,
  );
}

async function upsertMobileSession(
  redis: MobileAuthRedis,
  input: {
    nowMs: number;
    sessionId: string;
    userId: string;
  },
) {
  const sessionPayload: MobileSessionPayload = {
    createdAt: input.nowMs,
    lastRotatedAt: input.nowMs,
    userId: input.userId,
  };

  await redis.eval(
    "redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[2]); return 'OK'",
    1,
    getMobileSessionKey(input.sessionId),
    JSON.stringify(sessionPayload),
    String(MOBILE_REFRESH_TOKEN_TTL_SECONDS),
  );
}

async function createMobileRefreshToken(
  redis: MobileAuthRedis,
  input: {
    nowMs: number;
    sessionId: string;
    userId: string;
  },
) {
  const refreshToken = randomBytes(48).toString("base64url");
  const payload: MobileRefreshTokenPayload = {
    createdAt: input.nowMs,
    sessionId: input.sessionId,
    userId: input.userId,
  };
  const stored = await redis.set(
    getMobileRefreshTokenKey(refreshToken),
    JSON.stringify(payload),
    "EX",
    MOBILE_REFRESH_TOKEN_TTL_SECONDS,
    "NX",
  );

  if (stored !== "OK") {
    throw new Error("Mobile refresh token could not be created.");
  }

  return refreshToken;
}

async function createMobileSessionSnapshot(
  user: MobileAuthUser,
  input: {
    nowMs: number;
    redis: MobileAuthRedis;
    sessionId?: string;
  },
  options: MobileAuthOptions = {},
) {
  const sessionId = input.sessionId ?? randomBytes(24).toString("base64url");
  await upsertMobileSession(input.redis, {
    nowMs: input.nowMs,
    sessionId,
    userId: user.id,
  });

  const [accessToken, refreshToken] = await Promise.all([
    Promise.resolve(createMobileAccessToken({ sessionId, userId: user.id }, options)),
    createMobileRefreshToken(input.redis, {
      nowMs: input.nowMs,
      sessionId,
      userId: user.id,
    }),
  ]);

  return {
    lastValidatedAt: input.nowMs,
    schemaVersion: 1,
    tokens: {
      accessToken: accessToken.token,
      expiresAt: accessToken.expiresAt,
      issuedAt: accessToken.issuedAt,
      refreshToken,
      scopes: accessToken.scopes,
      tokenType: "Bearer",
    },
    user: {
      avatarUrl: normalizeHttpsUrl(user.avatarUrl),
      displayName: normalizeDisplayName(user.displayName),
      id: user.id,
      username: user.username,
    },
  };
}

export function isMobileAuthHandoffToken(value: unknown): value is string {
  return typeof value === "string" && MOBILE_AUTH_HANDOFF_TOKEN_PATTERN.test(value);
}

export function isMobileRefreshToken(value: unknown): value is string {
  return typeof value === "string" && MOBILE_REFRESH_TOKEN_PATTERN.test(value);
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

  const redis = getMobileAuthRedis(options);
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

  const redis = getMobileAuthRedis(options);
  const rawPayload = await takeRedisValue(redis, getMobileAuthHandoffKey(handoffToken));
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

  const nowMs = Math.trunc(options.nowMs ?? Date.now());
  return MobileAuthExchangeResponseSchema.parse({
    session: await createMobileSessionSnapshot(user, { nowMs, redis }, options),
  });
}

export async function createMobilePasswordSession(
  input: {
    email: string;
    password: string;
  },
  options: MobileNativeAuthOptions = {},
) {
  const email = normalizeMobileAuthEmail(input.email);
  const user = await (options.loadUserByEmail ?? loadMobilePasswordAuthUser)(email);
  const comparePassword = options.comparePassword ?? bcrypt.compare;

  if (!user?.passwordHash) {
    return null;
  }

  const isPasswordValid = await comparePassword(input.password, user.passwordHash);
  if (!isPasswordValid || !isActiveMobileAuthUser(user)) {
    return null;
  }

  const redis = getMobileAuthRedis(options);
  const nowMs = Math.trunc(options.nowMs ?? Date.now());

  return MobileAuthPasswordLoginResponseSchema.parse({
    session: await createMobileSessionSnapshot(user, { nowMs, redis }, options),
  });
}

export async function registerMobilePasswordAccount(input: {
  confirmPassword: string;
  email: string;
  locale?: "en" | "tr" | undefined;
  password: string;
  username: string;
}) {
  const email = normalizeMobileAuthEmail(input.email);
  const locale = normalizeAppLocale(input.locale);
  const username = input.username.trim();
  if (input.password !== input.confirmPassword) {
    throw new MobileNativeAuthError(
      "PASSWORD_MISMATCH",
      400,
      "Password confirmation does not match.",
    );
  }

  const [existingEmail, existingUsername] = await Promise.all([
    prisma.user.findUnique({
      where: { email },
      select: {
        displayName: true,
        email: true,
        emailVerified: true,
        id: true,
        locale: true,
        username: true,
      },
    }),
    prisma.user.findUnique({
      where: { username },
      select: { id: true },
    }),
  ]);

  if (existingEmail) {
    if (existingEmail.emailVerified) {
      throw new MobileNativeAuthError(
        "EMAIL_TAKEN",
        409,
        "An account with this email already exists.",
      );
    }

    try {
      await sendVerificationEmail(existingEmail, existingEmail.locale ?? locale);
    } catch (error) {
      throw mapMobileEmailSendError(error, "VERIFICATION_EMAIL_UNAVAILABLE");
    }

    return MobileAuthRegisterResponseSchema.parse({
      email,
      message: "verification_email_sent",
      status: "verification-required",
    });
  }

  if (existingUsername) {
    throw new MobileNativeAuthError(
      "USERNAME_TAKEN",
      409,
      "This username is already taken.",
    );
  }

  const passwordHash = await bcrypt.hash(input.password, 12);

  try {
    const createdUser = await prisma.$transaction(async (tx) =>
      tx.user.create({
        data: {
          displayName: username,
          email,
          emailVerified: false,
          emailVerifiedAt: null,
          locale,
          notificationSettings: { create: {} },
          passwordHash,
          settings: { create: {} },
          status: "ONLINE",
          theme: DEFAULT_WIZARDS_THEME,
          username,
        },
        select: {
          displayName: true,
          email: true,
          id: true,
          locale: true,
          username: true,
        },
      }),
    );

    await persistUserLocale(createdUser.id, locale);

    try {
      await sendVerificationEmail(createdUser, locale);
    } catch (error) {
      await rollbackUnverifiedUser({
        email,
        userId: createdUser.id,
      });
      throw mapMobileEmailSendError(error, "VERIFICATION_EMAIL_UNAVAILABLE");
    }

    return MobileAuthRegisterResponseSchema.parse({
      email,
      message: "verification_email_sent",
      status: "verification-required",
    });
  } catch (error) {
    if (error instanceof MobileNativeAuthError) {
      throw error;
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new MobileNativeAuthError(
        "REGISTRATION_CONFLICT",
        409,
        "This email or username is already in use.",
      );
    }

    throw error;
  }
}

export async function requestMobilePasswordReset(input: {
  email: string;
  locale?: "en" | "tr" | undefined;
}) {
  const email = normalizeMobileAuthEmail(input.email);
  const locale = normalizeAppLocale(input.locale);
  const genericResponse = MobileAuthForgotPasswordResponseSchema.parse({
    email,
    message: "password_reset_if_available",
    status: "accepted",
  });

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      displayName: true,
      email: true,
      id: true,
      isBanned: true,
      locale: true,
      passwordHash: true,
      username: true,
    },
  });

  if (!user || user.isBanned || !user.passwordHash) {
    return genericResponse;
  }

  try {
    await sendPasswordResetEmail(
      {
        displayName: user.displayName,
        email: user.email,
        id: user.id,
        locale: user.locale,
        passwordHash: user.passwordHash,
        username: user.username,
      } satisfies PasswordResetUser,
      normalizeAppLocale(user.locale ?? locale),
    );
  } catch (error) {
    throw mapMobileEmailSendError(error, "PASSWORD_RESET_EMAIL_UNAVAILABLE");
  }

  return genericResponse;
}

export async function requestMobileVerificationEmail(
  input: {
    email: string;
    locale?: "en" | "tr" | undefined;
  },
  options: MobileVerificationEmailOptions = {},
) {
  const email = normalizeMobileAuthEmail(input.email);
  const locale = normalizeAppLocale(input.locale);
  const genericResponse = MobileAuthVerificationEmailResponseSchema.parse({
    email,
    message: "verification_email_if_available",
    status: "accepted",
  });

  const user = await (options.loadUserByEmail ?? loadMobileVerificationEmailUser)(email);
  if (!user || user.deletedAt || user.isBanned || user.emailVerified) {
    return genericResponse;
  }

  try {
    await (options.sendVerification ?? sendVerificationEmail)(
      {
        displayName: user.displayName,
        email: user.email,
        id: user.id,
        locale: user.locale,
        username: user.username,
      },
      user.locale ?? locale,
    );
  } catch (error) {
    logError("[mobile-auth] Verification email resend failed", error);
  }

  return genericResponse;
}

export async function refreshMobileSession(
  refreshToken: string,
  options: MobileAuthOptions = {},
) {
  if (!isMobileRefreshToken(refreshToken)) {
    return null;
  }

  const redis = getMobileAuthRedis(options);
  const rawPayload = await takeRedisValue(redis, getMobileRefreshTokenKey(refreshToken));
  const payload = parseMobileRefreshTokenPayload(rawPayload);
  if (!payload) {
    return null;
  }

  const rawSession = await readRedisValue(redis, getMobileSessionKey(payload.sessionId));
  const session = parseMobileSessionPayload(rawSession);
  if (!session || session.userId !== payload.userId) {
    return null;
  }

  const user = await (options.loadUser ?? loadMobileAuthUser)(payload.userId);
  if (!isActiveMobileAuthUser(user)) {
    await revokeMobileSession({ sessionId: payload.sessionId }, options);
    return null;
  }

  const nowMs = Math.trunc(options.nowMs ?? Date.now());
  return MobileAuthRefreshResponseSchema.parse({
    session: await createMobileSessionSnapshot(
      user,
      {
        nowMs,
        redis,
        sessionId: payload.sessionId,
      },
      options,
    ),
  });
}

export async function revokeMobileSession(
  input: {
    refreshToken?: string | null;
    sessionId?: string | null;
  },
  options: Pick<MobileAuthOptions, "redis"> = {},
) {
  const redis = getMobileAuthRedis(options);
  let sessionId = input.sessionId ?? null;

  if (input.refreshToken && isMobileRefreshToken(input.refreshToken)) {
    const rawPayload = await takeRedisValue(redis, getMobileRefreshTokenKey(input.refreshToken));
    const payload = parseMobileRefreshTokenPayload(rawPayload);
    sessionId = payload?.sessionId ?? sessionId;
  }

  if (sessionId) {
    await redis.eval("redis.call('DEL', KEYS[1]); return 'OK'", 1, getMobileSessionKey(sessionId));
  }
}

export async function isMobileAccessSessionActive(
  claims: MobileAccessTokenClaims,
  options: Pick<MobileAuthOptions, "redis"> = {},
) {
  const redis = getMobileAuthRedis(options);
  const rawSession = await readRedisValue(redis, getMobileSessionKey(claims.sessionId));
  const session = parseMobileSessionPayload(rawSession);

  return Boolean(session && session.userId === claims.userId);
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
    sessionId: payload.sid,
    userId: payload.sub,
  };
}

export function getBearerTokenFromHeaderValue(value: string | null | undefined) {
  const authorization = value ?? "";
  const [scheme, token, extra] = authorization.trim().split(/\s+/);

  if (extra || scheme?.toLowerCase() !== "bearer" || !token) {
    return null;
  }

  return token;
}

export function getBearerTokenFromRequest(request: Request) {
  return getBearerTokenFromHeaderValue(request.headers.get("authorization"));
}
