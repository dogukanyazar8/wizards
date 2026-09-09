import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { SETTINGS_METRICS } from "@/lib/settings/metrics";
import {
  measureScrollArea,
  resolveMenuPlacement,
  SETTINGS_MENU_MAX_HEIGHT,
  SETTINGS_MENU_OPEN_DOWN_THRESHOLD,
} from "@/lib/settings/menu-placement";

/**
 * Ş6 §4 — açılır menü yönü.
 *
 * Sınır üç değerle sabitlenir (235 / 236 / 237): eşiği "yaklaşık" tutan bir uygulama, listenin
 * son seçeneğini kaydırma alanının dışında bırakır ve bu ancak belirli bir satırda görülür.
 */

describe("resolveMenuPlacement — 236 px eşiği", () => {
  const base = { menuHeight: 222, scrollAreaTop: 0, triggerTop: 300 };

  it("eşiğin altında yukarı açılır (235)", () => {
    const placement = resolveMenuPlacement({
      ...base,
      scrollAreaBottom: 1000,
      triggerBottom: 765,
    });

    assert.equal(placement.direction, "up");
  });

  it("eşiğin tam üstünde aşağı açılır (236)", () => {
    const placement = resolveMenuPlacement({
      ...base,
      scrollAreaBottom: 1000,
      triggerBottom: 764,
    });

    assert.equal(placement.direction, "down");
  });

  it("eşiğin üstünde aşağı açılır (237)", () => {
    const placement = resolveMenuPlacement({
      ...base,
      scrollAreaBottom: 1000,
      triggerBottom: 763,
    });

    assert.equal(placement.direction, "down");
  });

  it("eşiği ölçü sözlüğünden okur", () => {
    assert.equal(SETTINGS_MENU_OPEN_DOWN_THRESHOLD, 236);
    assert.equal(
      SETTINGS_MENU_OPEN_DOWN_THRESHOLD,
      SETTINGS_METRICS.controls.select.openDownThreshold,
    );
    assert.equal(SETTINGS_MENU_MAX_HEIGHT, SETTINGS_METRICS.controls.select.menuMaxHeight);
  });

  it("eşik dışarıdan verilebilir", () => {
    const placement = resolveMenuPlacement({
      ...base,
      scrollAreaBottom: 1000,
      threshold: 100,
      triggerBottom: 899,
    });

    assert.equal(placement.direction, "down");
  });
});

describe("resolveMenuPlacement — yükseklik kırpılmaz", () => {
  it("aşağı açılırken menü kaydırma alanının içinde biter", () => {
    const placement = resolveMenuPlacement({
      menuHeight: 222,
      scrollAreaBottom: 1000,
      scrollAreaTop: 0,
      triggerBottom: 700,
      triggerTop: 666,
    });

    assert.equal(placement.direction, "down");
    // 700 + 222 = 922 < 1000 → istenen yükseklik olduğu gibi geçer.
    assert.equal(placement.maxHeight, 222);
  });

  it("yukarı açılırken üstteki boşluğa kısılır", () => {
    const placement = resolveMenuPlacement({
      menuHeight: 222,
      scrollAreaBottom: 1000,
      scrollAreaTop: 750,
      triggerBottom: 900,
      triggerTop: 866,
    });

    assert.equal(placement.direction, "up");
    // Üstte 116 px var; menü 222 istese de son seçeneği alanın dışına taşıramaz.
    assert.equal(placement.maxHeight, 116);
  });

  it("yukarıda bol yer varken istenen yükseklik korunur", () => {
    const placement = resolveMenuPlacement({
      menuHeight: 180,
      scrollAreaBottom: 1000,
      scrollAreaTop: 400,
      triggerBottom: 900,
      triggerTop: 866,
    });

    assert.equal(placement.direction, "up");
    assert.equal(placement.maxHeight, 180);
  });

  it("222 px hiçbir koşulda aşılmaz", () => {
    const placement = resolveMenuPlacement({
      menuHeight: 5000,
      scrollAreaBottom: 4000,
      scrollAreaTop: 0,
      triggerBottom: 100,
      triggerTop: 66,
    });

    assert.equal(placement.maxHeight, SETTINGS_MENU_MAX_HEIGHT);
  });

  it("iki yön de dar olduğunda geniş olan seçilir", () => {
    // Referansın kuralı burada menüyü 40 px'lik üst boşluğa atardı; 120 px'lik alt boşluk
    // daha az kırpar.
    const placement = resolveMenuPlacement({
      menuHeight: 222,
      scrollAreaBottom: 1000,
      scrollAreaTop: 806,
      triggerBottom: 880,
      triggerTop: 846,
    });

    assert.equal(placement.direction, "down");
    assert.equal(placement.maxHeight, 120);
  });

  it("negatif boşluk sıfıra düşer, eksi yükseklik üretmez", () => {
    // Tetikleyici kaydırma alanının tamamen dışına çıkmış (iki yönde de eksi boşluk).
    const placement = resolveMenuPlacement({
      menuHeight: 222,
      scrollAreaBottom: 500,
      scrollAreaTop: 900,
      triggerBottom: 900,
      triggerTop: 866,
    });

    assert.equal(placement.maxHeight, 0);
  });
});

