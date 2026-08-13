import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolveRegistrationConflict } from "./registration-policy";

describe("registration conflict policy", () => {
  it("keeps username conflicts independent of whether the email exists", () => {
    assert.equal(
      resolveRegistrationConflict({ emailExists: true, usernameExists: true }),
      "username_taken",
    );
    assert.equal(
      resolveRegistrationConflict({ emailExists: false, usernameExists: true }),
      "username_taken",
    );
  });

  it("uses the generic existing-email path only when the username is available", () => {
    assert.equal(
      resolveRegistrationConflict({ emailExists: true, usernameExists: false }),
      "existing_email",
    );
    assert.equal(
      resolveRegistrationConflict({ emailExists: false, usernameExists: false }),
      "available",
    );
  });
});
