import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import { ApiError, parseJsonBody } from "@/lib/api";
import { MobilePasswordChangeRequestSchema } from "@wizards/types";
import {
  mobileAccountPasswordChangeRoute,
  type MobilePasswordRouteDependencies,
} from "./route-logic";

const validBody = {
  confirmPassword: "brand-new-secret",
  currentPassword: "old-secret",
  newPassword: "brand-new-secret",
};

function passwordRequest(body: unknown = validBody) {
  return new Request("https://whispr.test/password", {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
}

function createDependencies(
  overrides: Partial<MobilePasswordRouteDependencies> = {},
): MobilePasswordRouteDependencies {
  return {
    authenticate: async () => "user-1",
    comparePassword: async () => true,
    enforceRateLimit: async () => undefined,
    hashPassword: async (password) => `hashed:${password}`,
    loadUser: async () => ({ deletedAt: null, isBanned: false, passwordHash: "hashed:old-secret" }),
    parseBody: (request) => parseJsonBody(request, MobilePasswordChangeRequestSchema),
    revokeSessions: async () => undefined,
    savePassword: async () => undefined,
    ...overrides,
  };
}

describe("mobile account password route", () => {
  it("hashes the new password, revokes web sessions, and reports success", async () => {
    const calls: string[] = [];
    const response = await mobileAccountPasswordChangeRoute(
      passwordRequest(),
      createDependencies({
        authenticate: async () => {
          calls.push("auth");
          return "user-1";
        },
        comparePassword: async (password, passwordHash) => {
          calls.push(`compare:${password}:${passwordHash}`);
          return true;
        },
        enforceRateLimit: async (userId, action) => {
          calls.push(`${action}:${userId}`);
        },
        revokeSessions: async (userId) => {
          calls.push(`revoke:${userId}`);
        },
        savePassword: async (userId, passwordHash) => {
          calls.push(`save:${userId}:${passwordHash}`);
        },
      }),
    );

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store, no-cache, must-revalidate");
    assert.deepEqual(await response.json(), { success: true });
    assert.deepEqual(calls, [
      "auth",
      "mobile:account:password:user-1",
      "compare:old-secret:hashed:old-secret",
      "save:user-1:hashed:brand-new-secret",
      "revoke:user-1",
    ]);
  });

  it("rejects a wrong current password without touching the stored hash", async () => {
    const response = await mobileAccountPasswordChangeRoute(
      passwordRequest(),
      createDependencies({
        comparePassword: async () => false,
        revokeSessions: async () => {
          throw new Error("must not run");
        },
        savePassword: async () => {
          throw new Error("must not run");
        },
      }),
    );

    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), {
      code: "INVALID_CREDENTIALS",
      error: "Invalid credentials",
    });
  });

  it("reports accounts without a password as unavailable", async () => {
    const response = await mobileAccountPasswordChangeRoute(
      passwordRequest(),
      createDependencies({
        loadUser: async () => ({ deletedAt: null, isBanned: false, passwordHash: null }),
      }),
    );

    assert.equal(response.status, 409);
    assert.equal((await response.json()).code, "PASSWORD_UNAVAILABLE");
  });

  it("rejects deleted or banned accounts", async () => {
    const deleted = await mobileAccountPasswordChangeRoute(
      passwordRequest(),
      createDependencies({
        loadUser: async () => ({
          deletedAt: new Date(),
          isBanned: false,
          passwordHash: "hashed:old-secret",
        }),
      }),
    );
    assert.equal(deleted.status, 404);

    const banned = await mobileAccountPasswordChangeRoute(
      passwordRequest(),
      createDependencies({
        loadUser: async () => ({
          deletedAt: null,
          isBanned: true,
          passwordHash: "hashed:old-secret",
        }),
      }),
    );
    assert.equal(banned.status, 404);
  });

  it("rejects mismatched, reused, short, and unknown-field payloads", async () => {
    for (const body of [
      { ...validBody, confirmPassword: "different-secret" },
      { confirmPassword: "old-secret", currentPassword: "old-secret", newPassword: "old-secret" },
      { confirmPassword: "short", currentPassword: "old-secret", newPassword: "short" },
      { ...validBody, email: "leak@example.com" },
    ]) {
      const response = await mobileAccountPasswordChangeRoute(
        passwordRequest(body),
        createDependencies({
          savePassword: async () => {
            throw new Error("must not run");
          },
        }),
      );
      assert.equal(response.status, 400);
      assert.equal(response.headers.get("cache-control"), "no-store, no-cache, must-revalidate");
    }
  });

  it("propagates authentication failures with no-store", async () => {
    const response = await mobileAccountPasswordChangeRoute(
      passwordRequest(),
      createDependencies({
        authenticate: async () => {
          throw new ApiError("Unauthorized", 401, "UNAUTHORIZED");
        },
      }),
    );

    assert.equal(response.status, 401);
    assert.equal(response.headers.get("cache-control"), "no-store, no-cache, must-revalidate");
    assert.deepEqual(await response.json(), { code: "UNAUTHORIZED", error: "Unauthorized" });
  });

  it("does not leak internal persistence errors", async () => {
    const errorLog = mock.method(console, "error", () => undefined);
    const response = await mobileAccountPasswordChangeRoute(
      passwordRequest(),
      createDependencies({
        savePassword: async () => {
          throw new Error("database host and private row details");
        },
      }),
    );

    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: "Internal server error" });
    assert.equal(errorLog.mock.callCount(), 1);
  });
});
