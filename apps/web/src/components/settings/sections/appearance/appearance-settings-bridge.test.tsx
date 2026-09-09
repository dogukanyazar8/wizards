import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  APPEARANCE_SERVER_ROWS,
  applyAppearanceDocumentEffects,
  FOCUS_RINGS_ATTRIBUTE,
  HIGH_CONTRAST_ATTRIBUTE,
  mainPanelPercentToWidth,
  mainPanelWidthToPercent,
  readAppearanceSettingsValues,
  REDUCE_MOTION_ATTRIBUTE,
  resolveSystemAccessibilityOverrides,
  type AppearanceDocumentRoot,
} from "@/components/settings/sections/appearance/appearance-settings-bridge";
import { MAX_MAIN_PANEL_WIDTH, MIN_MAIN_PANEL_WIDTH } from "@/lib/appearance";
import { UI_SCALE_STEPS } from "@/lib/home/scale";
import { MESSAGE_FONT_OPTIONS } from "@/lib/message-fonts";
import { TEXT_SCALE_ATTRIBUTE } from "@/lib/settings/text-scale";
import { resolveSettingStateKey } from "@/lib/settings/use-setting-value";

/** Ş8 §B — görünüm satırlarının üç hedefi ve belge etkileri. */

function createRoot() {
  const store = new Map<string, string>();
  const style = { fontSize: "" };

  const root: AppearanceDocumentRoot = {
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

describe("Görünüm köprüsü — hedefler", () => {
  it("F2 — sunucuya giden eşleme `PatchSettingsSchema` ile birebir", () => {
    assert.deepEqual(APPEARANCE_SERVER_ROWS, {
      m1: "messageFont",
      m2: "messageSizePx",
      m3: "interfaceDensity",
      m4: "messageDisplayCompact",
      n1: "appIcon",
      reduceMotion: "reduceMotion",
      v1: "inlineAttachmentMedia",
      v2: "linkPreviews",
      v3: "renderEmbeds",
      v4: "renderReactions",
      v5: "animateEmoji",
      v6: "animateStickers",
      v8: "enableTTS",
      x2: "highContrast",
      x3: "strongFocusRings",
      x4: "uiTextScale",
      x6: "screenReaderDescriptions",
      x7: "followSystemA11y",
      y1: "serverRailWidth",
      y2: "serverIconSize",
      y3: "channelSidebarWidth",
      y4: "mainContentWidth",
      y5: "showMemberPanelByDefault",
    });
  });

  it("F2 — kalıcılık şemasındaki Görünüm satırları sunucu alanına gidiyor", () => {
    // Consumer'ı olmayanlar UI'da kapalıdır; bu liste yalnız persistence sözleşmesini ölçer.
    assert.equal(Object.keys(APPEARANCE_SERVER_ROWS).length, 23);

    for (const row of ["m2", "m4", "v1", "v5", "x2", "x4", "n1", "y4", "y5"]) {
      assert.ok(row in APPEARANCE_SERVER_ROWS, `${row} sunucu alanı yok`);
    }
  });

  it("uygulama kutusundan satır değerleri", () => {
    const values = readAppearanceSettingsValues({
      channelSidebarWidth: 244,
      mainPanelWidth: MIN_MAIN_PANEL_WIDTH,
      memberPanelCollapsed: true,
      messageFont: "inter",
      serverRailIconSize: 40,
      serverRailWidth: 136,
    });

    assert.equal(
      values.m1,
      MESSAGE_FONT_OPTIONS.findIndex((option) => option.id === "inter"),
    );
    assert.equal(values.y3, 244);
    assert.equal(values.y4, 70);
    assert.equal(values.y5, false, "`y5` panel açık mı sorusudur, kapalı mı değil");
  });

  it("`y4` yüzde ↔ piksel dönüşümü tek yerde ve tersine dönüyor", () => {
    assert.equal(mainPanelPercentToWidth(70), MIN_MAIN_PANEL_WIDTH);
    assert.equal(mainPanelPercentToWidth(100), MAX_MAIN_PANEL_WIDTH);
    assert.equal(mainPanelWidthToPercent(MIN_MAIN_PANEL_WIDTH), 70);
    assert.equal(mainPanelWidthToPercent(MAX_MAIN_PANEL_WIDTH), 100);

    for (const percent of [70, 80, 90, 100]) {
      assert.equal(mainPanelWidthToPercent(mainPanelPercentToWidth(percent)), percent);
    }
  });
});

describe("Görünüm köprüsü — belge etkileri", () => {
  it("`x4` ölçek adımının üstüne biniyor", () => {
    const { root, store } = createRoot();
    const step = UI_SCALE_STEPS[2]!;

    applyAppearanceDocumentEffects({ x4: 120 }, root, step.rootFontSizePx);

    assert.equal(store.get(TEXT_SCALE_ATTRIBUTE), "120");
    assert.equal(root.style.fontSize, "28.8px");
  });

  it("hareket, kontrast ve odak nitelikleri köke yazılıyor", () => {
    const { root, store } = createRoot();

    applyAppearanceDocumentEffects({ reduceMotion: true, x2: true, x3: false }, root, 16);

    assert.equal(store.get(REDUCE_MOTION_ATTRIBUTE), "true");
    assert.equal(store.get(HIGH_CONTRAST_ATTRIBUTE), "true");
    assert.equal(store.get(FOCUS_RINGS_ATTRIBUTE), "false");
  });
});

describe("SPEC_DEVIATIONS #4 — tek anahtar, iki sekme", () => {
  it("`Hareketi azalt` Medya ve Erişilebilirlik'te aynı durumu yazıyor", () => {
    assert.equal(resolveSettingStateKey("v7"), "reduceMotion");
    assert.equal(resolveSettingStateKey("x1"), "reduceMotion");
    assert.equal(resolveSettingStateKey("v7"), resolveSettingStateKey("x1"));
  });

  it("`Text-to-speech` de tek anahtar", () => {
    assert.equal(resolveSettingStateKey("v8"), "enableTTS");
    assert.equal(resolveSettingStateKey("x5"), "enableTTS");
  });

  it("bağımsız satırlar bağlanmadı", () => {
    assert.equal(resolveSettingStateKey("x2"), "x2");
    assert.equal(resolveSettingStateKey("v5"), "v5");
  });
});

describe("`Sistem tercihlerini takip et` (x7)", () => {
  it("kapalıyken sistem hiçbir şeyi ezmiyor", () => {
    assert.deepEqual(
      resolveSystemAccessibilityOverrides(false, {
        prefersContrast: true,
        prefersReducedMotion: true,
      }),
      {},
    );
  });

  it("açıkken sistem kazanıyor", () => {
    assert.deepEqual(
      resolveSystemAccessibilityOverrides(true, {
        prefersContrast: false,
        prefersReducedMotion: true,
      }),
      { reduceMotion: true, x2: false },
    );
  });
});
