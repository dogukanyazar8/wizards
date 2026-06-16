import { getToken } from "next-auth/jwt";
import { NextResponse, type NextRequest } from "next/server";
import { jsonError } from "@/lib/api";
import { requireApiUserId } from "@/lib/auth/api";
import {
  expireAuthSessionCookies,
  getAuthSessionCookieConfig,
  shouldClearDesktopSessionOnClose,
} from "@/lib/auth/session-cookies";

function getAuthSecret() {
  return process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || "";
}

export async function POST(request: NextRequest) {
  try {
    await requireApiUserId();

    const secret = getAuthSecret();
    const sessionCookie = getAuthSessionCookieConfig();
    const token = secret
      ? await getToken({
          cookieName: sessionCookie.cookieName,
          req: request,
          secret,
          secureCookie: sessionCookie.secureCookie,
        })
      : null;
    const cleared = shouldClearDesktopSessionOnClose(token);
    const response = NextResponse.json({ cleared, success: true });
    response.headers.set("Cache-Control", "no-store");

    if (cleared) {
      expireAuthSessionCookies(response.cookies);
    }

    return response;
  } catch (error) {
    return jsonError(error);
  }
}
