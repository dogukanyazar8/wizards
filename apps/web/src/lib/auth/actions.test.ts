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
    // SPEC-GIRIS-KAYIT §10 / paket kararı K9: parola artık dört kuralın üçünü karşılamak
    // zorunda, yoksa Turnstile'a sıra gelmeden parola hatası döner.
    formData.set("confirmPassword", "Whispr!2026x");
    formData.set("password", "Whispr!2026x");
    formData.set("token", "reset-token");

    assert.deepEqual(await resetPasswordAction(formData), {
      error: "validation.turnstile.required",
      success: false,
    });
  });
});
