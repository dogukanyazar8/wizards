import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ApiError } from "@/lib/api";
import { assertActiveApiUser } from "@/lib/auth/access";
import { requireApiAuthSession, requireApiUserId } from "./api";

function authDependencies(
  user: {
    authEmailVerified?: boolean;
    deletedAt?: Date | null;
    id?: string | null;
    isBanned?: boolean;
  } | null,
  authSessionId?: string | null,
) {
  return {
    assertActiveApiUser,
    auth: async () =>
      user ? { ...(authSessionId === undefined ? {} : { authSessionId }), user } : null,
  };
}

describe("requireApiUserId", () => {
  it("returns the active session user id", async () => {
    await assert.doesNotReject(async () => {
      const userId = await requireApiUserId(
        authDependencies({
          authEmailVerified: true,
          deletedAt: null,
          id: "user-1",
          isBanned: false,
        }),
      );

      assert.equal(userId, "user-1");
    });
  });

  it("rejects missing sessions with the route-compatible 401 ApiError", async () => {
    await assert.rejects(
      () => requireApiUserId(authDependencies(null)),
      (error) => error instanceof ApiError && error.status === 401,
    );
  });

  it("rejects suspended users before returning a user id", async () => {
    await assert.rejects(
      () =>
        requireApiUserId(
          authDependencies({
            authEmailVerified: true,
            deletedAt: null,
            id: "user-1",
            isBanned: true,
          }),
        ),
      (error) =>
        error instanceof ApiError && error.status === 403 && error.code === "ACCOUNT_SUSPENDED",
    );
  });
});

describe("requireApiAuthSession", () => {
  it("returns the server-authenticated user and session identifiers", async () => {
    assert.deepEqual(
      await requireApiAuthSession(
        authDependencies(
          {
            authEmailVerified: true,
            deletedAt: null,
            id: "user-1",
            isBanned: false,
          },
          "session-1",
        ),
      ),
      { sessionId: "session-1", userId: "user-1" },
    );
  });

  it("rejects a legacy session without an AuthSession id", async () => {
    await assert.rejects(
      () =>
        requireApiAuthSession(
          authDependencies({ authEmailVerified: true, id: "user-1", isBanned: false }),
        ),
      (error) => error instanceof ApiError && error.status === 401,
    );
  });
});
