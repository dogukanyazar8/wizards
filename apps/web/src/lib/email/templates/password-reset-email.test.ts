import assert from "node:assert/strict";
import { describe, it } from "node:test";

process.env.APP_URL = "https://whispr.app";

const { renderPasswordResetEmail } = await import("@/lib/email/templates/password-reset-email");

const RESET_URL = "https://whispr.app/reset-password?token=ornek-token";

function render(overrides: Partial<Parameters<typeof renderPasswordResetEmail>[0]> = {}) {
  return renderPasswordResetEmail({
    accountEmail: "ada@whispr.app",
    locale: "tr",
    name: "Ada",
    requestContext: {
      deviceLine: "Chrome · macOS · İstanbul, TR",
      requestedAtLabel: "27 Ağustos 2026, 14:32 (GMT+3)",
    },
    resetUrl: RESET_URL,
    ttlMinutes: 30,
    ...overrides,
  });
}

/** SPEC §5 — metinler birebir. */
const SPEC_TR = {
  body: "Merhaba Ada, ada@whispr.app hesabı için şifre sıfırlama isteği aldık. Aşağıdaki bağlantı seni yeni şifre belirleme ekranına götürür.",
  cta: "Şifremi sıfırla",
  eyebrow: "Şifre sıfırlama",
  fallbackLabel: "Düğme çalışmıyorsa",
  heading: "Yeni bir şifre belirle",
  metaDevice: "Cihaz",
  metaTime: "İstek zamanı",
  securityLabel: "Bu isteği sen yapmadıysan",
};

describe("şifre sıfırlama e-postası", () => {
  it("SPEC §5 metinlerini birebir taşır", () => {
    const { html, subject } = render();

    for (const [key, text] of Object.entries(SPEC_TR)) {
      assert.ok(html.includes(text), `${key} metni birebir geçmiyor`);
    }

    assert.equal(subject, "Şifreni sıfırla — bağlantı 30 dakika geçerli");
    assert.match(html, /<title>Whispr şifre sıfırlama<\/title>/);
    assert.ok(html.includes("Hesap güvenliği"), "bant etiketi eksik");
    assert.match(
      html,
      /Bağlantı <span style="color:#B4761A;font-weight:600;">30 dakika<\/span> geçerli ve tek kullanımlıktır\./,
    );
  });

  it("güvenlik notundaki bağlantı ayarlar güvenlik sayfasına gider", () => {
    const { html } = render();

    assert.ok(
      html.includes(
        'E-postayı yok sayman yeterli; şifren değişmez. Hesabına başkasının erişmeye çalıştığını düşünüyorsan <a href="https://whispr.app/settings/account/security" style="color:#4C59E0;text-decoration:underline;font-weight:600;">tüm oturumlarını kapat</a> ve iki adımlı doğrulamayı aç.',
      ),
      "güvenlik notu birebir değil",
    );
  });

  it("buton ve yedek URL kutusu aynı adresi taşır", () => {
    const { html } = render();
    const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);
    const resetHrefs = hrefs.filter((href) => href === RESET_URL);

    assert.equal(resetHrefs.length, 2, "buton ve yedek kutu aynı adresi göstermeli");
    assert.ok(html.includes(`>${RESET_URL}</a>`), "yedek kutuda adres metin olarak da yazılmalı");
  });

  it("istek özeti iki kolonu doldurur", () => {
    const { html } = render();

    assert.match(html, /width="50%" class="w-meta" style="width:50%;padding:18px 10px 20px 0;/);
    assert.ok(html.includes("27 Ağustos 2026, 14:32 (GMT+3)"));
    assert.ok(html.includes("Chrome · macOS · İstanbul, TR"));
  });

  it("cihaz satırı çözülemediyse hücre çizilmez ve zaman tam genişliğe yayılır", () => {
    const { html, text } = render({
      requestContext: {
        deviceLine: null,
        requestedAtLabel: "27 Ağustos 2026, 14:32 (GMT+3)",
      },
    });

    assert.match(html, /width="100%" class="w-meta" style="width:100%;padding:18px 0 20px 0;/);
    assert.doesNotMatch(html, /Cihaz</);
    assert.doesNotMatch(text, /Cihaz:/);
    assert.ok(html.includes("İstek zamanı"));
  });

  it("İngilizce sürüm aynı tasarımı taşır", () => {
    const { html, subject } = render({ locale: "en" });

    assert.equal(subject, "Reset your password — link valid for 30 minutes");
    assert.match(html, /<html lang="en"/);
    assert.ok(html.includes("Set a new password"));
    assert.ok(html.includes("Account security"));
    assert.ok(html.includes("If the button doesn&#39;t work"));
    assert.ok(html.includes("Request time"));
    assert.ok(html.includes("sign out of all sessions"));
  });

  it("alıcı adı ve hesap adresi kaçırılır", () => {
    const { html } = render({ accountEmail: "a<b>@whispr.app", name: "<script>x</script>" });

    assert.doesNotMatch(html, /<script>/);
    assert.match(html, /&lt;script&gt;x&lt;\/script&gt;/);
    assert.match(html, /a&lt;b&gt;@whispr\.app/);
  });

  it("düz metin sürümü aynı sırayı ve adresleri taşır", () => {
    const { text } = render();

    assert.match(text, /^Yeni bir şifre belirle\n\nMerhaba Ada, ada@whispr\.app/);
    assert.ok(text.includes(RESET_URL));
    assert.ok(text.includes("Bağlantı 30 dakika geçerli ve tek kullanımlıktır."));
    assert.ok(text.includes("İstek zamanı: 27 Ağustos 2026, 14:32 (GMT+3)"));
    assert.ok(text.includes("Cihaz: Chrome · macOS · İstanbul, TR"));
    assert.ok(text.includes("https://whispr.app/settings/account/security"));
    assert.ok(text.trimEnd().endsWith("© 2026 Whispr"));
    assert.doesNotMatch(text, /<[a-z]/i);
  });

  it("önizleme satırı 85-110 karakter arasında kalır", () => {
    for (const locale of ["tr", "en"] as const) {
      const { html } = render({ locale });
      const preheader = /<span style="display:none[^"]*">([^<]*)<\/span>/.exec(html)?.[1] ?? "";

      assert.ok(
        preheader.length >= 85 && preheader.length <= 110,
        `${locale} önizleme ${preheader.length} karakter`,
      );
    }
  });

  it("bağlantılar ürün rotalarına bakar (K1)", () => {
    const { html } = render();

    assert.doesNotMatch(html, /whispr\.app\/(sifre-sifirla|guvenlik|gizlilik|sartlar|cerezler)/);
    assert.ok(html.includes("https://whispr.app/settings/account/security"));
  });
});
