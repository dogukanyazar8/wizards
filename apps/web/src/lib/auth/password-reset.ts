import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "@wizards/db";
import { Resend } from "resend";
import bcrypt from "bcryptjs";
import {
  type AppLocale,
  DEFAULT_APP_LOCALE,
  normalizeAppLocale,
  translate,
} from "@/lib/locale";
import { revokeUserSessions } from "@/lib/auth/session-revocation";

const PASSWORD_RESET_TOKEN_EXPIRY_MINUTES = 60;
const PASSWORD_RESET_TOKEN_EXPIRY_MS =
  PASSWORD_RESET_TOKEN_EXPIRY_MINUTES * 60 * 1000;

type PasswordResetPayload = {
  email: string;
  exp: number;
  uid: string;
};

export type PasswordResetErrorCode =
  | "CONFIGURATION_ERROR"
  | "INVALID_TOKEN"
  | "EXPIRED_TOKEN"
  | "SENDER_RESTRICTED"
  | "SEND_FAILED";

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
    throw new PasswordResetError(
      "CONFIGURATION_ERROR",
      `${key} is required for password reset.`,
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

function getAppUrl() {
  const rawAppUrl = getFirstRequiredEnv(["APP_URL", "AUTH_URL", "NEXTAUTH_URL"]);

  try {
    const appUrl = new URL(rawAppUrl);
    if (appUrl.protocol !== "https:" && appUrl.protocol !== "http:") {
      throw new Error("Unsupported protocol");
    }

    return appUrl.origin;
  } catch {
    throw new PasswordResetError(
      "CONFIGURATION_ERROR",
      "APP_URL must be a valid http(s) URL.",
    );
  }
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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

function buildPasswordResetUrl(token: string) {
  const url = new URL("/reset-password", `${getAppUrl()}/`);
  url.searchParams.set("token", token);
  return url.toString();
}

function renderPasswordResetEmail(input: {
  locale: AppLocale;
  name: string;
  resetUrl: string;
}) {
  const values = {
    minutes: PASSWORD_RESET_TOKEN_EXPIRY_MINUTES,
    name: input.name,
  };
  const subject = translate(input.locale, "auth.passwordReset.emailSubject");
  const title = translate(input.locale, "auth.passwordReset.emailTitle");
  const greeting = translate(input.locale, "auth.passwordReset.emailGreeting", values);
  const body = translate(input.locale, "auth.passwordReset.emailBody");
  const cta = translate(input.locale, "auth.passwordReset.emailCta");
  const expires = translate(input.locale, "auth.passwordReset.emailExpires", values);
  const fallback = translate(input.locale, "auth.passwordReset.emailFallback");
  const ignore = translate(input.locale, "auth.passwordReset.emailIgnore");
  const footer = translate(input.locale, "auth.passwordReset.emailFooter");

  const safeTitle = escapeHtml(title);
  const safeGreeting = escapeHtml(greeting);
  const safeBody = escapeHtml(body);
  const safeCta = escapeHtml(cta);
  const safeExpires = escapeHtml(expires);
  const safeFallback = escapeHtml(fallback);
  const safeIgnore = escapeHtml(ignore);
  const safeFooter = escapeHtml(footer);
  const safeUrl = escapeHtml(input.resetUrl);

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
      input.resetUrl,
      "",
      expires,
      fallback,
      input.resetUrl,
      "",
      ignore,
      footer,
    ].join("\n"),
  };
}

export async function sendPasswordResetEmail(
  user: PasswordResetUser,
  locale?: string | null,
) {
  const resolvedLocale = normalizeAppLocale(locale ?? user.locale ?? DEFAULT_APP_LOCALE);
  const displayName = user.displayName ?? user.username;
  const resetUrl = buildPasswordResetUrl(buildPasswordResetToken(user));
  const email = renderPasswordResetEmail({
    locale: resolvedLocale,
    name: displayName,
    resetUrl,
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
      isResendDevSenderRestriction(response.error, from)
        ? "SENDER_RESTRICTED"
        : "SEND_FAILED",
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

export async function resetPasswordWithToken(input: {
  password: string;
  token: string;
}) {
  const verification = await verifyPasswordResetToken(input.token);
  if (verification.status !== "valid") {
    return verification;
  }

  const passwordHash = await bcrypt.hash(input.password, 12);
  await prisma.user.update({
    where: { id: verification.userId },
    data: { passwordHash },
  });
  await revokeUserSessions(verification.userId);

  return { status: "reset" as const };
}
