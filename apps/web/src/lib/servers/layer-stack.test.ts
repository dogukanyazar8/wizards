import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  EMPTY_LAYER_STACK,
  SERVER_LAYER_Z_INDEX,
  type ServerLayerStack,
  closeLayer,
  closeTopLayer,
  isLayerOpen,
  isTopLayer,
  layerZIndex,
  openLayer,
  topLayer,
} from "./layer-stack";

const POPOVER = { id: "server-menu", kind: "popover" } as const;
const SEARCH = { id: "channel-search", kind: "popover" } as const;
const SETTINGS = { id: "server-settings", kind: "settings" } as const;
const CATEGORY = { id: "category-modal", kind: "modal" } as const;
const CHANNEL = { id: "channel-modal", kind: "modal" } as const;
/** Ş14 — ayarların **içinden** açılan satır menüleri (üye rol/moderasyon menüsü). */
const ROLE_MENU = { id: "member-role-menu", kind: "menu" } as const;
const MODERATION_MENU = { id: "member-moderation-menu", kind: "menu" } as const;

function stackOf(...ids: string[]): string[] {
  return ids;
}

function ids(stack: ServerLayerStack): string[] {
  return stack.map((entry) => entry.id);
}

describe("katman yığını — sıra", () => {
  it("üç katmanı SPEC'in sırasında tutar", () => {
    assert.equal(layerZIndex("popover"), 60);
    assert.equal(layerZIndex("settings"), 70);
    assert.equal(layerZIndex("menu"), 75);
    assert.equal(layerZIndex("modal"), 80);
    assert.ok(SERVER_LAYER_Z_INDEX.popover < SERVER_LAYER_Z_INDEX.settings);
    assert.ok(SERVER_LAYER_Z_INDEX.settings < SERVER_LAYER_Z_INDEX.menu);
    assert.ok(SERVER_LAYER_Z_INDEX.menu < SERVER_LAYER_Z_INDEX.modal);
  });

  it("yeni açılan açılır öncekini kapatır", () => {
    const stack = openLayer(openLayer(EMPTY_LAYER_STACK, POPOVER), SEARCH);

    assert.deepEqual(ids(stack), stackOf("channel-search"));
  });

  it("ayarlar açılırken açık popover'ı kapatır", () => {
    const stack = openLayer(openLayer(EMPTY_LAYER_STACK, POPOVER), SETTINGS);

    assert.deepEqual(ids(stack), stackOf("server-settings"));
  });

  it("aynı yüzey iki kez açılsa da yığında bir kez durur", () => {
    const stack = openLayer(openLayer(EMPTY_LAYER_STACK, SETTINGS), CATEGORY);

    assert.deepEqual(ids(openLayer(stack, CATEGORY)), stackOf("server-settings", "category-modal"));
  });
});

describe("katman yığını — ayarların üstündeki pencere (K11)", () => {
  it("pencere açılınca ayarlar kapanmaz, altta kalır", () => {
    const stack = openLayer(openLayer(EMPTY_LAYER_STACK, SETTINGS), CATEGORY);

    assert.deepEqual(ids(stack), stackOf("server-settings", "category-modal"));
    assert.ok(isLayerOpen(stack, "server-settings"));
    assert.equal(topLayer(stack)?.id, "category-modal");
  });

  it("pencere kapanınca ayarlara dönülür", () => {
    const opened = openLayer(openLayer(EMPTY_LAYER_STACK, SETTINGS), CATEGORY);
    const closed = closeLayer(opened, "category-modal");

    assert.deepEqual(ids(closed), stackOf("server-settings"));
    assert.ok(isTopLayer(closed, "server-settings"));
  });

  it("ikinci pencere birincisini kapatır ama ayarları bırakmaz", () => {
    const stack = openLayer(openLayer(openLayer(EMPTY_LAYER_STACK, SETTINGS), CATEGORY), CHANNEL);

    assert.deepEqual(ids(stack), stackOf("server-settings", "channel-modal"));
  });

  it("ayarlar kapalıyken açılan pencere tek başına durur", () => {
    const stack = openLayer(EMPTY_LAYER_STACK, CATEGORY);

    assert.deepEqual(ids(stack), stackOf("category-modal"));
  });

  it("pencere açıkken açılan popover yığını temizler", () => {
    const stack = openLayer(openLayer(openLayer(EMPTY_LAYER_STACK, SETTINGS), CATEGORY), POPOVER);

    assert.deepEqual(ids(stack), stackOf("server-menu"));
  });
});

