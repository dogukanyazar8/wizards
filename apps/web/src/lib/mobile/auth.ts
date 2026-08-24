import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { Prisma, prisma } from "@wizards/db";
import {
  MobileAuthExchangeResponseSchema,
  MobileAuthForgotPasswordResponseSchema,
  MobileAuthGoogleLoginResponseSchema,
  MobileAuthPasswordLoginResponseSchema,
  MobileAuthRegisterResponseSchema,
  MobileAuthRefreshResponseSchema,
  MobileAuthVerificationEmailResponseSchema,
} from "@wizards/types";
import bcrypt from "bcryptjs";

import { DEFAULT_WIZARDS_THEME } from "@/lib/appearance";
import {
  EmailVerificationError,
  sendRegistrationAttemptEmail,
  sendVerificationEmail,
} from "@/lib/auth/email-verification";
import {
  PASSWORD_RESET_TOKEN_EXPIRY_MINUTES,
  PasswordResetError,
  sendPasswordResetEmail,
  type PasswordResetUser,
} from "@/lib/auth/password-reset";
import { rollbackUnverifiedUser } from "@/lib/auth/registration-compensation";
import { getSafeAuthRedirectPath } from "@/lib/auth/redirect";
import { verifyTwoFactorCredential } from "@/lib/auth/two-factor";
import { requiresOAuthTwoFactorStepUp } from "@/lib/auth/oauth-email";
import { resolveRegistrationConflict } from "@/lib/auth/registration-policy";
import {
  assertMobileLoginAttemptAllowed,
  recordMobileLoginAttemptFailure,
  resetMobileLoginAttemptFailures,
} from "@/lib/auth/mobile-login-attempts";
import { createRedisAttemptStore, type AttemptStore } from "@/lib/auth/attempt-tracker";
import { isAuthSessionActive as isDurableAuthSessionActive } from "@/lib/auth/auth-session-service";
import { normalizeAppLocale } from "@/lib/locale";
import { persistUserLocale } from "@/lib/locale/persistence";
import { logError } from "@/lib/logger";
import { getRedis, getRedisRate } from "@/lib/redis";
import {
  linkMobileGoogleAccount,
  MobileGoogleAuthError,
  verifyMobileGoogleIdToken,
  type MobileGoogleIdentity,
  type MobileGoogleLinkedUser,
} from "./google-native-auth";
import {
  createMobileRefreshFamily,
  isMobileRefreshFamilyActive,
  isMobileRefreshToken,
  type MobileRefreshFamilyRedis,
  revokeMobileRefreshFamily,
  rotateMobileRefreshFamily,
} from "./refresh-token-family";

export const MOBILE_AUTH_HANDOFF_TTL_SECONDS = 120;
export const MOBILE_ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const MOBILE_REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;
/**
 * A rotated refresh token stays usable for this long. Rotation destroys the old
 * credential before the new one can reach the device, so a dropped response, a
 * client timeout or an app kill mid-flight would otherwise strand the device
 * holding a token the server no longer knows — an unrecoverable sign-out. The
 * window is deliberately short: inside it a stolen token can be replayed once,
 * which is the accepted trade in the OAuth 2.0 security BCP.
 */
export const MOBILE_REFRESH_TOKEN_GRACE_MS = 60_000;

const MOBILE_AUTH_HANDOFF_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;
const MOBILE_AUTH_HANDOFF_KEY_PREFIX = "auth:mobile-handoff:";
const MOBILE_ACCESS_TOKEN_ISSUER = "whispr-api";
const MOBILE_ACCESS_TOKEN_AUDIENCE = "whispr-mobile";
const MOBILE_ACCESS_TOKEN_TYPE = "whispr-mobile-access";
const MOBILE_ACCESS_TOKEN_SCOPES = ["mobile:bootstrap"] as const;
const MOBILE_PASSWORD_RESET_DELIVERY_FAILURE = {
  code: "PASSWORD_RESET_DELIVERY_FAILED",
} as const;
// Missing accounts still pay the same bcrypt cost as wrong passwords. The
// value is deliberately fixed: hashing per request would create a larger oracle.
const MOBILE_MISSING_ACCOUNT_PASSWORD_HASH =
  "$2b$12$/zC3shOXAfktTcluug7UXukRRVQVvFIvceUC4sm3kIzn6iSSGGT6m";

interface MobileAuthHandoffPayload {
  callbackPath: string;
  createdAt: number;
  userId: string;
}

