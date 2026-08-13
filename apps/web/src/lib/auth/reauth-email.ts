import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@wizards/db";
import { Resend } from "resend";
import { ApiError } from "@/lib/api";
import {
  ACCOUNT_DELETION_REAUTH_PURPOSE,
  createAccountDeletionReauthTokenForVerifiedEmail,
} from "@/lib/auth/reauth";
import { type AppLocale, DEFAULT_APP_LOCALE, normalizeAppLocale, translate } from "@/lib/locale";

const EMAIL_REAUTH_TOKEN_BYTES = 32;
const EMAIL_REAUTH_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,128}$/u;
const ACCOUNT_DELETION_EMAIL_REAUTH_EXPIRY_MINUTES = 10;
const ACCOUNT_DELETION_EMAIL_REAUTH_EXPIRY_MS =
  ACCOUNT_DELETION_EMAIL_REAUTH_EXPIRY_MINUTES * 60 * 1000;

type EmailReauthUser = {
  displayName: string | null;
  email: string;
  emailVerified: boolean;
  emailVerifiedAt: Date | null;
  id: string;
  locale?: string | null;
  passwordHash: string | null;
  username: string;
};

let resendClient: Resend | null = null;

function getRequiredEnv(key: string) {
  const value = process.env[key]?.trim();
  if (!value) {
    throw new ApiError(
      `${key} is required for account deletion email re-authentication.`,
      503,
      "REAUTH_EMAIL_UNAVAILABLE",
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

  throw new ApiError(
    `${keys.join(" or ")} is required for account deletion email re-authentication.`,
    503,
    "REAUTH_EMAIL_UNAVAILABLE",
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

function getAppUrl(env: Record<string, string | undefined> = process.env) {
  const rawAppUrl = [env.APP_URL, env.AUTH_URL, env.NEXTAUTH_URL]
    .map((value) => value?.trim())
    .find(Boolean);

  if (!rawAppUrl) {
    throw new ApiError(
      "APP_URL or AUTH_URL or NEXTAUTH_URL is required for account deletion email re-authentication.",
      503,
      "REAUTH_EMAIL_UNAVAILABLE",
    );
  }

  try {
    const appUrl = new URL(rawAppUrl);
    if (appUrl.protocol !== "https:" && appUrl.protocol !== "http:") {
      throw new Error("Unsupported protocol");
    }

    return appUrl.origin;
  } catch {
    throw new ApiError("APP_URL must be a valid http(s) URL.", 503, "REAUTH_EMAIL_UNAVAILABLE");
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

export function hashAccountReauthChallengeToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

// Query parameters are copied into browser history and request telemetry; the
// short-lived deletion credential stays in the dedicated route path instead.
export function buildAccountDeletionReauthUrl(
  token: string,
  env: Record<string, string | undefined> = process.env,
  platform: "MOBILE" | "WEB" = "WEB",
) {
  if (platform === "MOBILE") {
    return `whispr://reauth/account-delete/${encodeURIComponent(token)}`;
  }
  const url = new URL(`/settings/reauth/${encodeURIComponent(token)}`, `${getAppUrl(env)}/`);
  return url.toString();
}

function renderAccountDeletionReauthEmail(input: {
  locale: AppLocale;
  name: string;
  reauthUrl: string;
}) {
  const values = {
    minutes: ACCOUNT_DELETION_EMAIL_REAUTH_EXPIRY_MINUTES,
    name: input.name,
  };
  const subject = translate(input.locale, "auth.reauthEmail.subject");
  const title = translate(input.locale, "auth.reauthEmail.title");
  const greeting = translate(input.locale, "auth.reauthEmail.greeting", values);
  const body = translate(input.locale, "auth.reauthEmail.body");
  const cta = translate(input.locale, "auth.reauthEmail.cta");
  const expires = translate(input.locale, "auth.reauthEmail.expires", values);
  const fallback = translate(input.locale, "auth.reauthEmail.fallback");
  const ignore = translate(input.locale, "auth.reauthEmail.ignore");
  const footer = translate(input.locale, "auth.reauthEmail.footer");

  const safeTitle = escapeHtml(title);
  const safeGreeting = escapeHtml(greeting);
  const safeBody = escapeHtml(body);
  const safeCta = escapeHtml(cta);
  const safeExpires = escapeHtml(expires);
  const safeFallback = escapeHtml(fallback);
  const safeIgnore = escapeHtml(ignore);
  const safeFooter = escapeHtml(footer);
  const safeUrl = escapeHtml(input.reauthUrl);

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
      input.reauthUrl,
      "",
      expires,
      fallback,
      input.reauthUrl,
      "",
      ignore,
      footer,
    ].join("\n"),
  };
}

async function createAccountReauthChallenge(userId: string) {
  const token = randomBytes(EMAIL_REAUTH_TOKEN_BYTES).toString("base64url");
  const tokenHash = hashAccountReauthChallengeToken(token);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ACCOUNT_DELETION_EMAIL_REAUTH_EXPIRY_MS);

  const challenge = await prisma.$transaction(async (tx) => {
    await tx.accountReauthChallenge.updateMany({
      where: {
        purpose: ACCOUNT_DELETION_REAUTH_PURPOSE,
        usedAt: null,
        userId,
      },
      data: {
        usedAt: now,
      },
    });

    return tx.accountReauthChallenge.create({
      data: {
        expiresAt,
        purpose: ACCOUNT_DELETION_REAUTH_PURPOSE,
        tokenHash,
        userId,
      },
      select: {
        expiresAt: true,
        id: true,
      },
    });
  });

  return {
    expiresAt: challenge.expiresAt,
    token,
    tokenId: challenge.id,
  };
}

function assertEmailReauthEligibleUser(user: EmailReauthUser | null) {
  if (!user) {
    throw new ApiError("Unable to verify account", 401, "REAUTH_FAILED");
  }

  if (user.passwordHash) {
    throw new ApiError(
      "Password re-authentication is available for this account.",
      409,
      "REAUTH_PASSWORD_REQUIRED",
    );
  }

  if (!user.emailVerified) {
    throw new ApiError(
      "A verified email address is required for email re-authentication.",
      409,
      "REAUTH_EMAIL_UNVERIFIED",
    );
  }
}

export async function sendAccountDeletionReauthEmail(
  userId: string,
  platform: "MOBILE" | "WEB" = "WEB",
) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      deletedAt: true,
      displayName: true,
      email: true,
      emailVerified: true,
      emailVerifiedAt: true,
      id: true,
      isBanned: true,
      locale: true,
      passwordHash: true,
      username: true,
    },
  });

  if (!user || user.deletedAt || user.isBanned) {
    throw new ApiError("Unable to verify account", 401, "REAUTH_FAILED");
  }

  assertEmailReauthEligibleUser(user);

  const generatedChallenge = await createAccountReauthChallenge(user.id);
  const resolvedLocale = normalizeAppLocale(user.locale ?? DEFAULT_APP_LOCALE);
  const displayName = user.displayName ?? user.username;
  const reauthUrl = buildAccountDeletionReauthUrl(generatedChallenge.token, process.env, platform);
  const email = renderAccountDeletionReauthEmail({
    locale: resolvedLocale,
    name: displayName,
    reauthUrl,
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
      throw new ApiError(
        response.error.message,
        isResendDevSenderRestriction(response.error, from) ? 409 : 503,
        isResendDevSenderRestriction(response.error, from)
          ? "REAUTH_EMAIL_SENDER_RESTRICTED"
          : "REAUTH_EMAIL_UNAVAILABLE",
      );
    }
  } catch (error) {
    await prisma.accountReauthChallenge.updateMany({
      where: {
        id: generatedChallenge.tokenId,
        usedAt: null,
      },
      data: {
        usedAt: new Date(),
      },
    });

    if (error instanceof ApiError) {
      throw error;
    }

    throw new ApiError(
      "Unable to send account deletion confirmation email.",
      503,
      "REAUTH_EMAIL_UNAVAILABLE",
    );
  }

  return {
    expiresAt: generatedChallenge.expiresAt,
  };
}

