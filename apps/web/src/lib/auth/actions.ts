"use server";

import { headers } from "next/headers";
import { normalizeAuthEmail, signIn, signOut } from "@/auth";
import { DEFAULT_WIZARDS_THEME } from "@/lib/appearance";
import { normalizeAppLocale } from "@/lib/locale";
import { persistUserLocale } from "@/lib/locale/persistence";
import { getRedis } from "@/lib/redis";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  EmailVerificationError,
  sendVerificationEmail,
  type EmailVerificationUser,
} from "@/lib/auth/email-verification";
import {
  getTurnstileErrorMessageKey,
  verifyTurnstileToken,
} from "@/lib/auth/turnstile";
import { Prisma, prisma } from "@wizards/db";
import { ForgotPasswordSchema, LoginSchema, RegisterSchema } from "@wizards/types";
import bcrypt from "bcryptjs";
import { AuthError } from "next-auth";

export interface AuthActionResult {
  email?: string;
  success: boolean;
  error?: string;
  message?: string;
}

function getFormValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

async function getRequestIpAddress() {
  const headerStore = await headers();
  const forwardedFor = headerStore.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() || "unknown";
  }

  return headerStore.get("x-real-ip")?.trim() || "unknown";
}

async function sendVerificationEmailWithRateLimit(input: {
  ipAddress: string;
  locale: string;
  user: EmailVerificationUser;
}) {
  const redis = getRedis();

  try {
    const [emailAllowed, ipAllowed] = await Promise.all([
      checkRateLimit(
        redis,
        `rate:email-verification:user:${input.user.id}`,
        5,
        60 * 60,
      ),
      checkRateLimit(
        redis,
        `rate:email-verification:ip:${input.ipAddress}`,
        20,
        60 * 60,
      ),
    ]);

    if (!emailAllowed || !ipAllowed) {
      return {
        success: false,
        error: "auth.emailVerification.rateLimited",
      } as const;
    }
  } catch {
    // Email verification is security-sensitive, but Redis outages should not
    // prevent a newly-created account from receiving its first verification link.
  }

  try {
    await sendVerificationEmail(input.user, input.locale);
    return { success: true } as const;
  } catch (error) {
    if (error instanceof EmailVerificationError) {
      return {
        success: false,
        error:
          error.code === "CONFIGURATION_ERROR"
            ? "auth.emailVerification.notConfigured"
            : error.code === "SENDER_RESTRICTED"
              ? "auth.emailVerification.senderRestricted"
            : "auth.emailVerification.sendFailed",
      } as const;
    }

    return {
      success: false,
      error: "auth.emailVerification.sendFailed",
    } as const;
  }
}

async function checkVerificationResendRateLimit(input: {
  email: string;
  ipAddress: string;
}) {
  const redis = getRedis();

  try {
    const cooldownAllowed = await checkRateLimit(
      redis,
      `rate:email-verification:resend:cooldown:${input.email}:${input.ipAddress}`,
      1,
      60,
    );

    if (!cooldownAllowed) {
      return false;
    }

    const [emailAllowed, ipAllowed] = await Promise.all([
      checkRateLimit(
        redis,
        `rate:email-verification:resend:email:${input.email}`,
        5,
        60 * 60,
      ),
      checkRateLimit(
        redis,
        `rate:email-verification:resend:ip:${input.ipAddress}`,
        5,
        60 * 60,
      ),
    ]);

    return cooldownAllowed && emailAllowed && ipAllowed;
  } catch {
    // Fail open if Redis is temporarily unavailable.
    return true;
  }
}

