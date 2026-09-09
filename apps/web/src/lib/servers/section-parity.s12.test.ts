import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { readDesignReference } from "@/lib/design-reference";

import { SERVER_METRICS } from "./metrics";
import { SERVER_PERMISSION_GROUPS, SERVER_PERMISSION_ROW_COUNT } from "./permission-groups";
import { SERVER_ROLE_TONES } from "./role-color";

/**
 * Ş12 parity kapısı — §8.4 ve §8.5'in çizdiği her ölçü referans HTML'de birebir aranır.
 *
 * `parity.test.ts` bölüm sözlüğünün **tamamını** dolaşıyor; bu dosya yalnız Ş12'nin
 * dokunduğu parçaları, çizildikleri **birleşim** hâliyle denetler (şeridin kendi kapısı,
 * ayrı dosyada, çünkü Dalga 5'in üç şeridi aynı anda yazıyordu ve tek dosyada birleşmek
 * çakışma üretirdi).
 */
const reference = readDesignReference("design_handoff_sunucu/design/Sunucu.dc.html");

function assertReferenceContains(fragment: string): void {
  assert.ok(reference.includes(fragment), `Referans HTML parçası bulunamadı: ${fragment}`);
}

const s = SERVER_METRICS.settingsSections;

describe("Ş12 parity — Kanallar ve Kategoriler (§8.4)", () => {
  it("üst çubuğun iki düğmesi", () => {
    assertReferenceContains(
      `gap:${s.channelsButtonGap}px;height:${s.channelsButtonHeight}px;padding:0 ${s.channelsButtonPaddingX}px;border:1px solid hsl(var(--primary)/.4);border-radius:${s.channelsButtonRadius}px`,
    );
    assertReferenceContains(
      `gap:${s.channelsButtonGap}px;height:${s.channelsButtonHeight}px;padding:0 ${s.channelsButtonPaddingX}px;border:0;border-radius:${s.channelsButtonRadius}px;background:hsl(var(--primary))`,
    );
    assertReferenceContains(
      `flex:1;min-width:${s.channelsNoteMinWidth}px;text-align:right;font-size:${s.channelsNoteFontSize}px`,
    );
  });

  it("kategori kartı ve başlık şeridi", () => {
    assertReferenceContains(
      `border-radius:${s.channelsCardRadius}px;overflow:hidden;background:hsl(var(--surface-card))`,
    );
    assertReferenceContains(
      `gap:${s.channelsHeaderGap}px;padding:${s.channelsHeaderPaddingY}px ${s.channelsHeaderPaddingX}px;background:hsl(var(--surface-secondary)/.55);border-bottom:1px solid hsl(var(--border)/.5)`,
    );
    assertReferenceContains(
      `width:${s.channelsHandleWidth}px;height:${s.channelsHandleHeight}px;color:hsl(var(--text-muted)/.7);cursor:grab`,
    );
    assertReferenceContains(
      `width="${s.channelsHandleGlyphSize}" height="${s.channelsHandleGlyphSize}"`,
    );
    assertReferenceContains(
      `padding:${s.channelsCountChipPaddingY}px ${s.channelsCountChipPaddingX}px;border-radius:${s.channelsCountChipRadius}px;background:hsl(var(--surface-tertiary))`,
    );
  });

  it("kanal satırı, tür ikonu ve erişim çipi", () => {
    assertReferenceContains(
      `gap:${s.channelsRowGap}px;padding:${s.channelsRowPadding}px ${s.channelsRowPadding}px;border-radius:${s.channelsRowRadius}px`,
    );
    assertReferenceContains(
      `width:${s.channelsRowIconSize}px;height:${s.channelsRowIconSize}px;color:{{ ch.iconFg }}`,
    );
    assertReferenceContains(
      `padding:${s.channelsAccessChipPaddingY}px ${s.channelsAccessChipPaddingX}px;border-radius:${s.channelsAccessChipRadius}px;background:{{ ch.accBg }}`,
    );
    assertReferenceContains(`font:500 ${s.channelsRowNameFontSize}px/1.2 var(--w-body)`);
  });

  it("satır düğmeleri 26×26 ve `+` ikonu 14", () => {
    assertReferenceContains(
      `width:${s.channelsActionSize}px;height:${s.channelsActionSize}px;border:0;border-radius:${s.channelsActionRadius}px`,
    );
    assertReferenceContains(
      `width="${s.channelsActionGlyphSize}" height="${s.channelsActionGlyphSize}"`,
    );
  });

  it("erişim çipinin dört tonu SPEC ile aynı — `Herkese açık` success", () => {
    // Referansın kendi türetmesi: yalnız üç ad ayrık, kalan her şey success'e düşer.
    assertReferenceContains(
      "acc === 'Kilitli' ? 'warning' : (acc === 'Gizli' ? 'danger' : (acc === 'Role bağlı' ? 'primary' : 'success'))",
    );
  });
});

