/**
 * Girişten ve normal masaüstü açılışından sonraki varsayılan hedef. Açıkça
 * verilmiş güvenli deep linkler korunur; yalnız hedef yoksa Home açılır.
 */
export const DEFAULT_AUTH_REDIRECT_PATH = "/home";

/**
 * Girişten sonra dönülmesine **izin verilen** yol önekleri.
 *
 * Bu bir güvenlik sınırı: liste dışındaki her hedef sessizce varsayılana düşer,
 * böylece `?callbackUrl=` ile açık yönlendirme yapılamaz. `/channels` listede
 * kalıyor çünkü dolaşımdaki eski bağlantılar (bildirim, e-posta, yer imi) hâlâ
 * oraya işaret ediyor ve oradan `/messages`'a yönleniyor; listeden çıkarmak o
 * bağlantıları giriş ekranında varsayılana düşürürdü.
 */
const SAFE_AUTH_REDIRECT_PREFIXES = [
  "/home",
  "/messages",
  "/channels",
  "/settings",
  "/invite",
] as const;
const SAFE_AUTH_REDIRECT_EXACT_PATHS = [
  "/desktop/oauth/complete",
  "/mobile/oauth/complete",
] as const;
const URL_SCHEME_PATTERN = /^[a-zA-Z][a-zA-Z\d+.-]*:/;

export function getSafeAuthRedirectPath(
  value: unknown,
  fallback = DEFAULT_AUTH_REDIRECT_PATH,
): string {
  if (typeof value !== "string") {
    return fallback;
  }

  const rawValue = value.trim();

  if (
    !rawValue ||
    rawValue.startsWith("//") ||
    rawValue.includes("\\") ||
    URL_SCHEME_PATTERN.test(rawValue)
  ) {
    return fallback;
  }

  try {
    const parsedUrl = new URL(rawValue, "https://whispr.local");

    if (parsedUrl.origin !== "https://whispr.local") {
      return fallback;
    }

    if (!isSafeAuthRedirectPath(parsedUrl.pathname)) {
      return fallback;
    }

    return `${parsedUrl.pathname}${parsedUrl.search}${parsedUrl.hash}`;
  } catch {
    return fallback;
  }
}

function isSafeAuthRedirectPath(pathname: string): boolean {
  const exactPath = pathname as (typeof SAFE_AUTH_REDIRECT_EXACT_PATHS)[number];
  if (SAFE_AUTH_REDIRECT_EXACT_PATHS.includes(exactPath)) {
    return true;
  }

  return SAFE_AUTH_REDIRECT_PREFIXES.some((prefix) => {
    return pathname === prefix || pathname.startsWith(`${prefix}/`);
  });
}