export async function registerAction(formData: FormData): Promise<AuthActionResult> {
  const validation = RegisterSchema.safeParse({
    email: normalizeAuthEmail(getFormValue(formData, "email")),
    username: getFormValue(formData, "username"),
    password: getFormValue(formData, "password"),
    confirmPassword: getFormValue(formData, "confirmPassword"),
    turnstileToken: getFormValue(formData, "turnstileToken"),
  });

  if (!validation.success) {
    return {
      success: false,
      error: validation.error.issues[0]?.message ?? "auth.register.alertUnavailable",
    };
  }

  const email = normalizeAuthEmail(validation.data.email);
  const locale = normalizeAppLocale(getFormValue(formData, "locale"));
  const username = validation.data.username;
  const ipAddress = await getRequestIpAddress();

  try {
    const isAllowed = await checkRateLimit(
      getRedis(),
      `rate:register:${ipAddress}`,
      10,
      60 * 60,
    );

    if (!isAllowed) {
      return {
        success: false,
        error: "auth.register.rateLimited",
      };
    }
  } catch {
    // Fail open if Redis is temporarily unavailable.
  }

  try {
    await verifyTurnstileToken(validation.data.turnstileToken, ipAddress);
  } catch (error) {
    return {
      success: false,
      error: getTurnstileErrorMessageKey(error),
    };
  }

  const [existingEmail, existingUsername] = await Promise.all([
    prisma.user.findUnique({
      where: { email },
      select: {
        displayName: true,
        email: true,
        emailVerified: true,
        id: true,
        locale: true,
        username: true,
      },
    }),
    prisma.user.findUnique({ where: { username }, select: { id: true } }),
  ]);

  if (existingEmail) {
    if (!existingEmail.emailVerified) {
      const verificationEmail = await sendVerificationEmailWithRateLimit({
        ipAddress,
        locale,
        user: existingEmail,
      });

      if (!verificationEmail.success) {
        return {
          success: false,
          error: verificationEmail.error,
        };
      }

      return {
        email,
        success: true,
        message: "auth.register.checkEmailMessage",
      };
    }

    return {
      success: false,
      error: "auth.register.emailTaken",
    };
  }

  if (existingUsername) {
    return {
      success: false,
      error: "auth.register.usernameTaken",
    };
  }

  const passwordHash = await bcrypt.hash(validation.data.password, 12);

  try {
    const createdUser = await prisma.$transaction(async (tx) => {
      return tx.user.create({
        data: {
          email,
          username,
          passwordHash,
          displayName: username,
          emailVerified: false,
          emailVerifiedAt: null,
          locale,
          status: "ONLINE",
          theme: DEFAULT_WIZARDS_THEME,
          settings: { create: {} },
          notificationSettings: { create: {} },
        },
      });
    });

    await persistUserLocale(createdUser.id, locale);

    const verificationEmail = await sendVerificationEmailWithRateLimit({
      ipAddress,
      locale,
      user: createdUser,
    });

    if (!verificationEmail.success) {
      await prisma.user.delete({ where: { id: createdUser.id } }).catch(() => undefined);

      return {
        success: false,
        error: verificationEmail.error,
      };
    }

    return {
      email,
      success: true,
      message: "auth.register.checkEmailMessage",
    };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return {
        success: false,
        error: "auth.register.emailTaken",
      };
    }

    throw error;
  }
}

export async function loginAction(formData: FormData): Promise<AuthActionResult> {
  const validation = LoginSchema.safeParse({
    email: normalizeAuthEmail(getFormValue(formData, "email")),
    password: getFormValue(formData, "password"),
  });

  if (!validation.success) {
    return {
      success: false,
      error: validation.error.issues[0]?.message ?? "auth.login.alertUnavailable",
    };
  }

  const { email, password } = validation.data;
  const ipAddress = await getRequestIpAddress();

  try {
    const isAllowed = await checkRateLimit(
      getRedis(),
      `rate:login:${email}:${ipAddress}`,
      5,
      15 * 60,
    );

    if (!isAllowed) {
      return {
        success: false,
        error: "auth.login.rateLimited",
      };
    }
  } catch {
    // Fail open if Redis is temporarily unavailable.
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      email: true,
      emailVerified: true,
      isBanned: true,
      passwordHash: true,
    },
  });

  if (user?.passwordHash && !user.isBanned) {
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

    if (isPasswordValid && !user.emailVerified) {
      return {
        email: user.email,
        success: false,
        error: "auth.login.emailNotVerified",
      };
    }
  }

  try {
    await signIn("credentials", {
      email,
      password,
      redirectTo: "/channels",
    });

    return { success: true };
  } catch (error) {
    if (error instanceof AuthError) {
      if (error.type === "CredentialsSignin") {
        return {
          success: false,
          error: "auth.login.invalidCredentials",
        };
      }

      return {
        success: false,
        error: "auth.login.alertUnavailable",
      };
    }

    throw error;
  }
}

export async function resendVerificationEmailAction(
  formData: FormData,
): Promise<AuthActionResult> {
  const validation = ForgotPasswordSchema.safeParse({
    email: normalizeAuthEmail(getFormValue(formData, "email")),
  });

  if (!validation.success) {
    return {
      success: false,
      error: validation.error.issues[0]?.message ?? "validation.email.invalid",
    };
  }

  const email = normalizeAuthEmail(validation.data.email);
  const locale = normalizeAppLocale(getFormValue(formData, "locale"));
  const ipAddress = await getRequestIpAddress();

  const isResendAllowed = await checkVerificationResendRateLimit({
    email,
    ipAddress,
  });

  if (!isResendAllowed) {
    return {
      success: false,
      error: "auth.emailVerification.rateLimited",
    };
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      displayName: true,
      email: true,
      emailVerified: true,
      id: true,
      locale: true,
      username: true,
    },
  });

  if (!user || user.emailVerified) {
    return {
      email,
      success: true,
      message: "auth.emailVerification.resendGenericSuccess",
    };
  }

  const verificationEmail = await sendVerificationEmailWithRateLimit({
    ipAddress,
    locale: normalizeAppLocale(user.locale ?? locale),
    user,
  });

  if (!verificationEmail.success) {
    return {
      email,
      success: true,
      message: "auth.emailVerification.resendGenericSuccess",
    };
  }

  return {
    email,
    success: true,
    message: "auth.emailVerification.resendGenericSuccess",
  };
}

export async function logoutAction() {
  try {
    await signOut({
      redirectTo: "/login",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      throw new Error("auth.login.signInUnavailable");
    }

    throw error;
  }
}
