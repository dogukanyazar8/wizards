export type MobileDeepLinkIntent =
  | {
      readonly callbackPath: string;
      readonly token: string;
      readonly type: "auth-handoff";
    }
  | {
      readonly autoAccept: boolean;
      readonly code: string;
      readonly type: "invite";
    }
  | {
      readonly path: string;
      readonly type: "route";
    };

export type MobileDeepLinkRejectionReason =
  | "external-origin"
  | "invalid-auth-handoff"
  | "invalid-invite-code"
  | "invalid-url"
  | "sensitive-query"
  | "unsupported-path";

export type MobileDeepLinkParseResult =
  | {
      readonly intent: MobileDeepLinkIntent;
      readonly ok: true;
    }
  | {
      readonly ok: false;
      readonly reason: MobileDeepLinkRejectionReason;
    };

interface ParseMobileDeepLinkOptions {
  readonly webUrl: string;
}

const WHISPR_SCHEME = "whispr:";
const AUTH_HANDOFF_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;
const INVITE_CODE_PATTERN = /^[A-Za-z0-9_-]{1,96}$/;
const SENSITIVE_QUERY_PARAMS = new Set([
  "access_token",
  "code",
  "email",
  "id_token",
  "password",
  "refresh_token",
  "session",
  "token",
]);
const SAFE_ROUTE_PREFIXES = ["/channels", "/settings", "/server", "/invite"] as const;
const URL_SCHEME_PATTERN = /^[a-zA-Z][a-zA-Z\d+.-]*:/;

export function buildMobileWebSignInUrl(webUrl: string, callbackPath = "/channels/@me"): string {
  return buildMobileWebAuthUrl(webUrl, "/login", callbackPath);
}

export function buildMobileWebRegisterUrl(webUrl: string, callbackPath = "/channels/@me"): string {
  return buildMobileWebAuthUrl(webUrl, "/register", callbackPath);
}

function buildMobileWebAuthUrl(
  webUrl: string,
  pathname: "/login" | "/register",
  callbackPath = "/channels/@me",
): string {
  const safeCallbackPath =
    normalizeSafeMobileRoutePath(callbackPath, "/channels/@me") ?? "/channels/@me";
  const mobileCompletePath = `/mobile/oauth/complete?callbackUrl=${encodeURIComponent(
    safeCallbackPath,
  )}`;
  const url = new URL(pathname, webUrl);
  url.searchParams.set("callbackUrl", mobileCompletePath);
  url.searchParams.set("client", "mobile");
  return url.toString();
}

export function parseMobileDeepLink(
  rawUrl: string,
  options: ParseMobileDeepLinkOptions,
): MobileDeepLinkParseResult {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    return { ok: false, reason: "invalid-url" };
  }

  if (hasSensitiveQuery(parsedUrl)) {
    return { ok: false, reason: "sensitive-query" };
  }

  const path =
    parsedUrl.protocol === WHISPR_SCHEME
      ? getWhisprSchemePath(parsedUrl)
      : getTrustedWebPath(parsedUrl, options.webUrl);

  if (!path) {
    return { ok: false, reason: "external-origin" };
  }

  const authHandoff = parseAuthHandoffIntent(path, parsedUrl.searchParams);
  if (authHandoff) {
    return { intent: authHandoff, ok: true };
  }

  if (isAuthLikePath(path)) {
    return { ok: false, reason: "invalid-auth-handoff" };
  }

  const invite = parseInviteIntent(path, parsedUrl.searchParams);
  if (invite) {
    return { intent: invite, ok: true };
  }

  if (path.startsWith("/invite/")) {
    return { ok: false, reason: "invalid-invite-code" };
  }

  const routePath = normalizeSafeMobileRoutePath(`${path}${parsedUrl.search}`, null);
  if (routePath) {
    return {
      intent: {
        path: routePath,
        type: "route",
      },
      ok: true,
    };
  }

  return { ok: false, reason: "unsupported-path" };
}

export function normalizeSafeMobileRoutePath(
  value: string,
  fallback: string | null = "/channels",
): string | null {
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
    const parsedUrl = new URL(rawValue, "https://whispr.mobile");
    if (parsedUrl.origin !== "https://whispr.mobile") {
      return fallback;
    }

    if (!isSafeMobileRoutePath(parsedUrl.pathname)) {
      return fallback;
    }

    if (hasSensitiveQuery(parsedUrl)) {
      return fallback;
    }

    return `${parsedUrl.pathname}${parsedUrl.search}${parsedUrl.hash}`;
  } catch {
    return fallback;
  }
}

function parseAuthHandoffIntent(
  path: string,
  searchParams: URLSearchParams,
): MobileDeepLinkIntent | null {
  const segments = path.split("/").filter(Boolean);
  const pathToken =
    segments[0] === "oauth" || segments[0] === "auth"
      ? segments[1]
      : segments[0] === "mobile" && segments[1] === "oauth"
        ? (segments[3] ?? segments[2])
        : null;
  const queryToken = searchParams.get("handoff");
  const token = [pathToken, queryToken].find(
    (value): value is string => typeof value === "string" && AUTH_HANDOFF_TOKEN_PATTERN.test(value),
  );

  if (!token) {
    return null;
  }

  const callbackPath = normalizeSafeMobileRoutePath(
    searchParams.get("callbackUrl") ?? "/channels/@me",
    "/channels/@me",
  );

  if (!callbackPath) {
    return null;
  }

  return {
    callbackPath,
    token,
    type: "auth-handoff",
  };
}

function parseInviteIntent(
  path: string,
  searchParams: URLSearchParams,
): MobileDeepLinkIntent | null {
  const segments = path.split("/").filter(Boolean);
  if (segments[0] !== "invite" || !segments[1] || !INVITE_CODE_PATTERN.test(segments[1])) {
    return null;
  }

  const autoAccept = ["1", "true"].includes(
    (searchParams.get("desktop") ?? searchParams.get("mobile") ?? "").toLowerCase(),
  );

  return {
    autoAccept,
    code: segments[1],
    type: "invite",
  };
}

function getWhisprSchemePath(url: URL): string {
  const hostPath = url.hostname ? `/${url.hostname}` : "";
  return `${hostPath}${url.pathname}`.replace(/\/+$/, "") || "/";
}

function getTrustedWebPath(url: URL, webUrl: string): string | null {
  let trustedOrigin: string;

  try {
    trustedOrigin = new URL(webUrl).origin;
  } catch {
    return null;
  }

  if (url.origin !== trustedOrigin) {
    return null;
  }

  return url.pathname.replace(/\/+$/, "") || "/";
}

function hasSensitiveQuery(url: URL): boolean {
  for (const key of url.searchParams.keys()) {
    if (SENSITIVE_QUERY_PARAMS.has(key.toLowerCase())) {
      return true;
    }
  }

  return false;
}

function isAuthLikePath(path: string): boolean {
  return (
    path === "/oauth" ||
    path.startsWith("/oauth/") ||
    path === "/auth" ||
    path.startsWith("/auth/") ||
    path.startsWith("/mobile/oauth")
  );
}

function isSafeMobileRoutePath(pathname: string): boolean {
  return SAFE_ROUTE_PREFIXES.some((prefix) => {
    return pathname === prefix || pathname.startsWith(`${prefix}/`);
  });
}