interface MobileAuthRedis extends MobileRefreshFamilyRedis {
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
  sessionsRevokedAfter?: Date | null;
  username: string;
}

interface MobileAuthOptions {
  env?: NodeJS.ProcessEnv;
  isAuthSessionActive?: typeof isDurableAuthSessionActive;
  loadSessionsRevokedAfter?: (userId: string) => Promise<Date | null | undefined>;
  loadUser?: (userId: string) => Promise<MobileAuthUser | null>;
  nowMs?: number;
  redis?: MobileAuthRedis;
}

interface MobilePasswordAuthUser extends MobileAuthUser {
  email: string;
  locale: string | null;
  passwordHash: string | null;
  twoFactorEnabled: boolean;
  twoFactorSecret: string | null;
  twoFactorSecretCiphertext?: string | null;
  twoFactorSecretKeyVersion?: string | null;
}

interface MobileGoogleAuthOptions extends MobileAuthOptions {
  linkAccount?: typeof linkMobileGoogleAccount;
  verifyIdToken?: (idToken: string) => Promise<MobileGoogleIdentity>;
  verifyTwoFactor?: typeof verifyTwoFactorCredential;
}

interface MobileNativeAuthOptions extends MobileAuthOptions {
  comparePassword?: (password: string, passwordHash: string) => Promise<boolean>;
  loadUserByEmail?: (email: string) => Promise<MobilePasswordAuthUser | null>;
  loginAttemptStore?: AttemptStore;
  verifyTwoFactor?: typeof verifyTwoFactorCredential;
}

type MobileRegistrationEmailUser = {
  displayName: string | null;
  email: string;
  emailVerified: boolean;
  id: string;
  locale: string | null;
  username: string;
};

type MobileRegistrationOptions = {
  findRegistrationConflicts?: (
    email: string,
    username: string,
  ) => Promise<{
    existingEmail: MobileRegistrationEmailUser | null;
    existingUsername: { id: string } | null;
  }>;
  notifyRegistrationAttempt?: typeof sendRegistrationAttemptEmail;
  sendVerification?: typeof sendVerificationEmail;
};

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

interface MobilePasswordResetUser {
  displayName: string | null;
  email: string;
  id: string;
  isBanned: boolean;
  locale: string | null;
  passwordHash: string | null;
  username: string;
}

