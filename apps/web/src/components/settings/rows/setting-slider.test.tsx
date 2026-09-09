import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { LocaleProvider } from "@/components/providers/locale-provider";
import {
  resolveSliderKeyValue,
  resolveSliderStep,
  SETTING_SLIDER_PAGE_MULTIPLIER,
  SettingSlider,
} from "@/components/settings/rows/setting-slider";
import { getMessagesForLocale } from "@/lib/locale";
import { SETTINGS_METRICS, pxToRem } from "@/lib/settings/metrics";

/** Ş6 §3 — kaydırıcı. Klavye kararı saf fonksiyonda, o yüzden gerçekten sınanıyor. */

const { slider } = SETTINGS_METRICS.controls;

function render(props: Partial<React.ComponentProps<typeof SettingSlider>> = {}) {
  return renderToStaticMarkup(
    <LocaleProvider initialLocale="tr" initialMessages={getMessagesForLocale("tr")}>
      <SettingSlider
        max={500}
        min={0}
        onChange={() => {}}
        testId="sld"
        unit=" ms"
        value={120}
        {...props}
      />
    </LocaleProvider>,
  );
}

describe("resolveSliderStep", () => {
  it("aralığı yirmi durakta geziyor", () => {
    assert.equal(resolveSliderStep(0, 500), 25);
    assert.equal(resolveSliderStep(0, 100), 5);
    assert.equal(resolveSliderStep(60, 92), 2);
  });

  it("dar aralıkta adım en az 1", () => {
    // `[12, 22, " px"]` → 10/20 = 0.5; sıfır adım kaydırıcıyı kilitlerdi.
    assert.equal(resolveSliderStep(12, 22), 1);
    assert.equal(resolveSliderStep(5, 5), 1);
  });
});

describe("resolveSliderKeyValue", () => {
  it("`←/→` bir adım gidiyor", () => {
    assert.equal(resolveSliderKeyValue("ArrowRight", 120, 0, 500), 145);
    assert.equal(resolveSliderKeyValue("ArrowLeft", 120, 0, 500), 95);
  });

  it("`↑/↓` de aynı adımı kullanıyor", () => {
    assert.equal(resolveSliderKeyValue("ArrowUp", 120, 0, 500), 145);
    assert.equal(resolveSliderKeyValue("ArrowDown", 120, 0, 500), 95);
  });

  it("`Home`/`End` uçlara gidiyor", () => {
    assert.equal(resolveSliderKeyValue("Home", 120, 0, 500), 0);
    assert.equal(resolveSliderKeyValue("End", 120, 0, 500), 500);
  });

  it("`PageUp`/`PageDown` beş adım atıyor", () => {
    assert.equal(SETTING_SLIDER_PAGE_MULTIPLIER, 5);
    assert.equal(resolveSliderKeyValue("PageUp", 120, 0, 500), 245);
    assert.equal(resolveSliderKeyValue("PageDown", 120, 0, 500), 0);
  });

  it("aralığın dışına çıkmıyor", () => {
    assert.equal(resolveSliderKeyValue("ArrowRight", 500, 0, 500), 500);
    assert.equal(resolveSliderKeyValue("ArrowLeft", 0, 0, 500), 0);
  });

  it("ilgisiz tuş `null` dönüyor", () => {
    assert.equal(resolveSliderKeyValue("a", 120, 0, 500), null);
    assert.equal(resolveSliderKeyValue("Tab", 120, 0, 500), null);
  });
});

describe("SettingSlider — anlam", () => {
  const markup = render();

  it('`role="slider"` ve üç değer niteliği taşıyor', () => {
    assert.ok(markup.includes('role="slider"'));
    assert.ok(markup.includes('aria-valuemin="0"'));
    assert.ok(markup.includes('aria-valuemax="500"'));
    assert.ok(markup.includes('aria-valuenow="120"'));
  });

  it("`aria-valuetext` birim taşıyor", () => {
    assert.ok(markup.includes('aria-valuetext="120 ms"'));
  });

  it("klavyeyle odaklanabiliyor", () => {
    assert.ok(markup.includes('tabindex="0"'));
  });

  it("− ve + düğmeleri adlandırılmış", () => {
    assert.ok(markup.includes('aria-label="Azalt"'));
    assert.ok(markup.includes('aria-label="Artır"'));
  });

  it("görünen değer ekran okuyucudan saklanıyor — `aria-valuetext` onu zaten söylüyor", () => {
    assert.ok(markup.includes("120 ms"));
    assert.equal(markup.match(/aria-hidden="true"/gu)?.length, 5);
  });
});

describe("SettingSlider — geometri", () => {
  it("220 px blok ve 4 px ray sözlükten geliyor", () => {
    const markup = render();

    assert.ok(markup.includes(`width:${pxToRem(slider.blockWidth)}`));
    assert.ok(markup.includes(`height:${pxToRem(slider.trackHeight)}`));
    assert.ok(markup.includes(`width:${pxToRem(slider.valueWidth)}`));
  });

  it("topuz yüzdeyle konumlanıyor", () => {
    // 120/500 = %24
    assert.ok(render().includes("width:24%"));
  });

  it("yüzde sıfır aralıkta bölme hatası vermiyor", () => {
    const markup = render({ max: 5, min: 5, value: 5 });

    assert.ok(markup.includes("width:0%"));
  });
});
