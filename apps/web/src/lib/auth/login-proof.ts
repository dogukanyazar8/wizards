import { createHmac, timingSafeEqual } from "node:crypto";

const LOGIN_PROOF_TTL_MS = 2 * 60 * 1000;

type LoginProofOptions = {
  env?: Record<string, string | undefined>;
  nowMs?: number;
};

function getLoginProofSecret(env: Record<string, string | undefined> = process.env) {
  const secret = env.AUTH_SECRET?.trim() || env.NEXTAUTH_SECRET?.trim();
  if (!secret) {
    throw new Error("AUTH_SECRET or NEXTAUTH_SECRET is required for login proof signing.");
  }

  return secret;
}

function normalizeLoginProofEmail(email: string) {
  return email.trim().toLowerCase();
}

function signLoginProof(email: string, issuedAt: string, secret: string) {
  return createHmac("sha256", secret)
    .update(normalizeLoginProofEmail(email))
    .update("\n")
    .update(issuedAt)
    .digest("base64url");
}

function isSafeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function createLoginProof(email: string, options: LoginProofOptions = {}) {
  const issuedAt = Math.trunc(options.nowMs ?? Date.now()).toString(36);
  const signature = signLoginProof(email, issuedAt, getLoginProofSecret(options.env));

  return `${issuedAt}.${signature}`;
}

export function verifyLoginProof(
  email: string,
  proof: string | null | undefined,
  options: LoginProofOptions = {},
) {
  if (!proof) {
    return false;
  }

  const [issuedAt, signature, extra] = proof.split(".");
  if (!issuedAt || !signature || extra !== undefined) {
    return false;
  }

  const issuedAtMs = Number.parseInt(issuedAt, 36);
  const nowMs = Math.trunc(options.nowMs ?? Date.now());
  if (!Number.isFinite(issuedAtMs) || issuedAtMs <= 0) {
    return false;
  }

  const ageMs = nowMs - issuedAtMs;
  if (ageMs < 0 || ageMs > LOGIN_PROOF_TTL_MS) {
    return false;
  }

  const expectedSignature = signLoginProof(email, issuedAt, getLoginProofSecret(options.env));

  return isSafeEqual(signature, expectedSignature);
}
