import { auth } from "@/auth";
import { ApiError } from "@/lib/api";
import { assertActiveApiUser } from "@/lib/auth/access";
import {
  getBearerTokenFromRequest,
  isMobileAccessSessionActive,
  verifyMobileAccessToken,
} from "@/lib/mobile/auth";
import { prisma } from "@wizards/db";

type ApiAuthSessionUser = {
  authEmailVerified?: boolean | null;
  deletedAt?: Date | string | null;
  id?: string | null;
  isBanned?: boolean;
};

type ApiAuthSession = {
  user?: ApiAuthSessionUser | null;
} | null;

export type RequireApiUserIdDependencies = {
  assertActiveApiUser: typeof assertActiveApiUser;
  auth: () => Promise<ApiAuthSession>;
};

const defaultRequireApiUserIdDependencies: RequireApiUserIdDependencies = {
  assertActiveApiUser,
  auth,
};

export async function requireApiUserId(
  dependencies: RequireApiUserIdDependencies = defaultRequireApiUserIdDependencies,
) {
  const session = await dependencies.auth();
  const user = session?.user;
  const userId = user?.id;

  if (!userId) {
    throw new ApiError("Unauthorized", 401);
  }

  dependencies.assertActiveApiUser({
    ...(user.deletedAt === undefined ? {} : { deletedAt: user.deletedAt }),
    emailVerified: Boolean(user.authEmailVerified),
    id: userId,
    isBanned: Boolean(user.isBanned),
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
