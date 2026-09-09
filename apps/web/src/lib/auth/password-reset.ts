import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "@wizards/db";
import { Resend } from "resend";
import bcrypt from "bcryptjs";
import { DEFAULT_APP_LOCALE, normalizeAppLocale } from "@/lib/locale";
import { revokeUserSessions } from "@/lib/auth/session-revocation";
import { logError } from "@/lib/logger";
import type { HeaderSource } from "@/lib/analytics/client-info";
import { buildResetPasswordUrl, EmailConfigurationError } from "@/lib/email/email-links";
import { resolveEmailRequestContext } from "@/lib/email/email-request-context";
import { renderPasswordResetEmail } from "@/lib/email/templates/password-reset-email";

/**
 * SPEC-GIRIS-KAYIT §4.7 ve §7/8 — "Bağlantı 30 dakika geçerli, yalnızca bir kez kullanılabilir."
 * Ürün 60 dakika tutuyordu; tasarım metni ekranda 30 dakika yazdığı için süre kısaltıldı.
 */
export const PASSWORD_RESET_TOKEN_EXPIRY_MINUTES = 30;
const PASSWORD_RESET_TOKEN_EXPIRY_MS = PASSWORD_RESET_TOKEN_EXPIRY_MINUTES * 60 * 1000;

type PasswordResetPayload = {
  email: string;
  exp: number;
  uid: string;
};

export type PasswordResetErrorCode =
  "CONFIGURATION_ERROR" | "INVALID_TOKEN" | "EXPIRED_TOKEN" | "SENDER_RESTRICTED" | "SEND_FAILED";

export class PasswordResetError extends Error {
  constructor(
    public readonly code: PasswordResetErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "PasswordResetError";
  }
}

export type PasswordResetUser = {
  displayName: string | null;
  email: string;
  id: string;
  locale?: string | null;
  passwordHash: string;
  username: string;
};

export type PasswordResetVerificationResult =
  | { status: "valid"; email: string; token: string; userId: string }
  | { status: "expired" }
  | { status: "invalid" };

let resendClient: Resend | null = null;

function getRequiredEnv(key: string) {
  const value = process.env[key]?.trim();
  if (!value) {
    throw new PasswordResetError("CONFIGURATION_ERROR", `${key} is required for password reset.`);
  }

  return value;
}

function getFirstRequiredEnv(keys: string[]) {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) {
      return value;
    }
  }

  throw new PasswordResetError(
    "CONFIGURATION_ERROR",
    `${keys.join(" or ")} is required for password reset.`,
  );
}

function getResendClient() {
  if (!resendClient) {
    resendClient = new Resend(getRequiredEnv("RESEND_API_KEY"));
  }

  return resendClient;
}

type ResendErrorLike = {
  message?: string;
  name?: string;
  statusCode?: number | null;
};

function isResendDevSenderRestriction(error: ResendErrorLike, from: string) {
  const normalizedFrom = from.toLowerCase();
  const normalizedMessage = error.message?.toLowerCase() ?? "";

  return (
    normalizedFrom.includes("@resend.dev") &&
    error.statusCode === 403 &&
    (error.name === "invalid_access" ||
      normalizedMessage.includes("testing emails") ||
      normalizedMessage.includes("own email address"))
  );
}