describe("Ş12 parity — Roller ve Yetkiler (§8.5)", () => {
  it("iki kolon ve rol listesi kartı", () => {
    assertReferenceContains(
      `grid-template-columns:${s.rolesListColumnWidth}px minmax(0,1fr);gap:${s.rolesGridGap}px`,
    );
    assertReferenceContains(
      `padding:${s.rolesListPadding}px;border-radius:${s.channelsCardRadius}px;background:hsl(var(--surface-card))`,
    );
    assertReferenceContains(
      `gap:${s.rolesRowGap}px;width:100%;padding:${s.rolesRowPaddingY}px ${s.rolesRowPaddingX}px;margin-bottom:${s.rolesRowMarginBottom}px;border:0;border-radius:${s.rolesRowRadius}px`,
    );
    assertReferenceContains(
      `width:${s.rolesDotSize}px;height:${s.rolesDotSize}px;border-radius:50%`,
    );
    assertReferenceContains(`font:600 ${s.rolesCountFontSize}px/1 var(--w-display)`);
  });

  it("`TASLAK` rozeti ve seçili satır zemini", () => {
    assertReferenceContains(
      `padding:${s.rolesDraftChipPaddingY}px ${s.rolesDraftChipPaddingX}px;border-radius:${s.rolesDraftChipRadius}px;background:hsl(var(--primary)/.22);font:600 ${s.rolesDraftChipFontSize}px/1 var(--w-display)`,
    );
    assertReferenceContains(
      `background:hsl(var(--primary)/.${String(s.rolesRowActiveAlpha).slice(2)})`,
    );
  });

  it("kesikli `+ Rol oluştur` düğmesi", () => {
    assertReferenceContains(
      `gap:${s.rolesCreateButtonGap}px;width:100%;padding:${s.rolesCreateButtonPaddingY}px 0;margin-top:${s.rolesCreateButtonMarginTop}px;border:1px dashed {{ newBtnBd }};border-radius:${s.rolesCreateButtonRadius}px`,
    );
    assertReferenceContains("newBtnBd: isNew ? H('primary', '.55') : H('border')");
  });

  it("başlık: nokta · ad · `Yeni rol` rozeti · `N yetki seçili` çipi", () => {
    assertReferenceContains(
      `width:${s.rolesHeaderDotSize}px;height:${s.rolesHeaderDotSize}px;border-radius:50%`,
    );
    assertReferenceContains(`font:600 ${s.rolesHeaderNameFontSize}px/1.2 var(--w-display)`);
    assertReferenceContains(
      `padding:${s.rolesNewChipPaddingY}px ${s.rolesNewChipPaddingX}px;border-radius:${s.rolesNewChipRadius}px;background:hsl(var(--primary)/.16)`,
    );
    assertReferenceContains(
      `padding:${s.rolesSelectedChipPaddingY}px ${s.rolesSelectedChipPaddingX}px;border-radius:${s.rolesSelectedChipRadius}px;background:hsl(var(--primary)/.14)`,
    );
    assertReferenceContains("{{ permCount }} yetki seçili");
  });

  it("`Rol adı` girdisi, altı swatch ve `Etiketlenebilir` satırı", () => {
    assertReferenceContains(
      `margin-top:${s.rolesInputMarginTop}px;padding:${s.rolesInputPaddingY}px ${s.rolesInputPaddingX}px;border:1px solid hsl(var(--border));border-radius:${s.rolesInputRadius}px`,
    );
    assertReferenceContains(`font:500 ${s.rolesInputFontSize}px/1 var(--w-body)`);
    assertReferenceContains(
      `width:${s.rolesSwatchSize}px;height:${s.rolesSwatchSize}px;padding:0;border:${s.rolesSwatchBorderWidth}px solid {{ c.bd }};border-radius:${s.rolesSwatchRadius}px`,
    );
    assertReferenceContains(
      "roleColors: ['text-muted', 'info', 'success', 'warning', 'danger', 'primary']",
    );
    assertReferenceContains(
      `gap:${s.rolesMentionRowGap}px;margin-top:${s.rolesMentionRowMarginTop}px;padding:${s.rolesMentionRowPaddingY}px ${s.rolesMentionRowPaddingX}px;border-radius:${s.rolesMentionRowRadius}px;background:hsl(var(--surface-soft)/.7)`,
    );
  });

  it("swatch sırası SPEC'in altı tonuyla birebir", () => {
    assert.deepEqual(
      [...SERVER_ROLE_TONES],
      ["textMuted", "info", "success", "warning", "danger", "primary"],
    );
  });

  it("`HAZIR AYARLAR` çipleri", () => {
    assertReferenceContains(
      `padding:${s.rolesPresetChipPaddingY}px ${s.rolesPresetChipPaddingX}px;border:1px solid {{ p.bd }};border-radius:${s.rolesPresetChipRadius}px`,
    );
    assertReferenceContains("rolePresets: ['Üye', 'Moderatör', 'Admin']");
  });

  it("dört grup ve on sekiz satır — sayı sabit değil, gruplardan türer", () => {
    assert.equal(SERVER_PERMISSION_GROUPS.length, 4);
    assert.equal(SERVER_PERMISSION_ROW_COUNT, 18);
    assert.deepEqual(
      SERVER_PERMISSION_GROUPS.map((group) => group.rows.length),
      [5, 5, 4, 4],
    );
    assertReferenceContains(
      "['Yönetim', ['Kanalları yönet', 'Rolleri yönet', 'Sunucuyu yönet', 'Yönetici'], false]",
    );
  });

  it("taslak alt çubuğu ve `Rolü sil` kartı", () => {
    assertReferenceContains(
      `gap:${s.rolesDraftBarGap}px;padding:${s.rolesDraftBarPaddingY}px ${s.rolesDraftBarPaddingX}px;border-radius:${s.rolesDraftBarRadius}px;background:hsl(var(--surface-card));border:1px solid hsl(var(--primary)/.35)`,
    );
    assertReferenceContains(
      `flex:1;min-width:${s.rolesDraftNoteMinWidth}px;font-size:${s.rolesDraftNoteFontSize}px`,
    );
    assertReferenceContains(
      `height:${s.rolesDraftCancelHeight}px;padding:0 ${s.rolesDraftCancelPaddingX}px;border:1px solid hsl(var(--border));border-radius:${s.rolesDraftCancelRadius}px`,
    );
    assertReferenceContains(
      `height:${s.rolesDraftSubmitHeight}px;padding:0 ${s.rolesDraftSubmitPaddingX}px;border:0;border-radius:${s.rolesDraftSubmitRadius}px`,
    );
    assertReferenceContains(
      `gap:${s.rolesDeleteCardGap}px;padding:${s.rolesDeleteCardPaddingY}px ${s.rolesDeleteCardPaddingX}px;border-radius:${s.rolesDeleteCardRadius}px;background:hsl(var(--danger)/.07);border:1px solid hsl(var(--danger)/.3)`,
    );
    assertReferenceContains(
      `height:${s.rolesDeleteButtonHeight}px;padding:0 ${s.rolesDeleteButtonPaddingX}px;border:1px solid hsl(var(--danger)/.4);border-radius:${s.rolesDeleteButtonRadius}px`,
    );
  });

  it("taslak metinleri SPEC'in cümlesiyle aynı", () => {
    assertReferenceContains("Devam etmek için bir rol adı gir.");
    assertReferenceContains("'Rol, @everyone üstünde ' + permCount + ' yetkiyle oluşturulacak.'");
    assertReferenceContains("Roldeki üyeler @everyone yetkilerine döner.");
    assertReferenceContains("Üyeler bu rolü @ ile çağırabilir.");
  });

  it("`Rol adı` sınırı 32 — referansın kendi kırpması", () => {
    assertReferenceContains("e.target.value.slice(0, 32)");
  });
});
