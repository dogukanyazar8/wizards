import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { readDesignReference } from "@/lib/design-reference";

import { SERVER_METRICS } from "./metrics";

/**
 * Ş11 parity kapısı — sunucu ayarları kabuğu (§8) ve Genel · Görünürlük · İçerik
 * (§8.1–§8.3) için **Ş11'in eklediği** sözlük kayıtları.
 *
 * `parity.test.ts` Ş0'ın yazdığı taban kümeyi ölçüyor; bu dosya yalnız bu şeridin eklediklerini
 * ekliyor. Ayrı dosya olmasının sebebi Dalga 5'in üç şeridinin **paralel** koşması: üçü de tek
 * dosyaya yazsaydı her biri diğerinin satırlarını taşırdı (`section-parity.s12.test.ts` aynı
 * gerekçeyle ayrı).
 *
 * Kural aynı: sözlükteki her sayı referansın inline `style` metninde birebir aranır. Sayı
 * "düzeltilirse" bu dosya kırmızı verir.
 */

const reference = readDesignReference("design_handoff_sunucu/design/Sunucu.dc.html");

function assertReferenceContains(fragment: string): void {
  assert.ok(reference.includes(fragment), `Referans HTML parçası bulunamadı: ${fragment}`);
}

describe("Ş11 parity — ayarlar kabuğu (§8)", () => {
  it("sol kolonun sunucu kartını ve menü boşluğunu korur", () => {
    const { settings } = SERVER_METRICS;

    assertReferenceContains(
      `padding:${settings.serverCardPaddingY}px ${settings.serverCardPaddingX}px;border-bottom:1px solid hsl(var(--border)/.45)`,
    );
    assertReferenceContains(
      `font:600 ${settings.serverNameFontSize}px/${settings.serverNameLineHeight} var(--w-display)`,
    );
    assertReferenceContains(
      `width:${settings.serverMetaDotSize}px;height:${settings.serverMetaDotSize}px;border-radius:50%`,
    );
    assertReferenceContains(
      `padding:${settings.menuPaddingTop}px ${settings.menuPaddingX}px ${settings.menuPaddingBottom}px`,
    );
  });

  it("menü sayı çipini ve aktif satır alfalarını korur", () => {
    const { settings } = SERVER_METRICS;

    assertReferenceContains(
      `padding:${settings.menuCountPaddingY}px ${settings.menuCountPaddingX}px;border-radius:${settings.menuCountRadius}px;background:hsl(var(--surface-tertiary));font:600 ${settings.menuCountFontSize}px/1 var(--w-display)`,
    );
    // Aktif satırın zemini referansta satır içi `style` değil, `SET_NAV` üreticisinin JS'i.
    assertReferenceContains(
      `bg: on ? (dz ? H('danger', '.${String(settings.menuDangerActiveAlpha).slice(2)}') : H('primary', '.${String(settings.menuActiveAlpha).slice(2)}'))`,
    );
  });

  it("`Değişiklikler kaydedildi` göstergesinin noktasını korur", () => {
    const { settings } = SERVER_METRICS;

    assertReferenceContains(
      `gap:${settings.savedGap}px;font:500 ${settings.savedFontSize}px/1 var(--w-body);color:hsl(var(--success))`,
    );
    assertReferenceContains(
      `width:${settings.savedDotSize}px;height:${settings.savedDotSize}px;border-radius:50%;background:hsl(var(--success))`,
    );
  });

  it("görünürlük rozetinin alfası `.16`", () => {
    const { settings } = SERVER_METRICS;

    assertReferenceContains(
      `visBg: visTone ? H(visTone, '.${String(settings.visibilityChipBackgroundAlpha).slice(2)}')`,
    );
  });
});

