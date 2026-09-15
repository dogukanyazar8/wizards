import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { LocaleProvider } from "@/components/providers/locale-provider";
import { CameraPreviewBlock } from "@/components/settings/blocks/camera-preview-block";
import { getMessagesForLocale } from "@/lib/locale";
import { pxToRem } from "@/lib/settings/metrics";

/** Ş8 §A.3 — `k2` önizleme çerçevesi. */

const markup = renderToStaticMarkup(
  <LocaleProvider initialLocale="tr" initialMessages={getMessagesForLocale("tr")}>
    <CameraPreviewBlock data={{}} row={{ block: "camera", key: "k2", type: "custom" }} />
  </LocaleProvider>,
);

describe("CameraPreviewBlock", () => {
  it("responsive 16:9 preview and quality controls", () => {
    assert.ok(markup.includes("width:100%"));
    assert.ok(markup.includes(`max-width:${pxToRem(520)}`));
    assert.ok(markup.includes("Çözünürlük"));
    assert.ok(markup.includes("Kare hızı"));
    assert.ok(markup.includes("aspect-ratio:16 / 9"));
  });

  it("kapalıyken önizleme yok, metin var", () => {
    assert.ok(markup.includes("Önizleme kapalı"));
    assert.ok(markup.includes("Önizlemeyi başlat"));
    assert.ok(!markup.includes("<video"), "kapalı önizlemede video elemanı çizilmemeli");
  });

  it("gizlilik notu referanstakiyle birebir", () => {
    assert.ok(markup.includes("Önizleme yalnızca bu pencerede görünür, kimseye gönderilmez."));
  });

  it("üç dönüşüm düğmesi adlandırılmış", () => {
    for (const label of ["Aynala", "Sola döndür", "Sağa döndür"]) {
      assert.ok(markup.includes(`aria-label="${label}"`), label);
    }
  });

  it("token dışı renk yok", () => {
    assert.doesNotMatch(markup, /#[0-9a-f]{3,8}\b/iu);
    assert.doesNotMatch(markup, /rgba?\(/u);
  });
});
