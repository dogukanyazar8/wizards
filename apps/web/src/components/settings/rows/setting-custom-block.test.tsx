import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { LocaleProvider } from "@/components/providers/locale-provider";
import {
  SETTINGS_BLOCKS,
  SETTINGS_INLINE_BLOCKS,
  SettingCustomBlock,
  isFullWidthSettingsBlock,
} from "@/components/settings/rows/setting-custom-block";
import { getMessagesForLocale } from "@/lib/locale";
import { SETTINGS_METRICS, pxToRem } from "@/lib/settings/metrics";
import { SETTINGS_TREE_COUNTS, walkSettingsRows, type SettingsBlockKey } from "@/lib/settings/tree";

/** Ş6 §7 — blok kayıt defteri. */

const { row } = SETTINGS_METRICS;

function render(block: SettingsBlockKey, divider = false) {
  return renderToStaticMarkup(
    <LocaleProvider initialLocale="tr" initialMessages={getMessagesForLocale("tr")}>
      <SettingCustomBlock
        data={{}}
        divider={divider}
        row={{ block, key: `${block}-row`, type: "custom" }}
      />
    </LocaleProvider>,
  );
}

describe("SETTINGS_BLOCKS — defter", () => {
  it("yirmi yuva var", () => {
    assert.equal(Object.keys(SETTINGS_BLOCKS).length, SETTINGS_TREE_COUNTS.blocks);
    assert.equal(Object.keys(SETTINGS_BLOCKS).length, 20);
  });

  it("ağacın istediği her blok anahtarı defterde", () => {
    const wanted = new Set<string>();

    for (const { row: rowDef } of walkSettingsRows()) {
      if (rowDef.block) wanted.add(rowDef.block);
    }

    assert.equal(wanted.size, 20);

    for (const key of wanted) {
      assert.ok(key in SETTINGS_BLOCKS, `${key} defterde yok`);
    }
  });

  it("defterde ağacın istemediği yuva yok", () => {
    const wanted = new Set<string>();

    for (const { row: rowDef } of walkSettingsRows()) {
      if (rowDef.block) wanted.add(rowDef.block);
    }

    const orphans = Object.keys(SETTINGS_BLOCKS).filter((key) => !wanted.has(key));

    assert.deepEqual(orphans, []);
  });
});

/**
 * Ş7–Ş10 yuvaları tek tek devralıyor; hangisinin hâlâ yer tutucu olduğu **defterden** okunur.
 *
 * Elle tutulan bir liste, kendi bloğunu bağlayan her şeridi bu dosyanın aynı satırına
 * dokunmaya zorlardı — dört şerit paralel çalışırken çakışmanın garanti yolu. `makePlaceholder`
 * ürettiği bileşene kendi `displayName`'ini basıyor; ayrım oradan gelir.
 */
function isPlaceholderSlot(key: SettingsBlockKey): boolean {
  return (SETTINGS_BLOCKS[key].displayName ?? "").startsWith("SettingsBlockPlaceholder(");
}

/**
 * Yer tutucu davranışını sınayan iki test **sabit bir anahtara** bağlanamaz: Ş7 `hero`'yu,
 * Ş8 `themes`'i, Ş9/Ş10 kalanları devraldı ve her devralma testi kırardı. Defterde kalan ilk
 * yer tutucu seçilir; hiç kalmadıysa iki test kendini atlar — sınadıkları davranışın artık
 * ürün yüzeyi yok, ama defter yeni bir yuva kazanırsa yeniden devreye girerler.
 */
function firstPlaceholderKey(): SettingsBlockKey | null {
  return (Object.keys(SETTINGS_BLOCKS) as SettingsBlockKey[]).find(isPlaceholderSlot) ?? null;
}

