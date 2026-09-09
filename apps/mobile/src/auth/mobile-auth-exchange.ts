import {
  MobileAuthExchangeResponseSchema,
  MobileAuthForgotPasswordResponseSchema,
  MobileAuthGoogleLoginResponseSchema,
  MobileAuthPasswordLoginResponseSchema,
  MobileAuthTwoFactorResponseSchema,
  MobileAuthRegisterResponseSchema,
  MobileAuthRefreshResponseSchema,
  MobileAuthVerificationEmailResponseSchema,
  type MobileAuthForgotPasswordResponse,
  type MobileAuthRegisterResponse,
  type MobileAuthVerificationEmailResponse,
  type MobileSessionSnapshotPayload,
} from "@wizards/types";

import type { MobileApiClient } from "../api/mobile-api-client";

export const MOBILE_AUTH_EXCHANGE_ENDPOINT = "/api/v1/mobile/auth/exchange";
export const MOBILE_AUTH_GOOGLE_ENDPOINT = "/api/v1/mobile/auth/google";
export const MOBILE_AUTH_FORGOT_PASSWORD_ENDPOINT = "/api/v1/mobile/auth/forgot-password";
export const MOBILE_AUTH_LOGIN_ENDPOINT = "/api/v1/mobile/auth/login";
export const MOBILE_AUTH_REGISTER_ENDPOINT = "/api/v1/mobile/auth/register";
export const MOBILE_AUTH_REFRESH_ENDPOINT = "/api/v1/mobile/auth/refresh";
export const MOBILE_AUTH_REVOKE_ENDPOINT = "/api/v1/mobile/auth/revoke";
export const MOBILE_AUTH_VERIFICATION_EMAIL_ENDPOINT = "/api/v1/mobile/auth/verification-email";
export const MOBILE_AUTH_TWO_FACTOR_ENDPOINT = "/api/v1/mobile/auth/two-factor";
export const MOBILE_AUTH_BACKUP_CODE_ENDPOINT = "/api/v1/mobile/auth/backup-code";

/**
 * SPEC-GIRIS-KAYIT §4.2 — parola girişi iki sonuçtan birini döndürür (paket kararı K2):
 * oturum ya da ikinci adım için kısa ömürlü bir challenge. Parola challenge yolunda ikinci kez
 * taşınmaz; kod ayrı uca, yalnız challenge kimliğiyle gider.
 */
export type MobilePasswordSignInOutcome =
  | { readonly kind: "session"; readonly session: MobileSessionSnapshotPayload }
  | { readonly challengeId: string; readonly kind: "two-factor-required" };

export async function signInMobileWithPassword(
  client: MobileApiClient,
  input: {
    email: string;
    password: string;
    twoFactorCode?: string;
  },
): Promise<MobilePasswordSignInOutcome> {
  const payload = await client.requestJson<unknown>(MOBILE_AUTH_LOGIN_ENDPOINT, {
    body: { ...input, supportsTwoFactorChallenge: true },
    method: "POST",
  });
  const response = MobileAuthPasswordLoginResponseSchema.parse(payload);

  if ("session" in response) {
    return { kind: "session", session: response.session };
  }

  return { challengeId: response.challengeId, kind: "two-factor-required" };
}

/** SPEC §4.2 — altı haneli kod. */
export async function completeMobileTwoFactor(
  client: MobileApiClient,
  input: { challengeId: string; code: string; rememberDevice?: boolean },
): Promise<MobileSessionSnapshotPayload> {
  const payload = await client.requestJson<unknown>(MOBILE_AUTH_TWO_FACTOR_ENDPOINT, {
    body: input,
    method: "POST",
  });

  return MobileAuthTwoFactorResponseSchema.parse(payload).session;
}

/** SPEC §4.3 — tek kullanımlık yedek kod. */
export async function completeMobileBackupCode(
  client: MobileApiClient,
  input: { backupCode: string; challengeId: string },
): Promise<MobileSessionSnapshotPayload> {
  const payload = await client.requestJson<unknown>(MOBILE_AUTH_BACKUP_CODE_ENDPOINT, {
    body: input,
    method: "POST",
  });

  return MobileAuthTwoFactorResponseSchema.parse(payload).session;
}

export async function signInMobileWithGoogleIdToken(
  client: MobileApiClient,
  input: {
    idToken: string;
    locale?: "en" | "tr";
    twoFactorCode?: string;
  },
): Promise<MobileSessionSnapshotPayload> {
  const payload = await client.requestJson<unknown>(MOBILE_AUTH_GOOGLE_ENDPOINT, {
    body: input,
    method: "POST",
  });

  return MobileAuthGoogleLoginResponseSchema.parse(payload).session;
}

export async function registerMobileWithPassword(
  client: MobileApiClient,
  input: {
    /** SPEC §4.4/1 — `Ad Soyad`. Eski sürümler göndermiyor, sunucu kullanıcı adına düşüyor. */
    displayName?: string;
    confirmPassword: string;
    email: string;
    locale?: "en" | "tr";
    password: string;
    username: string;
  },
): Promise<MobileAuthRegisterResponse> {
  const payload = await client.requestJson<unknown>(MOBILE_AUTH_REGISTER_ENDPOINT, {
    body: input,
    method: "POST",
  });

  return MobileAuthRegisterResponseSchema.parse(payload);
}

export async function requestMobilePasswordReset(
  client: MobileApiClient,
  input: {
    email: string;
    locale?: "en" | "tr";
  },
): Promise<MobileAuthForgotPasswordResponse> {
  const payload = await client.requestJson<unknown>(MOBILE_AUTH_FORGOT_PASSWORD_ENDPOINT, {
    body: input,
    method: "POST",
  });

  return MobileAuthForgotPasswordResponseSchema.parse(payload);
}

export async function requestMobileVerificationEmail(
  client: MobileApiClient,
  input: {
    email: string;
    locale?: "en" | "tr";
  },
): Promise<MobileAuthVerificationEmailResponse> {
  const payload = await client.requestJson<unknown>(MOBILE_AUTH_VERIFICATION_EMAIL_ENDPOINT, {
    body: input,
    method: "POST",
  });

  return MobileAuthVerificationEmailResponseSchema.parse(payload);
}

export async function exchangeMobileAuthHandoff(
  client: MobileApiClient,
  input: {
    callbackPath: string;
    handoffToken: string;
  },
): Promise<MobileSessionSnapshotPayload> {
  const payload = await client.requestJson<unknown>(MOBILE_AUTH_EXCHANGE_ENDPOINT, {
    body: input,
    method: "POST",
  });

  return MobileAuthExchangeResponseSchema.parse(payload).session;
}

export async function refreshMobileAuthSession(
  client: MobileApiClient,
  input: {
    refreshToken: string;
  },
): Promise<MobileSessionSnapshotPayload> {
  const payload = await client.requestJson<unknown>(MOBILE_AUTH_REFRESH_ENDPOINT, {
    body: input,
    method: "POST",
  });

  return MobileAuthRefreshResponseSchema.parse(payload).session;
}

export async function revokeMobileAuthSession(
  client: MobileApiClient,
  input: {
    refreshToken: string | null;
  },
): Promise<void> {
  await client.requestJson<void>(MOBILE_AUTH_REVOKE_ENDPOINT, {
    body: {
      refreshToken: input.refreshToken,
    },
    method: "POST",
  });
}
