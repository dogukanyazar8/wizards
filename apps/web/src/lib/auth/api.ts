import { auth } from "@/auth";
import { ApiError } from "@/lib/api";
import { assertActiveApiUser } from "@/lib/auth/access";
import {
  getBearerTokenFromRequest,
  isMobileAccessSessionActive,
  verifyMobileAccessToken,
} from "@/lib/mobile/auth";
import { prisma } from "@wizards/db";

export async function requireApiUserId() {
  const session = await auth();
  const user = session?.user;
  const userId = user?.id;

  if (!userId) {
    throw new ApiError("Unauthorized", 401);
  }

  assertActiveApiUser({
    deletedAt: user.deletedAt,
    emailVerified: user.authEmailVerified,
    id: userId,
    isBanned: user.isBanned,
  });

  return userId;
}

export async function requireMobileApiUserId(request: Request) {
  const session = await requireMobileApiSession(request);
  return session.userId;
}

export async function requireMobileApiSession(request: Request) {
  const token = getBearerTokenFromRequest(request);
  if (!token) {
    throw new ApiError("Unauthorized", 401, "UNAUTHORIZED");
  }

  const claims = verifyMobileAccessToken(token);
  if (!claims?.scopes.includes("mobile:bootstrap")) {
    throw new ApiError("Unauthorized", 401, "UNAUTHORIZED");
  }

  if (!(await isMobileAccessSessionActive(claims))) {
    throw new ApiError("Unauthorized", 401, "UNAUTHORIZED");
  }

  const user = await prisma.user.findUnique({
    where: { id: claims.userId },
    select: {
      deletedAt: true,
      emailVerified: true,
      id: true,
      isBanned: true,
    },
  });

  if (!user) {
    throw new ApiError("Unauthorized", 401, "UNAUTHORIZED");
  }

  assertActiveApiUser({
    deletedAt: user.deletedAt,
    emailVerified: Boolean(user.emailVerified),
    id: claims.userId,
    isBanned: user.isBanned,
  });

  return {
    sessionId: claims.sessionId,
    userId: claims.userId,
  };
}
