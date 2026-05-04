import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ApiError } from "@/lib/api";
import { assertActiveApiUser, isActiveAuthUser } from "./access";

describe("auth access checks", () => {
  it("accepts verified users that are not banned", () => {
    const user = {
      emailVerified: true,
      id: "user-1",
      isBanned: false,
    };

    assert.equal(isActiveAuthUser(user), true);
    assert.doesNotThrow(() => assertActiveApiUser(user));
  });

  it("rejects suspended users", () => {
    const user = {
      emailVerified: true,
      id: "user-1",
      isBanned: true,
    };

    assert.equal(isActiveAuthUser(user), false);
    assert.throws(
      () => assertActiveApiUser(user),
      (error) =>
        error instanceof ApiError &&
        error.code === "ACCOUNT_SUSPENDED" &&
        error.status === 403,
    );
  });

  it("rejects users that have not verified their email", () => {
    const user = {
      emailVerified: false,
      id: "user-1",
      isBanned: false,
    };

    assert.equal(isActiveAuthUser(user), false);
    assert.throws(
      () => assertActiveApiUser(user),
      (error) =>
        error instanceof ApiError &&
        error.code === "EMAIL_VERIFICATION_REQUIRED" &&
        error.status === 403,
    );
  });
});