describe("katman yığını — Esc", () => {
  it("en üstteki katmanı kapatır, altındakini bırakır", () => {
    const opened = openLayer(openLayer(EMPTY_LAYER_STACK, SETTINGS), CATEGORY);
    const first = closeTopLayer(opened);

    assert.equal(first.closed?.id, "category-modal");
    assert.deepEqual(ids(first.stack), stackOf("server-settings"));

    const second = closeTopLayer(first.stack);

    assert.equal(second.closed?.id, "server-settings");
    assert.deepEqual(ids(second.stack), []);
  });

  it("boş yığında hiçbir şey kapatmaz", () => {
    const result = closeTopLayer(EMPTY_LAYER_STACK);

    assert.equal(result.closed, null);
    assert.deepEqual(ids(result.stack), []);
  });

  it("yalnız en üstteki katman Esc'i ve odak tuzağını üstlenir", () => {
    const stack = openLayer(openLayer(EMPTY_LAYER_STACK, SETTINGS), CATEGORY);

    assert.equal(isTopLayer(stack, "category-modal"), true);
    assert.equal(isTopLayer(stack, "server-settings"), false);
    assert.equal(isLayerOpen(stack, "server-settings"), true);
  });
});

describe("katman yığını — ayarların içindeki menüler (Ş14)", () => {
  it("menü ayarları kapatmaz, üstüne biner", () => {
    const stack = openLayer(openLayer(EMPTY_LAYER_STACK, SETTINGS), ROLE_MENU);

    assert.deepEqual(ids(stack), stackOf("server-settings", "member-role-menu"));
    assert.equal(topLayer(stack)?.id, "member-role-menu");
  });

  it("`Esc` önce menüyü kapatır, ayarları bırakır", () => {
    const stack = openLayer(openLayer(EMPTY_LAYER_STACK, SETTINGS), ROLE_MENU);
    const { closed, stack: next } = closeTopLayer(stack);

    assert.equal(closed?.id, "member-role-menu");
    assert.deepEqual(ids(next), stackOf("server-settings"));
    assert.ok(isTopLayer(next, "server-settings"));
  });

  it("iki menü aynı anda açık kalamaz", () => {
    const stack = openLayer(
      openLayer(openLayer(EMPTY_LAYER_STACK, SETTINGS), ROLE_MENU),
      MODERATION_MENU,
    );

    assert.deepEqual(ids(stack), stackOf("server-settings", "member-moderation-menu"));
  });

  it("menü açıkken açılan pencere menüyü kapatır, ayarları bırakır", () => {
    const stack = openLayer(openLayer(openLayer(EMPTY_LAYER_STACK, SETTINGS), ROLE_MENU), CATEGORY);

    assert.deepEqual(ids(stack), stackOf("server-settings", "category-modal"));
  });

  it("ayarsız açılan bir menü yığını tek başına tutar", () => {
    const stack = openLayer(openLayer(EMPTY_LAYER_STACK, POPOVER), ROLE_MENU);

    assert.deepEqual(ids(stack), stackOf("member-role-menu"));
  });
});

describe("katman yığını — kapatma", () => {
  it("yığında olmayan bir kimlik yığını değiştirmez", () => {
    const stack = openLayer(EMPTY_LAYER_STACK, SETTINGS);

    assert.deepEqual(ids(closeLayer(stack, "category-modal")), stackOf("server-settings"));
  });

  it("alttaki katmanı doğrudan kapatmak üsttekini bırakır", () => {
    const stack = openLayer(openLayer(EMPTY_LAYER_STACK, SETTINGS), CATEGORY);

    assert.deepEqual(ids(closeLayer(stack, "server-settings")), stackOf("category-modal"));
  });
});
