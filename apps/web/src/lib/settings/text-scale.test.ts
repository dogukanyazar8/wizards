import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { UI_SCALE_STEPS } from "@/lib/home/scale";
import { applyUiScale } from "@/hooks/use-ui-scale";
import {
  applyTextScaleToDocument,
  clampTextScalePercent,
  composeRootFontSize,
  DEFAULT_TEXT_SCALE_PERCENT,
  MAX_TEXT_SCALE_PERCENT,
  MIN_TEXT_SCALE_PERCENT,
  readTextScaleMultiplier,
  TEXT_SCALE_ATTRIBUTE,
  type TextScaleRoot,
} from "@/lib/settings/text-scale";

function createRoot(attributes: Record<string, string> = {}) {
  const store = new Map(Object.entries(attributes));
  const style = { fontSize: "" };

  const root: TextScaleRoot = {
    getAttribute: (name) => store.get(name) ?? null,
    setAttribute: (name, value) => {
      store.set(name, value);
    },
    style: {
      get fontSize() {
        return style.fontSize;
      },
      set fontSize(value: string) {
        style.fontSize = value;
      },
    },
  };

  return { root, store };
}

const stepX1 = UI_SCALE_STEPS[0]!;
const stepX15 = UI_SCALE_STEPS[2]!;

describe("Yazı boyutu — ölçek adımının üstüne biner", () => {
  it("aralık SPEC §5.3 ile aynı", () => {
    assert.equal(MIN_TEXT_SCALE_PERCENT, 85);
    assert.equal(MAX_TEXT_SCALE_PERCENT, 130);
    assert.equal(DEFAULT_TEXT_SCALE_PERCENT, 100);
  });

  it("aralık dışı değerler kırpılır", () => {
    assert.equal(clampTextScalePercent(40), 85);
    assert.equal(clampTextScalePercent(400), 130);
    assert.equal(clampTextScalePercent(Number.NaN), 100);
    assert.equal(clampTextScalePercent(112.4), 112);
  });

  it("çarpan adımın yerine geçmez, onunla çarpılır", () => {
    const { root } = createRoot();

    applyTextScaleToDocument(root, 130, stepX15.rootFontSizePx);

    // 24 px adım × 1.30 = 31.2 px — adım korunuyor.
    assert.equal(root.style.fontSize, "31.2px");
  });

  it("aynı çarpan her adımda farklı sonuç verir — adım kaybolmuyor", () => {
    const sizes = UI_SCALE_STEPS.map((step) => {
      const { root } = createRoot();
      applyTextScaleToDocument(root, 120, step.rootFontSizePx);
      return root.style.fontSize;
    });

    assert.deepEqual(sizes, ["19.2px", "21.6px", "28.8px", "38.4px"]);
  });

  it("ölçek motoru yeniden koşunca kullanıcının seçimi silinmiyor", () => {
    const { root, store } = createRoot();

    applyTextScaleToDocument(root, 115, stepX1.rootFontSizePx);
    assert.equal(store.get(TEXT_SCALE_ATTRIBUTE), "115");
    assert.equal(root.style.fontSize, "18.4px");

    // Pencere büyüdü: motor ×1.5 adımını yazıyor.
    applyUiScale(root, stepX15);

    assert.equal(root.style.fontSize, "27.6px", "resize çarpanı sildi");
  });

  it("çarpan yokken motor tabanı yazar", () => {
    const { root } = createRoot();

    applyUiScale(root, stepX15);

    assert.equal(root.style.fontSize, "24px");
    assert.equal(readTextScaleMultiplier(root), 1);
  });

  it("bozuk nitelik çarpanı 1 sayar", () => {
    const { root } = createRoot({ [TEXT_SCALE_ATTRIBUTE]: "abc" });

    assert.equal(readTextScaleMultiplier(root), 1);
  });

  it("formül tek yerde — iki yazıcı da onu kullanır", () => {
    assert.equal(composeRootFontSize(16, 1), "16px");
    assert.equal(composeRootFontSize(18, 0.85), "15.3px");
  });
});
