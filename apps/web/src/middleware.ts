import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

const REDIRECT_IF_AUTHENTICATED = new Set(["/login", "/register"]);
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
  method,
  originHeader,
  pathname,
  refererHeader,
  requestOrigin,
  secFetchSite,
}: {
  allowedOrigins?: string[];
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

  return true;
}

function buildContentSecurityPolicy(nonce: string) {
  const isDevelopment = process.env.NODE_ENV !== "production";
  const appOrigins = unique([
    getOrigin(process.env.APP_URL),
    getOrigin(process.env.AUTH_URL),
    getOrigin(process.env.NEXTAUTH_URL),
  ]);
  const liveKitOrigins = unique([
    getOrigin(process.env.LIVEKIT_URL),
    getOrigin(process.env.NEXT_PUBLIC_LIVEKIT_URL),
  ]);

  const directives = {
    "base-uri": ["'self'"],
    "connect-src": unique([
      "'self'",
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
        ? [
            "http://localhost:*",
            "http://127.0.0.1:*",
            "ws://localhost:*",
            "ws://127.0.0.1:*",
          ]
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
      "https://media*.giphy.com",
    ],
    "media-src": [
      "'self'",
      "blob:",
      "data:",
      "https://*.ufs.sh",
      "https://*.uploadthing.com",
    ],
    "object-src": ["'none'"],
    "script-src": unique([
      "'self'",
      `'nonce-${nonce}'`,
      ...(isDevelopment ? ["'unsafe-eval'"] : ["'strict-dynamic'"]),
      // LiveKit Krisp uses a WASM-backed blob AudioWorklet/Worker for local noise filtering.
      // Keep this scoped to script execution primitives instead of broadly relaxing the policy.
      "'wasm-unsafe-eval'",
      "blob:",
      "https://challenges.cloudflare.com",
    ]),
    "style-src": ["'self'", "'unsafe-inline'"],
    "worker-src": ["'self'", "blob:"],
    ...(isDevelopment ? {} : { "upgrade-insecure-requests": [] }),
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
  return (
    pathname === "/channels" ||
    pathname.startsWith("/channels/") ||
    pathname === "/settings" ||
    pathname.startsWith("/settings/")
  );
}

function getSessionCookieConfig() {
  const secureCookie = process.env.NODE_ENV === "production";

  return {
    cookieName: secureCookie
      ? "__Secure-authjs.session-token"
      : "authjs.session-token",
    secureCookie,
  };
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  const nonce = createNonce();
  const cspHeader = buildContentSecurityPolicy(nonce);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", cspHeader);

  if (isCsrfProtectedApiPath(pathname)) {
    if (
      !isMutatingApiRequestAllowed({
        allowedOrigins: getAllowedRequestOrigins(request.nextUrl.origin),
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
  try {
    if (secret) {
      const sessionCookie = getSessionCookieConfig();
      const token = await getToken({
        cookieName: sessionCookie.cookieName,
        req: request,
        secureCookie: sessionCookie.secureCookie,
        secret,
      });
      isAuthenticated = Boolean(token);
    }
  } catch {
    // In development or if secret is not available, allow request through
    isAuthenticated = false;
  }

  if (!isAuthenticated && isProtectedRoute(pathname)) {
    return attachSecurityHeaders(
      NextResponse.redirect(new URL("/login", request.nextUrl.origin)),
      cspHeader,
      nonce,
    );
  }

  if (isAuthenticated && REDIRECT_IF_AUTHENTICATED.has(pathname)) {
    return attachSecurityHeaders(
      NextResponse.redirect(new URL("/channels", request.nextUrl.origin)),
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

export const config = {
  matcher: [
    "/api/v1/:path*",
    "/api/e2e/:path*",
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)",
  ],
};
