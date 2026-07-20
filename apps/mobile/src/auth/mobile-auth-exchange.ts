import {
  MobileAuthExchangeResponseSchema,
  MobileAuthForgotPasswordResponseSchema,
  MobileAuthGoogleLoginResponseSchema,
  MobileAuthPasswordLoginResponseSchema,
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

export async function signInMobileWithPassword(
  client: MobileApiClient,
  input: {
    email: string;
    password: string;
    twoFactorCode?: string;
  },
): Promise<MobileSessionSnapshotPayload> {
  const payload = await client.requestJson<unknown>(MOBILE_AUTH_LOGIN_ENDPOINT, {
    body: input,
    method: "POST",
  });

  return MobileAuthPasswordLoginResponseSchema.parse(payload).session;
}

export async function signInMobileWithGoogleIdToken(
  client: MobileApiClient,
  input: {
    idToken: string;
    locale?: "en" | "tr";
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
