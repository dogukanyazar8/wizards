import assert from "node:assert/strict";
import { describe, it } from "node:test";

process.env.APP_URL = "https://whispr.app";

const { renderAccountDeletionReauthEmail } =
  await import("@/lib/email/templates/account-deletion-reauth-email");

const WEB_URL = "https://whispr.app/settings/reauth/ornek-token";
const MOBILE_URL = "whispr://reauth/account-delete/ornek-token";

function render(overrides: Partial<Parameters<typeof renderAccountDeletionReauthEmail>[0]> = {}) {
  return renderAccountDeletionReauthEmail({
    expiryMinutes: 10,
    locale: "tr",
    name: "Ada",
    reauthUrl: WEB_URL,
    ...overrides,
  });
}

/** Mevcut metin korunur; kabuk ortaklaşır (K4 deseni). */
const EXISTING_TR = {
  body: "Bu hesabı silmeden önce doğrulamak için bir istek aldık. Devam etmek için aşağıdaki güvenli bağlantıyı kullan.",
  cta: "Hesap silmeyi doğrula",
  greeting: "Merhaba Ada,",
  heading: "Hesap silmeyi doğrula",
  rationale:
    "Whispr, yalnızca OAuth ile açılmış hesapları silmeden önce taze e-posta doğrulaması ister.",
};

describe("hesap silme yeniden kimlik doğrulama e-postası", () => {
  it("eski metni birebir korur", () => {
    const { html, subject } = render();

    for (const [key, text] of Object.entries(EXISTING_TR)) {
      assert.ok(html.includes(text), `${key} metni birebir geçmiyor`);
    }

    assert.equal(subject, "Whispr hesap silme işlemini doğrula");
    assert.match(html, /<title>Hesap silmeyi doğrula<\/title>/);
  });

  it("süre cümlesi eskisiyle aynı kelimeleri üretir, yalnız vurgu kazanır", () => {
    const { html, text } = render();

    assert.match(
      html,
      /Bu bağlantı <span style="color:#B4761A;font-weight:600;">10 dakika<\/span> içinde sona erer\./,
    );
    assert.ok(text.includes("Bu bağlantı 10 dakika içinde sona erer."));
  });

  it("güvenlik notu eski cümlenin etiket + gövde bölünmüş hâlidir", () => {
    const { html } = render();

    assert.ok(html.includes("Hesap silme isteğinde bulunmadıysan"));
    assert.ok(html.includes("Bu e-postayı güvenle yok sayabilirsin."));
  });

  it("türetilen kabuk değerleri E6/E7/E8 ile sınırlıdır", () => {
    const { html } = render();

    assert.ok(html.includes("Hesap güvenliği"), "E6 bant etiketi");
    assert.ok(html.includes("Hesap silme<"), "E7 göz üstü etiketi");
    assert.ok(html.includes("Düğme çalışmıyorsa"), "E8 yedek kutu etiketi");
  });

  it("kod kutusu ve meta ızgarası kullanılmaz", () => {
    const { html } = render();

    assert.doesNotMatch(html, /class="w-code"/);
    assert.doesNotMatch(html, /class="w-meta"/);
    assert.match(html, /class="w-url"/);
  });

  it("buton ve yedek kutu aynı adresi taşır", () => {
    const { html } = render();
    const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);

    assert.equal(hrefs.filter((href) => href === WEB_URL).length, 2);
  });

  it("mobil çağrıda eylem bağlantısı uygulama şeması taşır, alt bilgi https kalır", () => {
    const { html } = render({ reauthUrl: MOBILE_URL });
    /* Yalnız gövde çapaları sayılır; `<head>` içindeki font `<link>`leri bağlantı değildir. */
    const hrefs = [...html.matchAll(/<a href="([^"]+)"/g)].map((match) => match[1] ?? "");

    assert.equal(hrefs.filter((href) => href === MOBILE_URL).length, 2);
    assert.equal(hrefs.filter((href) => href.startsWith("https://")).length, 3);
    assert.ok(html.includes(`>${MOBILE_URL}</a>`), "yedek kutuda adres metin olarak da yazılmalı");
  });

  it("İngilizce sürüm aynı kabuğu kullanır", () => {
    const { html, subject } = render({ locale: "en" });

    assert.equal(subject, "Confirm Whispr account deletion");
    assert.match(html, /<html lang="en"/);
    assert.ok(html.includes("Confirm account deletion"));
    assert.ok(html.includes("Account security"));
    assert.match(
      html,
      /This link expires in <span style="color:#B4761A;font-weight:600;">10 minutes<\/span>\./,
    );
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

  it("alıcı adı kaçırılır", () => {
    const { html } = render({ name: "<script>x</script>" });

    assert.doesNotMatch(html, /<script>/);
    assert.match(html, /&lt;script&gt;x&lt;\/script&gt;/);
  });

  it("düz metin sürümü aynı sırayı taşır", () => {
    const { text } = render();

    assert.match(text, /^Hesap silmeyi doğrula\n\nMerhaba Ada,/);
    assert.ok(text.includes(WEB_URL));
    assert.ok(text.includes("Gizlilik: https://whispr.app/privacy"));
    assert.ok(text.trimEnd().endsWith("© 2026 Whispr"));
    assert.doesNotMatch(text, /<[a-z]/i);
  });
});