describe("SETTINGS_BLOCKS — yer tutucular", () => {
  it("her yuva `data-block` niteliğini bırakıyor", () => {
    // Sahibi gelmiş blok da, gelmemiş yer tutucu da aynı niteliği bırakır: satır motoru hangi
    // bloğu çizdiğini ekrandan okunabilir kılmadan 169 satırın hepsini çizemez.
    for (const key of Object.keys(SETTINGS_BLOCKS) as SettingsBlockKey[]) {
      assert.ok(render(key).includes(`data-block="${key}"`), `${key} niteliğini bırakmıyor`);
    }
  });

  it("sahibi gelmemiş yuvalar iskelet çiziyor", () => {
    for (const key of Object.keys(SETTINGS_BLOCKS) as SettingsBlockKey[]) {
      if (!isPlaceholderSlot(key)) continue;

      assert.ok(render(key).includes('data-block-placeholder="true"'), `${key} yer tutucu değil`);
    }
  });

  it("sahibi gelmiş yuvalar iskelet çizmiyor", () => {
    for (const key of Object.keys(SETTINGS_BLOCKS) as SettingsBlockKey[]) {
      if (isPlaceholderSlot(key)) continue;

      assert.ok(
        !render(key).includes('data-block-placeholder="true"'),
        `${key} hâlâ yer tutucu çiziyor`,
      );
    }
  });

  it("yer tutucu durumu duyuruyor", (t) => {
    const key = firstPlaceholderKey();

    if (!key) {
      t.skip("defterde yer tutucu kalmadı");
      return;
    }

    const markup = render(key);

    assert.ok(markup.includes('role="status"'));
    assert.ok(markup.includes('aria-busy="true"'));
    assert.ok(markup.includes('aria-label="Yükleniyor"'));
  });

  it("iskelet yüzeyi SPEC §4.6 ölçüsünden geliyor", (t) => {
    const key = firstPlaceholderKey();

    if (!key) {
      t.skip("defterde yer tutucu kalmadı");
      return;
    }

    assert.ok(
      render(key).includes(
        `hsl(var(--surface-soft) / ${SETTINGS_METRICS.body.skeletonSurfaceAlpha})`,
      ),
    );
  });
});

describe("SettingCustomBlock — kırpma (tuzak #6)", () => {
  it("tam genişlikli blok kendi içinde kırpıyor, satır dolgusu almıyor", () => {
    const markup = render("hero");

    assert.ok(markup.includes("overflow:hidden"));
    assert.ok(markup.includes(`border-radius:${pxToRem(row.customRadius)}`));
    assert.ok(!markup.includes(`padding:${pxToRem(row.paddingY)}`));
  });

  it("inline iki blok normal satır dolgusuyla çiziliyor, kırpmıyor", () => {
    for (const key of SETTINGS_INLINE_BLOCKS) {
      const markup = render(key);

      assert.ok(
        markup.includes(`padding:${pxToRem(row.paddingY)} ${pxToRem(row.paddingX)}`),
        `${key} satır dolgusu almalı`,
      );
    }
  });

  it("inline liste yalnız mikrofon ölçeri ve kamera önizlemesi (K13)", () => {
    assert.deepEqual([...SETTINGS_INLINE_BLOCKS], ["camera", "mic"]);
    assert.equal(isFullWidthSettingsBlock("hero"), true);
    assert.equal(isFullWidthSettingsBlock("mic"), false);
    assert.equal(isFullWidthSettingsBlock("camera"), false);
  });

  it("ayırıcı bayrağı üst kenarı getiriyor", () => {
    assert.ok(render("hero", true).includes("border-top"));
    assert.ok(!render("hero", false).includes("border-top"));
  });

  it("bloksuz `custom` satır hiçbir şey çizmiyor", () => {
    const markup = renderToStaticMarkup(
      <LocaleProvider initialLocale="tr" initialMessages={getMessagesForLocale("tr")}>
        <SettingCustomBlock data={{}} row={{ key: "boş", type: "custom" }} />
      </LocaleProvider>,
    );

    assert.equal(markup, "");
  });
});
