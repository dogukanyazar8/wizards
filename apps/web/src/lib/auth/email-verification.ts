import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@wizards/db";
import { Resend } from "resend";
import { DEFAULT_APP_LOCALE, normalizeAppLocale } from "@/lib/locale";
import {
  EMAIL_CODE_TTL_MS,
  requestEmailVerificationCode,
} from "@/lib/auth/email-verification-code";
import { buildVerifyEmailUrl, EmailConfigurationError } from "@/lib/email/email-links";
import { renderRegistrationAttemptEmail } from "@/lib/email/templates/registration-attempt-email";
import { renderVerificationCodeEmail } from "@/lib/email/templates/verification-code-email";

const EMAIL_VERIFICATION_TOKEN_BYTES = 32;
const EMAIL_VERIFICATION_TOKEN_EXPIRY_HOURS = 24;
const EMAIL_VERIFICATION_TOKEN_EXPIRY_MS = EMAIL_VERIFICATION_TOKEN_EXPIRY_HOURS * 60 * 60 * 1000;

export type EmailVerificationErrorCode =
  "CONFIGURATION_ERROR" | "INVALID_TOKEN" | "EXPIRED_TOKEN" | "SENDER_RESTRICTED" | "SEND_FAILED";

export class EmailVerificationError extends Error {
  constructor(
    public readonly code: EmailVerificationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "EmailVerificationError";
  }
}

export type EmailVerificationUser = {
  displayName: string | null;
  email: string;
  id: string;
  locale?: string | null;
  username: string;
};

export type GeneratedEmailVerificationToken = {
  expiresAt: Date;
  token: string;
  tokenId: string;
};

export type EmailVerificationResult =
  { status: "verified"; userId: string } | { status: "expired" } | { status: "invalid" };

let resendClient: Resend | null = null;

