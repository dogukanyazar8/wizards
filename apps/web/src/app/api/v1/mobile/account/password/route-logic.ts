import {
  MobilePasswordChangeRequestSchema,
  MobilePasswordChangeResponseSchema,
  type MobilePasswordChangeRequest,
} from "@wizards/types";
import { prisma } from "@wizards/db";
import bcrypt from "bcryptjs";

import { enforceApiRateLimit, type ApiRateLimitAction } from "@/lib/api-rate-limit";
import { ApiError, jsonError, parseJsonBody } from "@/lib/api";
import { requireMobileApiUserId } from "@/lib/auth/api";
import { revokeUserSessions } from "@/lib/auth/session-revocation";

const NO_STORE_HEADERS = { "Cache-Control": "no-store, no-cache, must-revalidate" } as const;

const PASSWORD_HASH_ROUNDS = 12;

function withNoStore(response: Response) {
  response.headers.set("Cache-Control", NO_STORE_HEADERS["Cache-Control"]);
  return response;
}

export type MobilePasswordChangeUser = {
  deletedAt: Date | null;
  isBanned: boolean;
  passwordHash: string | null;
};

export type MobilePasswordRouteDependencies = {
  authenticate(request: Request): Promise<string>;
  comparePassword(password: string, passwordHash: string): Promise<boolean>;
  enforceRateLimit(userId: string, action: ApiRateLimitAction): Promise<void>;
  hashPassword(password: string): Promise<string>;
  loadUser(userId: string): Promise<MobilePasswordChangeUser | null>;
  parseBody(request: Request): Promise<MobilePasswordChangeRequest>;
  revokeSessions(userId: string, now: Date): Promise<unknown>;
  savePassword(userId: string, passwordHash: string, now: Date): Promise<unknown>;
};

async function loadMobilePasswordChangeUser(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      deletedAt: true,
      isBanned: true,
      passwordHash: true,
    },
  });
}

async function saveMobilePassword(userId: string, passwordHash: string, now: Date) {
  return prisma.user.update({
    where: { id: userId },
    data: {
      passwordHash,
      sessionsRevokedAfter: now,
    },
    select: { id: true },
  });
}

const defaultDependencies: MobilePasswordRouteDependencies = {
  authenticate: (request) => requireMobileApiUserId(request),
  comparePassword: (password, passwordHash) => bcrypt.compare(password, passwordHash),
  enforceRateLimit: enforceApiRateLimit,
  hashPassword: (password) => bcrypt.hash(password, PASSWORD_HASH_ROUNDS),
  loadUser: loadMobilePasswordChangeUser,
  parseBody: (request) => parseJsonBody(request, MobilePasswordChangeRequestSchema),
  revokeSessions: (userId, now) => revokeUserSessions(userId, { now }),
  savePassword: saveMobilePassword,
};

/**
 * Changing the password advances the account-wide revocation timestamp. Mobile
 * refresh families compare their creation time with that same marker, so a
 * password change cannot leave an older device session alive.
 */
export async function mobileAccountPasswordChangeRoute(
  request: Request,
  dependencies: MobilePasswordRouteDependencies = defaultDependencies,
) {
  try {
    const userId = await dependencies.authenticate(request);
    await dependencies.enforceRateLimit(userId, "mobile:account:password");
    const input = await dependencies.parseBody(request);
    const user = await dependencies.loadUser(userId);

    if (!user || user.deletedAt || user.isBanned) {
      throw new ApiError("Account not found", 404, "USER_NOT_FOUND");
    }

    if (!user.passwordHash) {
      throw new ApiError("This account does not use a password.", 409, "PASSWORD_UNAVAILABLE");
    }

    const isCurrentPasswordValid = await dependencies.comparePassword(
      input.currentPassword,
      user.passwordHash,
    );
    if (!isCurrentPasswordValid) {
      throw new ApiError("Invalid credentials", 401, "INVALID_CREDENTIALS");
    }

    const now = new Date();
    await dependencies.savePassword(
      userId,
      await dependencies.hashPassword(input.newPassword),
      now,
    );
    await dependencies.revokeSessions(userId, now);

    return Response.json(MobilePasswordChangeResponseSchema.parse({ success: true }), {
      headers: NO_STORE_HEADERS,
    });
  } catch (error) {
    return withNoStore(jsonError(error));
  }
}
