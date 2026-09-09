import { z } from "zod";

import { ApiError, jsonError, parseJsonBody } from "@/lib/api";
import {
  changeAccountPassword,
  checkPasswordChangeRateLimit,
  checkPasswordPolicy,
  defaultChangeAccountPasswordDependencies,
  recordPasswordChangeFailure,
  saveAccountPassword,
  type ChangeAccountPasswordDependencies,
  type PasswordPolicyRule,
} from "@/lib/account/password-service";
import { requireApiAuthSession } from "@/lib/auth/api";
import { revokeOtherAuthSessions } from "@/lib/auth/auth-session-service";
import { revokeMobileSession } from "@/lib/mobile/auth";
import { recordSecurityEventFromHeaders } from "@/lib/security/security-event-service";

const NO_STORE_HEADERS = { "Cache-Control": "no-store, no-cache, must-revalidate" } as const;

/**
 * Deliberately loose about the password rules. The three failure branches the screen draws
 * (`PASSWORD_MISMATCH`, `WEAK_PASSWORD`, `INVALID_CURRENT_PASSWORD`) each need their own code, and
 * a zod `refine` would collapse two of them into one generic 400.
 */
export const AccountPasswordChangeRequestSchema = z
  .object({
    confirmPassword: z.string().min(1).max(512),
    currentPassword: z.string().min(1).max(512),
    newPassword: z.string().min(1).max(512),
  })
  .strict();

export type AccountPasswordChangeRequest = z.infer<typeof AccountPasswordChangeRequestSchema>;

export type AccountPasswordChangeResponse = {
  changedAt: string;
  revokedOtherSessions: number;
  success: true;
};

export type AccountPasswordRouteDependencies = {
  authenticate(): Promise<{ sessionId: string; userId: string }>;
  changePassword: ChangeAccountPasswordDependencies;
  checkRateLimit(input: { headers: Headers; userId: string }): Promise<boolean>;
  parseBody(request: Request): Promise<AccountPasswordChangeRequest>;
  recordFailure(input: { headers: Headers; userId: string }): Promise<boolean>;
  recordPasswordChanged(headers: Headers, userId: string): Promise<void>;
  revokeOtherSessions(input: { sessionId: string; userId: string }): Promise<number>;
};

/**
 * Ş3 §1 / tuzak #13. Every *other* durable session goes, the caller's own stays: the account-wide
 * `sessionsRevokedAfter` marker is **not** advanced here, because it compares
 * `sessionStartedAt <= revokedAfter` and would therefore log the person out of the window they
 * just used to change their password.
 */
async function revokeEveryOtherSession(input: { sessionId: string; userId: string }) {
  const revoked = await revokeOtherAuthSessions(input.userId, input.sessionId, {
    // The password change writes its own `PASSWORD_CHANGED` row; a second `SESSION_REVOKED` row
    // for the same action would double the log without adding a fact.
    recordEvent: async () => undefined,
  });

  await Promise.allSettled(
    revoked
      .filter(({ clientType }) => clientType === "MOBILE")
      .map(({ id }) => revokeMobileSession({ sessionId: id })),
  );

  return revoked.length;
}

export const defaultAccountPasswordRouteDependencies: AccountPasswordRouteDependencies = {
  authenticate: () => requireApiAuthSession(),
  changePassword: {
    ...defaultChangeAccountPasswordDependencies,
    // `saveAccountPassword` takes no `now`: the web write touches the password column only.
    savePassword: saveAccountPassword,
  },
  checkRateLimit: (input) => checkPasswordChangeRateLimit(input),
  parseBody: (request) => parseJsonBody(request, AccountPasswordChangeRequestSchema),
  recordFailure: (input) => recordPasswordChangeFailure(input),
  recordPasswordChanged: (headers, userId) =>
    recordSecurityEventFromHeaders(headers, { kind: "PASSWORD_CHANGED", userId }),
  revokeOtherSessions: revokeEveryOtherSession,
};

function weakPasswordResponse(failedRules: PasswordPolicyRule[]) {
  return Response.json(
    { code: "WEAK_PASSWORD", error: "Password does not meet the policy.", failedRules },
    { headers: NO_STORE_HEADERS, status: 400 },
  );
}

export async function accountPasswordChangeRoute(
  request: Request,
  dependencies: AccountPasswordRouteDependencies = defaultAccountPasswordRouteDependencies,
): Promise<Response> {
  try {
    const { sessionId, userId } = await dependencies.authenticate();

    if (!(await dependencies.checkRateLimit({ headers: request.headers, userId }))) {
      throw new ApiError("Too many requests. Please try again shortly.", 429, "RATE_LIMITED");
    }

    const input = await dependencies.parseBody(request);

    if (input.newPassword !== input.confirmPassword) {
      throw new ApiError("Passwords do not match.", 400, "PASSWORD_MISMATCH");
    }

    const failedRules = checkPasswordPolicy(input.newPassword, {
      currentPassword: input.currentPassword,
    });
    if (failedRules.length > 0) {
      return weakPasswordResponse(failedRules);
    }

    const result = await changeAccountPassword(
      { currentPassword: input.currentPassword, newPassword: input.newPassword, userId },
      dependencies.changePassword,
    );

    if (!result.ok) {
      if (result.reason === "invalid_current_password") {
        // The wrong-guess budget is spent before the answer is returned, so a script that ignores
        // the status code still runs out of attempts.
        await dependencies.recordFailure({ headers: request.headers, userId });
        throw new ApiError("Current password is incorrect.", 400, "INVALID_CURRENT_PASSWORD");
      }
      if (result.reason === "password_unavailable") {
        throw new ApiError("This account does not use a password.", 409, "PASSWORD_UNAVAILABLE");
      }
      throw new ApiError("Account not found", 404, "USER_NOT_FOUND");
    }

    const revokedOtherSessions = await dependencies.revokeOtherSessions({ sessionId, userId });
    await dependencies.recordPasswordChanged(request.headers, userId);

    return Response.json(
      {
        changedAt: result.changedAt.toISOString(),
        revokedOtherSessions,
        success: true,
      } satisfies AccountPasswordChangeResponse,
      { headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    const response = jsonError(error);
    response.headers.set("Cache-Control", NO_STORE_HEADERS["Cache-Control"]);
    return response;
  }
}
