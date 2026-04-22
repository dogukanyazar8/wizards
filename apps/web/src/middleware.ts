import { auth } from "@/auth";
import { NextResponse } from "next/server";

const REDIRECT_IF_AUTHENTICATED = new Set(["/login", "/register"]);

function isProtectedRoute(pathname: string): boolean {
  return (
    pathname === "/channels" ||
    pathname.startsWith("/channels/") ||
    pathname === "/settings" ||
    pathname.startsWith("/settings/")
  );
}

export default auth((request) => {
  const pathname = request.nextUrl.pathname;
  const isAuthenticated = Boolean(request.auth);

  if (!isAuthenticated && isProtectedRoute(pathname)) {
    return NextResponse.redirect(new URL("/login", request.nextUrl.origin));
  }

  if (isAuthenticated && REDIRECT_IF_AUTHENTICATED.has(pathname)) {
    return NextResponse.redirect(new URL("/channels/@me", request.nextUrl.origin));
  }

  return NextResponse.next();
});

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