type FakeElement = {
  clientHeight: number;
  getBoundingClientRect: () => { bottom: number; top: number };
  ownerDocument: { defaultView: { getComputedStyle: (node: unknown) => { overflowY: string } } };
  overflowY: string;
  parentElement: FakeElement | null;
  scrollHeight: number;
};

function fakeElement(
  overflowY: string,
  scrollHeight: number,
  clientHeight: number,
  rect: { bottom: number; top: number },
  parentElement: FakeElement | null = null,
): FakeElement {
  const node: FakeElement = {
    clientHeight,
    getBoundingClientRect: () => rect,
    ownerDocument: {
      defaultView: {
        getComputedStyle: (target: unknown) => ({
          overflowY: (target as FakeElement).overflowY,
        }),
      },
    },
    overflowY,
    parentElement,
    scrollHeight,
  };

  return node;
}

describe("measureScrollArea", () => {
  it("gerçekten kaydırılan ilk `auto` atayı bulur", () => {
    const scroller = fakeElement("auto", 2000, 800, { bottom: 900, top: 100 });
    const inner = fakeElement("visible", 100, 100, { bottom: 400, top: 300 }, scroller);
    const trigger = fakeElement("visible", 34, 34, { bottom: 334, top: 300 }, inner);

    assert.deepEqual(measureScrollArea(trigger as unknown as Element, 1080), {
      bottom: 900,
      top: 100,
    });
  });

  it("kaydırmayan `auto` kap sınır sayılmaz", () => {
    // Kaydırmayan bir kap menüyü kırpmaz; onu sınır saymak menüyü boşuna yukarı açardı.
    const idle = fakeElement("auto", 802, 800, { bottom: 900, top: 100 });
    const trigger = fakeElement("visible", 34, 34, { bottom: 334, top: 300 }, idle);

    assert.deepEqual(measureScrollArea(trigger as unknown as Element, 1080), {
      bottom: 1080,
      top: 0,
    });
  });

  it("F5 — `scroll` ve `overlay` kaplar da sınırdır", () => {
    for (const overflow of ["scroll", "overlay"]) {
      const scroller = fakeElement(overflow, 2000, 800, { bottom: 900, top: 100 });
      const trigger = fakeElement("visible", 34, 34, { bottom: 334, top: 300 }, scroller);

      assert.deepEqual(
        measureScrollArea(trigger as unknown as Element, 1080),
        { bottom: 900, top: 100 },
        `overflow-y: ${overflow} kırpıyor ama sınır sayılmadı`,
      );
    }
  });

  it("F5 — `hidden` kap sınır sayılmaz: kırpar ama kaydırmaz", () => {
    const clipped = fakeElement("hidden", 802, 800, { bottom: 900, top: 100 });
    const trigger = fakeElement("visible", 34, 34, { bottom: 334, top: 300 }, clipped);

    assert.deepEqual(measureScrollArea(trigger as unknown as Element, 1080), {
      bottom: 1080,
      top: 0,
    });
  });

  it("ata yoksa görünüm alanı sınırdır", () => {
    assert.deepEqual(measureScrollArea(null, 920), { bottom: 920, top: 0 });
  });
});
