import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { zodResolver } from "@hookform/resolvers/zod";
import { LoginSchema } from "@wizards/types";

const resolverOptions = {
  criteriaMode: "firstError",
  fields: {},
  shouldUseNativeValidation: false,
} as never;

describe("zodResolver login contract", () => {
  it("normalizes valid form input into the server login contract", async () => {
    const result = await zodResolver(LoginSchema)(
      {
        email: "ada@example.com",
        password: "correct-horse",
        rememberMe: "on",
        turnstileToken: "turnstile-token",
        twoFactorCode: " 123456 ",
      },
      undefined,
      resolverOptions,
    );

    assert.deepEqual(result.errors, {});
    assert.deepEqual(result.values, {
      email: "ada@example.com",
      password: "correct-horse",
      rememberMe: true,
      turnstileToken: "turnstile-token",
      twoFactorCode: "123456",
    });
  });

  it("keeps custom validation keys on invalid form input", async () => {
    const result = await zodResolver(LoginSchema)(
      {
        email: "not-an-email",
        password: "short",
        rememberMe: false,
        turnstileToken: "",
        twoFactorCode: "x".repeat(65),
      },
      undefined,
      resolverOptions,
    );

    assert.deepEqual(result.values, {});
    assert.equal(result.errors.email?.message, "validation.email.invalid");
    assert.equal(result.errors.password?.message, "validation.password.min");
    assert.equal(result.errors.turnstileToken?.message, "validation.turnstile.required");
    assert.equal(result.errors.twoFactorCode?.message, "validation.twoFactor.invalid");
  });
});
