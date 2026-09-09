import assert from "node:assert/strict";
import { describe, it } from "node:test";

process.env.APP_URL = "https://whispr.app";

const { renderVerificationCodeEmail, toSpacedCode } =
  await import("@/lib/email/templates/verification-code-email");

const VERIFICATION_URL = "https://whispr.app/verify-email?token=ornek-token";

function render(overrides: Partial<Parameters<typeof renderVerificationCodeEmail>[0]> = {}) {
  return renderVerificationCodeEmail({
    code: "482915",
    codeTtlMinutes: 10,
    locale: "tr",
    name: "Ada",
    verificationUrl: VERIFICATION_URL,
    ...overrides,
  });
}

/** SPEC §4 — metinler birebir; kısaltma, yeniden yazma veya çeviri yok. */
const SPEC_TR = {
  body: "Merhaba Ada, Whispr hesabını oluşturmak için aşağıdaki tek kullanımlık kodu uygulamadaki doğrulama alanına gir.",
  ctaNote: "Kodu elle girmek istemiyorsan bu bağlantı yeterli.",
  cta: "Doğrulamayı tarayıcıda tamamla",
  codeLabel: "Doğrulama kodu",
  eyebrow: "Son bir adım",
  heading: "E-posta adresini doğrula",
  securityBody:
    "İsteği sen yapmadıysan bir şey yapmana gerek yok; kod kullanılmadan geçersiz olur ve hesap açılmaz.",
  securityLabel: "Bu hesabı sen mi oluşturdun?",
};

describe("doğrulama kodu e-postası", () => {
  it("SPEC §4 metinlerini birebir taşır", () => {
    const { html } = render();

    for (const [key, text] of Object.entries(SPEC_TR)) {
      assert.ok(html.includes(text), `${key} metni birebir geçmiyor`);
    }

    assert.match(
      html,
      /Kod <span style="color:#B4761A;font-weight:600;">10 dakika<\/span> geçerli\./,
    );
    assert.match(html, /<title>Whispr doğrulama kodun<\/title>/);
    assert.ok(html.includes("Hesap doğrulama"), "bant etiketi eksik");
  });

  it("konu satırı kodu taşır, kod yoksa kodsuz biçime düşer", () => {
    assert.equal(render().subject, "Whispr doğrulama kodun: 482915");
    assert.equal(render({ code: null }).subject, "Whispr doğrulama kodun");
    assert.equal(render({ locale: "en" }).subject, "Your Whispr verification code: 482915");
  });

  it("kod üretilemediyse kutu ve kod medya kuralı hiç çizilmez", () => {
    const { html } = render({ code: null });

    assert.doesNotMatch(html, /class="w-code"/);
    assert.doesNotMatch(html, /\.w-code/);
    assert.doesNotMatch(html, /482915/);
    assert.doesNotMatch(html, /Doğrulama kodu</);
    /* Buton kutusuz düzende paragrafın kendi boşluğuna dayanır. */
    assert.match(html, /<td align="center">\n/);
    assert.ok(html.includes(SPEC_TR.cta), "kodsuz mektupta buton kalmalı");
  });

  it("rakam olmayan kod kabul edilmez", () => {
    const { html, subject } = render({ code: "48A915" });

    assert.equal(subject, "Whispr doğrulama kodun");
    assert.doesNotMatch(html, /48A915/);
  });

  it("önizleme satırı kodu üçerli okur ve 85-110 karakter arasında kalır", () => {
    assert.equal(toSpacedCode("482915"), "482 915");

    for (const locale of ["tr", "en"] as const) {
      for (const code of ["482915", null]) {
        const { html } = render({ code, locale });
        const preheader = /<span style="display:none[^"]*">([^<]*)<\/span>/.exec(html)?.[1] ?? "";

        assert.ok(
          preheader.length >= 85 && preheader.length <= 110,
          `${locale}/${code ? "kodlu" : "kodsuz"} önizleme ${preheader.length} karakter`,
        );
      }
    }

    assert.ok(render().html.includes("Doğrulama kodun 482 915 — 10 dakika geçerli."));
  });

  it("İngilizce sürüm aynı tasarımı taşır", () => {
    const { html } = render({ locale: "en" });

    assert.match(html, /<html lang="en"/);
    assert.ok(html.includes("Verify your email address"));
    assert.ok(html.includes("Account verification"));
    assert.ok(html.includes("Finish verification in your browser"));
    assert.match(
      html,
      /Code valid for <span style="color:#B4761A;font-weight:600;">10 minutes<\/span>\./,
    );
  });

  it("alıcı adı kaçırılır", () => {
    const { html } = render({ name: '<img src=x onerror="alert(1)">' });

    assert.doesNotMatch(html, /<img/);
    assert.match(html, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
  });

  it("düz metin sürümü aynı sırayı ve adresleri taşır", () => {
    const { text } = render();

    assert.match(text, /^E-posta adresini doğrula\n\nMerhaba Ada,/);
    assert.ok(text.includes("482915"));
    assert.ok(text.includes(VERIFICATION_URL));
    assert.ok(text.includes("Gizlilik: https://whispr.app/privacy"));
    assert.ok(text.trimEnd().endsWith("© 2026 Whispr"));
    assert.doesNotMatch(text, /<[a-z]/i);
  });

  it("bağlantı ürün rotasına bakar (K1)", () => {
    const { html } = render();
    const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1] ?? "");

    assert.ok(hrefs.includes(VERIFICATION_URL));
    assert.ok(hrefs.every((href) => href.startsWith("https://")));
    assert.doesNotMatch(html, /whispr\.app\/(dogrula|gizlilik|sartlar|cerezler)/);
  });
});
