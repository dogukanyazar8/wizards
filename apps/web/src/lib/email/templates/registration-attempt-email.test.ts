import assert from "node:assert/strict";
import { describe, it } from "node:test";

process.env.APP_URL = "https://whispr.app";

const { renderRegistrationAttemptEmail } =
  await import("@/lib/email/templates/registration-attempt-email");

describe("kayıt denemesi bildirimi", () => {
  it("mevcut metin korunur (K4 — kabuk ortaklaşır, metin değişmez)", () => {
    const { html, subject } = renderRegistrationAttemptEmail({ locale: "tr", name: "Ada" });

    assert.equal(subject, "Whispr kayıt denemesi bildirimi");
    assert.ok(html.includes("E-posta adresinizle kayıt denemesi"));
    assert.ok(html.includes("Merhaba Ada,"));
    assert.ok(
      html.includes("Birisi bu e-posta adresiyle yeni bir Whispr hesabı oluşturmaya çalıştı."),
    );
    assert.ok(html.includes("Hesabınızda değişiklik yapılmadı; bu iletiyi yok sayabilirsiniz."));
  });

  it("türetilen kabuk değerleri E1/E2 ile sınırlıdır", () => {
    const { html } = renderRegistrationAttemptEmail({ locale: "tr", name: "Ada" });

    assert.ok(html.includes("Hesap güvenliği"), "E1 bant etiketi");
    assert.ok(html.includes("Bildirim"), "E2 göz üstü etiketi");
    assert.match(html, /<title>Whispr kayıt denemesi<\/title>/);
  });

  it("eylemsiz düzen: kod kutusu, buton, yedek URL ve meta ızgarası yok (E3)", () => {
    const { html } = renderRegistrationAttemptEmail({ locale: "tr", name: "Ada" });

    assert.doesNotMatch(html, /class="w-code"/);
    assert.doesNotMatch(html, /class="w-url"/);
    assert.doesNotMatch(html, /class="w-meta"/);
    assert.doesNotMatch(html, /bgcolor="#5966F2"/);
    /* Alt bilgi bağlantıları dışında tıklanacak bir şey yok. */
    assert.equal([...html.matchAll(/<a href=/g)].length, 3);
  });

  it("İngilizce sürüm aynı kabuğu kullanır", () => {
    const { html, subject } = renderRegistrationAttemptEmail({ locale: "en", name: "Ada" });

    assert.equal(subject, "Whispr registration attempt notice");
    assert.match(html, /<html lang="en"/);
    assert.ok(html.includes("Registration attempt using your email"));
    assert.ok(html.includes("Account security"));
  });

  it("düz metin sürümü alt bilgiyi taşır", () => {
    const { text } = renderRegistrationAttemptEmail({ locale: "tr", name: "Ada" });

    assert.match(text, /^E-posta adresinizle kayıt denemesi\n\nMerhaba Ada,/);
    assert.ok(text.includes("Çerezler: https://whispr.app/cookies"));
    assert.ok(text.trimEnd().endsWith("© 2026 Whispr"));
  });

  it("alıcı adı kaçırılır", () => {
    const { html } = renderRegistrationAttemptEmail({ locale: "tr", name: "<script>x</script>" });

    assert.doesNotMatch(html, /<script>/);
    assert.match(html, /&lt;script&gt;x&lt;\/script&gt;/);
  });
});
