import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { SETTINGS_METRICS } from "@/lib/settings/metrics";
import {
  resolveUserBarMenuPlacement,
  USER_BAR_MENU_ANCHOR_GAP,
  USER_BAR_MENU_EDGE_PADDING,
} from "@/lib/shell/user-bar-menu-placement";

/** Kullanıcı barı menüsünün yerleşimi — SPEC-AYARLAR §3. */

const { userMenu } = SETTINGS_METRICS;
const DESKTOP = { height: 920, width: 1360 } as const;

describe("resolveUserBarMenuPlacement", () => {
  it("masaüstünde SPEC koordinatına oturuyor", () => {
    // Ray 74 + ayak dolgusu 10 = 84; kullanıcı barı ekranın altından 62 px yukarıda.
    const placement = resolveUserBarMenuPlacement({
      anchor: { left: 84, top: DESKTOP.height - 62, width: 280 },
      viewport: DESKTOP,
    });

    assert.equal(placement.left, 84);
    assert.equal(placement.bottom, 62 + USER_BAR_MENU_ANCHOR_GAP);
    assert.equal(placement.width, 280);
  });

  it("menü kullanıcı barını örtmüyor", () => {
    const anchorTop = 800;
    const placement = resolveUserBarMenuPlacement({
      anchor: { left: 84, top: anchorTop, width: 280 },
      viewport: DESKTOP,
    });

    // Menünün alt kenarının ekran üstünden uzaklığı = height - bottom.
    const menuBottomEdgeFromTop = DESKTOP.height - placement.bottom;

    assert.ok(menuBottomEdgeFromTop < anchorTop, "menü çapanın üstünde durmalı");
    assert.equal(anchorTop - menuBottomEdgeFromTop, USER_BAR_MENU_ANCHOR_GAP);
  });

  it("dar ekranda sağdan taşmıyor", () => {
    const viewport = { height: 812, width: 375 };
    const placement = resolveUserBarMenuPlacement({
      anchor: { left: 300, top: 740, width: 280 },
      viewport,
    });

    assert.ok(placement.left >= USER_BAR_MENU_EDGE_PADDING);
    assert.ok(
      placement.left + placement.width <= viewport.width - USER_BAR_MENU_EDGE_PADDING,
      "menü görünüm alanının sağına taşıyor",
    );
  });

  it("dar ekranda kanal çubuğunun genişliğine tam oturur", () => {
    const viewport = { height: 812, width: 320 };
    const placement = resolveUserBarMenuPlacement({
      anchor: { left: 8, top: 740, width: 280 },
      viewport,
    });

    assert.equal(placement.width, 280);
    assert.ok(placement.width < userMenu.width);
  });

  it("yükseklik kalan boşluğa kısılıyor", () => {
    const viewport = { height: 500, width: 1360 };
    const placement = resolveUserBarMenuPlacement({
      anchor: { left: 84, top: 460, width: 280 },
      maxHeight: 544,
      viewport,
    });

    assert.ok(placement.maxHeight <= viewport.height - placement.bottom);
    assert.ok(placement.maxHeight < 544, "kısa ekranda menü kısılmalı");
    assert.ok(placement.maxHeight > 0);
  });

  it("istenen yükseklik sığıyorsa aynen korunuyor", () => {
    const placement = resolveUserBarMenuPlacement({
      anchor: { left: 84, top: DESKTOP.height - 62, width: 280 },
      maxHeight: 300,
      viewport: DESKTOP,
    });

    assert.equal(placement.maxHeight, 300);
  });

  it("çapa yoksa SPEC'in sabit koordinatına düşüyor", () => {
    const placement = resolveUserBarMenuPlacement({ anchor: null, viewport: DESKTOP });

    assert.equal(placement.left, userMenu.left);
    assert.equal(placement.bottom, userMenu.bottom);
  });

  it("ölçek adımı büyüdüğünde tasarım ölçüleri büyür, ölçülen koordinat büyümez", () => {
    // Kök font 24 px = ×1.5 adımı. Çapa **zaten ölçeklenmiş** düzenden geliyor, o yüzden
    // olduğu gibi kullanılır; 308 px'lik tasarım genişliği ise 462 px'e çıkar.
    const anchor = { left: 126, top: DESKTOP.height - 93, width: 420 };
    const scaled = resolveUserBarMenuPlacement({ anchor, rootFontSizePx: 24, viewport: DESKTOP });
    const base = resolveUserBarMenuPlacement({ anchor, rootFontSizePx: 16, viewport: DESKTOP });

    assert.equal(base.width, anchor.width);
    assert.equal(scaled.width, anchor.width);
    assert.equal(base.left, anchor.left, "ölçülen sol kenar ölçekten etkilenmemeli");
    assert.equal(scaled.left, anchor.left);
    // Boşluk tasarım ölçüsü: ×1.5'te 9 px yerine 13,5 px.
    assert.equal(scaled.bottom - base.bottom, USER_BAR_MENU_ANCHOR_GAP * 0.5);
  });

  it("bozuk kök font boyutu tabana düşüyor", () => {
    const anchor = { left: 84, top: DESKTOP.height - 62, width: 280 };
    const expected = resolveUserBarMenuPlacement({ anchor, viewport: DESKTOP });

    for (const rootFontSizePx of [0, -8, Number.NaN]) {
      assert.deepEqual(
        resolveUserBarMenuPlacement({ anchor, rootFontSizePx, viewport: DESKTOP }),
        expected,
      );
    }
  });

  it("ölçülemeyen görünüm alanı (SSR) sabit koordinat veriyor", () => {
    for (const viewport of [
      { height: 0, width: 0 },
      { height: Number.NaN, width: 1360 },
      { height: 920, width: -10 },
    ]) {
      const placement = resolveUserBarMenuPlacement({
        anchor: { left: 84, top: 858, width: 280 },
        viewport,
      });

      assert.equal(placement.left, userMenu.left);
      assert.equal(placement.bottom, userMenu.bottom);
      assert.equal(placement.width, userMenu.width);
    }
  });

  it("çapa ekranın dışındaysa menü yine ekranda kalıyor", () => {
    const placement = resolveUserBarMenuPlacement({
      anchor: { left: -400, top: 4000, width: 280 },
      viewport: DESKTOP,
    });

    assert.equal(placement.left, USER_BAR_MENU_EDGE_PADDING);
    assert.ok(placement.bottom <= DESKTOP.height - USER_BAR_MENU_EDGE_PADDING);
    assert.ok(placement.maxHeight >= 0);
  });
});
