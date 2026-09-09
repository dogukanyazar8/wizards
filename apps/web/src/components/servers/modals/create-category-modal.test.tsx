import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { LocaleProvider } from "@/components/providers/locale-provider";
import { getMessagesForLocale } from "@/lib/locale";
import { SERVER_METRICS, pxToRem } from "@/lib/servers/metrics";
import { CreateCategoryModalView } from "./create-category-modal";

/** Ş8 — kategori penceresi (SPEC-SUNUCU §6.1, 560). */
const MESSAGES = getMessagesForLocale("tr");

const copy = (key: string): string => MESSAGES[key] ?? "";

function render(name: string): string {
  return renderToStaticMarkup(
    <LocaleProvider initialLocale="tr" initialMessages={MESSAGES}>
      <CreateCategoryModalView name={name} onChange={() => {}} onSubmit={() => {}} />
    </LocaleProvider>,
  );
}

describe("kategori penceresi — alan", () => {
  it("etiket, `Zorunlu` çipi ve `0/48` sayacını çizer", () => {
    const html = render("");

    assert.match(html, new RegExp(copy("server.modal.category.nameLabel"), "u"));
    assert.match(html, new RegExp(copy("server.field.required"), "u"));
    assert.match(html, />0\/48</u);
  });

  it("sayaç 40'ta muted, 41'de warning", () => {
    const at40 = render("x".repeat(40));
    const at41 = render("x".repeat(41));

    assert.match(at40, /text-\[hsl\(var\(--text-muted\)\)\][^>]*>40\/48</u);
    assert.match(at41, /text-\[hsl\(var\(--warning\)\)\][^>]*>41\/48</u);
  });

  it("input doluyken çerçevesi primary/.5 olur", () => {
    assert.match(render("Geliştirme"), /hsl\(var\(--primary\)\/0\.5\)/u);
    assert.doesNotMatch(render(""), /hsl\(var\(--primary\)\/0\.5\)/u);
  });

  it("ipucu ve bilgi notu SPEC metinleridir", () => {
    const html = render("");

    assert.match(html, /En fazla 48 karakter\. Kenar çubuğunda büyük harfle görünür\./u);
    assert.match(html, new RegExp(copy("server.modal.category.note"), "u"));
  });
});

describe("kategori penceresi — canlı önizleme", () => {
  it("boşken `YENİ KATEGORİ` yazar", () => {
    assert.match(render(""), />YENİ KATEGORİ</u);
  });

  it("adı büyük harfe çevirip gösterir", () => {
    assert.match(render("Geliştirme"), />GELİŞTİRME</u);
  });

  it("boş kanal satırını kesikli çerçeveyle çizer", () => {
    const html = render("");

    assert.match(html, new RegExp(copy("server.modal.category.previewEmptyChannels"), "u"));
    assert.match(html, /dashed hsl\(var\(--border\)\)/u);
  });

  it("önizleme kartının ölçüleri sözlükten gelir", () => {
    const { categoryModal } = SERVER_METRICS;
    const html = render("");

    assert.ok(html.includes(`border-radius:${pxToRem(categoryModal.previewRadius)}`));
    assert.ok(html.includes(`width:${pxToRem(categoryModal.previewAddSize)}`));
  });
});
