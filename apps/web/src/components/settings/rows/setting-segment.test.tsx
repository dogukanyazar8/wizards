import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { SettingSegment } from "@/components/settings/rows/setting-segment";
import { SETTINGS_METRICS, pxToRem } from "@/lib/settings/metrics";

/** Ş6 §3 — segment (2–3 kısa seçenek). */

const { segment } = SETTINGS_METRICS.controls;

const SOURCE = readFileSync(
  fileURLToPath(new URL("./setting-segment.tsx", import.meta.url)),
  "utf8",
);

function render(props: Partial<React.ComponentProps<typeof SettingSegment>> = {}) {
  return renderToStaticMarkup(
    <SettingSegment
      onChange={() => {}}
      options={["Tümü", "Yalnızca önemli", "Kapalı"]}
      testId="seg"
      value={1}
      {...props}
    />,
  );
}

describe("SettingSegment", () => {
  it("`radiogroup` + `radio` rolleri taşıyor", () => {
    const markup = render();

    assert.ok(markup.includes('role="radiogroup"'));
    assert.equal(markup.match(/role="radio"/gu)?.length, 3);
  });

  it("yalnız seçili segment sekme turunda duruyor", () => {
    const markup = render();

    assert.equal(markup.match(/tabindex="0"/gu)?.length, 1);
    assert.equal(markup.match(/tabindex="-1"/gu)?.length, 2);
  });

  it("seçili segment `aria-checked` ve birincil zemin taşıyor", () => {
    const markup = render();

    assert.equal(markup.match(/aria-checked="true"/gu)?.length, 1);
    assert.ok(markup.includes("bg-[hsl(var(--primary))]"));
  });

  it("aktif metin ters beyaz — tasarımın izin verdiği tek sabit renk", () => {
    assert.ok(render().includes("color:#fff"));
  });

  it("geometri sözlükten geliyor", () => {
    const markup = render();

    assert.ok(markup.includes(`height:${pxToRem(segment.optionHeight)}`));
    assert.ok(markup.includes(`border-radius:${pxToRem(segment.optionRadius)}`));
    assert.ok(markup.includes(`hsl(var(--border) / ${segment.borderAlpha})`));
  });

  it("`←/→` ve `Home`/`End` gezinmesi kodda", () => {
    assert.match(SOURCE, /ArrowRight/u);
    assert.match(SOURCE, /ArrowLeft/u);
    assert.match(SOURCE, /"Home"/u);
    assert.match(SOURCE, /"End"/u);
    // Odak seçimle birlikte taşınıyor.
    assert.match(SOURCE, /refs\.current\.get\(index\)\?\.focus\(\)/u);
  });
});
