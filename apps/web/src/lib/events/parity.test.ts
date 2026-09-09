import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { readDesignReference } from "@/lib/design-reference";

import { EVENTS_METRICS, SPEC_DEVIATIONS } from "./metrics";

const reference = readDesignReference("etkinlikler-paketi/referans/Etkinlikler-4B.dc.html");

function assertReferenceContains(fragment: string): void {
  assert.ok(reference.includes(fragment), `Referans HTML parçası bulunamadı: ${fragment}`);
}

/** Referans HTML opaklıkları baştaki sıfır olmadan yazıyor: `.62`, `.8`, `.85`. */
function alpha(value: number): string {
  return String(value).replace(/^0/u, "");
}

describe("events parity — ölçü sözlüğü ↔ referans HTML", () => {
  it("kabuk ve kolon genişliklerini aynı kaynaktan taşır", () => {
    const { columns, shell } = EVENTS_METRICS;

    assertReferenceContains(
      `border-radius:${shell.radius}px;border:1px solid hsl(var(--border)/.55)`,
    );
    assertReferenceContains(
      `box-shadow:0 ${shell.shadow.y}px ${shell.shadow.blur}px ${shell.shadow.spread}px hsl(var(--shadow-color)/.85)`,
    );
    assertReferenceContains(`width:${columns.agendaRailWidth}px;flex:none`);
    assertReferenceContains(`width:${columns.detailPanelWidth}px;flex:none`);
    assertReferenceContains(`width:${columns.railWidth}px;padding:14px 0 12px`);
    assertReferenceContains(
      `width:${columns.navPanelWidth}px;background:hsl(var(--surface-panel))`,
    );
  });

  it("akış başlığı, sekme ve ikon geometrisini korur", () => {
    const { feedHeader } = EVENTS_METRICS;

    assertReferenceContains(
      `gap:${feedHeader.gap}px;padding:${feedHeader.paddingY}px ${feedHeader.paddingX}px`,
    );
    assertReferenceContains(`flex:1 1 ${feedHeader.titleBlockBasis}px;min-width:0`);
    assertReferenceContains(`font:600 ${feedHeader.titleFontSize}px/1.2 var(--w-display)`);
    assertReferenceContains(
      `margin-top:${feedHeader.subMarginTop}px;font:500 ${feedHeader.subFontSize}px/1 var(--w-body)`,
    );
    assertReferenceContains(
      `gap:4px;padding:${feedHeader.tabGroupPadding}px;border-radius:${feedHeader.tabGroupRadius}px`,
    );
    assertReferenceContains(
      `height:${feedHeader.tabHeight}px;padding:0 ${feedHeader.tabPaddingX}px`,
    );
    assertReferenceContains(
      `min-width:${feedHeader.tabPillMinWidth}px;height:${feedHeader.tabPillHeight}px;padding:0 4px;border-radius:${feedHeader.tabPillRadius}px`,
    );
    assertReferenceContains(
      `width:${feedHeader.iconButtonSize}px;height:${feedHeader.iconButtonSize}px`,
    );
    assertReferenceContains(
      `border-radius:${feedHeader.iconButtonRadius}px;background:hsl(var(--primary))`,
    );
  });

  it("hafta şeridini korur", () => {
    const { weekStrip } = EVENTS_METRICS;

    assertReferenceContains(
      `gap:${weekStrip.gap}px;padding:${weekStrip.paddingY}px ${weekStrip.paddingX}px`,
    );
    assertReferenceContains(
      `width:${weekStrip.arrowSize}px;height:${weekStrip.arrowSize}px;border:1px solid hsl(var(--border)/.7);border-radius:${weekStrip.arrowRadius}px`,
    );
    assertReferenceContains(`min-width:${weekStrip.monthLabelMinWidth}px;text-align:center`);
    assertReferenceContains(`grid-template-columns:repeat(7,1fr);gap:${weekStrip.gridGap}px`);
    assertReferenceContains(
      `padding:${weekStrip.dayPaddingTop}px ${weekStrip.dayPaddingX}px ${weekStrip.dayPaddingBottom}px`,
    );
    assertReferenceContains(
      `font:600 ${weekStrip.dowFontSize}px/1 var(--w-display);letter-spacing:.12em`,
    );
    assertReferenceContains(`font:600 ${weekStrip.numFontSize}px/1 var(--w-display)`);
    assertReferenceContains(`gap:${weekStrip.dotGap}px;height:${weekStrip.dotRowHeight}px`);
    assertReferenceContains(`width:${weekStrip.dotSize}px;height:${weekStrip.dotSize}px`);
  });

  it("filtre şeridi ve RSVP şeridini korur", () => {
    const { filterBar, rsvpStrip } = EVENTS_METRICS;

    assertReferenceContains(`padding:${filterBar.paddingY}px ${filterBar.paddingX}px`);
    assertReferenceContains(
      `font:600 ${filterBar.labelFontSize}px/1 var(--w-display);letter-spacing:.14em`,
    );
    assertReferenceContains(
      `padding:${filterBar.chipPaddingTop}px ${filterBar.chipPaddingRight}px ${filterBar.chipPaddingBottom}px ${filterBar.chipPaddingLeft}px;border-radius:999px`,
    );
    assertReferenceContains(
      `width:${filterBar.chipRemoveSize}px;height:${filterBar.chipRemoveSize}px;border:0;border-radius:${filterBar.chipRemoveRadius}px`,
    );

    assertReferenceContains(
      `margin:${rsvpStrip.marginTop}px ${rsvpStrip.marginX}px 0;padding:${rsvpStrip.paddingY}px ${rsvpStrip.paddingX}px;border-radius:${rsvpStrip.radius}px`,
    );
    assertReferenceContains(
      `width:${rsvpStrip.iconSize}px;height:${rsvpStrip.iconSize}px;border-radius:${rsvpStrip.iconRadius}px`,
    );
    assertReferenceContains(
      `height:${rsvpStrip.actionHeight}px;padding:0 ${rsvpStrip.actionPaddingX}px`,
    );
    assertReferenceContains(
      `width:${rsvpStrip.closeSize}px;height:${rsvpStrip.closeSize}px;border:0;border-radius:${rsvpStrip.closeRadius}px`,
    );
  });

  it("ızgara ve gün gruplarını korur", () => {
    const { grid } = EVENTS_METRICS;

    assertReferenceContains(
      `padding:${grid.scrollPaddingTop}px ${grid.scrollPaddingX}px ${grid.scrollPaddingBottom}px`,
    );
    assertReferenceContains(
      `padding:${grid.groupHeaderPaddingTop}px ${grid.groupHeaderPaddingX}px ${grid.groupHeaderPaddingBottom}px`,
    );
    assertReferenceContains(
      `font:600 ${grid.groupLabelFontSize}px/1 var(--w-display);letter-spacing:.14em`,
    );
    assertReferenceContains(`repeat(auto-fill,minmax(var(--e-min),1fr));gap:${grid.gap}px`);
    // `--e-min` iki değer alır; ikisi de sözlükten gelir (K11).
    assertReferenceContains(`--e-min:${grid.minColumnWidth}px`);
    assertReferenceContains(`big ? '${grid.minColumnWidthLarge}px' : '${grid.minColumnWidth}px'`);
  });

  it("etkinlik kartını korur", () => {
    const { card } = EVENTS_METRICS;

    assertReferenceContains(`border-radius:${card.radius}px;background:{{ e.bg }}`);
    assertReferenceContains(
      `gap:${card.topGap}px;padding:${card.topPaddingTop}px ${card.paddingX}px 0`,
    );
    assertReferenceContains(
      `width:${card.kindTileSize}px;height:${card.kindTileSize}px;border-radius:${card.kindTileRadius}px`,
    );
    assertReferenceContains(`font:600 ${card.kindGlyphFontSize}px/1 var(--w-display)`);
    assertReferenceContains(
      `padding:${card.kindPillPaddingY}px ${card.kindPillPaddingX}px;border-radius:999px`,
    );
    assertReferenceContains(`font:500 ${card.metaFontSize}px/1 var(--w-body)`);
    assertReferenceContains(
      `margin-top:${card.titleMarginTop}px;font:600 ${card.titleFontSize}px/1.3 var(--w-display)`,
    );
    assertReferenceContains(`padding:${card.timePaddingTop}px ${card.paddingX}px 0`);
    assertReferenceContains(
      `width:${card.sourceTileSize}px;height:${card.sourceTileSize}px;border-radius:${card.sourceTileRadius}px`,
    );
    assertReferenceContains(`padding:${card.attendeesPaddingTop}px ${card.paddingX}px 0`);
    assertReferenceContains(`box-shadow:0 0 0 ${card.avatarRing}px hsl(var(--surface-card))`);
    assertReferenceContains(`margin-left:{{ a.ml }}`);
    assertReferenceContains(
      `margin-top:${card.actionsMarginTop}px;padding:${card.actionsPaddingTop}px ${card.paddingX}px ${card.actionsPaddingBottom}px`,
    );
    assertReferenceContains(`height:${card.actionHeight}px;padding:0 ${card.maybePaddingX}px`);
    assertReferenceContains(
      `top:${card.selectedStripeInset}px;bottom:${card.selectedStripeInset}px;width:${card.selectedStripeWidth}px`,
    );
  });

  it("ajanda rayını korur", () => {
    const { agendaRail } = EVENTS_METRICS;

    assertReferenceContains(
      `padding:${agendaRail.headerPaddingTop}px ${agendaRail.headerPaddingX}px ${agendaRail.headerPaddingBottom}px`,
    );
    assertReferenceContains(`font:600 ${agendaRail.titleFontSize}px/1.2 var(--w-display)`);
    assertReferenceContains(`padding:${agendaRail.bodyPaddingY}px ${agendaRail.bodyPaddingX}px`);
    assertReferenceContains(`flex:none;width:${agendaRail.hourColumnWidth}px`);
    assertReferenceContains(
      `flex:1;width:${agendaRail.ruleWidth}px;margin:${agendaRail.ruleMarginY}px 0`,
    );
    assertReferenceContains(
      `padding:${agendaRail.cardPaddingY}px ${agendaRail.cardPaddingX}px;border-radius:${agendaRail.cardRadius}px`,
    );
    assertReferenceContains(`width:${agendaRail.cardStripeWidth}px;border-radius:3px`);
    assertReferenceContains(`font:600 ${agendaRail.cardTitleFontSize}px/1.3 var(--w-body)`);
    assertReferenceContains(
      `width:${agendaRail.liveDotSize}px;height:${agendaRail.liveDotSize}px;border-radius:50%;background:hsl(var(--danger));flex:none`,
    );
    assertReferenceContains(
      `padding:${agendaRail.goingRowPaddingY}px ${agendaRail.goingRowPaddingX}px;border-radius:${agendaRail.goingRowRadius}px`,
    );
    assertReferenceContains(
      `width:${agendaRail.goingTileSize}px;height:${agendaRail.goingTileSize}px;border-radius:${agendaRail.goingTileRadius}px`,
    );
    assertReferenceContains(
      `padding:${agendaRail.footerPaddingY}px ${agendaRail.footerPaddingX}px;border-top:1px solid hsl(var(--border)/.5)`,
    );
    assertReferenceContains(
      `height:${agendaRail.footerButtonHeight}px;border:1px solid hsl(var(--border));border-radius:${agendaRail.footerButtonRadius}px`,
    );
  });

  it("detay panelini korur", () => {
    const { detailPanel } = EVENTS_METRICS;

    assertReferenceContains(
      `width:${detailPanel.kindTileSize}px;height:${detailPanel.kindTileSize}px;border-radius:${detailPanel.kindTileRadius}px`,
    );
    assertReferenceContains(`font:600 ${detailPanel.titleFontSize}px/1.25 var(--w-display)`);
    assertReferenceContains(
      `width:${detailPanel.closeSize}px;height:${detailPanel.closeSize}px;border:0;border-radius:${detailPanel.closeRadius}px`,
    );
    assertReferenceContains(
      `gap:${detailPanel.bodyGap}px;min-height:0;overflow-y:auto;padding:${detailPanel.bodyPaddingY}px ${detailPanel.bodyPaddingX}px`,
    );
    assertReferenceContains(
      `padding:${detailPanel.infoCardPaddingY}px ${detailPanel.infoCardPaddingX}px;border-radius:${detailPanel.infoCardRadius}px`,
    );
    assertReferenceContains(
      `font-size:${detailPanel.descriptionFontSize}px;line-height:${detailPanel.descriptionLineHeight}`,
    );
    assertReferenceContains(
      `padding:${detailPanel.attendeeRowPaddingY}px ${detailPanel.attendeeRowPaddingX}px;border-radius:${detailPanel.attendeeRowRadius}px`,
    );
    assertReferenceContains(
      `padding:${detailPanel.reminderPaddingY}px ${detailPanel.reminderPaddingX}px;border-radius:${detailPanel.reminderRadius}px;background:hsl(var(--surface-secondary)/${alpha(detailPanel.reminderSurfaceAlpha)})`,
    );
    assertReferenceContains(
      `flex:1;height:${detailPanel.footerButtonHeight}px;border:0;border-radius:${detailPanel.footerButtonRadius}px`,
    );
    // Panelin zemini `--surface-panel`; SPEC bu noktada sessiz.
    assertReferenceContains(
      `width:${EVENTS_METRICS.columns.detailPanelWidth}px;flex:none;background:hsl(var(--surface-panel))`,
    );
  });

  it("oluştur modalını korur", () => {
    const { createModal } = EVENTS_METRICS;

    assertReferenceContains(`background:hsl(var(--backdrop)/${alpha(createModal.overlayAlpha)})`);
    assertReferenceContains(`width:${createModal.width}px;max-width:100%`);
    assertReferenceContains(`border-radius:${createModal.cardRadius}px`);
    assertReferenceContains(
      `box-shadow:0 ${createModal.cardShadow.y}px ${createModal.cardShadow.blur}px ${createModal.cardShadow.spread}px hsl(var(--shadow-color))`,
    );
    assertReferenceContains(
      `padding:${createModal.headerPaddingTop}px ${createModal.headerPaddingX}px ${createModal.headerPaddingBottom}px`,
    );
    assertReferenceContains(
      `width:${createModal.headerIconSize}px;height:${createModal.headerIconSize}px;border-radius:${createModal.headerIconRadius}px`,
    );
    assertReferenceContains(`font:600 ${createModal.titleFontSize}px/1.2 var(--w-display)`);
    assertReferenceContains(
      `width:${createModal.closeSize}px;height:${createModal.closeSize}px;border:0;border-radius:${createModal.closeRadius}px`,
    );
    assertReferenceContains(
      `gap:${createModal.bodyGap}px;padding:${createModal.bodyPaddingY}px ${createModal.bodyPaddingX}px`,
    );
    assertReferenceContains(
      `font:600 ${createModal.fieldLabelFontSize}px/1 var(--w-display);letter-spacing:.13em`,
    );
    assertReferenceContains(
      `grid-template-columns:repeat(${createModal.kindColumns},1fr);gap:${createModal.kindGridGap}px`,
    );
    assertReferenceContains(
      `width:${createModal.kindTileSize}px;height:${createModal.kindTileSize}px;border-radius:${createModal.kindTileRadius}px`,
    );
    assertReferenceContains(
      `height:${createModal.inputHeight}px;padding:0 ${createModal.inputPaddingX}px;border-radius:${createModal.inputRadius}px`,
    );
    assertReferenceContains(`grid-template-columns:1fr 1fr;gap:${createModal.fieldRowGap}px`);
    assertReferenceContains(
      `width:${createModal.toggleWidth}px;height:${createModal.toggleHeight}px`,
    );
    assertReferenceContains(
      `top:${createModal.toggleKnobInset}px;left:{{ pubX }};width:${createModal.toggleKnobSize}px;height:${createModal.toggleKnobSize}px`,
    );
    assertReferenceContains(
      `s.pub ? '${createModal.toggleKnobOffsetOn}px' : '${createModal.toggleKnobInset}px'`,
    );
    assertReferenceContains(
      `height:${createModal.footerButtonHeight}px;padding:0 ${createModal.footerCancelPaddingX}px`,
    );
    assertReferenceContains(
      `height:${createModal.footerButtonHeight}px;padding:0 ${createModal.footerSubmitPaddingX}px`,
    );
  });

  it("boş ve hata durumunu korur", () => {
    const { emptyState, errorState } = EVENTS_METRICS;

    assertReferenceContains(
      `width:${emptyState.iconBox}px;height:${emptyState.iconBox}px;border-radius:${emptyState.iconBoxRadius}px`,
    );
    assertReferenceContains(`font:600 ${emptyState.titleFontSize}px/1.25 var(--w-display)`);
    assertReferenceContains(`text-align:center;max-width:${emptyState.bodyMaxWidth}px`);
    assertReferenceContains(
      `margin:${emptyState.bodyMarginTop}px 0 0;font-size:${emptyState.bodyFontSize}px;line-height:${emptyState.bodyLineHeight}`,
    );
    assertReferenceContains(
      `height:${emptyState.buttonHeight}px;padding:0 ${emptyState.buttonPaddingX}px`,
    );
    assertReferenceContains(`text-align:center;max-width:${errorState.bodyMaxWidth}px`);
    assertReferenceContains(
      `font-size:${errorState.codeLineFontSize}px;color:hsl(var(--text-muted)/${alpha(errorState.codeLineAlpha)})`,
    );
  });
});

