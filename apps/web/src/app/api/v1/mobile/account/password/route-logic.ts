import {
  MobilePasswordChangeRequestSchema,
  MobilePasswordChangeResponseSchema,
  type MobilePasswordChangeRequest,
} from "@wizards/types";
import bcrypt from "bcryptjs";

import { enforceApiRateLimit, type ApiRateLimitAction } from "@/lib/api-rate-limit";
import { ApiError, jsonError, parseJsonBody } from "@/lib/api";
import { requireMobileApiUserId } from "@/lib/auth/api";
import {
  PASSWORD_HASH_ROUNDS,
  changeAccountPassword,
  loadAccountPasswordUser,
  saveAccountPasswordWithGlobalRevocation,
  type AccountPasswordUser,
} from "@/lib/account/password-service";
import { revokeUserSessions } from "@/lib/auth/session-revocation";

const NO_STORE_HEADERS = { "Cache-Control": "no-store, no-cache, must-revalidate" } as const;

function withNoStore(response: Response) {
  response.headers.set("Cache-Control", NO_STORE_HEADERS["Cache-Control"]);
  return response;
}

export type MobilePasswordChangeUser = AccountPasswordUser;

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

const defaultDependencies: MobilePasswordRouteDependencies = {
  authenticate: (request) => requireMobileApiUserId(request),
  comparePassword: (password, passwordHash) => bcrypt.compare(password, passwordHash),
  enforceRateLimit: enforceApiRateLimit,
  hashPassword: (password) => bcrypt.hash(password, PASSWORD_HASH_ROUNDS),
  loadUser: loadAccountPasswordUser,
  parseBody: (request) => parseJsonBody(request, MobilePasswordChangeRequestSchema),
  revokeSessions: (userId, now) => revokeUserSessions(userId, { now }),
  savePassword: saveAccountPasswordWithGlobalRevocation,
};

/**
 * Changing the password advances the account-wide revocation timestamp. Mobile
 * refresh families compare their creation time with that same marker, so a
 * password change cannot leave an older device session alive.
 *
 * Ayarlar Ş3 §1: the verification and persistence steps now live in
 * `lib/account/password-service.ts`, shared with the web endpoint. This wrapper keeps mobile's
 * own rate-limit bucket, its `INVALID_CREDENTIALS` wording and its global revocation write —
 * the contract the shipped app depends on is unchanged.
 */
export async function mobileAccountPasswordChangeRoute(
  request: Request,
  dependencies: MobilePasswordRouteDependencies = defaultDependencies,
) {
  try {
    const userId = await dependencies.authenticate(request);
    await dependencies.enforceRateLimit(userId, "mobile:account:password");
    const input = await dependencies.parseBody(request);

    const result = await changeAccountPassword(
      { currentPassword: input.currentPassword, newPassword: input.newPassword, userId },
      {
        comparePassword: dependencies.comparePassword,
        hashPassword: dependencies.hashPassword,
        loadUser: dependencies.loadUser,
        now: () => new Date(),
        revokeSessions: dependencies.revokeSessions,
        savePassword: dependencies.savePassword,
      },
    );

    if (!result.ok) {
      switch (result.reason) {
        case "user_not_found":
          throw new ApiError("Account not found", 404, "USER_NOT_FOUND");
        case "password_unavailable":
          throw new ApiError("This account does not use a password.", 409, "PASSWORD_UNAVAILABLE");
        case "invalid_current_password":
          throw new ApiError("Invalid credentials", 401, "INVALID_CREDENTIALS");
      }
    }

    return Response.json(MobilePasswordChangeResponseSchema.parse({ success: true }), {
      headers: NO_STORE_HEADERS,
    });
  } catch (error) {
    return withNoStore(jsonError(error));
  }
}
