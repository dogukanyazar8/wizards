export const DEFAULT_AUTH_REDIRECT_PATH = "/channels";

const SAFE_AUTH_REDIRECT_PREFIXES = ["/channels", "/settings", "/invite"] as const;
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
  return SAFE_AUTH_REDIRECT_PREFIXES.some((prefix) => {
    return pathname === prefix || pathname.startsWith(`${prefix}/`);
  });
}
