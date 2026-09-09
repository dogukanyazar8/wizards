import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { LocaleProvider } from "@/components/providers/locale-provider";
import { MicLevelMeterBlock } from "@/components/settings/blocks/mic-level-meter-block";
import { getMessagesForLocale } from "@/lib/locale";
import { SETTINGS_METRICS } from "@/lib/settings/metrics";

/** Ş8 §A.2 — `i3` ölçeri. */

const TR = getMessagesForLocale("tr");

function render() {
  return renderToStaticMarkup(
    <LocaleProvider initialLocale="tr" initialMessages={TR}>
      <MicLevelMeterBlock data={{}} row={{ block: "mic", key: "i3", type: "custom" }} />
    </LocaleProvider>,
  );
}

describe("MicLevelMeterBlock", () => {
  const markup = render();

  it("segment sayısı ölçü sözlüğünden geliyor", () => {
    const segments = markup.match(/data-mic-segment=/g) ?? [];

    assert.equal(SETTINGS_METRICS.blocks.micMeter.segmentCount, 14);
    assert.equal(segments.length, SETTINGS_METRICS.blocks.micMeter.segmentCount);
  });

  it("referans etiketi ve düğmesi birebir", () => {
    assert.ok(markup.includes("Giriş seviyesi"));
    assert.ok(markup.includes("Mikrofonu test et"));
  });

  it("ölçer erişilebilir: `role=meter` + değer + metin", () => {
    assert.ok(markup.includes('role="meter"'));
    assert.ok(markup.includes('aria-valuenow="0"'));
    // Renk tek başına anlam taşımaz: durum metinle de bildiriliyor.
    assert.ok(markup.includes('role="status"'));
    assert.ok(markup.includes("Mikrofon testi kapalı"));
  });

  it("token dışı renk yok", () => {
    assert.doesNotMatch(markup, /#[0-9a-f]{3,8}\b/iu);
    assert.doesNotMatch(markup, /rgba?\(/u);
  });
});
