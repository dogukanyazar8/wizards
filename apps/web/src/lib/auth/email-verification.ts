import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@wizards/db";
import { Resend } from "resend";
import { type AppLocale, DEFAULT_APP_LOCALE, normalizeAppLocale, translate } from "@/lib/locale";

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

function getAppUrl() {
  const rawAppUrl = getFirstRequiredEnv(["APP_URL", "AUTH_URL", "NEXTAUTH_URL"]);

  try {
    const appUrl = new URL(rawAppUrl);
    if (appUrl.protocol !== "https:" && appUrl.protocol !== "http:") {
      throw new Error("Unsupported protocol");
    }

    return appUrl.origin;
  } catch {
    throw new EmailVerificationError("CONFIGURATION_ERROR", "APP_URL must be a valid http(s) URL.");
  }
}

function buildVerificationUrl(token: string) {
  const url = new URL("/verify-email", `${getAppUrl()}/`);
  url.searchParams.set("token", token);
  return url.toString();
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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

function renderVerificationEmail(input: {
  locale: AppLocale;
  name: string;
  verificationUrl: string;
}) {
  const values = {
    hours: EMAIL_VERIFICATION_TOKEN_EXPIRY_HOURS,
    name: input.name,
  };
  const subject = translate(input.locale, "auth.emailVerification.subject");
  const title = translate(input.locale, "auth.emailVerification.title");
  const greeting = translate(input.locale, "auth.emailVerification.greeting", values);
  const body = translate(input.locale, "auth.emailVerification.body");
  const cta = translate(input.locale, "auth.emailVerification.cta");
  const expires = translate(input.locale, "auth.emailVerification.expires", values);
  const fallback = translate(input.locale, "auth.emailVerification.fallback");
  const ignore = translate(input.locale, "auth.emailVerification.ignore");
  const footer = translate(input.locale, "auth.emailVerification.footer");

  const safeTitle = escapeHtml(title);
  const safeGreeting = escapeHtml(greeting);
  const safeBody = escapeHtml(body);
  const safeCta = escapeHtml(cta);
  const safeExpires = escapeHtml(expires);
  const safeFallback = escapeHtml(fallback);
  const safeIgnore = escapeHtml(ignore);
  const safeFooter = escapeHtml(footer);
  const safeUrl = escapeHtml(input.verificationUrl);

  return {
    html: `<!doctype html>
<html lang="${input.locale}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${safeTitle}</title>
  </head>
  <body style="margin:0;background:#f5f7fb;color:#111827;font-family:Inter,Segoe UI,Arial,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f7fb;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #e5e7eb;border-radius:28px;overflow:hidden;box-shadow:0 24px 70px rgba(15,23,42,0.10);">
            <tr>
              <td style="padding:32px 32px 20px;">
                <div style="display:inline-block;border-radius:999px;border:1px solid #dfe3ff;background:#eef1ff;color:#4f46e5;font-size:12px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;padding:8px 12px;">Whispr</div>
                <h1 style="font-size:30px;line-height:1.15;margin:24px 0 12px;color:#111827;">${safeTitle}</h1>
                <p style="font-size:16px;line-height:1.7;margin:0 0 12px;color:#4b5563;">${safeGreeting}</p>
                <p style="font-size:16px;line-height:1.7;margin:0;color:#4b5563;">${safeBody}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 32px 28px;">
                <a href="${safeUrl}" style="display:inline-block;border-radius:18px;background:#6366f1;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;padding:14px 20px;">${safeCta}</a>
                <p style="font-size:13px;line-height:1.6;margin:18px 0 0;color:#6b7280;">${safeExpires}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 30px;">
                <div style="border-radius:18px;background:#f8fafc;border:1px solid #e5e7eb;padding:16px;">
                  <p style="font-size:13px;line-height:1.6;margin:0 0 10px;color:#64748b;">${safeFallback}</p>
                  <a href="${safeUrl}" style="font-size:13px;line-height:1.6;color:#4f46e5;word-break:break-all;">${safeUrl}</a>
                </div>
                <p style="font-size:13px;line-height:1.6;margin:18px 0 0;color:#6b7280;">${safeIgnore}</p>
              </td>
            </tr>
            <tr>
              <td style="background:#f8fafc;border-top:1px solid #e5e7eb;padding:18px 32px;">
                <p style="font-size:12px;line-height:1.6;margin:0;color:#94a3b8;">${safeFooter}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`,
    subject,
    text: [
      subject,
      "",
      greeting,
      body,
      "",
      cta,
      input.verificationUrl,
      "",
      expires,
      fallback,
      input.verificationUrl,
      "",
      ignore,
      footer,
    ].join("\n"),
  };
}

function renderRegistrationAttemptEmail(input: { locale: AppLocale; name: string }) {
  const copy =
    input.locale === "tr"
      ? {
          body: "Birisi bu e-posta adresiyle yeni bir Whispr hesabı oluşturmaya çalıştı.",
          footer:
            "Bu işlem size ait değilse hesabınızda değişiklik yapılmadı; bu iletiyi yok sayabilirsiniz.",
          greeting: `Merhaba ${input.name},`,
          subject: "Whispr kayıt denemesi bildirimi",
          title: "E-posta adresinizle kayıt denemesi",
        }
      : {
          body: "Someone tried to create a new Whispr account using this email address.",
          footer:
            "If this was not you, no account changes were made and you can ignore this message.",
          greeting: `Hello ${input.name},`,
          subject: "Whispr registration attempt notice",
          title: "Registration attempt using your email",
        };

  const safeTitle = escapeHtml(copy.title);
  const safeGreeting = escapeHtml(copy.greeting);
  const safeBody = escapeHtml(copy.body);
  const safeFooter = escapeHtml(copy.footer);

  return {
    html: `<!doctype html>
<html lang="${input.locale}">
  <head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${safeTitle}</title></head>
  <body style="margin:0;background:#f5f7fb;color:#111827;font-family:Inter,Segoe UI,Arial,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f7fb;padding:32px 16px;">
      <tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #e5e7eb;border-radius:28px;overflow:hidden;">
        <tr><td style="padding:32px;"><div style="display:inline-block;border-radius:999px;border:1px solid #dfe3ff;background:#eef1ff;color:#4f46e5;font-size:12px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;padding:8px 12px;">Whispr</div><h1 style="font-size:30px;line-height:1.15;margin:24px 0 12px;">${safeTitle}</h1><p style="font-size:16px;line-height:1.7;color:#4b5563;">${safeGreeting}</p><p style="font-size:16px;line-height:1.7;color:#4b5563;">${safeBody}</p><p style="font-size:13px;line-height:1.6;color:#6b7280;">${safeFooter}</p></td></tr>
      </table></td></tr>
    </table>
  </body>
</html>`,
    subject: copy.subject,
    text: [copy.subject, "", copy.greeting, copy.body, "", copy.footer].join("\n"),
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
  const email = renderVerificationEmail({
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
