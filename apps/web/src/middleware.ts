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
  const secret = process.env.NEXTAUTH_SECRET;
  const token = await getToken(
    secret
      ? {
          req: request,
          secret,
        }
      : {
          req: request,
        },
  );
  const isAuthenticated = Boolean(token);

  if (!isAuthenticated && isProtectedRoute(pathname)) {
    return NextResponse.redirect(new URL("/login", request.nextUrl.origin));
  }

  if (isAuthenticated && REDIRECT_IF_AUTHENTICATED.has(pathname)) {
    return NextResponse.redirect(new URL("/channels/@me", request.nextUrl.origin));
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
