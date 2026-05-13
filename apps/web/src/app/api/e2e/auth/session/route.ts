import { NextResponse, type NextRequest } from "next/server";
import { encode, getToken } from "next-auth/jwt";
import { z } from "zod";
import { prisma, UserStatus } from "@wizards/db";
import { ApiError, jsonError, parseJsonBody } from "@/lib/api";
import { assertE2EApiRouteEnabled } from "@/lib/e2e/route-guard";
import {
  e2eUsers,
  getE2EUserByKey,
  type E2EUserKey,
} from "@/lib/e2e/test-fixtures";

const E2ESessionSchema = z.object({
  userKey: z.enum(["alice", "bob", "charlie"]),
});

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

function getAuthSecret(): string {
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;

  if (!secret) {
    throw new ApiError("E2E auth secret is not configured", 500);
  }

  return secret;
}

function getSessionCookieName(): string {
  return process.env.NODE_ENV === "production"
    ? "__Secure-authjs.session-token"
    : "authjs.session-token";
}

function getSessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure: process.env.NODE_ENV === "production",
  };
}

async function findE2EUser(userKey: E2EUserKey) {
  const fixture = getE2EUserByKey(userKey);
  const user = await prisma.user.findUnique({
    where: { email: fixture.email },
    select: {
      id: true,
      email: true,
      username: true,
      displayName: true,
      avatarUrl: true,
      locale: true,
      theme: true,
      emailVerified: true,
      isBanned: true,
    },
  });

  if (!user || !user.emailVerified || user.isBanned) {
    throw new ApiError("E2E user is not available. Run the E2E seed first.", 409);
  }

  return user;
}

export async function POST(request: NextRequest) {
  try {
    assertE2EApiRouteEnabled(request.nextUrl);

    const { userKey } = await parseJsonBody(request, E2ESessionSchema);
    const user = await findE2EUser(userKey);
    const secret = getAuthSecret();
    const cookieName = getSessionCookieName();
    const issuedAt = Math.floor(Date.now() / 1000);
    const expiresAt = issuedAt + SESSION_MAX_AGE_SECONDS;

    await prisma.user.update({
      where: { id: user.id },
      data: {
        lastLoginAt: new Date(),
        status: UserStatus.ONLINE,
      },
    });

    const sessionToken = await encode({
      maxAge: SESSION_MAX_AGE_SECONDS,
      salt: cookieName,
      secret,
      token: {
        avatarUrl: user.avatarUrl,
        displayName: user.displayName,
        email: user.email,
        exp: expiresAt,
        iat: issuedAt,
        id: user.id,
        jti: crypto.randomUUID(),
        locale: user.locale,
        name: user.displayName ?? user.username,
        sub: user.id,
        theme: user.theme,
        username: user.username,
      },
    });

    const response = NextResponse.json({
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        displayName: user.displayName,
      },
    });

    response.cookies.set(cookieName, sessionToken, {
      ...getSessionCookieOptions(),
      expires: new Date(expiresAt * 1000),
      maxAge: SESSION_MAX_AGE_SECONDS,
    });

    return response;
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    assertE2EApiRouteEnabled(request.nextUrl);

    const secret = getAuthSecret();
    const cookieName = getSessionCookieName();
    const token = await getToken({
      cookieName,
      req: request,
      secret,
      secureCookie: process.env.NODE_ENV === "production",
    });
    const userId = typeof token?.id === "string" ? token.id : typeof token?.sub === "string" ? token.sub : null;
    const e2eEmails = Object.values(e2eUsers).map((user) => user.email);

    if (userId) {
      await prisma.user.updateMany({
        where: {
          id: userId,
          email: { in: e2eEmails },
        },
        data: {
          status: UserStatus.OFFLINE,
        },
      });
    }

    const response = NextResponse.json({ ok: true });
    response.cookies.set(cookieName, "", {
      ...getSessionCookieOptions(),
      expires: new Date(0),
      maxAge: 0,
    });

    return response;
  } catch (error) {
    return jsonError(error);
  }
}

