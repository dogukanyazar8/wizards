import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  resolveTypeAheadIndex,
  SETTING_SELECT_TYPE_AHEAD_RESET_MS,
  SettingSelect,
} from "@/components/settings/rows/setting-select";
import { SETTINGS_METRICS, pxToRem } from "@/lib/settings/metrics";

/**
 * Ş6 §3/§4 — açılır menü.
 *
 * Klavye ve kaydırma davranışının **karar** kısmı saf fonksiyonlarda (`resolveTypeAheadIndex`,
 * `resolveMenuPlacement`) durduğu için burada gerçekten sınanıyor; DOM olayına bağlı kısım
 * (dinleyicinin `passive` kurulması, kaydırmada kapanma) kaynak taramasıyla sabitleniyor.
 */

const { select } = SETTINGS_METRICS.controls;

const SOURCE = readFileSync(
  fileURLToPath(new URL("./setting-select.tsx", import.meta.url)),
  "utf8",
);

const TIME_ZONES = [
  { label: "Africa/Cairo" },
  { label: "Europe/Berlin" },
  { label: "Europe/Istanbul" },
  { label: "Europe/London" },
];

function render(props: Partial<React.ComponentProps<typeof SettingSelect>> = {}) {
  return renderToStaticMarkup(
    <SettingSelect
      onChange={() => {}}
      onOpenChange={() => {}}
      open={false}
      options={TIME_ZONES}
      testId="sel"
      value={2}
      {...props}
    />,
  );
}

describe("resolveTypeAheadIndex", () => {
  const labels = TIME_ZONES.map((option) => option.label);

  it("`Eu` yazınca `Europe/Berlin`'e, sonra devamıyla `Europe/Istanbul`'a gidiyor", () => {
    assert.equal(resolveTypeAheadIndex(labels, "Eu", 0), 1);
    assert.equal(resolveTypeAheadIndex(labels, "Europe/I", 0), 2);
  });

  it("tek harf sıradaki eşleşmeye atlıyor", () => {
    assert.equal(resolveTypeAheadIndex(labels, "E", 0), 1);
    assert.equal(resolveTypeAheadIndex(labels, "E", 1), 2);
    assert.equal(resolveTypeAheadIndex(labels, "E", 3), 1, "liste dolanmalı");
  });

  it("büyük/küçük harf duyarsız ve Türkçe yerelinde", () => {
    assert.equal(resolveTypeAheadIndex(["İstanbul", "Ankara"], "i", 1), 0);
    assert.equal(resolveTypeAheadIndex(labels, "eUrOpE/l", 0), 3);
  });

  it("eşleşme yoksa -1", () => {
    assert.equal(resolveTypeAheadIndex(labels, "zz", 0), -1);
    assert.equal(resolveTypeAheadIndex(labels, "", 0), -1);
  });

  it("tampon sıfırlama süresi tanımlı", () => {
    assert.equal(SETTING_SELECT_TYPE_AHEAD_RESET_MS, 600);
  });
});

describe("SettingSelect — kapalı hâl", () => {
  it("seçili değerin etiketini gösteriyor", () => {
    assert.ok(render().includes("Europe/Istanbul"));
  });

  it('`aria-expanded="false"` ve liste yok', () => {
    const markup = render();

    assert.ok(markup.includes('aria-expanded="false"'));
    assert.ok(markup.includes('aria-haspopup="listbox"'));
    assert.ok(!markup.includes('role="listbox"'));
  });

  it("210×34 düğme sözlükten geliyor", () => {
    const markup = render();

    assert.ok(markup.includes(`width:${pxToRem(select.width)}`));
    assert.ok(markup.includes(`height:${pxToRem(select.height)}`));
    assert.ok(markup.includes(`border-radius:${pxToRem(select.radius)}`));
  });
});

describe("SettingSelect — açık hâl", () => {
  const markup = render({ open: true });

  it('`role="listbox"` ve dört `option` çiziyor', () => {
    assert.ok(markup.includes('role="listbox"'));
    assert.equal(markup.match(/role="option"/gu)?.length, 4);
  });

  it("seçili seçenek `aria-selected` ve tik taşıyor", () => {
    assert.ok(markup.includes('aria-selected="true"'));
    assert.equal(markup.match(/aria-selected="true"/gu)?.length, 1);
  });

  it("etkin seçenek `aria-activedescendant` ile bildiriliyor", () => {
    const active = /aria-activedescendant="([^"]+)"/u.exec(markup)?.[1];

    assert.ok(active);
    assert.ok(markup.includes(`id="${active}"`));
  });

  it("menü 222 px'i aşmıyor ve kendi içinde kaydırıyor", () => {
    assert.ok(markup.includes(`max-height:${pxToRem(select.menuMaxHeight)}`));
    assert.ok(markup.includes("overflow-y-auto"));
    assert.ok(markup.includes(`border-radius:${pxToRem(select.menuRadius)}`));
  });

  it("render sırasında yön varsayılan olarak aşağı — ölçüm tıklamada yapılır", () => {
    assert.ok(markup.includes('data-direction="down"'));
    assert.ok(markup.includes(`top:${pxToRem(select.menuOffset)}`));
  });

  it("açıkken kenar birincil tona geçiyor", () => {
    assert.ok(markup.includes("hsl(var(--primary) / 0.5)"));
  });
});

describe("SettingSelect — nokta tonu", () => {
  it("token adını renge çeviriyor, renk değeri taşımıyor", () => {
    const markup = render({
      open: true,
      options: [{ label: "Çevrimiçi", toneToken: "--success" }],
      value: 0,
    });

    assert.ok(markup.includes("background:hsl(var(--success))"));
    assert.ok(!/#[0-9a-f]{6}/iu.test(SOURCE));
  });
});

describe("SettingSelect — kaydırma ve ölçüm sözleşmesi", () => {
  it("yön tıklama anında ölçülüyor, render sırasında değil", () => {
    assert.match(SOURCE, /getBoundingClientRect\(\)/u);
    assert.match(SOURCE, /measure\(\);\s*\n\s*onOpenChange\(true\)/u);
    assert.match(SOURCE, /resolveMenuPlacement\(/u);
  });

  it("kaydırma menüyü **kapatıyor**, yeniden konumlandırmıyor", () => {
    assert.match(SOURCE, /const handleScroll = \(\) => close\(false\)/u);
    assert.ok(!/handleScroll = \(\) => measure\(\)/u.test(SOURCE));
  });

  it("`scroll` dinleyicisi `passive`", () => {
    assert.match(
      SOURCE,
      /addEventListener\("scroll", handleScroll, \{ capture: true, passive: true \}\)/u,
    );
  });

  it("dış tıklama da kapatıyor", () => {
    assert.match(SOURCE, /handlePointerDown/u);
  });
});