describe("events parity — sözlük renk taşımaz", () => {
  it("metrics.ts içinde hiçbir renk yok", () => {
    const source = readFileSync(new URL("./metrics.ts", import.meta.url), "utf8");
    const body = source.replace(/\/\*\*[\s\S]*?\*\/|\/\/[^\n]*/gu, "");

    assert.deepEqual(body.match(/hsl\(|#[0-9a-fA-F]{3,8}\b|rgba?\(/gu), null);
  });

  it("pxToRem / pxToEm / hairline yeniden ihraç edilmiş", async () => {
    const metrics = await import("./metrics");

    assert.equal(typeof metrics.pxToRem, "function");
    assert.equal(typeof metrics.pxToEm, "function");
    assert.equal(typeof metrics.hairline, "function");
    assert.equal(metrics.pxToRem(300), "18.75rem");
    assert.equal(metrics.hairline(), "max(1px, 0.0625rem)");
  });
});

describe("events parity — kayda geçen SPEC sapmaları", () => {
  it("§3.2'deki beş kaydı taşır", () => {
    assert.deepEqual(
      SPEC_DEVIATIONS.map(({ field }) => field),
      [
        "weekStrip.arrowStep",
        "card.kindPillLetterSpacing",
        "agendaRail.goingSectionLabel",
        "feedHeader.titleBranches",
        "grid.dayBucketCount",
      ],
    );

    for (const record of SPEC_DEVIATIONS) {
      assert.ok("html" in record && "spec" in record, `${record.field} eksik alan taşıyor`);
    }
  });

  it("hafta okları HTML'de hafta adımlar (K9)", () => {
    assertReferenceContains('title="Önceki hafta"');
    assertReferenceContains('title="Sonraki hafta"');
    assert.doesNotMatch(reference, /title="Önceki ay"/u);
  });

  it("tür pilinde letter-spacing yok", () => {
    assert.equal(EVENTS_METRICS.card.kindPillLetterSpacing, null);
    assertReferenceContains(
      "border-radius:999px;background:{{ e.kindBg }};font:600 10px/1 var(--w-body)",
    );
  });

  it("4B ajanda rayı 'Katılacağım' yazar; 'Katılımım' 4A kolonuna aittir", () => {
    assertReferenceContains(">Katılacağım<");
    // Tek geçişi var ve o, 4B'de çizilmeyen sol filtre kolonundadır.
    assert.equal(reference.split("Katılımım").length - 1, 1);
  });

  it("başlık metni HTML'de kaynak adına ve 'Bugün'e de dallanır", () => {
    assertReferenceContains("s.source ? SRC[s.source].label");
    assertReferenceContains("s.time === 'today' ? 'Bugün'");
  });

  it("ızgara üç gün grubu çizer, tip dört kova taşır", () => {
    assertReferenceContains("const order = ['Bugün', 'Yarın', 'Bu hafta'];");
    assert.equal(EVENTS_METRICS.grid.dayGroupCount, 3);
  });
});
