import { auth } from "@/auth";
import { ApiError } from "@/lib/api";
import { enforceApiRateLimit, type ApiRateLimitAction } from "@/lib/api-rate-limit";
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
  authSessionId?: string | null;
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

export async function requireApiAuthSession(
  dependencies: RequireApiUserIdDependencies = defaultRequireApiUserIdDependencies,
) {
  const session = await dependencies.auth();
  const user = session?.user;
  const userId = user?.id;
  const sessionId = session?.authSessionId;

  if (!userId || !sessionId) {
    throw new ApiError("Unauthorized", 401, "UNAUTHORIZED");
  }

  dependencies.assertActiveApiUser({
    ...(user.deletedAt === undefined ? {} : { deletedAt: user.deletedAt }),
    emailVerified: Boolean(user.authEmailVerified),
    id: userId,
    isBanned: Boolean(user.isBanned),
  });

  return { sessionId, userId };
}

/**
 * The one door a suspended account may still walk through. `requireApiUserId`
 * refuses a banned session by design, so the appeal path resolves the session
 * itself and then insists the caller really is banned — an active account has
 * nothing to appeal.
 */
export async function requireBannedApiUserId(
  dependencies: RequireApiUserIdDependencies = defaultRequireApiUserIdDependencies,
) {
  const session = await dependencies.auth();
  const user = session?.user;
  const userId = user?.id;

  if (!userId) {
    throw new ApiError("Unauthorized", 401);
  }

  if (user.deletedAt) {
    throw new ApiError("This account has been deleted", 403, "ACCOUNT_DELETED");
  }

  if (!user.isBanned) {
    throw new ApiError("There is no decision to appeal.", 409, "NOT_SUSPENDED");
  }

  return userId;
}

export async function requireMobileApiUserId(request: Request) {
  const session = await requireMobileApiSession(request);
  return session.userId;
}

function unwrapSettled<T>(result: PromiseSettledResult<T>): T {
  if (result.status === "rejected") {
    throw result.reason;
  }

  return result.value;
}

function findMobileApiUser(userId: string): Promise<MobileApiUserRecord> {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      deletedAt: true,
      emailVerified: true,
      id: true,
      isBanned: true,
    },
  });
}

export type MobileApiAuthDependencies = {
  findUser(userId: string): Promise<MobileApiUserRecord>;
  isSessionActive: typeof isMobileAccessSessionActive;
};

const defaultMobileApiAuthDependencies: MobileApiAuthDependencies = {
  findUser: findMobileApiUser,
  isSessionActive: isMobileAccessSessionActive,
};

/**
 * The token is verified locally, so the Redis session lookup and the Postgres
 * user lookup have no ordering dependency — running them together turns two
 * sequential network round trips into one. `allSettled` keeps the loser's
 * rejection from surfacing as an unhandled rejection when the other one wins.
 */
export async function requireMobileApiSession(
  request: Request,
  dependencies: MobileApiAuthDependencies = defaultMobileApiAuthDependencies,
) {
  const claims = readMobileApiClaims(request);
  const [sessionActive, user] = await Promise.allSettled([
    dependencies.isSessionActive(claims),
    dependencies.findUser(claims.userId),
  ]);

  assertMobileApiUserActive(claims, sessionActive, user);

  return {
    sessionId: claims.sessionId,
    userId: claims.userId,
  };
}

/**
 * The user id inside the locally verified token, with no network call at all.
 *
 * It is not authorization — the session may still be revoked and the account may
 * still be banned, which is what `authorizeMobileApiRequest` establishes. It
 * exists so a route can start a read that only needs the id *concurrently* with
 * that check, instead of queueing a full round trip behind it. Nothing may be
 * returned to the caller before the authorization promise has been unwrapped.
 */
export function readMobileApiClaimedUserId(request: Request): string {
  return readMobileApiClaims(request).userId;
}

function readMobileApiClaims(request: Request) {
  const token = getBearerTokenFromRequest(request);
  if (!token) {
    throw new ApiError("Unauthorized", 401, "UNAUTHORIZED");
  }

  const claims = verifyMobileAccessToken(token);
  if (!claims?.scopes.includes("mobile:bootstrap")) {
    throw new ApiError("Unauthorized", 401, "UNAUTHORIZED");
  }

  return claims;
}

type MobileApiUserRecord = {
  deletedAt: Date | null;
  emailVerified: boolean;
  id: string;
  isBanned: boolean;
} | null;

/**
 * Order matters and is the same order the sequential version used: a definite
 * "this session is revoked" answer outranks an infrastructure failure in the
 * other lookup, so a revoked token still reads as 401 when Postgres is down
 * rather than leaking a 500. Results are inspected rather than unwrapped up
 * front, because eager unwrapping would rethrow the losing branch first.
 */
function assertMobileApiUserActive(
  claims: { userId: string },
  sessionActive: PromiseSettledResult<boolean>,
  user: PromiseSettledResult<MobileApiUserRecord>,
) {
  if (sessionActive.status === "fulfilled" && !sessionActive.value) {
    throw new ApiError("Unauthorized", 401, "UNAUTHORIZED");
  }

  const activeSession = unwrapSettled(sessionActive);
  const userRecord = unwrapSettled(user);
  if (!activeSession || !userRecord) {
    throw new ApiError("Unauthorized", 401, "UNAUTHORIZED");
  }

  assertActiveApiUser({
    deletedAt: userRecord.deletedAt,
    emailVerified: Boolean(userRecord.emailVerified),
    id: claims.userId,
    isBanned: userRecord.isBanned,
  });
}

export type AuthorizeMobileApiRequestDependencies = MobileApiAuthDependencies & {
  enforceRateLimit: typeof enforceApiRateLimit;
};

const defaultAuthorizeMobileApiRequestDependencies: AuthorizeMobileApiRequestDependencies = {
  ...defaultMobileApiAuthDependencies,
  enforceRateLimit: enforceApiRateLimit,
};

/**
 * Authentication and rate limiting both key off the locally verified token, so
 * all three backing calls (Redis session, Postgres user, Redis rate counter)
 * run concurrently instead of stacking three round trips in front of the route.
 *
 * Failures are still reported in the original precedence — an unauthorized
 * request reads as 401, never 429 — which does mean a request with a valid
 * signature but a revoked session spends rate-limit budget. That is the
 * intended trade: it also throttles replay of revoked tokens.
 */
export async function authorizeMobileApiRequest(
  request: Request,
  action: ApiRateLimitAction,
  dependencies: AuthorizeMobileApiRequestDependencies = defaultAuthorizeMobileApiRequestDependencies,
): Promise<string> {
  return (await authorizeMobileApiSession(request, action, dependencies)).userId;
}

export async function authorizeMobileApiSession(
  request: Request,
  action: ApiRateLimitAction,
  dependencies: AuthorizeMobileApiRequestDependencies = defaultAuthorizeMobileApiRequestDependencies,
): Promise<{ sessionId: string; userId: string }> {
  const claims = readMobileApiClaims(request);
  const [sessionActive, user, rateLimit] = await Promise.allSettled([
    dependencies.isSessionActive(claims),
    dependencies.findUser(claims.userId),
    dependencies.enforceRateLimit(claims.userId, action),
  ]);

  assertMobileApiUserActive(claims, sessionActive, user);
  unwrapSettled(rateLimit);

  return { sessionId: claims.sessionId, userId: claims.userId };
}
