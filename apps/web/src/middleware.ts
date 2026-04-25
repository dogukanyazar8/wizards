import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

const REDIRECT_IF_AUTHENTICATED = new Set(["/login", "/register"]);

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
    return NextResponse.redirect(new URL("/login", request.nextUrl.origin));
  }

  if (isAuthenticated && REDIRECT_IF_AUTHENTICATED.has(pathname)) {
    return NextResponse.redirect(new URL("/channels", request.nextUrl.origin));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/channels/:path*",
    "/settings/:path*",
    "/login",
    "/register",
    "/forgot-password",
    "/invite/:path*",
  ],
};
