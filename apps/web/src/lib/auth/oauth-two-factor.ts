import { createHash, randomBytes } from "node:crypto";

import { prisma } from "@wizards/db";

import { getAuthSessionCookieConfig } from "@/lib/auth/session-cookies";
import { verifyTwoFactorCredential } from "@/lib/auth/two-factor";
import { getSafeAuthRedirectPath } from "@/lib/auth/redirect";
import {
  issueTrustedDevice,
  TRUSTED_DEVICE_USER_SELECT,
  type TrustedDeviceUser,
} from "./trusted-device";

export const OAUTH_TWO_FACTOR_TTL_SECONDS = 5 * 60;
const OAUTH_TWO_FACTOR_TOKEN_BYTES = 32;
const OAUTH_TWO_FACTOR_PURPOSE_PATTERN = /^oauth2fa:(c|g):(google|github):([a-f0-9]{32})$/;

export type OAuthTwoFactorProvider = "github" | "google";
export type OAuthTwoFactorPurposeKind = "challenge" | "grant";

type OAuthTwoFactorUser = TrustedDeviceUser & {
  deletedAt: Date | null;
  id: string;
  isBanned: boolean;
  twoFactorEnabled: boolean;
  twoFactorSecret: string | null;
  twoFactorSecretCiphertext: string | null;
  twoFactorSecretKeyVersion: string | null;
};

type OAuthTwoFactorChallengeRecord = {
  expiresAt: Date;
  id: string;
  purpose: string;
  usedAt: Date | null;
  user: OAuthTwoFactorUser;
  userId: string;
};

type OAuthTwoFactorGrantRecord = Omit<OAuthTwoFactorChallengeRecord, "user">;

type OAuthTwoFactorRecordInput = {
  expiresAt: Date;
  purpose: string;
  tokenHash: string;
  userId: string;
};

type CreateOAuthTwoFactorChallengeOptions = {
  createChallenge?: (input: OAuthTwoFactorRecordInput) => Promise<unknown>;
  now?: () => Date;
  randomToken?: () => string;
};

type CompleteOAuthTwoFactorChallengeOptions = {
  issueTrustedDevice?: typeof issueTrustedDevice;
  consumeChallengeAndCreateGrant?: (input: {
    challengeId: string;
    grant: OAuthTwoFactorRecordInput;
    now: Date;
  }) => Promise<boolean>;
  loadChallenge?: (tokenHash: string) => Promise<OAuthTwoFactorChallengeRecord | null>;
  now?: () => Date;
  randomToken?: () => string;
  verifyTwoFactor?: typeof verifyTwoFactorCredential;
};

type ConsumeOAuthTwoFactorGrantOptions = {
  consumeGrant?: (input: { grantId: string; now: Date }) => Promise<boolean>;
  loadGrant?: (tokenHash: string) => Promise<OAuthTwoFactorGrantRecord | null>;
  now?: () => Date;
};

export class OAuthTwoFactorError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "OAuthTwoFactorError";
  }
}

function createRandomOAuthTwoFactorToken() {
  return randomBytes(OAUTH_TWO_FACTOR_TOKEN_BYTES).toString("base64url");
}

export function hashOAuthTwoFactorToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function getOAuthTwoFactorPurpose(
  kind: OAuthTwoFactorPurposeKind,
  provider: OAuthTwoFactorProvider,
  providerAccountId: string,
) {
  const kindCode = kind === "challenge" ? "c" : "g";
  const accountDigest = createHash("sha256")
    .update(providerAccountId, "utf8")
    .digest("hex")
    .slice(0, 32);
  return `oauth2fa:${kindCode}:${provider}:${accountDigest}`;
}

function parseOAuthTwoFactorPurpose(purpose: string) {
  const match = OAUTH_TWO_FACTOR_PURPOSE_PATTERN.exec(purpose);
  if (!match) {
    return null;
  }

  const [, kindCode, provider, accountDigest] = match;
  if ((kindCode !== "c" && kindCode !== "g") || (provider !== "google" && provider !== "github")) {
    return null;
  }

  return {
    accountDigest: accountDigest ?? "",
    kind: kindCode === "c" ? ("challenge" as const) : ("grant" as const),
    provider,
  };
}

export function getOAuthTwoFactorGrantCookieConfig(
  env: Record<string, string | undefined> = process.env,
) {
  const secure = getAuthSessionCookieConfig(env).secureCookie;
  return {
    name: secure ? "__Secure-whispr.oauth-two-factor-grant" : "whispr.oauth-two-factor-grant",
    options: {
      httpOnly: true,
      maxAge: OAUTH_TWO_FACTOR_TTL_SECONDS,
      path: "/api/auth/callback",
      sameSite: "lax" as const,
      secure,
    },
  };
}

