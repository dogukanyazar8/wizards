import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import { evaluatePasswordStrength, meetsPasswordPolicy } from "@wizards/types";

/**
 * SPEC-GIRIS-KAYIT §4.4 — hesap oluşturma ekranının sözleşmesi.
 *
 * Ekran `useRouter` ve sunucu eylemine bağlı olduğu için bu kabukta render edilemiyor; doğrulama
 * kaynak düzeyinde ve paylaşılan saf mantık üstünden yapılıyor (Ş4 ile aynı yöntem).
 */

const REGISTER = readFileSync(
  path.join(process.cwd(), "src", "app", "(auth)", "register", "register-client.tsx"),
  "utf8",
);

function findHardcodedTextNodes(source: string): string[] {
  const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  return (withoutComments.match(/>[^<>{}\n]+</g) ?? [])
    .map((match) => match.slice(1, -1).trim())
    .filter((text) => /[A-Za-zÇĞİÖŞÜçğıöşü]/.test(text));
}

describe("register screen contract", () => {
  it("orders the eight blocks exactly as SPEC §4.4", () => {
    const order = [
      "auth.register.eyebrow",
      "auth.register.title",
      "auth.register.subtitle",
      "auth.field.fullName",
      "auth.field.username",
      "auth.register.usernameHint",
      "auth.field.email",
      "auth.field.emailDetected",
      "auth.field.password",
      "AuthPasswordStrength",
      "AuthTurnstileRow",
      "auth.register.terms",
      "auth.register.cta",
      "auth.register.haveAccount",
    ];

    let cursor = -1;
    for (const marker of order) {
      const index = REGISTER.indexOf(marker, cursor + 1);
      assert.ok(index > cursor, `${marker} sırada değil.`);
      cursor = index;
    }
  });

  it("keeps the name and username fields in one two-column row", () => {
    assert.match(REGISTER, /grid grid-cols-2 gap-\[var\(--auth-field-grid-gap\)\]/);
    const grid = REGISTER.slice(
      REGISTER.indexOf("grid grid-cols-2"),
      REGISTER.indexOf("auth.register.usernameHint"),
    );

    assert.match(grid, /auth\.field\.fullName/);
    assert.match(grid, /auth\.field\.username/);
    // SPEC §4.4/1 — bu iki alan h44, yani "compact".
    assert.equal((grid.match(/fieldSize="compact"/g) ?? []).length, 2);
  });

  it("drops the confirm-password field (K10)", () => {
    assert.equal(/confirmPassword/.test(REGISTER), false);
    assert.equal((REGISTER.match(/<PasswordInput/g) ?? []).length, 1);
  });

  it("accepts only an email in the contact field (K1)", () => {
    // Örnek adres artık sözlükten geliyor (Ş9 · SPEC §12/9: ekranda sabit metin yok).
    assert.match(REGISTER, /placeholder=\{t\("auth\.field\.emailPlaceholder"\)\}/);
    assert.match(REGISTER, /auth\.field\.emailDetected/);
    // Telefon dalı bu pakette yok: algılama satırı telefon anahtarını hiç okumamalı.
    assert.equal(/auth\.field\.phoneDetected|auth\.field\.contact\b/.test(REGISTER), false);
  });

  it("reserves the detection line so the layout never jumps", () => {
    assert.match(REGISTER, /color: emailDetected \? "hsl\(var\(--success\)\)" : "transparent"/);
    assert.match(REGISTER, /aria-live="polite"/);
  });

  it("hides the footer on this screen (K13)", () => {
    assert.match(REGISTER, /variant="register"/);
  });

  it("gates submission on SPEC §10", () => {
    const gate = REGISTER.slice(REGISTER.indexOf("const canSubmit"), REGISTER.indexOf("return ("));

    assert.match(gate, /displayName\.trim\(\)\.length >= 2/);
    assert.match(gate, /username\.trim\(\)\.length >= 2/);
    assert.match(gate, /emailDetected/);
    assert.match(gate, /meetsPasswordPolicy\(password\)/);
    assert.match(gate, /termsAccepted/);
    assert.match(gate, /turnstileToken/);
  });

  it("asks the server about the username when the field is left", () => {
    assert.match(REGISTER, /\/api\/v1\/auth\/username-availability/);
    assert.match(REGISTER, /register\("username", \{ onBlur: handleUsernameBlur \}\)/);
    assert.match(REGISTER, /data-testid="username-suggestions"/);
    assert.match(REGISTER, /AuthSuggestionChip key=\{suggestion\}/);
  });

  it("offers sign-in and reset when the email is already registered (durum 6)", () => {
    const block = REGISTER.slice(REGISTER.indexOf('result?.status === "emailRegistered"'));

    assert.match(block, /href="\/login"/);
    assert.match(block, /href="\/forgot-password"/);
  });

  it("carries the email to verification without putting it in the URL", () => {
    assert.match(REGISTER, /storePendingVerificationEmail\(/);
    assert.equal(/verify-email\?email=/.test(REGISTER), false);
  });

  it("drops the legacy pieces", () => {
    for (const banned of [
      "RoleTabs",
      "LoginCard",
      "LoginPage",
      "REGISTER_COPY",
      "verificationEmail",
    ]) {
      assert.equal(REGISTER.includes(banned), false, `${banned} hâlâ kayıt ekranında.`);
    }
  });

  it("leaves no hardcoded text node", () => {
    assert.deepEqual(findHardcodedTextNodes(REGISTER), []);
  });

  it("keeps the submission gate honest against the shared policy", () => {
    // İki kural (uzunluk + büyük/küçük) yeterli değil.
    assert.equal(evaluatePasswordStrength("Whisprpasswd").satisfiedCount, 2);
    assert.equal(meetsPasswordPolicy("Whisprpasswd"), false);

    // Üç kural + uzunluk açar.
    assert.equal(meetsPasswordPolicy("Whisprpasw1"), true);

    // Dokuz karakter üç kuralı sağlasa da uzunluk kuralı düşüyor.
    assert.equal(meetsPasswordPolicy("Ab1!efghi"), false);
  });
});
