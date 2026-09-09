import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApiError, parseJsonBody } from "@/lib/api";
import {
  defaultChangeAccountPasswordDependencies,
  saveAccountPassword,
} from "@/lib/account/password-service";

import {
  AccountPasswordChangeRequestSchema,
  accountPasswordChangeRoute,
  defaultAccountPasswordRouteDependencies,
  type AccountPasswordRouteDependencies,
} from "./route-logic";

const now = new Date("2026-08-24T09:00:00.000Z");

const validBody = {
  confirmPassword: "Brand-New-Secret-2",
  currentPassword: "Old-Secret-1",
  newPassword: "Brand-New-Secret-2",
};

function passwordRequest(body: unknown = validBody) {
  return new Request("https://whispr.test/api/v1/users/me/password", {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
}

function createDependencies(overrides: Partial<AccountPasswordRouteDependencies> = {}) {
  const calls: string[] = [];
  const dependencies: AccountPasswordRouteDependencies = {
    authenticate: async () => ({ sessionId: "session-current", userId: "user-1" }),
    changePassword: {
      comparePassword: async (password, passwordHash) => passwordHash === `hashed:${password}`,
      hashPassword: async (password) => `hashed:${password}`,
      loadUser: async () => ({
        deletedAt: null,
        isBanned: false,
        passwordHash: "hashed:Old-Secret-1",
      }),
      now: () => now,
      // Tuzak #13: no `revokeSessions` here, exactly as the shipped default omits it. The web
      // path must not advance the account-wide marker at all.
      savePassword: async (userId, passwordHash) => {
        calls.push(`save:${userId}:${passwordHash}`);
      },
    },
    checkRateLimit: async () => {
      calls.push("rate:request");
      return true;
    },
    parseBody: (request) => parseJsonBody(request, AccountPasswordChangeRequestSchema),
    recordFailure: async () => {
      calls.push("rate:failure");
      return true;
    },
    recordPasswordChanged: async (_headers, userId) => {
      calls.push(`event:PASSWORD_CHANGED:${userId}`);
    },
    revokeOtherSessions: async ({ sessionId, userId }) => {
      calls.push(`revoke-others:${userId}:not:${sessionId}`);
      return 2;
    },
    ...overrides,
  };

  return { calls, dependencies };
}

describe("web account password route", () => {
  it("changes the password, closes other sessions and logs the event", async () => {
    const { calls, dependencies } = createDependencies();

    const response = await accountPasswordChangeRoute(passwordRequest(), dependencies);

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store, no-cache, must-revalidate");
    assert.deepEqual(await response.json(), {
      changedAt: "2026-08-24T09:00:00.000Z",
      revokedOtherSessions: 2,
      success: true,
    });
    assert.deepEqual(calls, [
      "rate:request",
      "save:user-1:hashed:Brand-New-Secret-2",
      "revoke-others:user-1:not:session-current",
      "event:PASSWORD_CHANGED:user-1",
    ]);
  });

  it("never advances the account-wide revocation marker", async () => {
    // Tuzak #13 regression. The marker compares `sessionStartedAt <= revokedAfter`, so writing it
    // here would sign the caller out of the window they just used to change their password. The
    // shipped default omits `revokeSessions` entirely, and so does this fixture.
    const { calls, dependencies } = createDependencies();

    const response = await accountPasswordChangeRoute(passwordRequest(), dependencies);

    assert.equal(response.status, 200);
    assert.equal("revokeSessions" in defaultChangeAccountPasswordDependencies, false);
    assert.equal("revokeSessions" in defaultAccountPasswordRouteDependencies.changePassword, false);
    assert.equal(
      defaultAccountPasswordRouteDependencies.changePassword.savePassword,
      saveAccountPassword,
    );
    assert.deepEqual(
      calls.filter((call) => call.startsWith("revoke")),
      ["revoke-others:user-1:not:session-current"],
    );
  });

  it("returns PASSWORD_MISMATCH when the repeat does not match", async () => {
    const { calls, dependencies } = createDependencies();

    const response = await accountPasswordChangeRoute(
      passwordRequest({ ...validBody, confirmPassword: "Something-Else-3" }),
      dependencies,
    );

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      code: "PASSWORD_MISMATCH",
      error: "Passwords do not match.",
    });
    assert.deepEqual(calls, ["rate:request"]);
  });

  it("returns WEAK_PASSWORD with the rules that failed", async () => {
    const { dependencies } = createDependencies();

    const response = await accountPasswordChangeRoute(
      passwordRequest({
        confirmPassword: "short",
        currentPassword: "Old-Secret-1",
        newPassword: "short",
      }),
      dependencies,
    );

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      code: "WEAK_PASSWORD",
      error: "Password does not meet the policy.",
      failedRules: ["length", "digit", "uppercase"],
    });
  });

  it("returns INVALID_CURRENT_PASSWORD and spends the failure budget", async () => {
    const { calls, dependencies } = createDependencies({
      changePassword: {
        comparePassword: async () => false,
        hashPassword: async (password) => `hashed:${password}`,
        loadUser: async () => ({
          deletedAt: null,
          isBanned: false,
          passwordHash: "hashed:Old-Secret-1",
        }),
        now: () => now,
        savePassword: async () => {
          throw new Error("must not run");
        },
      },
    });

    const response = await accountPasswordChangeRoute(passwordRequest(), dependencies);

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      code: "INVALID_CURRENT_PASSWORD",
      error: "Current password is incorrect.",
    });
    assert.deepEqual(calls, ["rate:request", "rate:failure"]);
  });

  it("keeps the three failure branches on separate codes", async () => {
    const codes: string[] = [];
    for (const body of [
      { ...validBody, confirmPassword: "Something-Else-3" },
      { confirmPassword: "weak", currentPassword: "Old-Secret-1", newPassword: "weak" },
    ]) {
      const { dependencies } = createDependencies();
      const response = await accountPasswordChangeRoute(passwordRequest(body), dependencies);
      codes.push(String((await response.json()).code));
    }

    const { dependencies } = createDependencies({
      changePassword: {
        comparePassword: async () => false,
        hashPassword: async () => "unused",
        loadUser: async () => ({ deletedAt: null, isBanned: false, passwordHash: "x" }),
        now: () => now,
        savePassword: async () => undefined,
      },
    });
    codes.push(
      String(
        (await (await accountPasswordChangeRoute(passwordRequest(), dependencies)).json()).code,
      ),
    );

    assert.deepEqual(codes, ["PASSWORD_MISMATCH", "WEAK_PASSWORD", "INVALID_CURRENT_PASSWORD"]);
    assert.equal(new Set(codes).size, 3);
  });

  it("returns 429 before reading the body when the budget is spent", async () => {
    const { calls, dependencies } = createDependencies({
      checkRateLimit: async () => false,
      parseBody: async () => {
        throw new Error("must not run");
      },
    });

    const response = await accountPasswordChangeRoute(passwordRequest(), dependencies);

    assert.equal(response.status, 429);
    assert.equal((await response.json()).code, "RATE_LIMITED");
    assert.deepEqual(calls, []);
  });

  it("rejects an account without a password and an unknown account distinctly", async () => {
    const oauthOnly = await accountPasswordChangeRoute(
      passwordRequest(),
      createDependencies({
        changePassword: {
          comparePassword: async () => true,
          hashPassword: async () => "unused",
          loadUser: async () => ({ deletedAt: null, isBanned: false, passwordHash: null }),
          now: () => now,
          savePassword: async () => undefined,
        },
      }).dependencies,
    );
    const missing = await accountPasswordChangeRoute(
      passwordRequest(),
      createDependencies({
        changePassword: {
          comparePassword: async () => true,
          hashPassword: async () => "unused",
          loadUser: async () => null,
          now: () => now,
          savePassword: async () => undefined,
        },
      }).dependencies,
    );

    assert.equal(oauthOnly.status, 409);
    assert.equal((await oauthOnly.json()).code, "PASSWORD_UNAVAILABLE");
    assert.equal(missing.status, 404);
  });

  it("propagates authentication failure with no-store", async () => {
    const { dependencies } = createDependencies({
      authenticate: async () => {
        throw new ApiError("Unauthorized", 401, "UNAUTHORIZED");
      },
    });

    const response = await accountPasswordChangeRoute(passwordRequest(), dependencies);

    assert.equal(response.status, 401);
    assert.equal(response.headers.get("cache-control"), "no-store, no-cache, must-revalidate");
  });

  it("rejects unknown fields in the body", async () => {
    const { dependencies } = createDependencies();

    const response = await accountPasswordChangeRoute(
      passwordRequest({ ...validBody, email: "leak@example.com" }),
      dependencies,
    );

    assert.equal(response.status, 400);
  });
});
