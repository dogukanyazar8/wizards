import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { SERVER_ICON_TONES } from "@wizards/types";

import {
  SERVER_ICON_TONE_ORDER,
  deriveServerIconTone,
  getServerIconToneColor,
  getServerIconToneVariable,
  resolveServerIconTone,
} from "@/lib/servers/server-icon-tone";

describe("sunucu ikon tonu — SPEC-SUNUCU §7.1", () => {
  it("swatch sırası SPEC'in altı tonu, sözleşmeyle aynı sırada", () => {
    assert.deepEqual(
      [...SERVER_ICON_TONE_ORDER],
      ["primary", "info", "success", "warning", "danger", "accent2"],
    );
    assert.deepEqual([...SERVER_ICON_TONE_ORDER], [...SERVER_ICON_TONES]);
  });

  /** Sözleşme `accent2` yazar, CSS değişkeni `--accent-2`; köprü tek yerde olmalı. */
  it("accent2 tonunu --accent-2 değişkenine bağlar", () => {
    assert.equal(getServerIconToneVariable("accent2"), "--accent-2");
    assert.equal(getServerIconToneColor("accent2"), "hsl(var(--accent-2))");
    assert.equal(getServerIconToneColor("primary", 0.16), "hsl(var(--primary) / 0.16)");
  });

  it("her ton için yalnız hsl(var(--token)) üretir, hex üretmez", () => {
    for (const tone of SERVER_ICON_TONE_ORDER) {
      const color = getServerIconToneColor(tone);

      assert.match(color, /^hsl\(var\(--[a-z0-9-]+\)\)$/);
      assert.doesNotMatch(color, /#/);
    }
  });

  /**
   * `Sunucu.dc.html` satır 2205: harf kodları toplamı % palet uzunluğu. Değer değişirse
   * mevcut sunucuların ikon rengi topluca kayar, o yüzden sabitler tek tek yazılı.
   */
  it("kısa addan deterministik türetir (referanstaki formül)", () => {
    assert.equal(deriveServerIconTone("WH"), SERVER_ICON_TONE_ORDER[(87 + 72) % 6]);
    assert.equal(deriveServerIconTone("WT"), SERVER_ICON_TONE_ORDER[(87 + 84) % 6]);
    assert.equal(deriveServerIconTone("W"), SERVER_ICON_TONE_ORDER[87 % 6]);
  });

  it("aynı kısa ad her çağrıda aynı tonu verir", () => {
    for (const shortName of ["WH", "AB", "ZZZZ", "İK"]) {
      assert.equal(deriveServerIconTone(shortName), deriveServerIconTone(shortName));
    }
  });

  it("seçim varsa onu, yoksa türetmeyi döner; null ile undefined aynı görünür", () => {
    assert.equal(resolveServerIconTone("danger", "WH"), "danger");
    assert.equal(resolveServerIconTone(null, "WH"), deriveServerIconTone("WH"));
    assert.equal(resolveServerIconTone(undefined, "WH"), deriveServerIconTone("WH"));
  });
});
