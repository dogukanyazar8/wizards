import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@wizards/db";
import { Resend } from "resend";
import { ApiError } from "@/lib/api";
import {
  ACCOUNT_DELETION_REAUTH_PURPOSE,
  createAccountDeletionReauthTokenForVerifiedEmail,
} from "@/lib/auth/reauth";
import { DEFAULT_APP_LOCALE, normalizeAppLocale } from "@/lib/locale";
import { renderAccountDeletionReauthEmail } from "@/lib/email/templates/account-deletion-reauth-email";

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
    expiryMinutes: ACCOUNT_DELETION_EMAIL_REAUTH_EXPIRY_MINUTES,
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
