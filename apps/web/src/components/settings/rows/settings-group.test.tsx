import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { SettingsGroup } from "@/components/settings/rows/settings-group";
import { SETTINGS_METRICS, pxToRem } from "@/lib/settings/metrics";

/**
 * Ş6 §1 — grup kabı.
 *
 * İki şey burada kilitlenir: başlığın **isteğe bağlı** olması (sapma #8) ve kabın
 * `overflow:hidden` **taşımaması** (tuzak #6). İkincisi tek bir bileşenin değil, satır
 * motorunun tamamının kuralı olduğu için bir kod taramasıyla ölçülüyor — kapta kırpma açan
 * kişi bunu bir sonraki kaydırmada değil, burada görür.
 */

const { body } = SETTINGS_METRICS;

const ROWS_DIR = fileURLToPath(new URL(".", import.meta.url));

describe("SettingsGroup", () => {
  it("başlık ve notu çiziyor", () => {
    const markup = renderToStaticMarkup(
      <SettingsGroup note="Bu alanlar profilinde herkese görünür." title="Kimlik">
        <div>satır</div>
      </SettingsGroup>,
    );

    assert.ok(markup.includes("Kimlik"));
    assert.ok(markup.includes("Bu alanlar profilinde herkese görünür."));
  });

  it("başlıksız da render ediliyor (sapma #8)", () => {
    const markup = renderToStaticMarkup(
      <SettingsGroup>
        <div>hero</div>
      </SettingsGroup>,
    );

    assert.ok(markup.includes("hero"));
    // Başlık kabı hiç çizilmemeli; boş bir başlık 9 px'lik ölü boşluk bırakırdı.
    assert.ok(!markup.includes("padding-bottom:0.5625rem"));
  });

  it("not başlıksız çizilmiyor", () => {
    const markup = renderToStaticMarkup(
      <SettingsGroup note="yalnız not">
        <div>satır</div>
      </SettingsGroup>,
    );

    assert.ok(!markup.includes("yalnız not"));
  });

  it("kap ölçüleri sözlükten geliyor", () => {
    const markup = renderToStaticMarkup(
      <SettingsGroup title="Kimlik">
        <div>satır</div>
      </SettingsGroup>,
    );

    assert.ok(markup.includes(`border-radius:${pxToRem(body.groupRadius)}`));
    assert.ok(markup.includes(`hsl(var(--border) / ${body.groupBorderAlpha})`));
    assert.ok(markup.includes(`margin-bottom:${pxToRem(body.groupMarginBottom)}`));
  });

  it("kapta `overflow:hidden` yok, `overflow-visible` var (tuzak #6)", () => {
    const markup = renderToStaticMarkup(
      <SettingsGroup title="Kimlik">
        <div>satır</div>
      </SettingsGroup>,
    );

    assert.ok(markup.includes("overflow-visible"));
    assert.ok(!markup.includes("overflow:hidden"));
    assert.ok(!markup.includes("overflow-hidden"));
  });
});

describe("satır motoru — kırpma taraması (tuzak #6)", () => {
  /**
   * Kırpmaya izinli iki yer var: `SettingInput` (önek ile alanı tek çerçeve gösterir, açılır
   * menü taşımaz) ve `SettingCustomBlock`'un `fullWidth` dalı. Başka bir dosyada kırpma açmak
   * o dosyadaki menüyü kesmek demektir.
   */
  const ALLOWED = new Set(["setting-custom-block.tsx", "setting-input.tsx"]);

  /** Yorumlar taramadan çıkar: kuralı **anlatan** bir cümle kuralı ihlal etmiyor. */
  const stripComments = (source: string) =>
    source.replace(/\/\*[\s\S]*?\*\//gu, "").replace(/\/\/[^\n]*/gu, "");

  it("`overflow-hidden` yalnız izinli iki dosyada", () => {
    const offenders: string[] = [];

    for (const entry of readdirSync(ROWS_DIR)) {
      if (!entry.endsWith(".tsx") || entry.endsWith(".test.tsx") || ALLOWED.has(entry)) {
        continue;
      }

      const source = stripComments(readFileSync(`${ROWS_DIR}${entry}`, "utf8"));

      if (/overflow-hidden|overflow:\s*"hidden"/u.test(source)) {
        offenders.push(entry);
      }
    }

    assert.deepEqual(offenders, []);
  });

  it("grup dosyası kırpma niyetini açıkça yazıyor", () => {
    const source = readFileSync(`${ROWS_DIR}settings-group.tsx`, "utf8");

    assert.match(source, /overflow-visible/u);
    assert.match(source, /tuzak #6/u);
  });
});