export function getAuthJsCallbackCookieName(env: Record<string, string | undefined> = process.env) {
  return `${getAuthSessionCookieConfig(env).secureCookie ? "__Secure-" : ""}authjs.callback-url`;
}

export function getSafeOAuthCallbackPath(rawValue: string | null | undefined) {
  const value = rawValue?.trim();
  if (!value) {
    return "/messages";
  }

  if (value.startsWith("/")) {
    return getSafeAuthRedirectPath(value, "/messages");
  }

  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return "/messages";
    }
    return getSafeAuthRedirectPath(`${url.pathname}${url.search}${url.hash}`, "/messages");
  } catch {
    return "/messages";
  }
}

async function createChallengeRecord(input: OAuthTwoFactorRecordInput) {
  await prisma.accountReauthChallenge.create({ data: input });
}

async function loadChallengeRecord(
  tokenHash: string,
): Promise<OAuthTwoFactorChallengeRecord | null> {
  return prisma.accountReauthChallenge.findUnique({
    where: { tokenHash },
    select: {
      expiresAt: true,
      id: true,
      purpose: true,
      usedAt: true,
      userId: true,
      user: {
        select: {
          ...TRUSTED_DEVICE_USER_SELECT,
          twoFactorSecretKeyVersion: true,
        },
      },
    },
  });
}

async function consumeChallengeAndCreateGrant(input: {
  challengeId: string;
  grant: OAuthTwoFactorRecordInput;
  now: Date;
}) {
  return prisma.$transaction(async (tx) => {
    const consumed = await tx.accountReauthChallenge.updateMany({
      where: {
        expiresAt: { gt: input.now },
        id: input.challengeId,
        usedAt: null,
      },
      data: { usedAt: input.now },
    });

    if (consumed.count !== 1) {
      return false;
    }

    await tx.accountReauthChallenge.create({ data: input.grant });
    return true;
  });
}

async function loadGrantRecord(tokenHash: string): Promise<OAuthTwoFactorGrantRecord | null> {
  return prisma.accountReauthChallenge.findUnique({
    where: { tokenHash },
    select: {
      expiresAt: true,
      id: true,
      purpose: true,
      usedAt: true,
      userId: true,
    },
  });
}

async function consumeGrantRecord(input: { grantId: string; now: Date }) {
  const consumed = await prisma.accountReauthChallenge.updateMany({
    where: {
      expiresAt: { gt: input.now },
      id: input.grantId,
      usedAt: null,
    },
    data: { usedAt: input.now },
  });
  return consumed.count === 1;
}

export async function createOAuthTwoFactorChallenge(
  input: {
    provider: OAuthTwoFactorProvider;
    providerAccountId: string;
    userId: string;
  },
  options: CreateOAuthTwoFactorChallengeOptions = {},
) {
  const now = options.now?.() ?? new Date();
  const expiresAt = new Date(now.getTime() + OAUTH_TWO_FACTOR_TTL_SECONDS * 1000);
  const token = options.randomToken?.() ?? createRandomOAuthTwoFactorToken();
  await (options.createChallenge ?? createChallengeRecord)({
    expiresAt,
    purpose: getOAuthTwoFactorPurpose("challenge", input.provider, input.providerAccountId),
    tokenHash: hashOAuthTwoFactorToken(token),
    userId: input.userId,
  });

  return { expiresAt, token };
}

function throwTwoFactorVerificationError(error: string): never {
  if (error === "rate_limited") {
    throw new OAuthTwoFactorError(
      "RATE_LIMITED",
      429,
      "Too many two-factor verification attempts. Please try again shortly.",
    );
  }
  if (error === "verification_unavailable") {
    throw new OAuthTwoFactorError(
      "TWO_FACTOR_UNAVAILABLE",
      503,
      "Two-factor verification is temporarily unavailable.",
    );
  }
  throw new OAuthTwoFactorError(
    "TWO_FACTOR_INVALID",
    401,
    "The two-factor code is invalid or expired.",
  );
}

