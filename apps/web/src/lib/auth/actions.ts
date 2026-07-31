"use server";

import { headers } from "next/headers";
import { normalizeAuthEmail, signIn, signOut } from "@/auth";
import { DEFAULT_WIZARDS_THEME } from "@/lib/appearance";
import { normalizeAppLocale } from "@/lib/locale";
import { persistUserLocale } from "@/lib/locale/persistence";
import { logError } from "@/lib/logger";
import {
  EmailVerificationError,
  sendVerificationEmail,
  type EmailVerificationUser,
} from "@/lib/auth/email-verification";
import {
  PasswordResetError,
  resetPasswordWithToken,
  sendPasswordResetEmail,
  type PasswordResetUser,
} from "@/lib/auth/password-reset";
import { getTurnstileErrorMessageKey, verifyTurnstileToken } from "@/lib/auth/turnstile";
import { getSafeAuthRedirectPath } from "@/lib/auth/redirect";
import { rollbackUnverifiedUser } from "@/lib/auth/registration-compensation";
import { createLoginProof } from "@/lib/auth/login-proof";
import { LOGIN_FAILED_MESSAGE_KEY } from "@/lib/auth/login-errors";
import {
  checkLoginRequestRateLimit,
  checkPasswordResetConsumeRateLimit,
  checkPasswordResetRequestRateLimit,
  checkRegistrationRequestRateLimit,
  checkVerificationResendRequestRateLimit,
  checkVerificationSendRequestRateLimit,
} from "@/lib/auth/request-rate-limits";
import { getTrustedClientIp, type ClientIpHeaderSource } from "@/lib/security/client-ip";
import { Prisma, prisma } from "@wizards/db";
import {
  ForgotPasswordSchema,
  LoginSchema,
  RegisterSchema,
  ResetPasswordSchema,
} from "@wizards/types";
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

