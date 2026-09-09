import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { LocaleProvider } from "@/components/providers/locale-provider";
import { EN_MESSAGES } from "@/lib/locale/messages/en";
import { TR_MESSAGES } from "@/lib/locale/messages/tr";
import {
  CREATE_SERVER_INITIAL_STATE,
  type CreateServerFormState,
} from "@/lib/servers/create-server-form";

import { CreateServerPreview } from "./create-server-preview";

/**
 * SPEC-SUNUCU §7'nin önizleme kolonu: üç kart da forma **canlı** bağlıdır ve ayrı state
 * tutmaz. Test bunu tek yoldan sorabilir — durumu değiştir, çıkan HTML'i oku.
 */
function render(patch: Partial<CreateServerFormState> = {}, locale: "en" | "tr" = "tr"): string {
  return renderToStaticMarkup(
    <LocaleProvider
      initialLocale={locale}
      initialMessages={locale === "tr" ? TR_MESSAGES : EN_MESSAGES}
    >
      <CreateServerPreview state={{ ...CREATE_SERVER_INITIAL_STATE, ...patch }} />
    </LocaleProvider>,
  );
}

describe("sunucu oluşturma önizlemesi — SPEC-SUNUCU §7", () => {
  it("boş formda SPEC'in boş durum metinlerini çizer", () => {
    const html = render();

    assert.match(html, /Yeni sunucun/u);
    assert.match(html, /Açıklama eklersen üyeler sunucunun ne için olduğunu ilk bakışta anlar\./u);
    // Ad boşken ray notu üç karakterli güvenli varsayılanı gösterir.
    assert.match(html, /Rayda WHS olarak görünür/u);
  });

  it("ad yazılınca üç kart da aynı anda güncellenir", () => {
    const html = render({ name: "Whispr Topluluğu" });

    assert.equal(html.match(/Whispr Topluluğu/gu)?.length, 2, "ray satırı + sunucu kartı");
    assert.match(html, /Rayda WHI olarak görünür/u);
    assert.doesNotMatch(html, /Yeni sunucun/u);
  });

  it("kullanıcının yazdığı kısa ad türetmeyi ezer", () => {
    assert.match(
      render({ name: "Whispr Topluluğu", shortName: "WZZ" }),
      /Rayda WZZ olarak görünür/u,
    );
  });

  it("üç erişim seçeneğinin rozeti ve özet satırı aynı metni yazar", () => {
    for (const [access, label] of [
      ["private", "Özel"],
      ["public", "Herkese açık"],
      ["discover", "Keşfet&#x27;te"],
    ] as const) {
      const html = render({ access });

      // Rozet + özet kartındaki `Erişim` satırı: aynı etiket iki kez.
      assert.equal(html.match(new RegExp(label, "gu"))?.length, 2, access);
    }
  });

  it("rozet tonu erişime göre değişir (§7: gri · success · primary)", () => {
    assert.match(render({ access: "private" }), /hsl\(var\(--surface-tertiary\)\)/u);
    assert.match(render({ access: "public" }), /hsl\(var\(--success\)\/0\.16\)/u);
    assert.match(render({ access: "discover" }), /hsl\(var\(--primary\)\/0\.16\)/u);
  });

  it("medya özetinin dört hâlini yazar", () => {
    assert.match(render(), /GIF \+ dosya/u);
    assert.match(render({ allowFileUploads: false }), /Yalnızca GIF/u);
    assert.match(render({ allowGifs: false }), /Yalnızca dosya/u);
    assert.match(render({ allowFileUploads: false, allowGifs: false }), /Kapalı/u);
  });

  it("üye daveti satırı anahtarı izler", () => {
    assert.match(render(), /Tüm üyeler/u);
    assert.match(render({ allowMemberAdds: false }), /Yalnızca admin/u);
  });

  it("mesaj limiti satırı gelişmiş bloğun seçimini yazar", () => {
    assert.match(render(), /2B/u);
    assert.match(render({ messageCharacterLimit: 40000 }), /40\.000/u);
    assert.match(render({ messageCharacterLimit: 250 }, "en"), /250/u);
  });

  it("ikon rengi seçilmediğinde kısa addan türetilir, seçilince swatch kazanır", () => {
    // "WHS" → (87+72+83) % 6 = 2 → success.
    assert.match(render(), /hsl\(var\(--success\)\)/u);
    assert.match(render({ iconColor: "accent2" }), /hsl\(var\(--accent-2\)\)/u);
  });

  it("iki dilde de aynı yapıyı çizer", () => {
    const html = render({ name: "Whispr" }, "en");

    assert.match(html, /Preview/u);
    assert.match(html, /Appears as WHI on the rail/u);
    assert.doesNotMatch(html, /server\.create\./u, "çözülmemiş i18n anahtarı");
  });

  it("hiçbir hex renk sızdırmaz (PROMPT §1)", () => {
    const html = render({ iconColor: "danger", name: "Whispr" });
    const inlineStyles = html.match(/style="[^"]*"/gu) ?? [];

    for (const style of inlineStyles) {
      assert.doesNotMatch(style, /#[0-9a-fA-F]{3,8}\b/u, style);
    }
  });
});
