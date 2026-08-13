import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { forgotPasswordAction, resetPasswordAction } from "./actions";

describe("password reset actions", () => {
  it("rejects a missing Turnstile credential before password-reset delivery", async () => {
    const formData = new FormData();
    formData.set("email", "ada@example.com");

    assert.deepEqual(await forgotPasswordAction(formData), {
      error: "validation.turnstile.required",
      success: false,
    });
  });

  it("rejects a missing Turnstile credential before consuming a reset token", async () => {
    const formData = new FormData();
    formData.set("confirmPassword", "correct-horse");
    formData.set("password", "correct-horse");
    formData.set("token", "reset-token");

    assert.deepEqual(await resetPasswordAction(formData), {
      error: "validation.turnstile.required",
      success: false,
    });
  });
});
