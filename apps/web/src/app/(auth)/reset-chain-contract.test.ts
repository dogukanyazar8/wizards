import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import { PASSWORD_RESET_TOKEN_EXPIRY_MINUTES } from "@/lib/auth/password-reset";
import {
  EMAIL_CODE_RESEND_COOLDOWN_MS,
  EMAIL_CODE_TTL_MS,
} from "@/lib/auth/email-verification-code";

/**
 * SPEC-GIRIS-KAYIT §4.5 ve §4.7 — doğrulama ve şifre sıfırlama zincirinin sözleşmesi.
 *
 * Beş ekran, tek akış. Ekranlar `useRouter` ve sunucu eylemlerine bağlı olduğu için doğrulama
 * kaynak düzeyinde yapılıyor (Ş4/Ş5 ile aynı yöntem); canlı çizim Ş9'un e2e'sinde.
 */

const AUTH_DIR = path.join(process.cwd(), "src", "app", "(auth)");

function read(...segments: string[]) {
  return readFileSync(path.join(AUTH_DIR, ...segments), "utf8");
}

const VERIFY_PAGE = read("verify-email", "page.tsx");
const VERIFY_CLIENT = read("verify-email", "verify-email-client.tsx");
const FORGOT = read("forgot-password", "forgot-password-client.tsx");
const SENT = read("forgot-password", "sent", "sent-client.tsx");
const RESET = read("reset-password", "reset-password-client.tsx");
const DONE = read("reset-password", "done", "done-client.tsx");

function findHardcodedTextNodes(source: string): string[] {
  const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  return (withoutComments.match(/>[^<>{}\n]+</g) ?? [])
    .map((match) => match.slice(1, -1).trim())
    .filter((text) => /[A-Za-zÇĞİÖŞÜçğıöşü]/.test(text));
}

describe("verification and reset chain contract", () => {
  it("keeps the verification route two-headed (K3)", () => {
    // Token varsa bağlantı sonucu sunucuda, yoksa kod ekranı istemcide.
    assert.match(VERIFY_PAGE, /if \(!token\) \{\s*return <VerifyEmailClient next=\{next\} \/>;/);
    assert.match(VERIFY_PAGE, /await verifyEmailToken\(token\)/);
  });

  it("shows the blocking panel for an expired link (SPEC §7\/8)", () => {
    assert.match(VERIFY_PAGE, /auroraTone="danger-block"/);
    assert.match(VERIFY_PAGE, /auth\.status\.linkExpired\.title/);
    assert.match(VERIFY_PAGE, /auth\.status\.linkExpired\.action/);
  });

  it("carries the SPEC §4.5 pieces on the code screen", () => {
    for (const key of [
      "auth.verifyEmail.eyebrow",
      "auth.verifyEmail.title",
      "auth.verifyEmail.subtitle",
      "auth.verifyEmail.cta",
      "auth.verifyEmail.resend",
      "auth.verifyEmail.wait",
      "auth.verifyEmail.changeEmail",
    ]) {
      assert.ok(VERIFY_CLIENT.includes(key), `${key} doğrulama ekranında yok.`);
    }

    assert.match(VERIFY_CLIENT, /<AuthCodeInput/);
    assert.equal(
      /onComplete=/.test(VERIFY_CLIENT),
      false,
      "Kod tamamlanınca otomatik gönderiliyor.",
    );
  });

  it("swaps the resend link for a countdown while the cooldown runs", () => {
    for (const [name, source] of [
      ["verify-email", VERIFY_CLIENT],
      ["sent", SENT],
    ] as const) {
      assert.match(source, /countdown\.remainingMs > 0 \? \(/, `${name} sayacı yok.`);
    }

    // SPEC §4.7 — bağlantının **yerine** pill geçer.
    assert.match(SENT, /<AuthCountdownPill>[\s\S]*?auth\.forgotPassword\.resendWait/);
    assert.match(SENT, /data-testid="resend-reset-link"/);
  });

  it("changes exactly the three things SPEC §4.7 asks when the link is resent", () => {
    // 1 — aurora success tonuna geçer.
    assert.match(SENT, /auroraTone=\{resent \? "success" : "default"\}/);
    // 2 — success tonunda bant girer (glif `↻` bileşenin içinde).
    assert.match(SENT, /<AuthBanner[\s\S]*?tone="success"/);
    assert.match(SENT, /auth\.forgotPassword\.resentTitle/);
    // 3 — geri sayım pill'i bağlantının yerini alır.
    assert.match(SENT, /setRetryAfterMs\(actionResult\.retryAfterMs\)/);
  });

  it("never puts the address or the outcome in the URL", () => {
    for (const [name, source] of [
      ["forgot", FORGOT],
      ["sent", SENT],
      ["reset", RESET],
      ["done", DONE],
      ["verify", VERIFY_CLIENT],
    ] as const) {
      assert.equal(/\?email=/.test(source), false, `${name} adresi sorguya yazıyor.`);
      assert.equal(/searchParams/.test(source), false, `${name} sorgudan kişisel veri okuyor.`);
    }

    assert.match(FORGOT, /storePendingResetRequest\(/);
    assert.match(RESET, /storeResetOutcome\(/);
  });

  it("keeps the confirm field on the reset screen (K10)", () => {
    assert.equal((RESET.match(/<PasswordInput/g) ?? []).length, 2);
    assert.match(RESET, /auth\.field\.newPassword/);
    assert.match(RESET, /auth\.field\.confirmNewPassword/);
    assert.match(RESET, /<AuthPasswordStrength/);
  });

  it("gates the reset submit on the shared policy and the match", () => {
    const gate = RESET.slice(RESET.indexOf("const canSubmit"), RESET.indexOf("if (tokenExpired"));

    assert.match(gate, /meetsPasswordPolicy\(password\)/);
    assert.match(gate, /password === confirmPassword/);
  });

  it("centres the closing screen and inverts the aurora (SPEC §4.7)", () => {
    assert.match(DONE, /align="center"/);
    assert.match(DONE, /auroraTone="success-final"/);
    assert.match(DONE, /<AuthSuccessRing>/);
  });

  it("hides the device band when nothing was signed out", () => {
    assert.match(DONE, /outcome\.signedOutDeviceCount > 0 \? \(/);
    assert.match(DONE, /auth\.resetPassword\.doneMeta/);
  });

  it("sends the closing screen back to sign-in when opened directly", () => {
    assert.match(DONE, /if \(!stored\) \{[\s\S]*?router\.replace\("\/login"\)/);
  });

  it("leaves no hardcoded text node across the five screens", () => {
    for (const [name, source] of [
      ["verify-page", VERIFY_PAGE],
      ["verify-client", VERIFY_CLIENT],
      ["forgot", FORGOT],
      ["sent", SENT],
      ["reset", RESET],
      ["done", DONE],
    ] as const) {
      assert.deepEqual(findHardcodedTextNodes(source), [], `${name} sabit metin taşıyor.`);
    }
  });

  it("keeps the SPEC durations the screens promise", () => {
    // `Bağlantı 30 dakika geçerli` (SPEC §4.7) ve `Kod 10 dakika geçerli` (SPEC §4.5).
    assert.equal(PASSWORD_RESET_TOKEN_EXPIRY_MINUTES, 30);
    assert.equal(EMAIL_CODE_TTL_MS, 10 * 60_000);
    assert.equal(EMAIL_CODE_RESEND_COOLDOWN_MS, 60_000);
  });
});
