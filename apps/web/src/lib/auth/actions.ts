"use server";

import { headers } from "next/headers";
import { normalizeAuthEmail, signIn, signOut } from "@/auth";
import { DEFAULT_WIZARDS_THEME } from "@/lib/appearance";
import { normalizeAppLocale } from "@/lib/locale";
import { persistUserLocale } from "@/lib/locale/persistence";
import { logError } from "@/lib/logger";
import {
  EmailVerificationError,
  sendRegistrationAttemptEmail,
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
import { resolveRegistrationConflict } from "@/lib/auth/registration-policy";
import { rollbackUnverifiedUser } from "@/lib/auth/registration-compensation";
import { resolveAccountSuspension } from "@/lib/auth/account-suspension";
import { submitEmailVerificationCode } from "@/lib/auth/email-verification-code";
import { loginChallengeStore } from "@/lib/auth/login-challenge";
import { verifyLoginCredentials } from "@/lib/auth/login-credentials";
import { createLoginLockout } from "@/lib/auth/login-lockout";
import { createLoginProof } from "@/lib/auth/login-proof";
import type { AuthStatusId } from "@/lib/auth/status-catalog";
import { LOGIN_FAILED_MESSAGE_KEY } from "@/lib/auth/login-errors";
import {
  checkLoginRequestRateLimit,
  checkPasswordResetConsumeRateLimit,
  checkPasswordResetRequestRateLimit,
  checkRegistrationRequestRateLimit,
  checkVerificationResendRequestRateLimit,
  checkVerificationSendRequestRateLimit,
  getPasswordResetResendRetryAfterMs,
  getVerificationResendRetryAfterMs,
} from "@/lib/auth/request-rate-limits";
import { resolveTrustedProxyClientIp, type ClientIpHeaderSource } from "@/lib/security/client-ip";
import { Prisma, prisma } from "@wizards/db";
import {
  EmailVerificationCodeSchema,
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
  /**
   * SPEC-GIRIS-KAYIT §7 durum kimliği. Ekran hangi gösterim seviyesini (alan içi · bant · blok)
   * kullanacağını `AUTH_STATUS_CATALOG` üstünden buradan okur; `error` yalnız geriye uyumlu
   * i18n anahtarıdır.
   */
  status?: AuthStatusId;
  /** SPEC §8/1 — `3 deneme kaldı`. */
  attemptsLeft?: number;
  /** SPEC §7/2 ve §7/9 — `Kalan süre 14:32`, `Yeni kod · 01:58`. */
  retryAfterMs?: number;
  /** SPEC §7/10 — `Referans · WSP-40219`; vaka yoksa alan hiç gelmez. */
  reference?: string;
  /** K2 — iki adımlı doğrulama gerekiyorsa `/login/two-factor` bunu taşır. */
  challengeId?: string;
  twoFactorRequired?: boolean;
  /** SPEC §4.7 — `{count} cihazda oturum kapatıldı · {date} · {time}` bandının verisi. */
  signedOutAt?: string;
  signedOutDeviceCount?: number;
  /** SPEC §4.7 — `Bağlantıyı yeniden gönderdik` success bandını açar. */
  resent?: boolean;
}

function getFormValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function getAuthActionRequestUrl(headerStore: ClientIpHeaderSource) {
  const host = headerStore.get("host")?.split(",")[0]?.trim();
  if (!host) {
    // Missing request identity must never make a public E2E token acceptable.
    return "https://invalid.invalid/";
  }

  const forwardedProtocol = headerStore.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const protocol = forwardedProtocol === "http" ? "http" : "https";
  return `${protocol}://${host}/`;
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
    displayName: getFormValue(formData, "displayName") || getFormValue(formData, "username"),
    email: normalizeAuthEmail(getFormValue(formData, "email")),
    username: getFormValue(formData, "username"),
    password: getFormValue(formData, "password"),
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
      resolveTrustedProxyClientIp(headerStore) ?? undefined,
      { requestUrl: getAuthActionRequestUrl(headerStore) },
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

  const registrationConflict = resolveRegistrationConflict({
    emailExists: Boolean(existingEmail),
    usernameExists: Boolean(existingUsername),
  });

  if (registrationConflict === "username_taken") {
    return {
      success: false,
      error: "auth.register.usernameTaken",
      status: "usernameTaken",
    };
  }

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

    try {
      await sendRegistrationAttemptEmail(existingEmail, existingEmail.locale ?? locale);
    } catch (error) {
      // Delivery health must not reveal whether the address belongs to a user.
      logError("[auth] Registration-attempt email failed", error);
    }

    return {
      email,
      success: true,
      message: "auth.register.checkEmailMessage",
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
          displayName: validation.data.displayName,
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
        email,
        success: true,
        message: "auth.register.checkEmailMessage",
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
    turnstileToken: getFormValue(formData, "turnstileToken"),
  });

  if (!validation.success) {
    return {
      success: false,
      error: validation.error.issues[0]?.message ?? "auth.login.alertUnavailable",
    };
  }

  const { email, password, rememberMe } = validation.data;
  /*
   * Geçici köprü (Ş4 kaldıracak).
   *
   * K2 ile kod ayrı ekrandan, challenge kimliğiyle geliyor. Ayrı ekran Ş4'te kurulana kadar
   * bugünkü giriş ekranı kodu aynı formda gönderebiliyor; kod geldiyse eski tek atışlı yol
   * çalışır, gelmediyse challenge üretilir.
   */
  const legacyTwoFactorCode = getFormValue(formData, "twoFactorCode").trim().slice(0, 64);
  const redirectTo = getSafeAuthRedirectPath(getFormValue(formData, "callbackUrl"));
  const headerStore = await headers();
  const clientIp = resolveTrustedProxyClientIp(headerStore) ?? null;
  const userAgent = headerStore.get("user-agent");
  const lockout = createLoginLockout();
  const isAllowed = await checkLoginRequestRateLimit({
    email,
    headers: headerStore,
  });
  if (!isAllowed) {
    return {
      success: false,
      error: "auth.login.rateLimited",
      status: "rateLimit",
    };
  }

  /*
   * Kilit kontrolü paroladan **önce**: kilitli hesabın parolası hiç karşılaştırılmaz, hem
   * gereksiz bcrypt maliyeti ödenmez hem de kilit süresince doğru parola da geçmez (SPEC §7/2).
   */
  const lockState = await lockout.peek({ clientIp, email });

  if (lockState.status === "locked") {
    return {
      success: false,
      error: "auth.login.alertUnavailable",
      retryAfterMs: lockState.retryAfterMs,
      status: "accountLocked",
    };
  }

  try {
    await verifyTurnstileToken(validation.data.turnstileToken, clientIp ?? undefined, {
      expectedAction: "login",
      requestUrl: getAuthActionRequestUrl(headerStore),
    });
  } catch (error) {
    return {
      success: false,
      error: getTurnstileErrorMessageKey(error),
      status: "network",
    };
  }

  const credentialResult = await verifyLoginCredentials({ email, password });

  if (credentialResult.status === "invalid") {
    const failure = await lockout.registerFailure({ clientIp, email });

    if (failure.status === "locked") {
      return {
        success: false,
        error: "auth.login.alertUnavailable",
        retryAfterMs: failure.retryAfterMs,
        status: "accountLocked",
      };
    }

    return {
      success: false,
      error: LOGIN_FAILED_MESSAGE_KEY,
      attemptsLeft: failure.attemptsLeft,
      status: "credentials",
    };
  }

  if (credentialResult.status === "blocked") {
    /*
     * Yasaklı hesap SPEC §7/10'un askı bloğudur. Silinmiş hesap **değil** — o, adresin var
     * olduğunu sızdırmamak için jenerik kimlik hatası olarak döner.
     */
    if (!credentialResult.user.isBanned) {
      return {
        success: false,
        error: LOGIN_FAILED_MESSAGE_KEY,
        status: "credentials",
      };
    }

    const suspension = await resolveAccountSuspension(credentialResult.user);

    return {
      success: false,
      error: "auth.login.alertUnavailable",
      status: "accountSuspended",
      ...(suspension.reference ? { reference: suspension.reference } : {}),
    };
  }

  if (credentialResult.status === "unverified") {
    /*
     * Bugünkü davranış korunuyor: kullanıcıya jenerik kimlik hatası döner. SPEC §13'te
     * "e-posta doğrulanmamış" için bir giriş ekranı metni yok; `email` alanı Ş6'nın doğrulama
     * ekranına yönlendirebilmesi için taşınıyor.
     */
    return {
      email,
      success: false,
      error: LOGIN_FAILED_MESSAGE_KEY,
      status: "credentials",
    };
  }

  const user = credentialResult.user;

  if (user.twoFactorEnabled && !legacyTwoFactorCode) {
    try {
      const challengeId = await loginChallengeStore.issue({
        clientIp,
        email,
        redirectTo,
        rememberMe,
        userAgent,
        userId: user.id,
      });

      return {
        success: false,
        challengeId,
        error: LOGIN_FAILED_MESSAGE_KEY,
        twoFactorRequired: true,
      };
    } catch (error) {
      logError("[auth] Two-factor challenge unavailable", error);
      return {
        success: false,
        error: "auth.login.alertUnavailable",
      };
    }
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
      twoFactorCode: legacyTwoFactorCode,
    });

    await lockout.reset({ clientIp, email });

    return { success: true };
  } catch (error) {
    if (error instanceof AuthError) {
      if (error.type === "CredentialsSignin") {
        /*
         * Parola bu noktada zaten doğrulanmıştı; buraya düşmenin gerçekçi tek sebebi yanlış
         * iki adımlı kod (geçici köprü dalı). Sayaç beslenir, yoksa kod denemesi sınırsız olur.
         */
        const failure = await lockout.registerFailure({ clientIp, email });

        if (failure.status === "locked") {
          return {
            success: false,
            error: "auth.login.alertUnavailable",
            retryAfterMs: failure.retryAfterMs,
            status: "accountLocked",
          };
        }

        return {
          success: false,
          error: LOGIN_FAILED_MESSAGE_KEY,
          attemptsLeft: failure.attemptsLeft,
          status: "credentials",
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
    turnstileToken: getFormValue(formData, "turnstileToken"),
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
  const isAllowed = await checkPasswordResetRequestRateLimit({
    email,
    headers: headerStore,
  });

  if (!isAllowed) {
    /*
     * SPEC §4.7 — bağlantının yerini geri sayım pill'i alır. Kalan süre sunucudan okunuyor
     * (Redis penceresinin en eski kaydından), böylece sayfa yenilense de doğru kalıyor ve
     * istemci saatine bağlı değil.
     */
    return {
      success: false,
      email,
      error: "auth.forgot.rateLimited",
      retryAfterMs: await getPasswordResetResendRetryAfterMs({ email, headers: headerStore }),
      status: "rateLimit",
    };
  }

  /*
   * Başarıda da sayaç dönüyor: istek kaydı az önce yazıldığı için pencerede duruyor ve pill
   * hemen `00:58`den saymaya başlıyor.
   */
  const genericSuccess = {
    email,
    success: true,
    message: "auth.forgot.genericSuccess",
    retryAfterMs: await getPasswordResetResendRetryAfterMs({ email, headers: headerStore }),
  } satisfies AuthActionResult;

  try {
    await verifyTurnstileToken(
      validation.data.turnstileToken,
      resolveTrustedProxyClientIp(headerStore) ?? undefined,
      {
        expectedAction: "forgot-password",
        requestUrl: getAuthActionRequestUrl(headerStore),
      },
    );
  } catch (error) {
    return {
      success: false,
      error: getTurnstileErrorMessageKey(error),
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
      /* SPEC §5 istek özeti — cihaz ve konum yalnız bu isteğin başlıklarından türer. */
      { headers: headerStore },
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
    turnstileToken: getFormValue(formData, "turnstileToken"),
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
    await verifyTurnstileToken(
      validation.data.turnstileToken,
      resolveTrustedProxyClientIp(headerStore) ?? undefined,
      {
        expectedAction: "reset-password",
        requestUrl: getAuthActionRequestUrl(headerStore),
      },
    );
  } catch (error) {
    return {
      success: false,
      error: getTurnstileErrorMessageKey(error),
    };
  }

  try {
    const result = await resetPasswordWithToken({
      password: validation.data.password,
      token: validation.data.token,
    });

    if (result.status === "reset") {
      /*
       * SPEC §4.7 kapanış ekranı `3 cihazda oturum kapatıldı · 27.08.2026 · 11:24` bandını
       * gerçek sayıyla yazar. Sayı sıfırsa Ş6 bandı hiç göstermez.
       */
      return {
        success: true,
        message: "auth.passwordReset.success",
        signedOutAt: result.signedOutAt.toISOString(),
        signedOutDeviceCount: result.signedOutDeviceCount,
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
  const validation = ForgotPasswordSchema.pick({ email: true }).safeParse({
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

/**
 * SPEC-GIRIS-KAYIT §4.5 — alti haneli kodun dogrulanmasi (paket karari K3).
 *
 * Kod `userId`'ye bagli ve bes denemede iptal oluyor; adres uzerinden numaralandirmayi
 * onlemek icin bilinmeyen adres de ayni "kod gecersiz" yanitini alir.
 */
export async function submitEmailVerificationCodeAction(
  formData: FormData,
): Promise<AuthActionResult> {
  const email = normalizeAuthEmail(getFormValue(formData, "email"));
  const validation = EmailVerificationCodeSchema.safeParse({
    code: getFormValue(formData, "code"),
  });

  if (!validation.success) {
    return {
      success: false,
      error: validation.error.issues[0]?.message ?? "validation.verificationCode.invalid",
      status: "codeInvalid",
    };
  }

  const headerStore = await headers();
  const isAllowed = await checkVerificationResendRequestRateLimit({
    email,
    headers: headerStore,
  });

  if (!isAllowed) {
    return {
      success: false,
      error: "auth.register.rateLimited",
      status: "rateLimit",
    };
  }

  const user = await prisma.user.findUnique({
    select: { emailVerified: true, id: true },
    where: { email },
  });

  if (!user) {
    return { success: false, error: "auth.verifyEmail.invalidTitle", status: "codeInvalid" };
  }

  if (user.emailVerified) {
    return { email, success: true, message: "auth.verifyEmail.successTitle" };
  }

  const result = await submitEmailVerificationCode({ code: validation.data.code, userId: user.id });

  if (result.status === "verified") {
    const now = new Date();
    await prisma.user.update({
      data: { emailVerified: true, emailVerifiedAt: now },
      where: { id: user.id },
    });

    return { email, success: true, message: "auth.verifyEmail.successTitle" };
  }

  if (result.status === "invalid") {
    return {
      success: false,
      attemptsLeft: result.attemptsLeft,
      error: "auth.verifyEmail.invalidTitle",
      status: "codeInvalid",
    };
  }

  return { success: false, error: "auth.verifyEmail.expiredTitle", status: "linkExpired" };
}

/**
 * SPEC-GIRIS-KAYIT §4.7 — `Kodu tekrar gönder`.
 *
 * Yanıt her zaman jeneriktir (adres numaralandırılamaz). `resent` bayrağı ekranın success
 * bandını açar; `retryAfterMs` geri sayım pill'ini besler.
 */
export async function resendPasswordResetAction(formData: FormData): Promise<AuthActionResult> {
  const result = await forgotPasswordAction(formData);

  return { ...result, resent: true };
}

/**
 * SPEC-GIRIS-KAYIT §4.5 — `Kodu tekrar gönder` (e-posta doğrulama kodu).
 *
 * Kod, doğrulama e-postasının içinde gidiyor (K3), bu yüzden yeniden gönderme mevcut doğrulama
 * postası yolunu kullanır. Sayaç `Tekrar gönder · 00:42` satırını besler.
 */
export async function resendEmailVerificationCodeAction(
  formData: FormData,
): Promise<AuthActionResult> {
  const email = normalizeAuthEmail(getFormValue(formData, "email"));

  if (!email) {
    return { success: false, error: "validation.email.invalid" };
  }

  const result = await resendVerificationEmailAction(formData);
  const headerStore = await headers();
  const retryAfterMs = await getVerificationResendRetryAfterMs({ email, headers: headerStore });

  if (!result.success) {
    return { ...result, retryAfterMs, status: "rateLimit" };
  }

  return { ...result, retryAfterMs };
}
