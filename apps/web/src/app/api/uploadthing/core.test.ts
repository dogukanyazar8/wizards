import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isUploadUserAllowed } from "./core";

describe("UploadThing active-user guard", () => {
  it("accepts verified users that are not banned", () => {
    assert.equal(
      isUploadUserAllowed({
        emailVerified: true,
        id: "user-1",
        isBanned: false,
      }),
      true,
    );
  });

  it("rejects banned or unverified users", () => {
    assert.equal(
      isUploadUserAllowed({
        emailVerified: true,
        id: "user-1",
        isBanned: true,
      }),
      false,
    );
    assert.equal(
      isUploadUserAllowed({
        emailVerified: false,
        id: "user-1",
        isBanned: false,
      }),
      false,
    );
  });
});