interface MobilePasswordResetOptions {
  loadUserByEmail?: (email: string) => Promise<MobilePasswordResetUser | null>;
  sendPasswordReset?: typeof sendPasswordResetEmail;
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

  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
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
      getSafeAuthRedirectPath(parsed.callbackPath, "/messages") !== parsed.callbackPath ||
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
      sessionsRevokedAfter: true,
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
      twoFactorEnabled: true,
      twoFactorSecret: true,
      twoFactorSecretCiphertext: true,
      twoFactorSecretKeyVersion: true,
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

async function loadMobilePasswordResetUser(email: string): Promise<MobilePasswordResetUser | null> {
  return prisma.user.findUnique({
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

async function createMobileSessionSnapshot(
  user: MobileAuthUser,
  input: {
    nowMs: number;
    redis: MobileAuthRedis;
    refreshToken?: string;
    sessionId?: string;
  },
  options: MobileAuthOptions = {},
) {
  const sessionId = input.sessionId ?? randomBytes(24).toString("base64url");
  const refreshToken =
    input.refreshToken ??
    (await createMobileRefreshFamily({
      nowMs: input.nowMs,
      redis: input.redis,
      secret: getMobileAuthSecret(options.env),
      sessionId,
      tokenTtlSeconds: MOBILE_REFRESH_TOKEN_TTL_SECONDS,
      userId: user.id,
    }));
  const accessToken = createMobileAccessToken({ sessionId, userId: user.id }, options);

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

export async function createMobileAuthHandoffToken(
  input: {
    callbackPath: string;
    userId: string;
  },
  options: MobileAuthOptions = {},
) {
  const safeCallbackPath = getSafeAuthRedirectPath(input.callbackPath, "/messages");
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
  const expectedCallbackPath = getSafeAuthRedirectPath(input.expectedCallbackPath, "/messages");

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

async function authorizeMobileGoogleUser(
  user: MobileGoogleLinkedUser,
  twoFactorCode: string | undefined,
  verifyTwoFactor: typeof verifyTwoFactorCredential,
) {
  if (!isActiveMobileAuthUser(user)) {
    throw new MobileNativeAuthError(
      "ACCOUNT_UNAVAILABLE",
      403,
      "This account cannot sign in right now.",
    );
  }

  if (!requiresOAuthTwoFactorStepUp(user)) {
    return;
  }

  if (!twoFactorCode) {
    throw new MobileNativeAuthError(
      "TWO_FACTOR_REQUIRED",
      401,
      "Two-factor verification is required.",
    );
  }

  const result = await verifyTwoFactor({
    code: twoFactorCode,
    secret: user.twoFactorSecret,
    secretCiphertext: user.twoFactorSecretCiphertext,
    secretKeyVersion: user.twoFactorSecretKeyVersion,
    userId: user.id,
  });

  if (result.success) {
    return;
  }

  if (result.error === "rate_limited") {
    throw new MobileNativeAuthError(
      "RATE_LIMITED",
      429,
      "Too many two-factor verification attempts. Please try again shortly.",
    );
  }
  if (result.error === "verification_unavailable") {
    throw new MobileNativeAuthError(
      "TWO_FACTOR_UNAVAILABLE",
      503,
      "Two-factor verification is temporarily unavailable.",
    );
  }

  throw new MobileNativeAuthError(
    "TWO_FACTOR_INVALID",
    401,
    "The two-factor code is invalid or expired.",
  );
}

/**
 * Native Google sign-in. The device runs Google's own account sheet, so the only
 * credential that reaches this server is the ID token, which is verified against
 * Google's JWKS before any account is touched. No OAuth code, refresh token or
 * browser session is involved.
 */
export async function createMobileGoogleSession(
  input: {
    idToken: string;
    locale?: "en" | "tr" | undefined;
    twoFactorCode?: string | undefined;
  },
  options: MobileGoogleAuthOptions = {},
) {
  const nowMs = Math.trunc(options.nowMs ?? Date.now());
  let authorizedExistingUserId: string | null = null;

  try {
    const identity = await (options.verifyIdToken ?? verifyMobileGoogleIdToken)(input.idToken);
    const user = await (options.linkAccount ?? linkMobileGoogleAccount)({
      authorizeExistingUser: async (existingUser) => {
        if (authorizedExistingUserId === existingUser.id) {
          return;
        }
        await authorizeMobileGoogleUser(
          existingUser,
          input.twoFactorCode,
          options.verifyTwoFactor ?? verifyTwoFactorCredential,
        );
        authorizedExistingUserId = existingUser.id;
      },
      identity,
      locale: input.locale,
    });

    if (!isActiveMobileAuthUser(user)) {
      throw new MobileNativeAuthError(
        "ACCOUNT_UNAVAILABLE",
        403,
        "This account cannot sign in right now.",
      );
    }

    if (requiresOAuthTwoFactorStepUp(user) && authorizedExistingUserId !== user.id) {
      throw new MobileNativeAuthError(
        "TWO_FACTOR_REQUIRED",
        401,
        "Two-factor verification is required.",
      );
    }

    const redis = getMobileAuthRedis(options);
    return MobileAuthGoogleLoginResponseSchema.parse({
      session: await createMobileSessionSnapshot(user, { nowMs, redis }, options),
    });
  } catch (error) {
    if (error instanceof MobileGoogleAuthError) {
      throw new MobileNativeAuthError(error.code, error.status, error.message);
    }

    throw error;
  }
}

export async function createMobilePasswordSession(
  input: {
    email: string;
    password: string;
    twoFactorCode?: string;
  },
  options: MobileNativeAuthOptions = {},
) {
  const email = normalizeMobileAuthEmail(input.email);
  const nowMs = Math.trunc(options.nowMs ?? Date.now());
  const loginAttemptStore = options.loginAttemptStore ?? createRedisAttemptStore(getRedisRate());
  const attemptAllowed = await assertMobileLoginAttemptAllowed({
    email,
    nowMs,
    store: loginAttemptStore,
  });
  if (!attemptAllowed.allowed) {
    throw new MobileNativeAuthError(
      "RATE_LIMITED",
      429,
      "Too many sign-in attempts. Please try again shortly.",
    );
  }

  const user = await (options.loadUserByEmail ?? loadMobilePasswordAuthUser)(email);
  const comparePassword = options.comparePassword ?? bcrypt.compare;
  const isPasswordValid = await comparePassword(
    input.password,
    user?.passwordHash ?? MOBILE_MISSING_ACCOUNT_PASSWORD_HASH,
  );

  if (!user?.passwordHash) {
    const failure = await recordMobileLoginAttemptFailure({
      email,
      nowMs,
      store: loginAttemptStore,
    });
    if (failure.locked) {
      throw new MobileNativeAuthError(
        "RATE_LIMITED",
        429,
        "Too many sign-in attempts. Please try again shortly.",
      );
    }
    return null;
  }

  if (!isPasswordValid || !isActiveMobileAuthUser(user)) {
    const failure = await recordMobileLoginAttemptFailure({
      email,
      nowMs,
      store: loginAttemptStore,
    });
    if (failure.locked) {
      throw new MobileNativeAuthError(
        "RATE_LIMITED",
        429,
        "Too many sign-in attempts. Please try again shortly.",
      );
    }
    return null;
  }

  if (user.twoFactorEnabled) {
    if (!input.twoFactorCode) {
      throw new MobileNativeAuthError(
        "TWO_FACTOR_REQUIRED",
        401,
        "Two-factor verification is required.",
      );
    }

    const verifyTwoFactor = options.verifyTwoFactor ?? verifyTwoFactorCredential;
    const result = await verifyTwoFactor({
      code: input.twoFactorCode,
      secret: user.twoFactorSecret,
      ...(user.twoFactorSecretCiphertext === undefined
        ? {}
        : { secretCiphertext: user.twoFactorSecretCiphertext }),
      ...(user.twoFactorSecretKeyVersion === undefined
        ? {}
        : { secretKeyVersion: user.twoFactorSecretKeyVersion }),
      userId: user.id,
    });

    if (!result.success) {
      if (result.error === "rate_limited") {
        throw new MobileNativeAuthError(
          "RATE_LIMITED",
          429,
          "Too many two-factor verification attempts. Please try again shortly.",
        );
      }
      if (result.error === "verification_unavailable") {
        throw new MobileNativeAuthError(
          "TWO_FACTOR_UNAVAILABLE",
          503,
          "Two-factor verification is temporarily unavailable.",
        );
      }

      throw new MobileNativeAuthError(
        "TWO_FACTOR_INVALID",
        401,
        "The two-factor code is invalid or expired.",
      );
    }
  }

  const redis = getMobileAuthRedis(options);
  const response = MobileAuthPasswordLoginResponseSchema.parse({
    session: await createMobileSessionSnapshot(user, { nowMs, redis }, options),
  });
  await resetMobileLoginAttemptFailures({ email, store: loginAttemptStore });
  return response;
}

async function findMobileRegistrationConflicts(email: string, username: string) {
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

  return { existingEmail, existingUsername };
}

export async function registerMobilePasswordAccount(
  input: {
    confirmPassword: string;
    email: string;
    locale?: "en" | "tr" | undefined;
    password: string;
    username: string;
  },
  options: MobileRegistrationOptions = {},
) {
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

  const { existingEmail, existingUsername } = await (
    options.findRegistrationConflicts ?? findMobileRegistrationConflicts
  )(email, username);

  const registrationConflict = resolveRegistrationConflict({
    emailExists: Boolean(existingEmail),
    usernameExists: Boolean(existingUsername),
  });

  if (registrationConflict === "username_taken") {
    throw new MobileNativeAuthError("USERNAME_TAKEN", 409, "This username is already taken.");
  }

  if (existingEmail) {
    if (existingEmail.emailVerified) {
      // Return the same accepted envelope as a new registration. Notification
      // delivery stays best-effort so Resend health cannot become an oracle.
      try {
        await (options.notifyRegistrationAttempt ?? sendRegistrationAttemptEmail)(
          existingEmail,
          existingEmail.locale ?? locale,
        );
      } catch (error) {
        logError("[mobile-auth] Registration-attempt email failed", error);
      }

      return MobileAuthRegisterResponseSchema.parse({
        email,
        message: "verification_email_sent",
        status: "verification-required",
      });
    }

    try {
      await (options.sendVerification ?? sendVerificationEmail)(
        existingEmail,
        existingEmail.locale ?? locale,
      );
    } catch (error) {
      throw mapMobileEmailSendError(error, "VERIFICATION_EMAIL_UNAVAILABLE");
    }

    return MobileAuthRegisterResponseSchema.parse({
      email,
      message: "verification_email_sent",
      status: "verification-required",
    });
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
      await (options.sendVerification ?? sendVerificationEmail)(createdUser, locale);
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

export async function requestMobilePasswordReset(
  input: {
    email: string;
    locale?: "en" | "tr" | undefined;
  },
  options: MobilePasswordResetOptions = {},
) {
  const email = normalizeMobileAuthEmail(input.email);
  const locale = normalizeAppLocale(input.locale);
  const genericResponse = MobileAuthForgotPasswordResponseSchema.parse({
    email,
    message: "password_reset_if_available",
    resetLinkTtlMinutes: PASSWORD_RESET_TOKEN_EXPIRY_MINUTES,
    status: "accepted",
  });

  const loadUserByEmail = options.loadUserByEmail ?? loadMobilePasswordResetUser;
  const sendPasswordReset = options.sendPasswordReset ?? sendPasswordResetEmail;
  const user = await loadUserByEmail(email);

  if (!user || user.isBanned || !user.passwordHash) {
    return genericResponse;
  }

  try {
    await sendPasswordReset(
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
  } catch {
    logError("[mobile-auth] Password reset email failed", MOBILE_PASSWORD_RESET_DELIVERY_FAILURE);
    return genericResponse;
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

export async function refreshMobileSession(refreshToken: string, options: MobileAuthOptions = {}) {
  if (!isMobileRefreshToken(refreshToken)) {
    return null;
  }

  const redis = getMobileAuthRedis(options);
  const nowMs = Math.trunc(options.nowMs ?? Date.now());
  const rotation = await rotateMobileRefreshFamily({
    graceMs: MOBILE_REFRESH_TOKEN_GRACE_MS,
    nowMs,
    redis,
    refreshToken,
    secret: getMobileAuthSecret(options.env),
    tokenTtlSeconds: MOBILE_REFRESH_TOKEN_TTL_SECONDS,
  });
  if (!rotation) {
    return null;
  }

  const user = await (options.loadUser ?? loadMobileAuthUser)(rotation.userId);
  if (!isActiveMobileAuthUser(user)) {
    await revokeMobileSession({ sessionId: rotation.sessionId }, options);
    return null;
  }
  if (
    !(await isMobileRefreshFamilyActive(redis, rotation, {
      loadDurableRevokedAfter: async () => user.sessionsRevokedAfter ?? null,
    }))
  ) {
    // Rotation alone cannot rehabilitate a family invalidated by a password
    // reset. Remove the just-rotated state and return the same invalid result.
    await revokeMobileSession({ sessionId: rotation.sessionId }, options);
    return null;
  }

  const checkAuthSession =
    options.isAuthSessionActive ?? (options.redis ? async () => null : isDurableAuthSessionActive);
  if ((await checkAuthSession(rotation.userId, rotation.sessionId)) === false) {
    await revokeMobileSession({ sessionId: rotation.sessionId }, options);
    return null;
  }

  return MobileAuthRefreshResponseSchema.parse({
    session: await createMobileSessionSnapshot(
      user,
      {
        nowMs,
        redis,
        refreshToken: rotation.refreshToken,
        sessionId: rotation.sessionId,
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
  options: Pick<MobileAuthOptions, "env" | "redis"> = {},
) {
  const redis = getMobileAuthRedis(options);
  await revokeMobileRefreshFamily(redis, {
    refreshToken:
      input.refreshToken && isMobileRefreshToken(input.refreshToken) ? input.refreshToken : null,
    ...(input.refreshToken ? { secret: getMobileAuthSecret(options.env) } : {}),
    ...(input.sessionId === undefined ? {} : { sessionId: input.sessionId }),
  });
}

export async function isMobileAccessSessionActive(
  claims: MobileAccessTokenClaims,
  options: Pick<
    MobileAuthOptions,
    "isAuthSessionActive" | "loadSessionsRevokedAfter" | "redis"
  > = {},
) {
  const redis = getMobileAuthRedis(options);
  const loadDurableRevokedAfter =
    options.loadSessionsRevokedAfter ??
    (options.redis
      ? undefined
      : async (userId: string) => {
          const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { sessionsRevokedAfter: true },
          });
          return user?.sessionsRevokedAfter ?? null;
        });
  const checkAuthSession =
    options.isAuthSessionActive ?? (options.redis ? async () => null : isDurableAuthSessionActive);
  const [refreshFamilyActive, authSessionActive] = await Promise.all([
    isMobileRefreshFamilyActive(redis, claims, {
      ...(loadDurableRevokedAfter ? { loadDurableRevokedAfter } : {}),
    }),
    checkAuthSession(claims.userId, claims.sessionId),
  ]);
  return refreshFamilyActive && authSessionActive !== false;
}

export function verifyMobileAccessToken(
  token: string,
  options: Pick<MobileAuthOptions, "env" | "nowMs"> = {},
): MobileAccessTokenClaims | null {
  if (typeof token !== "string" || token.length < 16 || token.length > 8192 || /\s/.test(token)) {
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
