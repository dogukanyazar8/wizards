import assert from "node:assert/strict";
import { describe, it } from "node:test";

import * as authSchemas from "./auth";
import {
  ForgotPasswordSchema,
  LoginCredentialsSchema,
  LoginSchema,
  RegisterSchema,
  ResetPasswordSchema,
  TurnstileTokenSchema,
} from "./auth";
import { assertAccepts, assertRejects, assertSchemaBehaviorCoverage } from "./schema-test-helpers";

const validLogin = {
  email: "ada@example.com",
  password: "correct-horse",
  rememberMe: false,
  twoFactorCode: "123456",
  turnstileToken: "turnstile-token",
};

describe("auth schemas", () => {
  it("keeps every exported schema covered by an acceptance and rejection fixture", () => {
    assertSchemaBehaviorCoverage(authSchemas, {
      ForgotPasswordSchema: {
        schema: ForgotPasswordSchema,
        valid: { email: "ada@example.com" },
        invalid: { email: "not-an-email" },
      },
      LoginCredentialsSchema: {
        schema: LoginCredentialsSchema,
        valid: { email: "ada@example.com", password: "password" },
        invalid: { email: "ada@example.com", password: "short" },
      },
      LoginSchema: {
        schema: LoginSchema,
        valid: validLogin,
        invalid: { ...validLogin, turnstileToken: "" },
      },
      RegisterSchema: {
        schema: RegisterSchema,
        valid: {
          confirmPassword: "correct-horse",
          email: "ada@example.com",
          password: "correct-horse",
          turnstileToken: "turnstile-token",
          username: "ada_lovelace",
        },
        invalid: {
          confirmPassword: "different-password",
          email: "ada@example.com",
          password: "correct-horse",
          turnstileToken: "turnstile-token",
          username: "ada_lovelace",
        },
      },
      ResetPasswordSchema: {
        schema: ResetPasswordSchema,
        valid: {
          confirmPassword: "correct-horse",
          password: "correct-horse",
          token: "reset-token",
        },
        invalid: { confirmPassword: "password", password: "password", token: "" },
      },
      TurnstileTokenSchema: {
        schema: TurnstileTokenSchema,
        valid: "turnstile-token",
        invalid: "",
      },
    });
  });

  it("enforces credential email and password boundaries", () => {
    assertAccepts(LoginCredentialsSchema, {
      email: "ada@example.com",
      password: "12345678",
    });
    assertRejects(LoginCredentialsSchema, { email: "ada", password: "12345678" }, ["email"]);
    assertRejects(LoginCredentialsSchema, { email: "ada@example.com", password: "1234567" }, [
      "password",
    ]);
  });

  it("normalizes remember-me values and trims optional two-factor codes", () => {
    for (const rememberMe of [true, "1", "on", "TRUE", "yes"]) {
      const parsed = assertAccepts(LoginSchema, { ...validLogin, rememberMe });
      assert.equal(parsed?.rememberMe, true);
    }

    for (const rememberMe of [false, "", "0", "no", 1, null, undefined]) {
      const parsed = assertAccepts(LoginSchema, { ...validLogin, rememberMe });
      assert.equal(parsed?.rememberMe, false);
    }

    assert.equal(
      assertAccepts(LoginSchema, { ...validLogin, twoFactorCode: " 123456 " })?.twoFactorCode,
      "123456",
    );
    for (const twoFactorCode of ["", 123456, null, undefined]) {
      assert.equal(assertAccepts(LoginSchema, { ...validLogin, twoFactorCode })?.twoFactorCode, "");
    }
    assertRejects(LoginSchema, { ...validLogin, twoFactorCode: "1".repeat(65) }, ["twoFactorCode"]);
  });

  it("enforces Turnstile and registration boundaries", () => {
    const base = {
      confirmPassword: "12345678",
      email: "ada@example.com",
      password: "12345678",
      turnstileToken: "x",
      username: "ab",
    };
    assertAccepts(RegisterSchema, base);
    assertAccepts(RegisterSchema, {
      ...base,
      password: "p".repeat(100),
      confirmPassword: "p".repeat(100),
      turnstileToken: "x".repeat(4096),
      username: "u".repeat(32),
    });
    assertRejects(RegisterSchema, { ...base, username: "a" }, ["username"]);
    assertRejects(RegisterSchema, { ...base, username: "u".repeat(33) }, ["username"]);
    assertRejects(RegisterSchema, { ...base, username: "ada-lovelace" }, ["username"]);
    assertRejects(RegisterSchema, { ...base, password: "short" }, ["password"]);
    assertRejects(
      RegisterSchema,
      { ...base, password: "p".repeat(101), confirmPassword: "p".repeat(101) },
      ["password"],
    );
    assertRejects(RegisterSchema, { ...base, turnstileToken: "" }, ["turnstileToken"]);
    assertRejects(RegisterSchema, { ...base, turnstileToken: "x".repeat(4097) }, [
      "turnstileToken",
    ]);
  });

  it("reports password confirmation refinements on confirmPassword", () => {
    const registerResult = RegisterSchema.safeParse({
      confirmPassword: "different",
      email: "ada@example.com",
      password: "correct-horse",
      turnstileToken: "token",
      username: "ada",
    });
    assert.equal(registerResult.success, false);
    if (!registerResult.success) {
      assert.ok(
        registerResult.error.issues.some(
          (issue) =>
            issue.path.join(".") === "confirmPassword" &&
            issue.message === "validation.password.confirmMismatch",
        ),
      );
    }

    assertRejects(
      ResetPasswordSchema,
      { confirmPassword: "different", password: "correct-horse", token: "token" },
      ["confirmPassword"],
    );
  });

  it("enforces reset-password token and password boundaries", () => {
    assertAccepts(ResetPasswordSchema, {
      confirmPassword: "12345678",
      password: "12345678",
      token: "token",
    });
    assertRejects(
      ResetPasswordSchema,
      { confirmPassword: "1234567", password: "1234567", token: "token" },
      ["password"],
    );
    assertRejects(
      ResetPasswordSchema,
      {
        confirmPassword: "p".repeat(101),
        password: "p".repeat(101),
        token: "token",
      },
      ["password"],
    );
    assertRejects(
      ResetPasswordSchema,
      { confirmPassword: "12345678", password: "12345678", token: "" },
      ["token"],
    );
  });
});