async function sendVerificationEmailWithRateLimit(input: {
  headers: ClientIpHeaderSource;
  locale: string;
  user: EmailVerificationUser;
}) {
  const isAllowed = await checkVerificationSendRequestRateLimit({
    headers: input.headers,
    userId: input.user.id,
  });
  if (!isAllowed) {
    return {
      success: false,
      error: "auth.emailVerification.rateLimited",
    } as const;
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

function mapPasswordResetError(error: unknown) {
  if (error instanceof PasswordResetError) {
    if (error.code === "CONFIGURATION_ERROR") {
      return "auth.passwordReset.notConfigured";
    }

    if (error.code === "SENDER_RESTRICTED") {
      return "auth.passwordReset.senderRestricted";
    }

    return "auth.passwordReset.sendFailed";
  }

  return "auth.passwordReset.sendFailed";
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
  const headerStore = await headers();
  const isAllowed = await checkRegistrationRequestRateLimit({
    email,
    headers: headerStore,
  });
  if (!isAllowed) {
    return {
      success: false,
      error: "auth.register.rateLimited",
    };
  }

  try {
    await verifyTurnstileToken(
      validation.data.turnstileToken,
      getTrustedClientIp(headerStore) ?? undefined,
    );
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
        headers: headerStore,
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
      headers: headerStore,
      locale,
      user: createdUser,
    });

    if (!verificationEmail.success) {
      await rollbackUnverifiedUser({
        email,
        userId: createdUser.id,
      });

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
    rememberMe: getFormValue(formData, "rememberMe"),
    twoFactorCode: getFormValue(formData, "twoFactorCode"),
    turnstileToken: getFormValue(formData, "turnstileToken"),
  });

  if (!validation.success) {
    return {
      success: false,
      error: validation.error.issues[0]?.message ?? "auth.login.alertUnavailable",
    };
  }

  const { email, password, rememberMe } = validation.data;
  const redirectTo = getSafeAuthRedirectPath(getFormValue(formData, "callbackUrl"));
  const headerStore = await headers();
  const isAllowed = await checkLoginRequestRateLimit({
    email,
    headers: headerStore,
  });
  if (!isAllowed) {
    return {
      success: false,
      error: "auth.login.rateLimited",
    };
  }

  try {
    await verifyTurnstileToken(
      validation.data.turnstileToken,
      getTrustedClientIp(headerStore) ?? undefined,
      {
        expectedAction: "login",
      },
    );
  } catch (error) {
    return {
      success: false,
      error: getTurnstileErrorMessageKey(error),
    };
  }

  try {
    let loginProof: string;
    try {
      loginProof = createLoginProof(email);
    } catch (error) {
      logError("[auth] Login proof unavailable", error);
      return {
        success: false,
        error: "auth.login.alertUnavailable",
      };
    }

    await signIn("credentials", {
      email,
      loginProof,
      password,
      rememberMe: rememberMe ? "true" : "false",
      redirectTo,
      twoFactorCode: validation.data.twoFactorCode,
    });

    return { success: true };
  } catch (error) {
    if (error instanceof AuthError) {
      if (error.type === "CredentialsSignin") {
        return {
          success: false,
          error: LOGIN_FAILED_MESSAGE_KEY,
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

export async function forgotPasswordAction(formData: FormData): Promise<AuthActionResult> {
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
  const headerStore = await headers();
  const genericSuccess = {
    email,
    success: true,
    message: "auth.forgot.genericSuccess",
  } satisfies AuthActionResult;

  const isAllowed = await checkPasswordResetRequestRateLimit({
    email,
    headers: headerStore,
  });
  if (!isAllowed) {
    return {
      success: false,
      error: "auth.forgot.rateLimited",
    };
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      displayName: true,
      email: true,
      id: true,
      isBanned: true,
      locale: true,
      passwordHash: true,
      username: true,
    },
  });

  if (!user || user.isBanned || !user.passwordHash) {
    return genericSuccess;
  }

  try {
    await sendPasswordResetEmail(
      {
        displayName: user.displayName,
        email: user.email,
        id: user.id,
        locale: user.locale,
        passwordHash: user.passwordHash,
        username: user.username,
      } satisfies PasswordResetUser,
      normalizeAppLocale(user.locale ?? locale),
    );

    return genericSuccess;
  } catch (error) {
    logError("[auth] Password reset email failed", error);
    return {
      email,
      success: false,
      error: mapPasswordResetError(error),
    };
  }
}

export async function resetPasswordAction(formData: FormData): Promise<AuthActionResult> {
  const validation = ResetPasswordSchema.safeParse({
    confirmPassword: getFormValue(formData, "confirmPassword"),
    password: getFormValue(formData, "password"),
    token: getFormValue(formData, "token"),
  });

  if (!validation.success) {
    return {
      success: false,
      error: validation.error.issues[0]?.message ?? "auth.passwordReset.unavailable",
    };
  }

  const headerStore = await headers();
  const isAllowed = await checkPasswordResetConsumeRateLimit({
    headers: headerStore,
    token: validation.data.token,
  });
  if (!isAllowed) {
    return {
      success: false,
      error: "auth.passwordReset.unavailable",
    };
  }

  try {
    const result = await resetPasswordWithToken({
      password: validation.data.password,
      token: validation.data.token,
    });

    if (result.status === "reset") {
      return {
        success: true,
        message: "auth.passwordReset.success",
      };
    }

    return {
      success: false,
      error:
        result.status === "expired"
          ? "auth.passwordReset.expiredToken"
          : "auth.passwordReset.invalidToken",
    };
  } catch (error) {
    logError("[auth] Password reset failed", error);
    return {
      success: false,
      error: "auth.passwordReset.unavailable",
    };
  }
}

export async function resendVerificationEmailAction(formData: FormData): Promise<AuthActionResult> {
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
  const headerStore = await headers();

  const isResendAllowed = await checkVerificationResendRequestRateLimit({
    email,
    headers: headerStore,
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
    headers: headerStore,
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
