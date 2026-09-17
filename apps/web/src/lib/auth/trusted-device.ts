import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@wizards/db";
import { credentialStamp } from "@/lib/account/email-change-policy";
import { logError } from "@/lib/logger";
import { getAuthSessionCookieConfig } from "./session-cookies";

export const TRUSTED_DEVICE_TTL_SECONDS = 30 * 24 * 60 * 60;
export const TRUSTED_DEVICE_PURPOSE_PREFIX = "trusted2fa:";
export const TRUSTED_DEVICE_USER_SELECT = {
  id: true,
  email: true,
  emailVerified: true,
  passwordHash: true,
  sessionsRevokedAfter: true,
  twoFactorEnabled: true,
  twoFactorSecret: true,
  twoFactorSecretCiphertext: true,
  isBanned: true,
  deletedAt: true,
} as const;

export type TrustedDeviceUser = Parameters<typeof credentialStamp>[0] & {
  id: string;
  emailVerified: boolean;
  isBanned: boolean;
  deletedAt: Date | null;
};
export type TrustedDeviceRecord = {
  tokenHash: string;
  userId: string;
  purpose: string;
  expiresAt: Date;
  usedAt: Date | null;
};
type TrustedDeviceOptions = {
  now?: () => Date;
  store?: {
    create(record: TrustedDeviceRecord): Promise<unknown>;
    find(tokenHash: string): Promise<TrustedDeviceRecord | null>;
  };
};
const store: NonNullable<TrustedDeviceOptions["store"]> = {
  create: (record) => prisma.accountReauthChallenge.create({ data: record }),
  find: (tokenHash) =>
    prisma.accountReauthChallenge.findUnique({
      where: { tokenHash },
      select: { tokenHash: true, userId: true, purpose: true, expiresAt: true, usedAt: true },
    }),
};
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
function purpose(user: TrustedDeviceUser, userAgent: string) {
  // Account credential changes invalidate trust without another database write.
  // IP is deliberately excluded: switching networks is not switching browsers.
  return (
    TRUSTED_DEVICE_PURPOSE_PREFIX +
    createHash("sha256")
      .update(JSON.stringify([user.id, credentialStamp(user), userAgent]))
      .digest("base64url")
  );
}
function eligible(user: TrustedDeviceUser, userAgent: string | null | undefined) {
  return Boolean(
    userAgent &&
    user.emailVerified &&
    user.twoFactorEnabled &&
    (user.twoFactorSecret || user.twoFactorSecretCiphertext) &&
    !user.isBanned &&
    !user.deletedAt,
  );
}

/** Call only after a consumed, successful second-factor challenge. Never on a trusted login. */
export async function issueTrustedDevice(
  user: TrustedDeviceUser,
  userAgent: string | null | undefined,
  options: TrustedDeviceOptions = {},
) {
  if (!eligible(user, userAgent)) throw new Error("Cannot remember an unverified device");
  const token = randomBytes(32).toString("base64url");
  await (options.store ?? store).create({
    tokenHash: hashToken(token),
    userId: user.id,
    purpose: purpose(user, userAgent!),
    usedAt: null,
    expiresAt: new Date(
      (options.now?.() ?? new Date()).getTime() + TRUSTED_DEVICE_TTL_SECONDS * 1000,
    ),
  });
  return token;
}

export async function verifyTrustedDevice(
  token: string | null | undefined,
  user: TrustedDeviceUser,
  userAgent: string | null | undefined,
  options: TrustedDeviceOptions = {},
) {
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token) || !eligible(user, userAgent)) return false;
  try {
    const record = await (options.store ?? store).find(hashToken(token));
    return Boolean(
      record &&
      record.userId === user.id &&
      !record.usedAt &&
      record.expiresAt > (options.now?.() ?? new Date()) &&
      record.purpose === purpose(user, userAgent!),
    );
  } catch (error) {
    logError("[auth] Trusted device lookup unavailable; requiring two-factor", error);
    return false;
  }
}

export function getTrustedDeviceCookieConfig(
  env: Record<string, string | undefined> = process.env,
) {
  const secure = getAuthSessionCookieConfig(env).secureCookie;
  return {
    name: secure ? "__Host-whispr.trusted-device" : "whispr.trusted-device",
    options: {
      httpOnly: true,
      secure,
      sameSite: "lax" as const,
      path: "/",
      maxAge: TRUSTED_DEVICE_TTL_SECONDS,
    },
  };
}

export async function revokeTrustedDevices(userId: string) {
  await prisma.accountReauthChallenge.deleteMany({
    where: { userId, purpose: { startsWith: TRUSTED_DEVICE_PURPOSE_PREFIX } },
  });
}
