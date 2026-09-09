"use server";

import { headers } from "next/headers";
import { AuthError } from "next-auth";

import { BackupCodeChallengeSchema, TwoFactorChallengeSchema } from "@wizards/types";

import { signIn } from "@/auth";
import { LOGIN_FAILED_MESSAGE_KEY } from "@/lib/auth/login-errors";
import { createLoginProof } from "@/lib/auth/login-proof";
import { getSafeAuthRedirectPath } from "@/lib/auth/redirect";
import { submitBackupCode, submitTwoFactorCode } from "@/lib/auth/two-factor-login";
import type { AuthActionResult } from "@/lib/auth/actions";
import { logError } from "@/lib/logger";
import { resolveTrustedProxyClientIp } from "@/lib/security/client-ip";

/**
 * SPEC-GIRIS-KAYIT §4.2 / §4.3 ekranlarının sunucu eylemleri.
 *
 * İş mantığı `two-factor-login.ts` içinde; burası yalnız istek bağlamını (IP, User-Agent) okur
 * ve doğrulama geçtiyse `signIn`'i tek kullanımlık biletle çağırır. Parola bu yolda hiç
 * görünmez — K2'nin bütün amacı bu.
 */

function getFormValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

type SecondStepOutcome = Awaited<ReturnType<typeof submitTwoFactorCode>>;

async function completeSignIn(
  outcome: Extract<SecondStepOutcome, { status: "ok" }>,
  fallbackRedirect: string,
): Promise<AuthActionResult> {
  let loginProof: string;

  try {
    loginProof = createLoginProof(outcome.email);
  } catch (error) {
    logError("[auth] Login proof unavailable", error);
    return { success: false, error: "auth.login.alertUnavailable" };
  }

  try {
    await signIn("credentials", {
      email: outcome.email,
      loginProof,
      redirectTo: getSafeAuthRedirectPath(outcome.redirectTo || fallbackRedirect),
      twoFactorTicket: outcome.ticket,
    });

    return { success: true };
  } catch (error) {
    if (error instanceof AuthError) {
      return { success: false, error: "auth.login.alertUnavailable" };
    }

    throw error;
  }
}

function mapFailure(outcome: SecondStepOutcome): AuthActionResult {
  if (outcome.status === "accountLocked") {
    return {
      success: false,
      error: "auth.login.alertUnavailable",
      retryAfterMs: outcome.retryAfterMs,
      status: "accountLocked",
    };
  }

  if (outcome.status === "codeInvalid") {
    return {
      success: false,
      error: LOGIN_FAILED_MESSAGE_KEY,
      status: "codeInvalid",
      ...(outcome.attemptsLeft === undefined ? {} : { attemptsLeft: outcome.attemptsLeft }),
    };
  }

  if (outcome.status === "unavailable") {
    return { success: false, error: "auth.login.alertUnavailable" };
  }

  // `challengeExpired`: challenge düştü, kullanıcı giriş ekranından yeniden başlar.
  return { success: false, error: LOGIN_FAILED_MESSAGE_KEY, status: "codeInvalid" };
}

async function readRequestContext() {
  const headerStore = await headers();

  return {
    clientIp: resolveTrustedProxyClientIp(headerStore) ?? null,
    userAgent: headerStore.get("user-agent"),
  };
}

export async function submitTwoFactorCodeAction(formData: FormData): Promise<AuthActionResult> {
  const validation = TwoFactorChallengeSchema.safeParse({
    challengeId: getFormValue(formData, "challengeId"),
    code: getFormValue(formData, "code"),
    rememberDevice: getFormValue(formData, "rememberDevice"),
  });

  if (!validation.success) {
    return {
      success: false,
      error: validation.error.issues[0]?.message ?? "validation.verificationCode.invalid",
      status: "codeInvalid",
    };
  }

  const context = await readRequestContext();
  const outcome = await submitTwoFactorCode(validation.data, context);

  if (outcome.status !== "ok") {
    return mapFailure(outcome);
  }

  return completeSignIn(outcome, getFormValue(formData, "callbackUrl"));
}

export async function submitBackupCodeAction(formData: FormData): Promise<AuthActionResult> {
  const validation = BackupCodeChallengeSchema.safeParse({
    backupCode: getFormValue(formData, "backupCode"),
    challengeId: getFormValue(formData, "challengeId"),
  });

  if (!validation.success) {
    return {
      success: false,
      error: validation.error.issues[0]?.message ?? "validation.backupCode.invalid",
      status: "codeInvalid",
    };
  }

  const context = await readRequestContext();
  const outcome = await submitBackupCode(validation.data, context);

  if (outcome.status !== "ok") {
    return mapFailure(outcome);
  }

  return completeSignIn(outcome, getFormValue(formData, "callbackUrl"));
}
