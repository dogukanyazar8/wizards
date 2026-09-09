import assert from "node:assert/strict";
import { describe, it } from "node:test";

process.env.APP_URL = "https://whispr.app";

const { renderEmailShell } = await import("@/lib/email/email-shell");

function shell(overrides: Partial<Parameters<typeof renderEmailShell>[0]> = {}) {
  return renderEmailShell({
    bandLabel: "Hesap doğrulama",
    bodyHtml: "        <p>gövde</p>",
    documentTitle: "Whispr doğrulama kodun",
    locale: "tr",
    preheader: "önizleme satırı",
    ...overrides,
  });
}

describe("e-posta kabuğu", () => {
  it("gövdenin ilk elemanı gizli önizleme satırıdır", () => {
    const html = shell();
    const body = html.slice(html.indexOf("<body"));
    const firstElement = /<body[^>]*>\s*(<[^>]+>)/.exec(body)?.[1] ?? "";

    assert.match(firstElement, /^<span /);
    assert.match(firstElement, /display:none!important/);
    assert.match(firstElement, /mso-hide:all/);
    assert.match(body, /<span[^>]*>önizleme satırı<\/span>/);
  });

  it("head yalnız MSO koşulları, font ve medya sorgusu taşır", () => {
    const html = shell();
    const style = /<style type="text\/css">([\s\S]*?)<\/style>/.exec(html)?.[1] ?? "";

    assert.match(html, /<!--\[if mso\]><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</);
    assert.match(html, /<!--\[if !mso\]><!-->/);
    assert.match(html, /<!--<!\[endif\]-->/);
    assert.match(style, /^\s*@import url\('https:\/\/fonts\.googleapis\.com/);
    assert.match(style, /@media only screen and \(max-width:520px\)/);
    /* Blok silinse bile mektup okunmalı: medya sorgusu dışında görsel kural yok. */
    assert.doesNotMatch(style.replace(/@media[\s\S]*$/, ""), /color:|font-family:|padding:/);
  });

  it("medya kuralları yalnız şablonun kullandığı sınıflar için yazılır", () => {
    const bare = shell();
    const rich = shell({ mediaFeatures: ["code", "url", "meta"] });

    assert.match(bare, /\.w-wrap\{width:100%!important\}/);
    assert.match(bare, /\.w-h1\{font-size:21px!important\}/);
    assert.doesNotMatch(bare, /\.w-code/);
    assert.doesNotMatch(bare, /\.w-url/);
    assert.doesNotMatch(bare, /\.w-meta/);

    assert.match(rich, /\.w-code\{font-size:28px!important;letter-spacing:8px!important\}/);
    assert.match(rich, /\.w-url\{font-size:11px!important\}/);
    assert.match(rich, /\.w-meta\{display:block!important;width:100%!important/);
  });

  it("marka işareti beş çubuğu doğru yüksekliklerle çizer", () => {
    const html = shell();
    const heights = [...html.matchAll(/height="(\d+)" bgcolor="#FFFFFF"/g)].map((match) =>
      Number(match[1]),
    );

    assert.deepEqual(heights, [12, 18, 24, 17, 13]);
    assert.match(html, /background-image:linear-gradient\(145deg,#7C70FF,#5B62FF 46%,#2F6DFF\)/);
    assert.match(html, /background-color:#5B62FF/);
  });

  it("bant etiketi ve belge başlığı kaçırılır", () => {
    const html = shell({ bandLabel: "<script>x</script>", documentTitle: 'A "B"' });

    assert.doesNotMatch(html, /<script>/);
    assert.match(html, /<title>A &quot;B&quot;<\/title>/);
  });

  it("alt bilgi yalnız üç bağlantı ve telif satırı içerir", () => {
    const html = shell();
    const footer = html.slice(html.lastIndexOf('bgcolor="#F9FAFB"'));
    const anchors = [...footer.matchAll(/<a href="([^"]+)"[^>]*>([^<]+)<\/a>/g)];

    assert.deepEqual(
      anchors.map((match) => [match[1], match[2]]),
      [
        ["https://whispr.app/privacy", "Gizlilik"],
        ["https://whispr.app/terms", "Şartlar"],
        ["https://whispr.app/cookies", "Çerezler"],
      ],
    );
    assert.match(footer, /© 2026 Whispr/);
    assert.doesNotMatch(footer, /abonelik|tercih|yardım merkezi|unsubscribe/i);
  });

  it("dil ve renk şeması üst verileri locale'e göre yazılır", () => {
    assert.match(shell(), /<html lang="tr"/);
    assert.match(shell({ locale: "en" }), /<html lang="en"/);
    assert.match(shell(), /<meta name="color-scheme" content="light dark">/);
    assert.match(shell(), /<meta name="supported-color-schemes" content="light dark">/);
  });

  it("kart 600 px ve zeminler saf siyah/beyaz değil", () => {
    const html = shell();

    assert.match(html, /width="600" style="width:600px;max-width:600px;"/);
    assert.doesNotMatch(html, /background-color:#000\b/i);
    assert.doesNotMatch(html, /background-color:#fff\b/i);
  });
});
