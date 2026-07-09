import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ApiError } from "@/lib/api";
import { assertActiveApiUser } from "@/lib/auth/access";
import { requireApiUserId } from "./api";

function authDependencies(user: {
  authEmailVerified?: boolean;
  deletedAt?: Date | null;
  id?: string | null;
  isBanned?: boolean;
} | null) {
  return {
    assertActiveApiUser,
    auth: async () => (user ? { user } : null),
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
        error instanceof ApiError &&
        error.status === 403 &&
        error.code === "ACCOUNT_SUSPENDED",
    );
  });
});
