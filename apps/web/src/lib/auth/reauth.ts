import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { prisma } from "@wizards/db";
import bcrypt from "bcryptjs";
import { ApiError } from "@/lib/api";

export const ACCOUNT_DELETION_REAUTH_PURPOSE = "account-delete";
export const ACCOUNT_DELETION_REAUTH_HEADER = "x-whispr-reauth-token";

const REAUTH_TOKEN_VERSION = "v1";
const ACCOUNT_DELETION_REAUTH_TTL_MS = 5 * 60 * 1000;

type ReauthPurpose = typeof ACCOUNT_DELETION_REAUTH_PURPOSE;

type ReauthTokenOptions = {
  env?: Record<string, string | undefined>;
  nowMs?: number;
};

function getReauthSecret(env: Record<string, string | undefined> = process.env) {
  const secret = env.AUTH_SECRET?.trim() || env.NEXTAUTH_SECRET?.trim();
  if (!secret) {
    throw new Error("AUTH_SECRET or NEXTAUTH_SECRET is required for re-auth signing.");
  }

  return secret;
}

function isSafeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function signReauthToken(args: {
  expiresAt: string;
  issuedAt: string;
  nonce: string;
  passwordHash: string;
  purpose: ReauthPurpose;
  secret: string;
  userId: string;
}) {
  return createHmac("sha256", args.secret)
    .update(REAUTH_TOKEN_VERSION)
    .update("\n")
    .update(args.userId)
    .update("\n")
    .update(args.purpose)
    .update("\n")
    .update(args.issuedAt)
    .update("\n")
    .update(args.expiresAt)
    .update("\n")
    .update(args.nonce)
    .update("\n")
    .update(args.passwordHash)
    .digest("base64url");
}

export function createAccountDeletionReauthToken(
  userId: string,
  passwordHash: string,
  options: ReauthTokenOptions = {},
) {
  const nowMs = Math.trunc(options.nowMs ?? Date.now());
  const issuedAt = nowMs.toString(36);
  const expiresAt = (nowMs + ACCOUNT_DELETION_REAUTH_TTL_MS).toString(36);
  const nonce = randomBytes(16).toString("base64url");
  const secret = getReauthSecret(options.env);
  const signature = signReauthToken({
    expiresAt,
    issuedAt,
    nonce,
    passwordHash,
    purpose: ACCOUNT_DELETION_REAUTH_PURPOSE,
    secret,
    userId,
  });

  return {
    expiresAt: new Date(nowMs + ACCOUNT_DELETION_REAUTH_TTL_MS),
    token: [REAUTH_TOKEN_VERSION, issuedAt, expiresAt, nonce, signature].join("."),
  };
}

export function verifyAccountDeletionReauthToken(
  userId: string,
  passwordHash: string,
  token: string | null | undefined,
  options: ReauthTokenOptions = {},
) {
  if (!token) {
    return false;
  }

  const [version, issuedAt, expiresAt, nonce, signature, extra] = token.split(".");
  if (
    version !== REAUTH_TOKEN_VERSION ||
    !issuedAt ||
    !expiresAt ||
    !nonce ||
    !signature ||
    extra !== undefined
  ) {
    return false;
  }

  const issuedAtMs = Number.parseInt(issuedAt, 36);
  const expiresAtMs = Number.parseInt(expiresAt, 36);
  const nowMs = Math.trunc(options.nowMs ?? Date.now());
  if (
    !Number.isFinite(issuedAtMs) ||
    !Number.isFinite(expiresAtMs) ||
    issuedAtMs <= 0 ||
    expiresAtMs <= issuedAtMs ||
    nowMs < issuedAtMs ||
    nowMs > expiresAtMs
  ) {
    return false;
  }

  const expectedSignature = signReauthToken({
    expiresAt,
    issuedAt,
    nonce,
    passwordHash,
    purpose: ACCOUNT_DELETION_REAUTH_PURPOSE,
    secret: getReauthSecret(options.env),
    userId,
  });

  return isSafeEqual(signature, expectedSignature);
}

export async function createAccountDeletionReauthTokenForPassword(
  userId: string,
  password: string,
) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      deletedAt: true,
      isBanned: true,
      passwordHash: true,
    },
  });

  if (!user || user.deletedAt || user.isBanned) {
    throw new ApiError("Unable to verify account", 401, "REAUTH_FAILED");
  }

  if (!user.passwordHash) {
    throw new ApiError(
      "Password re-authentication is not available for this account.",
      409,
      "REAUTH_PASSWORD_UNAVAILABLE",
    );
  }

  const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
  if (!isPasswordValid) {
    throw new ApiError("Unable to verify account", 401, "REAUTH_FAILED");
  }

  return createAccountDeletionReauthToken(userId, user.passwordHash);
}

export async function requireAccountDeletionReauthToken(
  userId: string,
  token: string | null | undefined,
) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      passwordHash: true,
    },
  });

  if (
    !user?.passwordHash ||
    !verifyAccountDeletionReauthToken(userId, user.passwordHash, token)
  ) {
    throw new ApiError(
      "Recent authentication is required to delete this account.",
      403,
      "REAUTH_REQUIRED",
    );
  }
}
