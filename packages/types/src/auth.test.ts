import assert from "node:assert/strict";
import { describe, it } from "node:test";

import * as authSchemas from "./auth";
import {
  BackupCodeChallengeSchema,
  DisplayNameSchema,
  EmailVerificationCodeSchema,
  ForgotPasswordSchema,
  LoginCredentialsSchema,
  LoginSchema,
  RegisterSchema,
  ResendVerificationSchema,
  ResetPasswordSchema,
  TurnstileTokenSchema,
  TwoFactorChallengeSchema,
  UsernameSchema,
} from "./auth";
import { assertAccepts, assertRejects, assertSchemaBehaviorCoverage } from "./schema-test-helpers";

/** SPEC §4.4/5 dört kuralı da karşılayan referans şifre. */
const STRONG_PASSWORD = "Whispr!2026x";

const validLogin = {
  email: "ada@example.com",
  password: "correct-horse",
  rememberMe: false,
  turnstileToken: "turnstile-token",
};

const validChallengeId = "aGVsbG8td29ybGQtY2hhbGxlbmdlLWlk";

describe("auth schemas", () => {
  it("keeps every exported schema covered by an acceptance and rejection fixture", () => {
    assertSchemaBehaviorCoverage(authSchemas, {
      BackupCodeChallengeSchema: {
        schema: BackupCodeChallengeSchema,
        valid: { backupCode: "7QF4-2KDX-9M", challengeId: validChallengeId },
        invalid: { backupCode: "7QF4", challengeId: validChallengeId },
      },
      DisplayNameSchema: {
        schema: DisplayNameSchema,
        valid: "Ada Lovelace",
        invalid: "a",
      },
      EmailVerificationCodeSchema: {
        schema: EmailVerificationCodeSchema,
        valid: { code: "290418" },
        invalid: { code: "29041" },
      },
      ForgotPasswordSchema: {
        schema: ForgotPasswordSchema,
        valid: { email: "ada@example.com", turnstileToken: "turnstile-token" },
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
          displayName: "Ada Lovelace",
          email: "ada@example.com",
          password: STRONG_PASSWORD,
          turnstileToken: "turnstile-token",
          username: "ada_lovelace",
        },
        invalid: {
          displayName: "Ada Lovelace",
          email: "ada@example.com",
          password: "correct-horse",
          turnstileToken: "turnstile-token",
          username: "ada_lovelace",
        },
      },
      ResendVerificationSchema: {
        schema: ResendVerificationSchema,
        valid: { channel: "email" },
        invalid: { channel: "sms" },
      },
      ResetPasswordSchema: {
        schema: ResetPasswordSchema,
        valid: {
          confirmPassword: STRONG_PASSWORD,
          password: STRONG_PASSWORD,
          token: "reset-token",
          turnstileToken: "turnstile-token",
        },
        invalid: { confirmPassword: "password", password: "password", token: "" },
      },
      TurnstileTokenSchema: {
        schema: TurnstileTokenSchema,
        valid: "turnstile-token",
        invalid: "",
      },
      TwoFactorChallengeSchema: {
        schema: TwoFactorChallengeSchema,
        valid: { challengeId: validChallengeId, code: "481029", rememberDevice: false },
        invalid: { challengeId: validChallengeId, code: "48102", rememberDevice: false },
      },
      UsernameSchema: {
        schema: UsernameSchema,
        valid: "ada_lovelace",
        invalid: "ada-lovelace",
      },
    });
  });

  it("requires Turnstile for password-reset email requests", () => {
    assert.equal(ForgotPasswordSchema.safeParse({ email: "ada@example.com" }).success, false);
    assert.equal(
      ForgotPasswordSchema.safeParse({
        email: "ada@example.com",
        turnstileToken: "turnstile-token",
      }).success,
      true,
    );
  });

  it("requires Turnstile before consuming a password-reset token", () => {
    assert.equal(
      ResetPasswordSchema.safeParse({
        confirmPassword: STRONG_PASSWORD,
        password: STRONG_PASSWORD,
        token: "reset-token",
      }).success,
      false,
    );
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

  it("normalizes remember-me values", () => {
    for (const rememberMe of [true, "1", "on", "TRUE", "yes"]) {
      const parsed = assertAccepts(LoginSchema, { ...validLogin, rememberMe });
      assert.equal(parsed?.rememberMe, true);
    }

    for (const rememberMe of [false, "", "0", "no", 1, null, undefined]) {
      const parsed = assertAccepts(LoginSchema, { ...validLogin, rememberMe });
      assert.equal(parsed?.rememberMe, false);
    }
  });

  it("keeps the two-factor code out of the login form (K2)", () => {
    const parsed = assertAccepts(LoginSchema, { ...validLogin, twoFactorCode: "123456" });

    assert.equal("twoFactorCode" in (parsed as Record<string, unknown>), false);
  });

  it("accepts a six-digit two-factor code with a challenge id", () => {
    const parsed = assertAccepts(TwoFactorChallengeSchema, {
      challengeId: validChallengeId,
      code: " 481029 ",
      rememberDevice: "on",
    });

    assert.equal(parsed?.code, "481029");
    assert.equal(parsed?.rememberDevice, true);

    assertRejects(
      TwoFactorChallengeSchema,
      { challengeId: validChallengeId, code: "48102a", rememberDevice: false },
      ["code"],
    );
    assertRejects(
      TwoFactorChallengeSchema,
      { challengeId: "short", code: "481029", rememberDevice: false },
      ["challengeId"],
    );
    assertRejects(
      TwoFactorChallengeSchema,
      { challengeId: `${validChallengeId}!`, code: "481029", rememberDevice: false },
      ["challengeId"],
    );
  });

  it("normalizes backup codes to an unseparated uppercase value", () => {
    const parsed = assertAccepts(BackupCodeChallengeSchema, {
      backupCode: "7qf4-2kdx-9m",
      challengeId: validChallengeId,
    });

    assert.equal(parsed?.backupCode, "7QF42KDX9M");
    assertRejects(BackupCodeChallengeSchema, { backupCode: "---", challengeId: validChallengeId }, [
      "backupCode",
    ]);
  });

  it("accepts only six-digit verification codes", () => {
    assert.equal(assertAccepts(EmailVerificationCodeSchema, { code: " 290418 " })?.code, "290418");
    assertRejects(EmailVerificationCodeSchema, { code: "2904181" }, ["code"]);
    assertRejects(EmailVerificationCodeSchema, { code: "29041a" }, ["code"]);
  });

  it("enforces Turnstile and registration boundaries", () => {
    const base = {
      displayName: "Ada Lovelace",
      email: "ada@example.com",
      password: STRONG_PASSWORD,
      turnstileToken: "x",
      username: "ab",
    };
    assertAccepts(RegisterSchema, base);
    assertAccepts(RegisterSchema, {
      ...base,
      // 72 bayt tam sınır, dört kural da karşılanıyor.
      password: `Aa1!${"p".repeat(68)}`,
      turnstileToken: "x".repeat(4096),
      username: "u".repeat(32),
    });
    assertAccepts(RegisterSchema, {
      ...base,
      // Emoji sembol sayılır; 3 + 17×4 = 71 bayt.
      password: `Aa1${"🙂".repeat(17)}`,
    });
    assertRejects(RegisterSchema, { ...base, username: "a" }, ["username"]);
    assertRejects(RegisterSchema, { ...base, username: "u".repeat(33) }, ["username"]);
    assertRejects(RegisterSchema, { ...base, username: "ada-lovelace" }, ["username"]);
    assertRejects(RegisterSchema, { ...base, displayName: "A" }, ["displayName"]);
    assertRejects(RegisterSchema, { ...base, displayName: "n".repeat(61) }, ["displayName"]);
    assertRejects(RegisterSchema, { ...base, password: "short" }, ["password"]);
    assertRejects(RegisterSchema, { ...base, password: `Aa1!${"p".repeat(69)}` }, ["password"]);
    assertRejects(RegisterSchema, { ...base, password: `Aa1${"🙂".repeat(18)}` }, ["password"]);
    assertRejects(RegisterSchema, { ...base, turnstileToken: "" }, ["turnstileToken"]);
    assertRejects(RegisterSchema, { ...base, turnstileToken: "x".repeat(4097) }, [
      "turnstileToken",
    ]);
  });

  it("rejects registration passwords that miss the SPEC §4.4 rules", () => {
    const base = {
      displayName: "Ada Lovelace",
      email: "ada@example.com",
      turnstileToken: "turnstile-token",
      username: "ada_lovelace",
    };

    // Uzunluk var, kural sayısı 2 (uzunluk + büyük-küçük).
    assertRejects(RegisterSchema, { ...base, password: "Whisprpasswd" }, ["password"]);
    // Üç kural + uzunluk → kabul.
    assertAccepts(RegisterSchema, { ...base, password: "Whisprpasw1" });
    // Dokuz karakter, üç kural — uzunluk kuralı düşüyor.
    assertRejects(RegisterSchema, { ...base, password: "Ab1!efghi" }, ["password"]);
  });

  it("trims the display name", () => {
    assert.equal(assertAccepts(DisplayNameSchema, "  Ada Lovelace  "), "Ada Lovelace");
  });

  it("reports password confirmation refinements on confirmPassword", () => {
    assertRejects(
      ResetPasswordSchema,
      {
        confirmPassword: "different",
        password: STRONG_PASSWORD,
        token: "token",
        turnstileToken: "turnstile-token",
      },
      ["confirmPassword"],
    );
  });

  it("enforces reset-password token and password boundaries", () => {
    assertAccepts(ResetPasswordSchema, {
      confirmPassword: STRONG_PASSWORD,
      password: STRONG_PASSWORD,
      token: "token",
      turnstileToken: "turnstile-token",
    });
    assertRejects(
      ResetPasswordSchema,
      {
        confirmPassword: "Ab1!efghi",
        password: "Ab1!efghi",
        token: "token",
        turnstileToken: "turnstile-token",
      },
      ["password"],
    );
    assertRejects(
      ResetPasswordSchema,
      {
        confirmPassword: `Aa1!${"p".repeat(69)}`,
        password: `Aa1!${"p".repeat(69)}`,
        token: "token",
        turnstileToken: "turnstile-token",
      },
      ["password"],
    );
    assertRejects(
      ResetPasswordSchema,
      {
        confirmPassword: STRONG_PASSWORD,
        password: STRONG_PASSWORD,
        token: "",
        turnstileToken: "turnstile-token",
      },
      ["token"],
    );
  });
});
