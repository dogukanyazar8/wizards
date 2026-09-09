import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  escapeHtml,
  inlineStyle,
  spacerCell,
  stripHeaderNewlines,
  typeDeclarations,
  typeStyle,
} from "@/lib/email/email-html";

describe("e-posta HTML yardımcıları", () => {
  it("kaçış beş karakteri de kapsar ve ampersandı iki kez kaçırmaz", () => {
    assert.equal(
      escapeHtml(`<a href="x">&'</a>`),
      "&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;",
    );
    assert.equal(escapeHtml("Tom & Jerry"), "Tom &amp; Jerry");
  });

  it("konu satırından satır sonu temizlenir (başlık enjeksiyonu)", () => {
    assert.equal(
      stripHeaderNewlines("Whispr kodun\r\nBcc: saldirgan@example.com"),
      "Whispr kodun Bcc: saldirgan@example.com",
    );
    assert.equal(stripHeaderNewlines("  düz konu  "), "düz konu");
  });

  it("satır içi stil anahtar sırasını korur ve boş değerleri eler", () => {
    assert.equal(
      inlineStyle({ margin: 0, color: "#1A202D", padding: undefined, border: null, width: "" }),
      "margin:0;color:#1A202D;",
    );
    assert.equal(inlineStyle({}), "");
  });

  it("400 ağırlık ve tanımsız letter-spacing yazılmaz", () => {
    const declarations = typeDeclarations("body");

    assert.equal(declarations["font-weight"], undefined);
    assert.equal(declarations["letter-spacing"], undefined);
    assert.equal(declarations["mso-line-height-rule"], "exactly");
  });

  it("overrides yalnız verilen alanı değiştirir", () => {
    const style = typeStyle("smallNote", {
      before: { margin: 0 },
      overrides: { lineHeight: "18px" },
    });

    assert.match(style, /^margin:0;/);
    assert.match(style, /font-size:12\.5px;/);
    assert.match(style, /line-height:18px;/);
    assert.match(style, /mso-line-height-rule:exactly;$/);
  });

  it("undefined override taban değeri korur", () => {
    assert.equal(
      typeStyle("smallNote", { overrides: { fontSize: undefined } }),
      typeStyle("smallNote"),
    );
  });

  it("boşluk hücresi Outlook'ta çökmesin diye nbsp taşır", () => {
    assert.equal(
      spacerCell(3),
      '<td width="3" style="width:3px;font-size:0;line-height:0;">&nbsp;</td>',
    );
  });
});
