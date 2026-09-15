import { createHash, createHmac } from "node:crypto";
import { EMAIL_CHANGE_MAX_ATTEMPTS } from "./contact-contract";

type Credentials = {
  email: string;
  passwordHash: string | null;
  sessionsRevokedAfter: Date | null;
  twoFactorEnabled: boolean;
  twoFactorSecret: string | null;
  twoFactorSecretCiphertext: string | null;
};

export function isEmailChangeGoogleCallback(value: string | undefined) {
  if (!value) return false;
  try {
    return new URL(value, "https://whispr.invalid").pathname === "/settings/email-change/google";
  } catch {
    return false;
  }
}

export function credentialStamp(user: Credentials) {
  return createHash("sha256")
    .update(
      JSON.stringify([
        user.email,
        user.passwordHash,
        user.sessionsRevokedAfter?.toISOString(),
        user.twoFactorEnabled,
        user.twoFactorSecret,
        user.twoFactorSecretCiphertext,
      ]),
    )
    .digest("hex");
}

export function hashEmailChangeCode(code: string, id: string, secret?: string) {
  const key = secret ?? process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!key) throw new Error("AUTH_SECRET is required for email change codes");
  return createHmac("sha256", key).update(`email-change:${id}:${code}`).digest("hex");
}

export function canConfirmEmailChange(
  pending: {
    currentEmail: string;
    credentialStamp: string;
    sentAt: Date | null;
    expiresAt: Date;
    attempts: number;
  },
  user: Credentials,
  now: Date,
) {
  return (
    pending.sentAt !== null &&
    pending.expiresAt > now &&
    pending.attempts < EMAIL_CHANGE_MAX_ATTEMPTS &&
    pending.currentEmail === user.email &&
    pending.credentialStamp === credentialStamp(user)
  );
}
