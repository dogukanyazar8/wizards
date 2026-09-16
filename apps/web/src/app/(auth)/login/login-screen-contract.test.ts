import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import { formatCountdown } from "@/lib/auth/countdown";
import { formatBackupCode } from "@/app/(auth)/login/backup-code/backup-code-client";

/**
 * SPEC-GIRIS-KAYIT §4.1 · §4.2 · §4.3 — üç giriş ekranının sözleşmesi.
 *
 * Ekranlar `useRouter` ve sunucu eylemleri kullandığı için bu kabukta gerçek render edilemiyor
 * (`renderToStaticMarkup` Next yönlendiricisini bulamaz). Bu yüzden doğrulama iki koldan gider:
 * saf yardımcılar davranışıyla, ekranlar kaynak düzeyinde. Canlı çizim Ş9'un e2e'sinde ölçülecek.
 */

const LOGIN_DIR = path.join(process.cwd(), "src", "app", "(auth)", "login");

function readScreen(...segments: string[]) {
  return readFileSync(path.join(LOGIN_DIR, ...segments), "utf8");
}

const LOGIN = readScreen("login-client.tsx");
const TWO_FACTOR = readScreen("two-factor", "two-factor-client.tsx");
const BACKUP = readScreen("backup-code", "backup-code-client.tsx");

/**
 * JSX metin düğümü taraması.
 *
 * "Sabit metin" derken kastedilen, kullanıcıya **görünen** ama sözlükten gelmeyen bir dize:
 * `<p>Merhaba</p>` gibi. Öznitelik değerleri (sınıf adı, rota, `data-testid`) görünmez, bu yüzden
 * yalnız etiketler arasındaki metin düğümleri aranır.
 */
function findHardcodedTextNodes(source: string): string[] {
  const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  return (withoutComments.match(/>[^<>{}\n]+</g) ?? [])
    .map((match) => match.slice(1, -1).trim())
    .filter((text) => /[A-Za-zÇĞİÖŞÜçğıöşü]/.test(text));
}

