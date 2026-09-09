import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { zodResolver } from "@hookform/resolvers/zod";
import { LoginSchema, TwoFactorChallengeSchema } from "@wizards/types";

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
    });
  });

  it("keeps custom validation keys on invalid form input", async () => {
    const result = await zodResolver(LoginSchema)(
      {
        email: "not-an-email",
        password: "short",
        rememberMe: false,
        turnstileToken: "",
      },
      undefined,
      resolverOptions,
    );

    assert.deepEqual(result.values, {});
    assert.equal(result.errors.email?.message, "validation.email.invalid");
    assert.equal(result.errors.password?.message, "validation.password.min");
    assert.equal(result.errors.turnstileToken?.message, "validation.turnstile.required");
  });

  it("keeps custom validation keys on the two-factor challenge contract", async () => {
    const result = await zodResolver(TwoFactorChallengeSchema)(
      {
        challengeId: "short",
        code: "12345",
        rememberDevice: false,
      },
      undefined,
      resolverOptions,
    );

    assert.deepEqual(result.values, {});
    assert.equal(result.errors.challengeId?.message, "validation.twoFactor.challenge");
    assert.equal(result.errors.code?.message, "validation.verificationCode.invalid");
  });
});
