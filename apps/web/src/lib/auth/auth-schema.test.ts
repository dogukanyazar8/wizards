import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LoginCredentialsSchema, LoginSchema, TwoFactorChallengeSchema } from "@wizards/types";

describe("auth schemas", () => {
  it("requires Turnstile for login form submissions but not internal credentials parsing", () => {
    assert.equal(
      LoginSchema.safeParse({
        email: "ada@example.test",
        password: "password123",
      }).success,
      false,
    );

    assert.equal(
      LoginCredentialsSchema.safeParse({
        email: "ada@example.test",
        password: "password123",
      }).success,
      true,
    );

    assert.equal(
      LoginSchema.safeParse({
        email: "ada@example.test",
        password: "password123",
        turnstileToken: "token",
      }).success,
      true,
    );
  });

  it("normalizes remember-me form values without affecting internal credentials parsing", () => {
    const remembered = LoginSchema.parse({
      email: "ada@example.test",
      password: "password123",
      rememberMe: "on",
      turnstileToken: "token",
    });

    assert.equal(remembered.rememberMe, true);

    const oneTime = LoginSchema.parse({
      email: "ada@example.test",
      password: "password123",
      turnstileToken: "token",
    });

    assert.equal(oneTime.rememberMe, false);
  });

  it("no longer carries the two-factor code on the login form (K2)", () => {
    const parsed = LoginSchema.parse({
      email: "ada@example.test",
      password: "password123",
      twoFactorCode: " 123456 ",
      turnstileToken: "token",
    });

    // Kod ayrı ekrandan, challenge kimliğiyle gelir; giriş formu artık taşımaz.
    assert.equal("twoFactorCode" in (parsed as Record<string, unknown>), false);
  });

  it("takes the two-factor code with a challenge id instead", () => {
    const parsed = TwoFactorChallengeSchema.parse({
      challengeId: "aGVsbG8td29ybGQtY2hhbGxlbmdlLWlk",
      code: " 123456 ",
      rememberDevice: "on",
    });

    assert.equal(parsed.code, "123456");
    assert.equal(parsed.rememberDevice, true);
    assert.equal(
      TwoFactorChallengeSchema.safeParse({
        challengeId: "aGVsbG8td29ybGQtY2hhbGxlbmdlLWlk",
        code: "12345",
        rememberDevice: false,
      }).success,
      false,
    );
  });
});
