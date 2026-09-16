import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import {
  expireAuthSessionCookies,
  getAuthSessionCookieConfig,
  isAuthSessionCookieName,
} from "@/lib/auth/session-cookies";
import { WHISPR_REQUEST_PATHNAME_HEADER } from "@/lib/request-context";

const CSRF_PROTECTED_API_PREFIXES = ["/api/v1", "/api/e2e"] as const;
const UNSAFE_METHODS = new Set(["DELETE", "PATCH", "POST", "PUT"]);

function createNonce() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

function getOrigin(value: string | undefined) {
  if (!value?.trim()) {
    return null;
  }

  try {
    return new URL(value.trim()).origin;
  } catch {
    return null;
  }
}

function unique(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter(Boolean))) as string[];
}

function getAllowedRequestOrigins(requestOrigin: string) {
  return unique([
    requestOrigin,
    getOrigin(process.env.APP_URL),
    getOrigin(process.env.AUTH_URL),
    getOrigin(process.env.NEXTAUTH_URL),
  ]);
}

function isCsrfProtectedApiPath(pathname: string) {
  return CSRF_PROTECTED_API_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function isSameAllowedOrigin(value: string | null, allowedOrigins: string[]) {
  const origin = getOrigin(value ?? undefined);
  return Boolean(origin && allowedOrigins.includes(origin));
}

export function isMutatingApiRequestAllowed({
  allowedOrigins,
  authorizationHeader,
  method,
  originHeader,
  pathname,
  refererHeader,
  requestOrigin,
  secFetchSite,
}: {
  allowedOrigins?: string[];
  authorizationHeader?: string | null;
  method: string;
  originHeader?: string | null;
  pathname: string;
  refererHeader?: string | null;
  requestOrigin: string;
  secFetchSite?: string | null;
}) {
  if (!isCsrfProtectedApiPath(pathname) || !UNSAFE_METHODS.has(method.toUpperCase())) {
    return true;
  }

  const isMobileApiPath = pathname.startsWith("/api/v1/mobile/");
  const isPublicMobileAuthPath = pathname.startsWith("/api/v1/mobile/auth/");
  if (
    isMobileApiPath &&
    (isPublicMobileAuthPath || /^Bearer\s+\S+$/iu.test(authorizationHeader?.trim() ?? ""))
  ) {
    // Native auth endpoints have no ambient cookie authority; every other
    // mobile mutation must present the Bearer credential its route validates.
    return true;
  }

  if (secFetchSite?.toLowerCase() === "cross-site") {
    return false;
  }

  const origins = allowedOrigins ?? [requestOrigin];
  if (originHeader) {
    return isSameAllowedOrigin(originHeader, origins);
  }

  if (refererHeader) {
    return isSameAllowedOrigin(refererHeader, origins);
  }

  return false;
}

export function buildContentSecurityPolicy(
  nonce: string,
  env: Record<string, string | undefined> = process.env,
) {
  const isDevelopment = env.NODE_ENV !== "production";
  const shouldUpgradeInsecureRequests =
    !isDevelopment && getAuthSessionCookieConfig(env).secureCookie;
  const appOrigins = unique([
    getOrigin(env.APP_URL),
    getOrigin(env.AUTH_URL),
    getOrigin(env.NEXTAUTH_URL),
  ]);
  const liveKitOrigins = unique([
    getOrigin(env.LIVEKIT_URL),
    getOrigin(env.NEXT_PUBLIC_LIVEKIT_URL),
  ]);

  const directives = {
    "base-uri": ["'self'"],
    "connect-src": unique([
      "'self'",
      // Remote pages also carry this CSP inside Tauri. Permit its fixed IPC
      // transports without opening arbitrary local/network destinations.
      "ipc:",
      "http://ipc.localhost",
      "https://ipc.localhost",
      ...appOrigins,
      ...liveKitOrigins,
      "https://api.giphy.com",
      "https://*.giphy.com",
      "https://*.livekit.cloud",
      "https://livekit.io",
      "https://integrations.livekit.io",
      "https://*.ufs.sh",
      "https://*.uploadthing.com",
      "https://challenges.cloudflare.com",
      "wss://*.livekit.cloud",
      ...(isDevelopment
        ? ["http://localhost:*", "http://127.0.0.1:*", "ws://localhost:*", "ws://127.0.0.1:*"]
        : []),
    ]),
    "default-src": ["'self'"],
    "font-src": ["'self'", "data:"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
    "frame-src": ["'self'", "https://challenges.cloudflare.com"],
    "img-src": [
      "'self'",
      "blob:",
      "data:",
      "https://*.giphy.com",
      "https://*.googleusercontent.com",
      "https://*.ufs.sh",
      "https://*.uploadthing.com",
      "https://avatars.githubusercontent.com",
    ],
    "media-src": ["'self'", "blob:", "data:", "https://*.ufs.sh", "https://*.uploadthing.com"],
    "object-src": ["'none'"],
    "script-src": unique([
      "'self'",
      ...(isDevelopment
        ? ["'unsafe-inline'", "'unsafe-eval'"]
        : [`'nonce-${nonce}'`, "'strict-dynamic'"]),
      // LiveKit Krisp uses a WASM-backed blob AudioWorklet/Worker for local noise filtering.
      // Keep this scoped to script execution primitives instead of broadly relaxing the policy.
      "'wasm-unsafe-eval'",
      "blob:",
      "https://challenges.cloudflare.com",
    ]),
    "style-src": ["'self'", "'unsafe-inline'"],
    "worker-src": ["'self'", "blob:"],
    ...(shouldUpgradeInsecureRequests ? { "upgrade-insecure-requests": [] } : {}),
  };

  return Object.entries(directives)
    .map(([key, values]) => (values.length > 0 ? `${key} ${values.join(" ")}` : key))
    .join("; ");
}

function attachSecurityHeaders(response: NextResponse, cspHeader: string, nonce: string) {
  response.headers.set("Content-Security-Policy", cspHeader);
  response.headers.set("x-nonce", nonce);
  return response;
}

function isProtectedRoute(pathname: string): boolean {
  // This token-bound OAuth bridge opens in a separate browser for desktop users.
  // It never changes an email; completion requires the original authenticated session.
  if (pathname === "/settings/email-change/google") return false;
  return (
    pathname === "/channels" ||
    pathname.startsWith("/channels/") ||
    pathname === "/settings" ||
    pathname.startsWith("/settings/")
  );
}

export function getAuthRouteRedirectPath({
  hasAuthSecret,
  isAuthenticated,
  pathname,
}: {
  hasAuthSecret: boolean;
  isAuthenticated: boolean;
  pathname: string;
}) {
  if ((!hasAuthSecret || !isAuthenticated) && isProtectedRoute(pathname)) {
    return "/login";
  }

  // A decoded JWT is not proof that its database session is still active.
  // Login/register already use auth() before redirecting; bypassing that check
  // here creates a login -> channels -> login loop for a revoked session.
  return null;
}

export function getAuthTokenDisposition(token: { revoked?: unknown; sub?: unknown } | null) {
  const isAuthenticated = Boolean(
    token && token.revoked !== true && typeof token.sub === "string" && token.sub.length > 0,
  );

  return {
    isAuthenticated,
    // A decoded shell with no identity is not a session. Expire it so `/login`
    // stays anonymous instead of bouncing back to the protected application.
    shouldExpireCookies: Boolean(token) && !isAuthenticated,
  };
}

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  const nonce = createNonce();
  const cspHeader = buildContentSecurityPolicy(nonce);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", cspHeader);
  requestHeaders.set(WHISPR_REQUEST_PATHNAME_HEADER, pathname);

  if (isCsrfProtectedApiPath(pathname)) {
    if (
      !isMutatingApiRequestAllowed({
        allowedOrigins: getAllowedRequestOrigins(request.nextUrl.origin),
        authorizationHeader: request.headers.get("authorization"),
        method: request.method,
        originHeader: request.headers.get("origin"),
        pathname,
        refererHeader: request.headers.get("referer"),
        requestOrigin: request.nextUrl.origin,
        secFetchSite: request.headers.get("sec-fetch-site"),
      })
    ) {
      return attachSecurityHeaders(
        NextResponse.json(
          { error: "Cross-site API request blocked", code: "CSRF_BLOCKED" },
          { status: 403 },
        ),
        cspHeader,
        nonce,
      );
    }

    return attachSecurityHeaders(
      NextResponse.next({
        request: {
          headers: requestHeaders,
        },
      }),
      cspHeader,
      nonce,
    );
  }

  let isAuthenticated = false;
  let shouldExpireCookies = false;
  const sessionCookieNames = request.cookies
    .getAll()
    .map(({ name }) => name)
    .filter((name) => isAuthSessionCookieName(name));
  try {
    if (secret) {
      const sessionCookie = getAuthSessionCookieConfig();
      const token = await getToken({
        cookieName: sessionCookie.cookieName,
        req: request,
        secureCookie: sessionCookie.secureCookie,
        secret,
      });
      const disposition = getAuthTokenDisposition(token);
      isAuthenticated = disposition.isAuthenticated;
      shouldExpireCookies =
        disposition.shouldExpireCookies || (token === null && sessionCookieNames.length > 0);
    }
  } catch {
    // Token parsing failures remain unauthenticated; protected routes fail closed below.
    isAuthenticated = false;
  }

  const authRedirectPath = getAuthRouteRedirectPath({
    hasAuthSecret: Boolean(secret),
    isAuthenticated,
    pathname,
  });
  if (authRedirectPath) {
    const response = NextResponse.redirect(new URL(authRedirectPath, request.nextUrl.origin));
    if (shouldExpireCookies) {
      expireAuthSessionCookies(response.cookies, sessionCookieNames);
    }
    return attachSecurityHeaders(response, cspHeader, nonce);
  }

  if (shouldExpireCookies) {
    // Also remove invalid cookies from the forwarded request: clearing only the
    // response still makes this render's auth() calls decode the stale token.
    for (const name of sessionCookieNames) request.cookies.delete(name);
    requestHeaders.set("cookie", request.cookies.toString());
  }
  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
  if (shouldExpireCookies) {
    expireAuthSessionCookies(response.cookies, sessionCookieNames);
  }
  return attachSecurityHeaders(response, cspHeader, nonce);
}

export const config = {
  matcher: [
    "/api/v1/:path*",
    "/api/e2e/:path*",
    "/((?!monitoring(?:/|$)|api|_next/static|_next/image|favicon.ico|.*\\..*).*)",
  ],
};
