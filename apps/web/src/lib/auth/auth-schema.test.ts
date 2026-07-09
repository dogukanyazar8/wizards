import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LoginCredentialsSchema, LoginSchema } from "@wizards/types";

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

  it("accepts an optional two-factor code on login form submissions only", () => {
    const parsed = LoginSchema.parse({
      email: "ada@example.test",
      password: "password123",
      twoFactorCode: " 123456 ",
      turnstileToken: "token",
    });

    assert.equal(parsed.twoFactorCode, "123456");
    assert.equal(
      LoginCredentialsSchema.safeParse({
        email: "ada@example.test",
        password: "password123",
        twoFactorCode: "123456",
      }).success,
      true,
    );
  });
});