function getRequiredEnv(key: string) {
  const value = process.env[key]?.trim();
  if (!value) {
    throw new EmailVerificationError(
      "CONFIGURATION_ERROR",
      `${key} is required for email verification.`,
    );
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

  throw new EmailVerificationError(
    "CONFIGURATION_ERROR",
    `${keys.join(" or ")} is required for email verification.`,
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

/**
 * Adres kurulumu artık `lib/email/email-links` içinde yaşıyor (tüm işlemsel e-postalar aynı
 * kökü kullanıyor). Hata tipi burada çevriliyor ki dışarıdaki `CONFIGURATION_ERROR` eşlemesi
 * ve mesaj metni aynen kalsın.
 */
function buildVerificationUrl(token: string) {
  try {
    return buildVerifyEmailUrl(token);
  } catch (error) {
    if (error instanceof EmailConfigurationError) {
      throw new EmailVerificationError("CONFIGURATION_ERROR", error.message);
    }

    throw error;
  }
}

export function hashEmailVerificationToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export async function generateEmailVerificationToken(
  userId: string,
): Promise<GeneratedEmailVerificationToken> {
  const token = randomBytes(EMAIL_VERIFICATION_TOKEN_BYTES).toString("base64url");
  const tokenHash = hashEmailVerificationToken(token);
  const expiresAt = new Date(Date.now() + EMAIL_VERIFICATION_TOKEN_EXPIRY_MS);
  const now = new Date();

  const createdToken = await prisma.$transaction(async (tx) => {
    await tx.emailVerificationToken.updateMany({
      where: {
        userId,
        usedAt: null,
      },
      data: {
        usedAt: now,
      },
    });

    return tx.emailVerificationToken.create({
      data: {
        userId,
        tokenHash,
        expiresAt,
      },
      select: {
        id: true,
        expiresAt: true,
      },
    });
  });

  return {
    expiresAt: createdToken.expiresAt,
    token,
    tokenId: createdToken.id,
  };
}

export async function sendRegistrationAttemptEmail(
  user: EmailVerificationUser,
  locale?: string | null,
) {
  const resolvedLocale = normalizeAppLocale(locale ?? user.locale ?? DEFAULT_APP_LOCALE);
  const email = renderRegistrationAttemptEmail({
    locale: resolvedLocale,
    name: user.displayName ?? user.username,
  });

  try {
    const from = getFirstRequiredEnv(["RESEND_FROM_EMAIL", "RESEND_FROM"]);
    const response = await getResendClient().emails.send({
      from,
      html: email.html,
      subject: email.subject,
      text: email.text,
      to: user.email,
    });

    if (response.error) {
      throw new EmailVerificationError(
        isResendDevSenderRestriction(response.error, from) ? "SENDER_RESTRICTED" : "SEND_FAILED",
        response.error.message,
      );
    }
  } catch (error) {
    if (error instanceof EmailVerificationError) {
      throw error;
    }

    throw new EmailVerificationError("SEND_FAILED", "Unable to send registration notice.");
  }
}

export async function sendVerificationEmail(user: EmailVerificationUser, locale?: string | null) {
  const resolvedLocale = normalizeAppLocale(locale ?? user.locale ?? DEFAULT_APP_LOCALE);
  const displayName = user.displayName ?? user.username;
  const generatedToken = await generateEmailVerificationToken(user.id);
  const verificationUrl = buildVerificationUrl(generatedToken.token);
  /*
   * K3 — ayni e-posta hem baglantiyi hem alti haneli kodu tasir. Kod hiz sinirina takildiysa
   * mektup yalniz baglantiyla gider; kullaniciyi bos birakmaktansa eski yol calisir.
   */
  const codeResult = await requestEmailVerificationCode({ email: user.email, id: user.id }).catch(
    () => null,
  );
  const email = renderVerificationCodeEmail({
    code: codeResult?.status === "sent" ? codeResult.code : null,
    codeTtlMinutes: EMAIL_CODE_TTL_MS / 60_000,
    locale: resolvedLocale,
    name: displayName,
    verificationUrl,
  });

  try {
    const from = getFirstRequiredEnv(["RESEND_FROM_EMAIL", "RESEND_FROM"]);
    const response = await getResendClient().emails.send({
      from,
      html: email.html,
      subject: email.subject,
      text: email.text,
      to: user.email,
    });

    if (response.error) {
      throw new EmailVerificationError(
        isResendDevSenderRestriction(response.error, from) ? "SENDER_RESTRICTED" : "SEND_FAILED",
        response.error.message,
      );
    }
  } catch (error) {
    await prisma.emailVerificationToken.updateMany({
      where: {
        id: generatedToken.tokenId,
        usedAt: null,
      },
      data: {
        usedAt: new Date(),
      },
    });

    if (error instanceof EmailVerificationError) {
      throw error;
    }

    throw new EmailVerificationError("SEND_FAILED", "Unable to send verification email.");
  }

  return {
    expiresAt: generatedToken.expiresAt,
  };
}

export async function verifyEmailToken(token: string): Promise<EmailVerificationResult> {
  const normalizedToken = token.trim();
  if (!normalizedToken) {
    return { status: "invalid" };
  }

  const tokenHash = hashEmailVerificationToken(normalizedToken);
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const verificationToken = await tx.emailVerificationToken.findUnique({
      where: { tokenHash },
      select: {
        expiresAt: true,
        id: true,
        usedAt: true,
        userId: true,
      },
    });

    if (!verificationToken || verificationToken.usedAt) {
      return { status: "invalid" };
    }

    if (verificationToken.expiresAt <= now) {
      return { status: "expired" };
    }

    const consumedToken = await tx.emailVerificationToken.updateMany({
      where: {
        id: verificationToken.id,
        usedAt: null,
      },
      data: {
        usedAt: now,
      },
    });

    if (consumedToken.count !== 1) {
      return { status: "invalid" };
    }

    await tx.user.update({
      where: { id: verificationToken.userId },
      data: {
        emailVerified: true,
        emailVerifiedAt: now,
      },
    });

    return {
      status: "verified",
      userId: verificationToken.userId,
    };
  });
}