describe("login screen contract", () => {
  it("orders the sign-in screen exactly as SPEC §4.1", () => {
    const order = [
      "auth.login.eyebrow",
      "auth.login.title",
      "auth.login.subtitle",
      "auth.field.email",
      "auth.field.password",
      "auth.login.forgot",
      "auth.login.remember",
      "auth.login.cta",
      "SocialAuthButtons",
      "auth.login.noAccount",
      "auth.login.createAccount",
    ];

    let cursor = -1;
    for (const marker of order) {
      const index = LOGIN.indexOf(marker, cursor + 1);
      assert.ok(index > cursor, `${marker} sırada değil.`);
      cursor = index;
    }
  });

  it("keeps the sign-in identifier's autocomplete token valid (WCAG 1.3.5)", () => {
    /*
     * `autocomplete` accepts one field name; `"username email"` is two, which axe reports as
     * `autocomplete-valid` and browsers ignore. `username` alone is the login identifier token
     * and covers e-mail addresses too.
     */
    assert.match(LOGIN, /<TextInput\s+autoComplete="username"\s/);
    assert.doesNotMatch(LOGIN, /autoComplete="username email"/);
  });

  it("keeps the forgot-password link inside the label row (SPEC §4.1)", () => {
    assert.match(
      LOGIN,
      /labelAction=\{\s*<AuthLink href="\/forgot-password" size="small">\s*\{t\("auth\.login\.forgot"\)\}/,
    );
  });

  it("shows the attempts counter beside remember-me (SPEC §8\/1)", () => {
    assert.match(LOGIN, /trailing=\{[\s\S]*?auth\.status\.credentials\.attemptsLeft/);
  });

  it("turns only the password field red on a credential failure", () => {
    // E-posta alanının `error` özelliği yok: SPEC §8/1 diğer alanlara dokunulmamasını istiyor.
    const emailBlock = LOGIN.slice(LOGIN.indexOf("<TextInput"), LOGIN.indexOf("<PasswordInput"));
    assert.equal(/error=/.test(emailBlock), false);
    assert.match(LOGIN, /error=\{credentialsFailed \? t\("auth\.status\.credentials\.field"\)/);
  });

  it("replaces the form with a blocking panel when locked or suspended (SPEC §8\/3)", () => {
    assert.match(LOGIN, /blockedStatus \? \(\s*<AuthBlockingPanel/);
    assert.match(LOGIN, /statusId=\{blockedStatus\}/);
  });

  it("never puts the challenge id in the URL (K2)", () => {
    for (const [name, source] of [
      ["login", LOGIN],
      ["two-factor", TWO_FACTOR],
      ["backup-code", BACKUP],
    ] as const) {
      assert.equal(/challengeId=\$\{/.test(source), false, `${name} challenge'ı URL'e yazıyor.`);
      assert.equal(
        /searchParams.*challenge/i.test(source),
        false,
        `${name} challenge'ı sorguda okuyor.`,
      );
    }

    assert.match(LOGIN, /storeTwoFactorChallenge\(\{ challengeId: actionResult\.challengeId/);
    assert.match(LOGIN, /router\.replace\("\/login\/two-factor"\)/);
  });

  it("sends the second-step screens back to sign-in without a challenge", () => {
    for (const source of [TWO_FACTOR, BACKUP]) {
      assert.match(source, /useState<PendingTwoFactorChallenge \| null>\(readTwoFactorChallenge\)/);
      assert.match(source, /if \(hydrated && !challenge\) \{\s*router\.replace\("\/login"\);/);
      assert.match(source, /if \(!hydrated \|\| !challenge\) \{\s*return null;/);
    }
  });

  it("never auto-submits the six-digit code (SPEC §4.2)", () => {
    assert.equal(
      /onComplete=/.test(TWO_FACTOR),
      false,
      "Kod tamamlanınca form kendiliğinden gidiyor.",
    );
    assert.match(TWO_FACTOR, /disabled=\{code\.length !== AUTH_METRICS\.codeCell\.count/);
  });

  it("carries the SPEC §4.2 pieces on the two-factor screen", () => {
    for (const key of [
      "auth.twoFactor.eyebrow",
      "auth.twoFactor.title",
      "auth.twoFactor.subtitle",
      "auth.twoFactor.rememberDevice",
      "auth.twoFactor.cta",
      "auth.twoFactor.useBackup",
      "auth.common.backToLogin",
    ]) {
      assert.ok(TWO_FACTOR.includes(key), `${key} 2FA ekranında yok.`);
    }

    assert.match(TWO_FACTOR, /href="\/login\/backup-code"/);
  });

  it("carries the SPEC §4.3 pieces on the backup-code screen", () => {
    for (const key of [
      "auth.twoFactor.eyebrow",
      "auth.backupCode.title",
      "auth.backupCode.subtitle",
      "auth.field.backupCode",
      "auth.twoFactor.cta",
      "auth.common.backToLogin",
    ]) {
      assert.ok(BACKUP.includes(key), `${key} yedek kod ekranında yok.`);
    }

    assert.match(BACKUP, /fieldSize="code"/);
    // Örnek kod artık sözlükten geliyor (Ş9 · SPEC §12/9: ekranda sabit metin yok).
    assert.match(BACKUP, /placeholder=\{t\("auth\.field\.backupCodePlaceholder"\)\}/);
  });

  it("drops the legacy pieces (K4)", () => {
    for (const banned of [
      "RoleTabs",
      "AUTH_ERROR_MESSAGES",
      "showTwoFactorPrompt",
      "LoginCard",
      "SocialLogin",
    ]) {
      assert.equal(LOGIN.includes(banned), false, `${banned} hâlâ giriş ekranında.`);
    }
  });

  it("keeps the desktop OAuth handoff wiring", () => {
    assert.match(LOGIN, /buildDesktopOAuthStartUrl/);
    assert.match(LOGIN, /isWhisprDesktopRuntime/);
    assert.match(LOGIN, /DesktopOAuthPendingDialog/);
    assert.match(LOGIN, /SplashScreen step="session" surface="desktop" variant="overlay"/);
  });

  it("leaves no hardcoded text node in the three screens", () => {
    for (const [name, source] of [
      ["login", LOGIN],
      ["two-factor", TWO_FACTOR],
      ["backup-code", BACKUP],
    ] as const) {
      assert.deepEqual(findHardcodedTextNodes(source), [], `${name} sabit metin taşıyor.`);
    }
  });

  it("masks the backup code as 4-4-2 and normalizes the value", () => {
    assert.equal(formatBackupCode("7qf42kdx9m"), "7QF4-2KDX-9M");
    assert.equal(formatBackupCode("7QF4-2KDX-9M"), "7QF4-2KDX-9M");
    assert.equal(formatBackupCode("7qf4 2kdx 9m"), "7QF4-2KDX-9M");
    assert.equal(formatBackupCode("7qf4"), "7QF4");
    assert.equal(formatBackupCode("7qf42"), "7QF4-2");
    assert.equal(formatBackupCode("7QF42KDX9MEXTRA"), "7QF4-2KDX-9M");
    assert.equal(formatBackupCode("---"), "");
  });

  it("formats every countdown as mm:ss (SPEC §4.5, §4.7, §7)", () => {
    assert.equal(formatCountdown(42_000), "00:42");
    assert.equal(formatCountdown(58_000), "00:58");
    assert.equal(formatCountdown(14 * 60_000 + 32_000), "14:32");
    assert.equal(formatCountdown(118_000), "01:58");
    assert.equal(formatCountdown(0), "00:00");
    assert.equal(formatCountdown(-5_000), "00:00");
  });
});
