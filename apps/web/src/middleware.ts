import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

const REDIRECT_IF_AUTHENTICATED = new Set(["/login", "/register"]);

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
      ...(isDevelopment ? ["'unsafe-eval'", "'unsafe-inline'"] : ["'strict-dynamic'"]),
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

function attachSecurityHeaders(response: NextResponse, nonce: string) {
  response.headers.set("Content-Security-Policy", buildContentSecurityPolicy(nonce));
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

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  const nonce = createNonce();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);

  let isAuthenticated = false;
  try {
    if (secret) {
      const token = await getToken({
        req: request,
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
      nonce,
    );
  }

  if (isAuthenticated && REDIRECT_IF_AUTHENTICATED.has(pathname)) {
    return attachSecurityHeaders(
      NextResponse.redirect(new URL("/channels", request.nextUrl.origin)),
      nonce,
    );
  }

  return attachSecurityHeaders(
    NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    }),
    nonce,
  );
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)",
  ],
};
