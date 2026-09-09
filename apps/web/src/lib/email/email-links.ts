/**
 * İşlemsel e-postaların taşıdığı adresler.
 *
 * Paket kararı K1: e-postadaki bağlantılar **gerçek ürün rotalarıdır**. Teslim paketindeki
 * SPEC Türkçe yollar yazıyor (`/dogrula`, `/gizlilik` …) ama üründe böyle rota yok ve bu paket
 * yeni rota/redirect açmıyor; tasarımın geri kalanı birebir uygulanır, yalnız `href` değerleri
 * çalışan sayfalara bakar.
 */

export class EmailConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmailConfigurationError";
  }
}

const APP_URL_KEYS = ["APP_URL", "AUTH_URL", "NEXTAUTH_URL"] as const;

export const EMAIL_PATHS = {
  verifyEmail: "/verify-email",
  resetPassword: "/reset-password",
  privacy: "/privacy",
  terms: "/terms",
  cookies: "/cookies",
  security: "/settings/account/security",
} as const;

function getFirstRequiredEnv(keys: readonly string[], purpose: string) {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) {
      return value;
    }
  }

  throw new EmailConfigurationError(`${keys.join(" or ")} is required for ${purpose}.`);
}

/**
 * `purpose`, çağıran modülün hata metnini koruması içindir: `email-verification.ts` bu hatayı
 * kendi `EmailVerificationError("CONFIGURATION_ERROR", …)` tipine sarar ve mesaj aynen geçer.
 */
export function getEmailAppUrl(purpose = "email delivery") {
  const rawAppUrl = getFirstRequiredEnv(APP_URL_KEYS, purpose);

  try {
    const appUrl = new URL(rawAppUrl);
    if (appUrl.protocol !== "https:" && appUrl.protocol !== "http:") {
      throw new Error("Unsupported protocol");
    }

    return appUrl.origin;
  } catch {
    throw new EmailConfigurationError("APP_URL must be a valid http(s) URL.");
  }
}

function buildUrl(path: string, purpose: string, token?: string) {
  const url = new URL(path, `${getEmailAppUrl(purpose)}/`);
  if (token !== undefined) {
    url.searchParams.set("token", token);
  }

  return url.toString();
}

export function buildVerifyEmailUrl(token: string, purpose = "email verification") {
  return buildUrl(EMAIL_PATHS.verifyEmail, purpose, token);
}

export function buildResetPasswordUrl(token: string, purpose = "password reset") {
  return buildUrl(EMAIL_PATHS.resetPassword, purpose, token);
}

export function buildSecurityUrl(purpose = "email delivery") {
  return buildUrl(EMAIL_PATHS.security, purpose);
}

export type EmailFooterLinks = {
  cookies: string;
  privacy: string;
  terms: string;
};

export function buildFooterLinks(purpose = "email delivery"): EmailFooterLinks {
  return {
    cookies: buildUrl(EMAIL_PATHS.cookies, purpose),
    privacy: buildUrl(EMAIL_PATHS.privacy, purpose),
    terms: buildUrl(EMAIL_PATHS.terms, purpose),
  };
}
