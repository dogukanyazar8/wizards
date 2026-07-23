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
      readonly callType: "video" | "voice";
      readonly conversationId: string;
      readonly fromUserId: string;
      readonly type: "dm-call-answer";
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
export const MOBILE_WEB_OAUTH_START_PATH = "/mobile/oauth/start";
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
const SAFE_ROUTE_PREFIXES = ["/channels", "/settings", "/server", "/invite", "/user"] as const;
const URL_SCHEME_PATTERN = /^[a-zA-Z][a-zA-Z\d+.-]*:/;

export function buildMobileWebSignInUrl(webUrl: string, callbackPath = "/channels/@me"): string {
  return buildMobileWebAuthUrl(webUrl, "/login", callbackPath);
}

export function buildMobileWebRegisterUrl(webUrl: string, callbackPath = "/channels/@me"): string {
  return buildMobileWebAuthUrl(webUrl, "/register", callbackPath);
}

/**
 * Starts the provider OAuth flow on web directly (mirrors the desktop
 * `/desktop/oauth/start` hand-off) instead of dropping the user on the web
 * password form. The web route signs the browser session out first, runs the
 * provider consent screen and then redirects to `/mobile/oauth/complete`, which
 * mints the single-use handoff token delivered back over `whispr://oauth/<token>`.
 */
export function buildMobileWebSocialSignInUrl(
  webUrl: string,
  provider: "google",
  callbackPath = "/channels/@me",
): string {
  const safeCallbackPath =
    normalizeSafeMobileRoutePath(callbackPath, "/channels/@me") ?? "/channels/@me";
  const url = new URL(MOBILE_WEB_OAUTH_START_PATH, webUrl);
  url.searchParams.set("callbackUrl", safeCallbackPath);
  url.searchParams.set("provider", provider);
  url.searchParams.set("client", "mobile");
  return url.toString();
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

  const dmCallAnswer = parseDMCallAnswerIntent(path, parsedUrl.searchParams);
  if (dmCallAnswer) {
    return { intent: dmCallAnswer, ok: true };
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

/**
 * Answer taps on the Android CallStyle notification arrive as
 * `whispr://channels/@me/<conversationId>?call=answer&from=<userId>&type=voice`.
 * Decline never reaches JS — the native broadcast receiver handles it. Anything
 * malformed falls through to the plain DM route intent, so a bad link still
 * opens the conversation instead of failing outright.
 */
function parseDMCallAnswerIntent(
  path: string,
  searchParams: URLSearchParams,
): MobileDeepLinkIntent | null {
  if (searchParams.get("call") !== "answer") {
    return null;
  }

  const segments = path.split("/").filter(Boolean);
  if (segments[0] !== "channels" || segments[1] !== "@me" || !segments[2]) {
    return null;
  }

  const fromUserId = searchParams.get("from");
  if (!fromUserId) {
    return null;
  }

  return {
    callType: searchParams.get("type") === "video" ? "video" : "voice",
    conversationId: decodeSafeSegment(segments[2]),
    fromUserId,
    type: "dm-call-answer",
  };
}

function decodeSafeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
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