describe("Ş11 parity — Genel (§8.1)", () => {
  const s = SERVER_METRICS.settingsSections;

  it("ikon kartının satırını, yükleme düğmelerini ve ipucunu korur", () => {
    assertReferenceContains(
      `gap:${s.generalIconRowGap}px;margin-top:${s.generalIconRowMarginTop}px`,
    );
    assertReferenceContains(
      `width:${s.generalIconSize}px;height:${s.generalIconSize}px;border-radius:${s.generalIconRadius}px`,
    );
    assertReferenceContains(`font:600 ${s.generalIconFontSize}px/1 var(--w-display)`);
    assertReferenceContains(
      `gap:${s.generalUploadGap}px;height:${s.generalUploadHeight}px;padding:0 ${s.generalUploadPaddingX}px;border:1px solid hsl(var(--border));border-radius:${s.generalUploadRadius}px`,
    );
    assertReferenceContains(
      `border:1px solid hsl(var(--danger)/.${String(s.generalRemoveBorderAlpha).slice(2)});border-radius:${s.generalUploadRadius}px`,
    );
    assertReferenceContains(
      `margin-top:${s.generalIconHintMarginTop}px;font-size:${s.generalIconHintFontSize}px;line-height:${s.generalNoteLineHeight}`,
    );
  });

  it("alan başlığının boşluğunu, sayacını ve kısaltma girdisini korur", () => {
    assertReferenceContains(`display:flex;align-items:center;gap:${s.generalLabelGap}px`);
    assertReferenceContains(
      `font:600 ${SERVER_METRICS.modal.counterFontSize}px/1 var(--w-display)`,
    );
    assertReferenceContains(
      `letter-spacing:.${String(s.generalShortNameLetterSpacing).slice(2)}em;text-align:center`,
    );
    assertReferenceContains(
      `margin-top:${s.generalInputMarginTop}px;padding:${s.generalInputPaddingY}px ${s.generalInputPaddingX}px;border:1px solid hsl(var(--border));border-radius:${s.generalInputRadius}px`,
    );
  });

  it("profil önizlemesinin satırını, istatistiklerini ve notunu korur", () => {
    assertReferenceContains(
      `gap:${s.generalProfileIconRowGap}px;margin-top:${s.generalIconRowMarginTop}px`,
    );
    assertReferenceContains(
      `gap:${s.generalProfileBadgeGap}px;margin-top:${s.generalProfileBadgeMarginTop}px`,
    );
    assertReferenceContains(
      `gap:${s.generalStatsGap}px;margin-top:${s.generalStatsMarginTop}px;padding-top:${s.generalStatsPaddingTop}px;border-top:1px solid hsl(var(--border)/.${String(s.generalStatsBorderTopAlpha).slice(2)})`,
    );
    assertReferenceContains(`gap:${s.generalStatRowGap}px;padding:${s.generalStatRowPaddingY}px 0`);
    assertReferenceContains(
      `padding:${s.generalNotePaddingY}px ${s.generalNotePaddingX}px;border-radius:${s.generalNoteRadius}px;background:hsl(var(--surface-soft)/.${String(s.generalNoteBackgroundAlpha).slice(2)})`,
    );
  });
});

describe("Ş11 parity — Görünürlük ve İçerik (§8.2, §8.3)", () => {
  const s = SERVER_METRICS.settingsSections;

  it("satırın ikon tonunu, çizim boyunu ve başlık satır yüksekliğini korur", () => {
    assertReferenceContains(`icon: ic(iconPath, ${s.visibilityIconGlyphSize})`);
    assertReferenceContains(
      `iconBg: H(tone, '.${String(s.visibilityIconBackgroundAlpha).slice(2)}')`,
    );
    assertReferenceContains(
      `font:600 ${s.visibilityTitleFontSize}px/${s.visibilityTitleLineHeight} var(--w-body)`,
    );
    assertReferenceContains(
      `gap:${s.visibilityRowGap}px;padding:${s.visibilityRowPaddingY}px ${s.visibilityRowPaddingX}px;border-radius:${s.visibilityRowRadius}px`,
    );
  });

  it("`Salt okunur` çipi sol kolonun görünürlük rozetiyle **aynı** kutu", () => {
    const { settings } = SERVER_METRICS;

    // İki kayıt olsaydı iki çip ayrışırdı; referans ikisini de aynı kutuyla çiziyor.
    assertReferenceContains(
      `padding:${settings.visibilityChipPaddingY}px ${settings.visibilityChipPaddingX}px;border-radius:${settings.visibilityChipRadius}px;background:hsl(var(--surface-tertiary));font:600 ${settings.visibilityChipFontSize}px/1 var(--w-display)`,
    );
  });

  it("İçerik bölümünün seçenek kartını ve değer çipini korur", () => {
    assertReferenceContains(
      `gap:${s.contentOptionsGap}px;margin-top:${s.contentOptionsMarginTop}px`,
    );
    assertReferenceContains(
      `padding:${s.contentCardPadding}px;border-radius:${s.contentCardRadius}px;background:hsl(var(--surface-card));border:1px solid hsl(var(--border)/.${String(s.contentCardBorderAlpha).slice(2)})`,
    );
    assertReferenceContains(
      `padding:${s.contentValueChipPaddingY}px ${s.contentValueChipPaddingX}px;border-radius:${s.contentValueChipRadius}px;background:hsl(var(--primary)/.${String(s.contentValueChipBackgroundAlpha).slice(2)});font:600 ${s.contentValueChipFontSize}px/1 var(--w-display)`,
    );
  });
});

describe("Ş11 parity — sözlüğün sözleşmesi", () => {
  it("Genel bölümünün swatch'ı oluşturma penceresininkinden **bilerek** ayrı", () => {
    const { createServer, settingsSections } = SERVER_METRICS;

    // §7.1 `26`, §8.1 `27`. Sessizce eşitlenirlerse `ServerIconSwatches` tek varyanta düşer.
    assert.notEqual(createServer.swatchSize, settingsSections.generalSwatchSize);
    assert.equal(createServer.swatchRadius, settingsSections.generalSwatchRadius);
  });

  it("§8.1'in etiket boşluğu §6'nın ortak etiketinden ayrı", () => {
    assert.notEqual(SERVER_METRICS.modal.labelGap, SERVER_METRICS.settingsSections.generalLabelGap);
  });

  it("kabuk ikinci bir `z-index` merdiveni tanımlamaz", () => {
    // K11: `settings` katmanı 70, pencere 80. Sözlükte tek kayıt var ve `layer-stack` onu okur.
    assert.equal(SERVER_METRICS.settings.overlayZIndex, 70);
    assert.equal(SERVER_METRICS.modal.overlayZIndex, 80);
  });
});