function base64UrlEncode(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function getPasswordResetSecret() {
  return getFirstRequiredEnv(["AUTH_SECRET", "NEXTAUTH_SECRET"]);
}

function signPasswordResetPayload(payload: string, passwordHash: string) {
  return createHmac("sha256", getPasswordResetSecret())
    .update(payload)
    .update(".")
    .update(passwordHash)
    .digest("base64url");
}

function safeCompare(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function buildPasswordResetToken(user: PasswordResetUser) {
  const payload: PasswordResetPayload = {
    email: user.email,
    exp: Date.now() + PASSWORD_RESET_TOKEN_EXPIRY_MS,
    uid: user.id,
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = signPasswordResetPayload(encodedPayload, user.passwordHash);

  return `${encodedPayload}.${signature}`;
}

function parsePasswordResetToken(token: string): PasswordResetPayload | null {
  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) {
    return null;
  }

  try {
    const parsed = JSON.parse(base64UrlDecode(encodedPayload)) as Partial<PasswordResetPayload>;
    if (
      typeof parsed.email !== "string" ||
      typeof parsed.exp !== "number" ||
      typeof parsed.uid !== "string"
    ) {
      return null;
    }

    return {
      email: parsed.email,
      exp: parsed.exp,
      uid: parsed.uid,
    };
  } catch {
    return null;
  }
}

/**
 * Adres kurulumu `lib/email/email-links` içinde; hata tipi burada çevriliyor ki dışarıdaki
 * `CONFIGURATION_ERROR` eşlemesi ve mesaj metni aynen kalsın.
 */
function buildPasswordResetUrl(token: string) {
  try {
    return buildResetPasswordUrl(token, "password reset");
  } catch (error) {
    if (error instanceof EmailConfigurationError) {
      throw new PasswordResetError("CONFIGURATION_ERROR", error.message);
    }

    throw error;
  }
}

/**
 * İstek özetindeki saat, kullanıcının kendi saat dilimine göre yazılır (K6). Ayar okunamazsa
 * mektup gitmeye devam eder: eksik bir saat dilimi yüzünden şifre sıfırlama akışı durmaz.
 */
async function loadUserTimeZone(userId: string) {
  try {
    const settings = await prisma.userSettings.findUnique({
      where: { userId },
      select: { timeZone: true },
    });

    return settings?.timeZone ?? null;
  } catch (error) {
    logError("[auth] Password reset time zone unavailable", error);
    return null;
  }
}

/**
 * `context` isteğe bağlıdır: verilmezse cihaz satırı çizilmez (SPEC §5'in eksik parça kuralı).
 * Böylece bağlam taşımayan eski çağrılar kırılmadan çalışmaya devam eder.
 */
export async function sendPasswordResetEmail(
  user: PasswordResetUser,
  locale?: string | null,
  context?: { headers?: HeaderSource | null | undefined; now?: Date | undefined },
) {
  const resolvedLocale = normalizeAppLocale(locale ?? user.locale ?? DEFAULT_APP_LOCALE);
  const displayName = user.displayName ?? user.username;
  const resetUrl = buildPasswordResetUrl(buildPasswordResetToken(user));
  const email = renderPasswordResetEmail({
    accountEmail: user.email,
    locale: resolvedLocale,
    name: displayName,
    requestContext: resolveEmailRequestContext({
      headers: context?.headers,
      locale: resolvedLocale,
      now: context?.now ?? new Date(),
      timeZone: await loadUserTimeZone(user.id),
    }),
    resetUrl,
    ttlMinutes: PASSWORD_RESET_TOKEN_EXPIRY_MINUTES,
  });

  const from = getFirstRequiredEnv(["RESEND_FROM_EMAIL", "RESEND_FROM"]);
  const response = await getResendClient().emails.send({
    from,
    html: email.html,
    subject: email.subject,
    text: email.text,
    to: user.email,
  });

  if (response.error) {
    throw new PasswordResetError(
      isResendDevSenderRestriction(response.error, from) ? "SENDER_RESTRICTED" : "SEND_FAILED",
      response.error.message,
    );
  }
}

export async function verifyPasswordResetToken(
  token: string,
): Promise<PasswordResetVerificationResult> {
  const normalizedToken = token.trim();
  const [encodedPayload, signature] = normalizedToken.split(".");
  const payload = parsePasswordResetToken(normalizedToken);

  if (!payload || !encodedPayload || !signature) {
    return { status: "invalid" };
  }

  if (payload.exp <= Date.now()) {
    return { status: "expired" };
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.uid },
    select: {
      email: true,
      id: true,
      isBanned: true,
      passwordHash: true,
    },
  });

  if (!user || user.isBanned || !user.passwordHash || user.email !== payload.email) {
    return { status: "invalid" };
  }

  const expectedSignature = signPasswordResetPayload(encodedPayload, user.passwordHash);
  if (!safeCompare(signature, expectedSignature)) {
    return { status: "invalid" };
  }

  return {
    email: user.email,
    status: "valid",
    token: normalizedToken,
    userId: user.id,
  };
}

/**
 * SPEC §4.7 "Şifre güncellendi" ekranındaki bilgi bandı gerçek bir sayı istiyor:
 * `3 cihazda oturum kapatıldı · 27.08.2026 · 11:24`. Sayı, kapatma **anında** açık olan
 * dayanıklı oturumlardan gelir; sayı sıfırsa ekran bandı hiç göstermez (uydurma sayı yazmaz).
 */
async function countActiveSessions(userId: string, now: Date) {
  try {
    return await prisma.authSession.count({
      where: {
        expiresAt: { gt: now },
        revokedAt: null,
        userId,
      },
    });
  } catch (error) {
    logError("[auth] Active session count unavailable", error);
    return 0;
  }
}

export async function resetPasswordWithToken(input: { password: string; token: string }) {
  const verification = await verifyPasswordResetToken(input.token);
  if (verification.status !== "valid") {
    return verification;
  }

  const passwordHash = await bcrypt.hash(input.password, 12);
  const now = new Date();
  const signedOutDeviceCount = await countActiveSessions(verification.userId, now);

  await prisma.user.update({
    where: { id: verification.userId },
    data: {
      passwordHash,
      sessionsRevokedAfter: now,
    },
  });
  await revokeUserSessions(verification.userId, { now });

  return { signedOutAt: now, signedOutDeviceCount, status: "reset" as const };
}