export async function completeOAuthTwoFactorChallenge(
  input: {
    challengeToken: string;
    twoFactorCode: string;
    rememberDevice?: boolean | undefined;
    userAgent?: string | null;
  },
  options: CompleteOAuthTwoFactorChallengeOptions = {},
) {
  const now = options.now?.() ?? new Date();
  const challengeToken = input.challengeToken.trim();
  const challenge = await (options.loadChallenge ?? loadChallengeRecord)(
    hashOAuthTwoFactorToken(challengeToken),
  );
  const parsedPurpose = challenge ? parseOAuthTwoFactorPurpose(challenge.purpose) : null;

  if (
    !challenge ||
    !parsedPurpose ||
    parsedPurpose.kind !== "challenge" ||
    challenge.usedAt ||
    challenge.expiresAt <= now ||
    challenge.userId !== challenge.user.id ||
    challenge.user.deletedAt ||
    challenge.user.isBanned ||
    !challenge.user.emailVerified ||
    !challenge.user.twoFactorEnabled
  ) {
    throw new OAuthTwoFactorError(
      "OAUTH_TWO_FACTOR_CHALLENGE_INVALID",
      401,
      "The OAuth two-factor challenge is invalid or expired.",
    );
  }

  const result = await (options.verifyTwoFactor ?? verifyTwoFactorCredential)({
    code: input.twoFactorCode.trim(),
    secret: challenge.user.twoFactorSecret,
    secretCiphertext: challenge.user.twoFactorSecretCiphertext,
    secretKeyVersion: challenge.user.twoFactorSecretKeyVersion,
    userId: challenge.userId,
  });
  if (!result.success) {
    throwTwoFactorVerificationError(result.error);
  }

  const grantToken = options.randomToken?.() ?? createRandomOAuthTwoFactorToken();
  const expiresAt = new Date(now.getTime() + OAUTH_TWO_FACTOR_TTL_SECONDS * 1000);
  const grantPurpose = challenge.purpose.replace("oauth2fa:c:", "oauth2fa:g:");
  const consumed = await (options.consumeChallengeAndCreateGrant ?? consumeChallengeAndCreateGrant)(
    {
      challengeId: challenge.id,
      grant: {
        expiresAt,
        purpose: grantPurpose,
        tokenHash: hashOAuthTwoFactorToken(grantToken),
        userId: challenge.userId,
      },
      now,
    },
  );

  if (!consumed) {
    throw new OAuthTwoFactorError(
      "OAUTH_TWO_FACTOR_CHALLENGE_INVALID",
      401,
      "The OAuth two-factor challenge is invalid or expired.",
    );
  }

  const trustedDeviceToken = input.rememberDevice
    ? await (options.issueTrustedDevice ?? issueTrustedDevice)(challenge.user, input.userAgent)
    : undefined;
  return {
    expiresAt,
    grantToken,
    provider: parsedPurpose.provider,
    ...(trustedDeviceToken ? { trustedDeviceToken } : {}),
  };
}

export async function consumeOAuthTwoFactorGrant(
  input: {
    grantToken: string;
    provider: OAuthTwoFactorProvider;
    providerAccountId: string;
    userId: string;
  },
  options: ConsumeOAuthTwoFactorGrantOptions = {},
) {
  const grantToken = input.grantToken.trim();
  if (!grantToken) {
    return false;
  }

  const now = options.now?.() ?? new Date();
  const grant = await (options.loadGrant ?? loadGrantRecord)(hashOAuthTwoFactorToken(grantToken));
  const expectedPurpose = getOAuthTwoFactorPurpose(
    "grant",
    input.provider,
    input.providerAccountId,
  );

  if (
    !grant ||
    grant.usedAt ||
    grant.expiresAt <= now ||
    grant.userId !== input.userId ||
    grant.purpose !== expectedPurpose
  ) {
    return false;
  }

  return (options.consumeGrant ?? consumeGrantRecord)({ grantId: grant.id, now });
}

export async function authorizeOAuthTwoFactorSignIn(
  input: {
    existingUser: { id: string; twoFactorEnabled: boolean } | null | undefined;
    grantToken: string | null | undefined;
    provider: string | null | undefined;
    providerAccountId: string | null | undefined;
  },
  options: {
    consumeGrant?: typeof consumeOAuthTwoFactorGrant;
    createChallenge?: typeof createOAuthTwoFactorChallenge;
    isTrustedDevice?: () => Promise<boolean>;
  } = {},
): Promise<boolean | string> {
  if (input.existingUser?.twoFactorEnabled !== true) {
    return true;
  }

  if ((input.provider !== "google" && input.provider !== "github") || !input.providerAccountId) {
    return false;
  }

  if (
    input.grantToken &&
    (await (options.consumeGrant ?? consumeOAuthTwoFactorGrant)({
      grantToken: input.grantToken,
      provider: input.provider,
      providerAccountId: input.providerAccountId,
      userId: input.existingUser.id,
    }))
  ) {
    return true;
  }

  if (await options.isTrustedDevice?.()) return true;

  const challenge = await (options.createChallenge ?? createOAuthTwoFactorChallenge)({
    provider: input.provider,
    providerAccountId: input.providerAccountId,
    userId: input.existingUser.id,
  });
  const query = new URLSearchParams({
    challenge: challenge.token,
    provider: input.provider,
  });
  return `/oauth-two-factor?${query.toString()}`;
}
