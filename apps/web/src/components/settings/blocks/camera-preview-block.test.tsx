import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { LocaleProvider } from "@/components/providers/locale-provider";
import { CameraPreviewBlock } from "@/components/settings/blocks/camera-preview-block";
import { getMessagesForLocale } from "@/lib/locale";
import { SETTINGS_METRICS, pxToRem } from "@/lib/settings/metrics";

/** Ş8 §A.3 — `k2` önizleme çerçevesi. */

const markup = renderToStaticMarkup(
  <LocaleProvider initialLocale="tr" initialMessages={getMessagesForLocale("tr")}>
    <CameraPreviewBlock data={{}} row={{ block: "camera", key: "k2", type: "custom" }} />
  </LocaleProvider>,
);

describe("CameraPreviewBlock", () => {
  it("220 px 16:9 çerçeve sözlükten", () => {
    const { cameraPreview } = SETTINGS_METRICS.blocks;

    assert.equal(cameraPreview.width, 220);
    assert.ok(markup.includes(`width:${pxToRem(cameraPreview.width)}`));
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
