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
});
