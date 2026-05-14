import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { LOGIN_FAILED_MESSAGE_KEY } from "./login-errors";

describe("login error messages", () => {
  it("uses one generic credential failure key for invalid and unverified credentials", () => {
    assert.equal(LOGIN_FAILED_MESSAGE_KEY, "auth.login.failed");
  });
});