export async function confirmAccountDeletionReauthEmail(userId: string, token: string) {
  const normalizedToken = token.trim();
  if (!EMAIL_REAUTH_TOKEN_PATTERN.test(normalizedToken)) {
    throw new ApiError("Unable to verify account", 401, "REAUTH_FAILED");
  }

  const tokenHash = hashAccountReauthChallengeToken(normalizedToken);
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const challenge = await tx.accountReauthChallenge.findUnique({
      where: { tokenHash },
      select: {
        expiresAt: true,
        id: true,
        purpose: true,
        usedAt: true,
        userId: true,
        user: {
          select: {
            deletedAt: true,
            email: true,
            emailVerified: true,
            emailVerifiedAt: true,
            isBanned: true,
            passwordHash: true,
          },
        },
      },
    });

    if (
      !challenge ||
      challenge.usedAt ||
      challenge.userId !== userId ||
      challenge.purpose !== ACCOUNT_DELETION_REAUTH_PURPOSE ||
      challenge.expiresAt <= now ||
      challenge.user.deletedAt ||
      challenge.user.isBanned ||
      challenge.user.passwordHash ||
      !challenge.user.emailVerified
    ) {
      throw new ApiError("Unable to verify account", 401, "REAUTH_FAILED");
    }

    const consumed = await tx.accountReauthChallenge.updateMany({
      where: {
        id: challenge.id,
        usedAt: null,
      },
      data: {
        usedAt: now,
      },
    });

    if (consumed.count !== 1) {
      throw new ApiError("Unable to verify account", 401, "REAUTH_FAILED");
    }

    return createAccountDeletionReauthTokenForVerifiedEmail(
      userId,
      challenge.user.email,
      challenge.user.emailVerifiedAt,
    );
  });
}
