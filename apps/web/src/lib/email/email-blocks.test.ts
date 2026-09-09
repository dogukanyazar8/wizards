import assert from "node:assert/strict";
import { describe, it } from "node:test";

process.env.APP_URL = "https://whispr.app";

const blocks = await import("@/lib/email/email-blocks");

describe("e-posta blokları", () => {
  it("buton bgcolor taşıyan hücre ve display:block çapadır", () => {
    const html = blocks.callToAction({
      buttonPadding: "14px 32px",
      href: "https://whispr.app/verify-email?token=abc",
      label: "Doğrulamayı tarayıcıda tamamla",
      noteHtml: "not",
      notePadding: "10px 0 22px 0",
      wrapperPadding: "22px 0 0 0",
    });

    assert.match(html, /<td align="center" bgcolor="#5966F2" style="[^"]*border-radius:12px;">/);
    assert.match(
      html,
      /<a href="https:\/\/whispr\.app\/verify-email\?token=abc" style="display:block;padding:14px 32px;/,
    );
    assert.match(
      html,
      /color:#FFFFFF;text-decoration:none;line-height:19px;mso-line-height-rule:exactly;/,
    );
    assert.doesNotMatch(html, /<button/);
    assert.doesNotMatch(html, /<img/);
  });

  it("buton sarmalayıcı dolgusu verilmediğinde hiç yazılmaz", () => {
    const html = blocks.callToAction({
      buttonPadding: "15px 36px",
      href: "https://whispr.app/reset-password?token=abc",
      label: "Şifremi sıfırla",
      noteHtml: "not",
      notePadding: "10px 0 20px 0",
    });

    assert.match(html, /<td align="center">\n/);
  });

  it("kod kutusu etiket, kod ve süre satırını sırayla çizer", () => {
    const html = blocks.codeBox({
      code: "482915",
      expiryPrefix: "Kod ",
      expirySuffix: " geçerli.",
      expiryValue: "10 dakika",
      label: "Doğrulama kodu",
    });

    assert.match(html, /letter-spacing:1\.6px;[^"]*">Doğrulama kodu</);
    assert.match(html, /<p class="w-code" [^>]*letter-spacing:11px;[^>]*>482915<\/p>/);
    assert.match(
      html,
      /Kod <span style="color:#B4761A;font-weight:600;">10 dakika<\/span> geçerli\./,
    );
  });

  it("meta ızgarasında ayırıcı hücre dolgusu yoktur ve tek girdi tam genişliğe yayılır", () => {
    const two = blocks.metaGrid([
      { label: "İstek zamanı", value: "27 Ağustos 2026, 14:32 (GMT+3)" },
      { label: "Cihaz", value: "Chrome · macOS · İstanbul, TR" },
    ]);
    const one = blocks.metaGrid([
      { label: "İstek zamanı", value: "27 Ağustos 2026, 14:32 (GMT+3)" },
    ]);

    assert.match(two, /width="50%" class="w-meta" style="width:50%;padding:18px 10px 20px 0;/);
    assert.match(two, /width="50%" class="w-meta" style="width:50%;padding:18px 0 20px 10px;/);
    assert.match(one, /width="100%" class="w-meta" style="width:100%;padding:18px 0 20px 0;/);
    assert.equal(blocks.metaGrid([]), "");
  });

  it("güvenlik bölümü 1 px ayırıcıyla başlar", () => {
    const html = blocks.securitySection({ bodyHtml: "gövde", label: "Bu isteği sen yapmadıysan" });

    assert.match(
      html,
      /<td height="1" bgcolor="#E3E6EE" style="height:1px;[^"]*font-size:0;line-height:0;">&nbsp;<\/td>/,
    );
    assert.match(html, /<td style="padding:20px 0 0 0;">/);
  });

  it("yedek bağlantı kutusu adresi kırılabilir yazar ve daktilo font kullanmaz", () => {
    const html = blocks.fallbackUrlBox({
      label: "Düğme çalışmıyorsa",
      url: "https://whispr.app/reset-password?token=abc",
    });

    assert.match(html, /class="w-url"/);
    assert.match(html, /word-break:break-all/);
    assert.match(html, /color:#4C59E0;text-decoration:underline/);
    assert.doesNotMatch(html, /monospace|courier/i);
  });

  it("gövde metni ve bağlantı etiketi kaçırılır", () => {
    assert.match(blocks.eyebrow("<b>x</b>"), /&lt;b&gt;x&lt;\/b&gt;/);
    assert.match(blocks.heading("A & B"), /A &amp; B/);
    assert.match(
      blocks.inlineLink("https://whispr.app/settings/account/security", "tüm oturumlarını kapat"),
      /<a href="https:\/\/whispr\.app\/settings\/account\/security" style="color:#4C59E0;text-decoration:underline;font-weight:600;">tüm oturumlarını kapat<\/a>/,
    );
  });
});
