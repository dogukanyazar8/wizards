import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { readDesignReference } from "@/lib/design-reference";
import { HOME_METRICS } from "@/lib/home/metrics";
import { NAV_PANEL_ADJUSTMENTS } from "@/lib/messages/metrics";

import {
  NAV_PANEL_SPEC_WIDTH,
  SERVER_METRICS,
  SHARED_SHELL_METRICS,
  SPEC_DEVIATIONS,
} from "./metrics";

/**
 * Parity kapısı — ölçü sözlüğü ↔ referans HTML.
 *
 * Sözlükteki her sayı referansın inline `style` metninde **birebir** aranır. Bir değer elle
 * "düzeltildiğinde" bu dosya kırmızı verir; tasarım gerçekten değiştiğinde ikisi birlikte
 * güncellenir. `lib/settings/parity.test.ts` ve `lib/mentions/parity.test.ts` ile aynı desen.
 */
const reference = readDesignReference("design_handoff_sunucu/design/Sunucu.dc.html");

function assertReferenceContains(fragment: string): void {
  assert.ok(reference.includes(fragment), `Referans HTML parçası bulunamadı: ${fragment}`);
}

/**
 * İki yüzeyin **bilerek** ayrıştığı yerlerde eşitlik bir hatadır: `DiscoveryTagPicker` tek
 * bileşendir ama öneri rozetinin boyu iki yüzeyde farklıdır. Sayılar sessizce eşitlenirse
 * bileşen tek varyanta düşer ve kimse fark etmez.
 */
function assertNotEqualSizes(left: number, right: number): void {
  assert.notEqual(left, right, "İki yüzeyin kasıtlı sapması eşitlenmiş");
}

describe("sunucu parity — kolonlar ve kabuk", () => {
  it("kanal kenar çubuğunu ve sağ paneli aynı kaynaktan taşır", () => {
    const { layout } = SERVER_METRICS;

    assertReferenceContains(`width:${layout.sidebarWidth}px;flex:none`);
    assertReferenceContains(
      `width:${layout.rightPanelWidth}px;flex:none;border-left:1px solid hsl(var(--border)/.5)`,
    );
  });

  it("ray, panel ve kabuk ölçülerini kopyalamaz, HOME_METRICS'ten okur", () => {
    assert.equal(SHARED_SHELL_METRICS.railWidth, HOME_METRICS.rail.width);
    assert.equal(SHARED_SHELL_METRICS.panelWidth, HOME_METRICS.panel.width);
    assert.equal(SHARED_SHELL_METRICS.shellRadius, HOME_METRICS.shell.radius);
    assert.equal(SHARED_SHELL_METRICS.shellMinWidth, HOME_METRICS.shell.minWidth);
    assert.equal(SHARED_SHELL_METRICS.shellMinHeight, HOME_METRICS.shell.minHeight);

    // Sözlük ikinci bir ray/panel genişliği tanımlamaz.
    const serialized = JSON.stringify(SERVER_METRICS.layout);

    assert.doesNotMatch(serialized, /"railWidth"|"panelWidth"/u);
  });

  it("K1 sapmasını beyaz listeye alır ve gerekçesini tek yerde tutar", () => {
    // SPEC §1 paneli 228 veriyor; kod 280 kullanır. Sapma Mesajlar paketinde bilerek yapıldı ve
    // Etkinlikler gün paneli ile `metrics.test.ts` bu değere bağlı.
    assert.equal(NAV_PANEL_SPEC_WIDTH, 228);
    assert.equal(NAV_PANEL_ADJUSTMENTS.width.from, NAV_PANEL_SPEC_WIDTH);
    assert.equal(NAV_PANEL_ADJUSTMENTS.width.to, HOME_METRICS.panel.width);
    assert.notEqual(HOME_METRICS.panel.width, NAV_PANEL_SPEC_WIDTH);
  });

  it("asgari kabukta ana alana kalan genişliği kolonlardan türetir", () => {
    const { layout } = SERVER_METRICS;
    const expected =
      HOME_METRICS.shell.minWidth -
      HOME_METRICS.rail.width -
      HOME_METRICS.panel.width -
      layout.sidebarWidth;

    assert.equal(layout.mainMinWidth, expected);
    assert.equal(layout.mainMinWidthWithPanel, expected - layout.rightPanelWidth);
  });
});

describe("sunucu parity — kanal kenar çubuğu (§2)", () => {
  it("sunucu başlığını ve menüsünü korur", () => {
    const { sidebar } = SERVER_METRICS;

    assertReferenceContains(
      `gap:${sidebar.headerGap}px;padding:${sidebar.headerPaddingY}px ${sidebar.headerPaddingX}px`,
    );
    assertReferenceContains(
      `width:${sidebar.headerIconSize}px;height:${sidebar.headerIconSize}px;border-radius:${sidebar.headerIconRadius}px`,
    );
    assertReferenceContains(
      `left:${sidebar.menuInsetX}px;right:${sidebar.menuInsetX}px;top:${sidebar.menuTop}px;z-index:${sidebar.menuZIndex};padding:${sidebar.menuPadding}px;border-radius:${sidebar.menuRadius}px`,
    );
    assertReferenceContains(
      `padding:${sidebar.menuRowPaddingY}px ${sidebar.menuRowPaddingX}px;border-radius:${sidebar.menuRowRadius}px;font:500 ${sidebar.menuRowFontSize}px/1 var(--w-body)`,
    );
    assertReferenceContains(
      `box-shadow:${sidebar.menuShadow.x} ${sidebar.menuShadow.y}px ${sidebar.menuShadow.blur}px ${sidebar.menuShadow.spread}px hsl(var(--shadow-color))`,
    );
  });

  it("kanal aramasını ve popover'ını korur", () => {
    const { sidebar } = SERVER_METRICS;

    assertReferenceContains(
      `padding:${sidebar.searchWrapperPaddingTop}px ${sidebar.searchWrapperPaddingX}px ${sidebar.searchWrapperPaddingBottom}px`,
    );
    assertReferenceContains(
      `padding:${sidebar.searchButtonPaddingY}px ${sidebar.searchButtonPaddingX}px;border:1px solid hsl(var(--border)/.7);border-radius:${sidebar.searchButtonRadius}px`,
    );
    assertReferenceContains(
      `padding:2px ${sidebar.searchKbdPaddingX}px;border-radius:${sidebar.searchKbdRadius}px;background:hsl(var(--surface-tertiary));font:600 ${sidebar.searchKbdFontSize}px/1 var(--w-display)`,
    );
    assertReferenceContains(
      `left:${sidebar.searchPopoverInsetX}px;right:${sidebar.searchPopoverInsetX}px;top:${sidebar.searchPopoverTop}px;z-index:${sidebar.searchPopoverZIndex};padding:${sidebar.searchPopoverPadding}px;border-radius:${sidebar.searchPopoverRadius}px`,
    );
  });

  it("kategori başlığını ve kanal satırını korur", () => {
    const { sidebar } = SERVER_METRICS;

    assertReferenceContains(
      `padding:${sidebar.categoryHeaderPaddingY}px ${sidebar.categoryHeaderPaddingRight}px ${sidebar.categoryHeaderPaddingY}px ${sidebar.categoryHeaderPaddingLeft}px`,
    );
    assertReferenceContains(
      `width:${sidebar.categoryAddButtonSize}px;height:${sidebar.categoryAddButtonSize}px;border:0;border-radius:${sidebar.categoryAddButtonRadius}px`,
    );
    assertReferenceContains(
      `padding:${sidebar.channelRowPaddingY}px ${sidebar.channelRowPaddingX}px;border-radius:${sidebar.channelRowRadius}px`,
    );
    assertReferenceContains(
      `left:${sidebar.channelActiveStripeLeft}px;top:50%;transform:translateY(-50%);width:${sidebar.channelActiveStripeWidth}px;height:${sidebar.channelActiveStripeHeight}px;border-radius:0 ${sidebar.channelActiveStripeRadius}px ${sidebar.channelActiveStripeRadius}px 0`,
    );
    assertReferenceContains(
      `min-width:${sidebar.channelUnreadMinWidth}px;height:${sidebar.channelUnreadHeight}px;padding:0 ${sidebar.channelUnreadPaddingX}px;border-radius:${sidebar.channelUnreadRadius}px`,
    );
    assertReferenceContains(
      `padding:${sidebar.participantPaddingY}px ${sidebar.participantPaddingRight}px ${sidebar.participantPaddingY}px ${sidebar.participantPaddingLeft}px;border-radius:${sidebar.participantRadius}px`,
    );
    assertReferenceContains(
      `width:${sidebar.participantAvatarSize}px;height:${sidebar.participantAvatarSize}px;border-radius:50%`,
    );
  });

  it("bağlı ses şeridini korur (§2.5)", () => {
    const { voiceStrip } = SERVER_METRICS;

    assertReferenceContains(
      `margin:0 ${voiceStrip.marginX}px ${voiceStrip.marginBottom}px;padding:${voiceStrip.paddingY}px ${voiceStrip.paddingX}px;border-radius:${voiceStrip.radius}px`,
    );
    assertReferenceContains(
      `width:${voiceStrip.leaveButtonSize}px;height:${voiceStrip.leaveButtonSize}px;border:0;border-radius:${voiceStrip.leaveButtonRadius}px`,
    );

    for (const height of voiceStrip.barHeights) {
      assertReferenceContains(
        `width:${voiceStrip.barWidth}px;height:${height}px;border-radius:${voiceStrip.barRadius}px`,
      );
    }
  });
});

describe("sunucu parity — metin kanalı (§3)", () => {
  it("başlığı, düğmeleri ve ayracı korur", () => {
    const { textHeader } = SERVER_METRICS;

    assertReferenceContains(`padding:${textHeader.paddingY}px ${textHeader.paddingX}px`);
    assertReferenceContains(
      `width:${textHeader.actionSize}px;height:${textHeader.actionSize}px;border:0;border-radius:${textHeader.actionRadius}px`,
    );
    assertReferenceContains(
      `width:${textHeader.dividerWidth}px;height:${textHeader.dividerHeight}px;background:hsl(var(--border));margin:0 ${textHeader.dividerMarginX}px`,
    );
    assertReferenceContains(
      `height:${textHeader.membersButtonHeight}px;padding:0 ${textHeader.membersButtonPaddingX}px;border:0;border-radius:${textHeader.membersButtonRadius}px`,
    );
    assertReferenceContains(`font:600 ${textHeader.nameFontSize}px/1.2 var(--w-display)`);
  });

  it("sabitlenen mesaj çubuğunu korur", () => {
    const { pinnedBar } = SERVER_METRICS;

    assertReferenceContains(
      `gap:${pinnedBar.gap}px;padding:${pinnedBar.paddingY}px ${pinnedBar.paddingX}px;background:hsl(var(--surface-secondary)/.7)`,
    );
    assertReferenceContains(`font:600 ${pinnedBar.titleFontSize}px/1 var(--w-body)`);
  });

  it("`yazıyor` satırını korur (§3.3 son maddesi)", () => {
    const { typing } = SERVER_METRICS;

    assertReferenceContains(
      `gap:${typing.gap}px;padding:${typing.paddingY}px ${typing.paddingX}px;font-size:${typing.fontSize}px;color:hsl(var(--text-muted))`,
    );
    assertReferenceContains(`gap:${typing.dotGap}px;flex:none`);

    // Üç nokta aynı ölçüde, farklı opaklıkta: `1 → .6 → .3`. Dördüncü bir nokta ya da
    // dördüncü bir opaklık referansta yok.
    assert.equal(typing.dotAlphas.length, 3);
    assert.equal(typing.dotAlphas[0], 1);

    for (const alpha of typing.dotAlphas) {
      const tone =
        alpha === 1 ? "hsl(var(--primary))" : `hsl(var(--primary)/${String(alpha).slice(1)})`;

      assertReferenceContains(
        `width:${typing.dotSize}px;height:${typing.dotSize}px;border-radius:50%;background:${tone}`,
      );
    }
  });

  it("bestekarı korur", () => {
    const { composer } = SERVER_METRICS;

    assertReferenceContains(`padding:0 ${composer.paddingX}px ${composer.paddingBottom}px`);
    assertReferenceContains(
      `padding:${composer.boxPaddingY}px ${composer.boxPaddingX}px;border:1px solid hsl(var(--border));border-radius:${composer.boxRadius}px`,
    );
    assertReferenceContains(
      `width:${composer.attachSize}px;height:${composer.attachSize}px;border:0;border-radius:${composer.attachRadius}px`,
    );
    assertReferenceContains(
      `width:${composer.sendSize}px;height:${composer.sendSize}px;margin-left:${composer.sendMarginLeft}px;border:0;border-radius:${composer.sendRadius}px`,
    );
    assertReferenceContains(
      `box-shadow:${composer.sendShadow.x} ${composer.sendShadow.y}px ${composer.sendShadow.blur}px ${composer.sendShadow.spread}px hsl(var(--primary))`,
    );
  });
});

describe("sunucu parity — sağ panel ve arama (§4)", () => {
  it("panel başlığını ve üye satırını korur", () => {
    const { rightPanel } = SERVER_METRICS;

    assertReferenceContains(
      `padding:${rightPanel.headerPaddingTop}px ${rightPanel.headerPaddingX}px ${rightPanel.headerPaddingBottom}px`,
    );
    assertReferenceContains(
      `width:${rightPanel.closeSize}px;height:${rightPanel.closeSize}px;border:0;border-radius:${rightPanel.closeRadius}px`,
    );
    assertReferenceContains(
      `padding:${rightPanel.memberRowPaddingY}px ${rightPanel.memberRowPaddingX}px;border-radius:${rightPanel.memberRowRadius}px`,
    );
    assertReferenceContains(
      `width:${rightPanel.avatarSize}px;height:${rightPanel.avatarSize}px;border-radius:50%`,
    );
    assertReferenceContains(
      `width:${rightPanel.presenceDotSize}px;height:${rightPanel.presenceDotSize}px;border-radius:50%`,
    );
    assertReferenceContains(
      `height:${rightPanel.inviteButtonHeight}px;padding:0 ${rightPanel.inviteButtonPaddingX}px`,
    );
    assertReferenceContains(
      `height:${rightPanel.copyLinkHeight}px;border:1px solid hsl(var(--primary)/.4);border-radius:${rightPanel.copyLinkRadius}px`,
    );
  });

  it("arama panelinin alanlarını ve anahtarını korur (§4.3)", () => {
    const { search } = SERVER_METRICS;

    assertReferenceContains(`padding:${search.segmentPaddingTop}px ${search.segmentPaddingX}px 0`);
    assertReferenceContains(
      `padding:${search.queryBoxPaddingY}px ${search.queryBoxPaddingX}px;border:1px solid hsl(var(--primary)/.45);border-radius:${search.queryBoxRadius}px`,
    );
    assertReferenceContains(
      `padding:${search.fieldRowPaddingY}px ${search.fieldRowPaddingX}px;border:1px solid hsl(var(--border)/.75);border-radius:${search.fieldRowRadius}px`,
    );
    assertReferenceContains(
      `width:${search.switchWidth}px;height:${search.switchHeight}px;border:0;border-radius:999px`,
    );
    assertReferenceContains(
      `width:${search.switchKnobSize}px;height:${search.switchKnobSize}px;border-radius:50%`,
    );
    assertReferenceContains(
      `padding:${search.resultPaddingY}px ${search.resultPaddingX}px;border-radius:${search.resultRadius}px`,
    );
  });
});

describe("sunucu parity — ses kanalı (§5)", () => {
  it("katılımcı ızgarasını ve kartı korur", () => {
    const { voiceGrid } = SERVER_METRICS;

    assertReferenceContains(
      `padding:${voiceGrid.paddingTop}px ${voiceGrid.paddingX}px ${voiceGrid.paddingBottom}px`,
    );
    assertReferenceContains(`gap:${voiceGrid.gap}px`);
    assertReferenceContains(
      `aspect-ratio:${voiceGrid.cardAspectWidth}/${voiceGrid.cardAspectHeight};border-radius:${voiceGrid.cardRadius}px`,
    );
    assertReferenceContains(
      `width:${voiceGrid.avatarSize}px;height:${voiceGrid.avatarSize}px;border-radius:50%`,
    );
    assertReferenceContains(
      `inset:${voiceGrid.avatarRingInset}px;border-radius:50%;border:${voiceGrid.avatarRingWidth}px solid hsl(var(--success)/.55)`,
    );
    assertReferenceContains(
      `width:${voiceGrid.statusBadgeSize}px;height:${voiceGrid.statusBadgeSize}px;border-radius:${voiceGrid.statusBadgeRadius}px`,
    );
    assertReferenceContains(
      `hsl(var(--surface-secondary)) 0 ${voiceGrid.cameraStripeSize}px,hsl(var(--surface-tertiary)/.55) ${voiceGrid.cameraStripeSize}px ${voiceGrid.cameraStripeCycle}px`,
    );
  });

  it("konuşma dalgasının süresini ve gecikmesini korur", () => {
    const { voiceGrid } = SERVER_METRICS;

    // Referans saniyeyi başındaki sıfır olmadan yazar (`.9s`), sözlük milisaniye tutar.
    const seconds = (ms: number) => String(ms / 1000).replace(/^0/u, "");

    assertReferenceContains(`wbar ${seconds(voiceGrid.waveDurationMs)}s ease-in-out`);
    assertReferenceContains(`(k * ${voiceGrid.waveStaggerMs / 1000})`);
    assertReferenceContains(
      `width: ${voiceGrid.waveBarWidth}, height: h, borderRadius: ${voiceGrid.waveBarRadius}`,
    );
    assertReferenceContains(
      `bars(camOn ? ${voiceGrid.waveBarHeightCamera} : ${voiceGrid.waveBarHeight}, camOn ? ${voiceGrid.waveBarCountCamera} : ${voiceGrid.waveBarCount})`,
    );
  });

  it("ekran paylaşımı sahnesini ve şeridini korur (§5.3)", () => {
    const { screenShare } = SERVER_METRICS;

    assertReferenceContains(
      `border-radius:${screenShare.stageRadius}px;overflow:hidden;border:${screenShare.stageBorderWidth}px solid hsl(var(--primary)/.55)`,
    );
    assertReferenceContains(
      `hsl(var(--surface-secondary)) 0 ${screenShare.stageStripeSize}px,hsl(var(--surface-tertiary)/.6) ${screenShare.stageStripeSize}px ${screenShare.stageStripeCycle}px`,
    );
    assertReferenceContains(
      `width:${screenShare.stripCardWidth}px;flex:none;padding:${screenShare.stripCardPaddingY}px ${screenShare.stripCardPaddingX}px;border-radius:${screenShare.stripCardRadius}px`,
    );
    assertReferenceContains(
      `width:${screenShare.fullscreenSize}px;height:${screenShare.fullscreenSize}px;border:1px solid hsl(var(--border)/.7);border-radius:${screenShare.metaChipRadius}px`,
    );
  });

  it("kontrol çubuğunu korur (§5.4)", () => {
    const { voiceControls } = SERVER_METRICS;

    assertReferenceContains(
      `padding:${voiceControls.paddingTop}px ${voiceControls.paddingX}px ${voiceControls.paddingBottom}px`,
    );
    assertReferenceContains(
      `height:${voiceControls.buttonHeight}px;padding:0 ${voiceControls.buttonPaddingX}px`,
    );
    assertReferenceContains(
      `width:${voiceControls.settingsSize}px;height:${voiceControls.settingsSize}px;border:1px solid hsl(var(--border));border-radius:${voiceControls.settingsRadius}px`,
    );
    assertReferenceContains(
      `width:${voiceControls.dividerWidth}px;height:${voiceControls.dividerHeight}px;background:hsl(var(--border));margin:0 ${voiceControls.dividerMarginX}px`,
    );
    assertReferenceContains(
      `height:${voiceControls.leaveHeight}px;padding:0 ${voiceControls.leavePaddingX}px;border:0;border-radius:${voiceControls.leaveRadius}px`,
    );
  });
});

describe("sunucu parity — pencereler (§6, §7)", () => {
  it("altı pencerenin genişliğini korur", () => {
    for (const width of Object.values(SERVER_METRICS.modalWidths)) {
      assertReferenceContains(`width:min(${width}px,100%)`);
    }
  });

  it("ortak pencere kabuğunu korur", () => {
    const { modal } = SERVER_METRICS;

    assertReferenceContains(
      `z-index:${modal.overlayZIndex};display:grid;place-items:center;padding:${modal.overlayPadding}px;background:hsl(var(--background)/.72)`,
    );
    assertReferenceContains(
      `border-radius:${modal.cardRadius}px;overflow:hidden;background:hsl(var(--surface-card))`,
    );
    assertReferenceContains(
      `box-shadow:${modal.cardShadow.x} ${modal.cardShadow.y}px ${modal.cardShadow.blur}px ${modal.cardShadow.spread}px hsl(var(--shadow-color))`,
    );
    assertReferenceContains(
      `padding:${modal.headerPaddingTop}px ${modal.headerPaddingX}px ${modal.headerPaddingBottom}px`,
    );
    assertReferenceContains(
      `width:${modal.iconBoxSize}px;height:${modal.iconBoxSize}px;border-radius:${modal.iconBoxRadius}px`,
    );
    assertReferenceContains(
      `width:${modal.closeSize}px;height:${modal.closeSize}px;border:0;border-radius:${modal.closeRadius}px`,
    );
    assertReferenceContains(
      `padding:${modal.footerPaddingY}px ${modal.footerPaddingX}px;border-top:1px solid hsl(var(--border)/.5);background:hsl(var(--surface-secondary)/.5)`,
    );
    assertReferenceContains(`height:${modal.primaryHeight}px;padding:0 ${modal.primaryPaddingX}px`);
    assertReferenceContains(
      `height:${modal.secondaryHeight}px;padding:0 ${modal.secondaryPaddingX}px;border:1px solid hsl(var(--border));border-radius:${modal.secondaryRadius}px`,
    );
    // §6.4'ün kenarsız ayağı — ortak ayakla aynı değil, sözlük ikisini de taşır.
    assertReferenceContains(
      `padding:${modal.plainFooterPaddingTop}px ${modal.plainFooterPaddingX}px ${modal.plainFooterPaddingBottom}px`,
    );
  });

  it("kanal sihirbazının dört adımını korur (§6.2)", () => {
    const { channelWizard } = SERVER_METRICS;

    assertReferenceContains(
      `width:${channelWizard.stepNumberSize}px;height:${channelWizard.stepNumberSize}px;border-radius:${channelWizard.stepNumberRadius}px`,
    );
    assertReferenceContains(
      `padding:${channelWizard.kindCardPaddingY}px ${channelWizard.kindCardPaddingX}px;border:${channelWizard.kindCardBorderWidth}px solid`,
    );
    assertReferenceContains(
      `width:${channelWizard.kindIconSize}px;height:${channelWizard.kindIconSize}px;border-radius:${channelWizard.kindIconRadius}px`,
    );
    assertReferenceContains(
      `padding:${channelWizard.accessRowPaddingY}px ${channelWizard.accessRowPaddingX}px;border:${channelWizard.accessRowBorderWidth}px solid`,
    );
    assertReferenceContains(
      `width:${channelWizard.accessIconSize}px;height:${channelWizard.accessIconSize}px;border-radius:${channelWizard.accessIconRadius}px`,
    );
    assertReferenceContains(
      `width:${channelWizard.accessRadioSize}px;height:${channelWizard.accessRadioSize}px;border-radius:50%;border:${channelWizard.accessRadioBorderWidth}px solid`,
    );
    assertReferenceContains(
      `padding:${channelWizard.settingCardPaddingY}px ${channelWizard.settingCardPaddingX}px;border-radius:${channelWizard.settingCardRadius}px`,
    );
    assertReferenceContains(
      `padding:${channelWizard.settingChipPaddingY}px ${channelWizard.settingChipPaddingX}px;border:1px solid {{ o.bd }};border-radius:${channelWizard.settingChipRadius}px`,
    );
  });

  it("sunucu oluşturma penceresini korur (§7)", () => {
    const { createServer } = SERVER_METRICS;

    assertReferenceContains(
      `grid-template-columns:minmax(0,1fr) ${createServer.previewColumnWidth}px`,
    );
    assertReferenceContains(
      `width:${createServer.iconSize}px;height:${createServer.iconSize}px;border-radius:${createServer.iconRadius}px`,
    );
    assertReferenceContains(
      `width:${createServer.swatchSize}px;height:${createServer.swatchSize}px;padding:0;border:${createServer.swatchBorderWidth}px solid {{ c.bd }};border-radius:${createServer.swatchRadius}px`,
    );
    assertReferenceContains(
      `grid-template-columns:minmax(0,1fr) ${createServer.shortNameColumnWidth}px`,
    );
    assertReferenceContains(
      `width:${createServer.railIconSize}px;height:${createServer.railIconSize}px;border-radius:${createServer.railIconRadius}px`,
    );
    assertReferenceContains(
      `width:${createServer.serverIconSize}px;height:${createServer.serverIconSize}px;border-radius:${createServer.serverIconRadius}px`,
    );
  });

  it("sunucu oluşturma gövdesini yüksekliğe sınırlar; form aşağı kayabilir", () => {
    const source = readFileSync(
      new URL("../../components/servers/modals/create-server-modal.tsx", import.meta.url),
      "utf8",
    );

    assert.match(source, /grid-rows-\[minmax\(0,1fr\)\]/u);
    assert.match(source, /min-h-0 flex-1 overflow-y-auto/u);
  });

  it("§7.4 erişim radyosunu korur", () => {
    const { createServer } = SERVER_METRICS;

    assertReferenceContains(
      `padding:${createServer.accessRowPaddingY}px ${createServer.accessRowPaddingX}px;border:${createServer.accessRowBorderWidth}px solid {{ a.bd }};border-radius:${createServer.accessRowRadius}px`,
    );
    assertReferenceContains(
      `width:${createServer.accessIconSize}px;height:${createServer.accessIconSize}px;border-radius:${createServer.accessIconRadius}px`,
    );
    assertReferenceContains(
      `width:${createServer.accessRadioSize}px;height:${createServer.accessRadioSize}px;border-radius:50%;border:${createServer.accessRadioBorderWidth}px solid {{ a.dotBd }}`,
    );
  });

  /**
   * §6.2 adım 3 ile §7.4 aynı kartı çiziyor ve sözlükte iki ayrı kayıtları var. Eşitlik burada
   * **beklenen** sonuçtur; test onu bilerek sabitliyor ki biri sessizce kayarsa iki bölümden
   * hangisinin değiştiği belli olsun.
   */
  it("§6.2 ve §7.4'ün radyo kartı aynı ölçüde", () => {
    const { channelWizard, createServer } = SERVER_METRICS;

    for (const field of [
      "accessListMarginTop",
      "accessListGap",
      "accessRowPaddingY",
      "accessRowPaddingX",
      "accessRowRadius",
      "accessRowBorderWidth",
      "accessRowGap",
      "accessIconSize",
      "accessIconRadius",
      "accessIconGlyphSize",
      "accessTitleFontSize",
      "accessTitleLineHeight",
      "accessDescriptionMarginTop",
      "accessDescriptionFontSize",
      "accessDescriptionLineHeight",
      "accessRadioSize",
      "accessRadioBorderWidth",
      "accessRadioCheckGlyphSize",
    ] as const) {
      assert.equal(createServer[field], channelWizard[field], `§7.4 ${field} §6.2'den ayrışmış`);
    }
  });

  it("§7.7 gelişmiş çip grubunu korur", () => {
    const { createServer } = SERVER_METRICS;

    assertReferenceContains(
      `padding:${createServer.advancedHeaderPaddingY}px ${createServer.advancedHeaderPaddingX}px`,
    );
    assertReferenceContains(
      `padding:${createServer.advancedBodyPaddingTop}px ${createServer.advancedBodyPaddingX}px ${createServer.advancedBodyPaddingBottom}px`,
    );
    assertReferenceContains(
      `padding:${createServer.advancedValueChipPaddingY}px ${createServer.advancedValueChipPaddingX}px;border-radius:${createServer.advancedValueChipRadius}px`,
    );
    assertReferenceContains(
      `padding:${createServer.advancedChipPaddingY}px ${createServer.advancedChipPaddingX}px;border:1px solid {{ o.bd }};border-radius:${createServer.advancedChipRadius}px`,
    );
  });

  /**
   * §7.7 ile §8.3 aynı **seçenek** listesini çizer ama farklı kartta: başlık 12.5 ↔ 13.5,
   * çipin üstündeki boşluk 9 ↔ 11. `OptionChipGroup`'un iki varyantı bu yüzden var; sayılar
   * eşitlenirse varyant ayrımı sessizce anlamsızlaşır.
   */
  it("§7.7 ile §8.3 kasıtlı olarak ayrı ölçüde", () => {
    const { createServer, settingsSections } = SERVER_METRICS;

    assertNotEqualSizes(
      createServer.advancedOptionTitleFontSize,
      settingsSections.contentTitleFontSize,
    );
    assertNotEqualSizes(
      createServer.advancedChipsMarginTop,
      settingsSections.contentChipsMarginTop,
    );
  });

  it("§7 önizleme kolonunun üç kartını korur", () => {
    const { createServer } = SERVER_METRICS;

    assertReferenceContains(
      `padding:${createServer.previewPaddingTop}px ${createServer.previewPaddingX}px ${createServer.previewPaddingBottom}px;border-left:1px solid hsl(var(--border)/${String(
        createServer.previewBorderLeftAlpha,
      ).replace(/^0/, "")});background:hsl(var(--surface-panel))`,
    );
    assertReferenceContains(
      `padding:${createServer.railCardPaddingY}px ${createServer.railCardPaddingX}px;border-radius:${createServer.railCardRadius}px`,
    );
    assertReferenceContains(
      `padding:${createServer.serverBadgePaddingY}px ${createServer.serverBadgePaddingX}px;border-radius:${createServer.serverBadgeRadius}px`,
    );
    assertReferenceContains(
      `padding:${createServer.summaryCardPadding}px;border-radius:${createServer.summaryCardRadius}px`,
    );
    assertReferenceContains(
      `width:${createServer.serverMetaDotSize}px;height:${createServer.serverMetaDotSize}px;border-radius:50%;background:hsl(var(--success))`,
    );
  });

  it("kategori penceresinin canlı önizlemesini korur (§6.1)", () => {
    const { categoryModal } = SERVER_METRICS;

    assertReferenceContains(
      `padding:${categoryModal.previewPaddingY}px ${categoryModal.previewPaddingX}px;border-radius:${categoryModal.previewRadius}px;background:hsl(var(--surface-panel))`,
    );
    assertReferenceContains(
      `width:${categoryModal.previewAddSize}px;height:${categoryModal.previewAddSize}px;border-radius:${categoryModal.previewAddRadius}px`,
    );
    assertReferenceContains(
      `padding:${categoryModal.previewEmptyPaddingY}px ${categoryModal.previewEmptyPaddingX}px;border-radius:${categoryModal.previewEmptyRadius}px;border:1px dashed hsl(var(--border))`,
    );
  });

  it("etkinlik penceresinin üç kolonunu korur (§6.5)", () => {
    const { eventModal } = SERVER_METRICS;

    assertReferenceContains(
      `grid-template-columns:minmax(0,${eventModal.gridDateFraction}fr) minmax(0,1fr) minmax(0,1fr)`,
    );
    assertReferenceContains(
      `width:${eventModal.requiredDotSize}px;height:${eventModal.requiredDotSize}px;border-radius:50%;background:hsl(var(--danger))`,
    );
    assertReferenceContains(
      `padding:${eventModal.fieldPaddingY}px ${eventModal.fieldPaddingX}px;border:1px solid {{ evDateBd }};border-radius:${eventModal.fieldRadius}px`,
    );
  });
});

describe("sunucu parity — paylaşılan parçalar (Ş8)", () => {
  it("anahtar satırının iki boyunu da referanstan alır", () => {
    const { toggleRow } = SERVER_METRICS;

    assertReferenceContains(
      `gap:${toggleRow.contentGap}px;padding:${toggleRow.paddingY}px ${toggleRow.paddingX}px;border-radius:${toggleRow.radius}px;background:hsl(var(--surface-base));border:1px solid hsl(var(--border)/.7)`,
    );
    assertReferenceContains(
      `width:${toggleRow.switchWidth}px;height:${toggleRow.switchHeight}px;border:0;border-radius:999px`,
    );
    assertReferenceContains(
      `top:${toggleRow.switchKnobInset}px;left:{{ csInvX }};width:${toggleRow.switchKnobSize}px;height:${toggleRow.switchKnobSize}px`,
    );
    assertReferenceContains(
      `width:${toggleRow.compactSwitchWidth}px;height:${toggleRow.compactSwitchHeight}px;border:0;border-radius:999px`,
    );
    assertReferenceContains(
      `top:${toggleRow.compactSwitchKnobInset}px;left:{{ p.x }};width:${toggleRow.compactSwitchKnobSize}px;height:${toggleRow.compactSwitchKnobSize}px`,
    );
  });

  it("keşif etiketi seçicisinin iki yüzeyini tek sözlükten besler", () => {
    const { create, settings, shared } = SERVER_METRICS.discoveryTagPicker;

    // Ortak kısım — seçili çip, silme ve `Etiket yaz, Enter'a bas` alanı iki yüzeyde birebir.
    assertReferenceContains(
      `gap:${shared.chipGap}px;padding:${shared.chipPaddingY}px ${shared.chipPaddingX}px;border-radius:${shared.chipRadius}px;background:hsl(var(--primary)/.14)`,
    );
    assertReferenceContains(
      `min-width:${shared.draftMinWidth}px;padding:${shared.draftPaddingY}px 0;font:500 ${shared.draftFontSize}px/1 var(--w-body)`,
    );
    assertReferenceContains(
      `padding:${shared.suggestionChipPaddingY}px ${shared.suggestionChipPaddingX}px;border:1px solid {{ t.bd }};border-radius:${shared.suggestionChipRadius}px`,
    );

    // Ayrışan tek şey rozetin boyu: ayarlarda 31, sunucu oluşturmada 29.
    assertReferenceContains(
      `width:${settings.suggestionCodeSize}px;height:${settings.suggestionCodeSize}px;border-radius:${shared.suggestionCodeRadius}px`,
    );
    assertReferenceContains(
      `width:${create.suggestionCodeSize}px;height:${create.suggestionCodeSize}px;border-radius:${shared.suggestionCodeRadius}px`,
    );
    assertNotEqualSizes(settings.suggestionCodeSize, create.suggestionCodeSize);
  });

  it("yetki grubu kartını korur (§8.5)", () => {
    const { settingsSections } = SERVER_METRICS;

    assertReferenceContains(
      `border-radius:${settingsSections.rolesGroupRadius}px;overflow:hidden;background:hsl(var(--surface-card));border:1px solid hsl(var(--border)/.6)`,
    );
    assertReferenceContains(
      `gap:${settingsSections.rolesGroupHeaderGap}px;padding:${settingsSections.rolesGroupHeaderPaddingY}px ${settingsSections.rolesGroupHeaderPaddingX}px;border-bottom:1px solid hsl(var(--border)/.5)`,
    );
    assertReferenceContains(
      `padding:${settingsSections.rolesGroupListPaddingTop}px ${settingsSections.rolesGroupListPaddingX}px ${settingsSections.rolesGroupListPaddingBottom}px`,
    );
    assertReferenceContains(
      `gap:${settingsSections.rolesPermissionRowGap}px;padding:${settingsSections.rolesPermissionRowPadding}px ${settingsSections.rolesPermissionRowPadding}px;border-radius:${settingsSections.rolesPermissionRowRadius}px`,
    );
    assertReferenceContains(
      `padding:${settingsSections.rolesOwnerChipPaddingY}px ${settingsSections.rolesOwnerChipPaddingX}px;border-radius:${settingsSections.rolesOwnerChipRadius}px;background:hsl(var(--danger)/.12)`,
    );
  });

  it("seçenek çipi grubunun iki varyantını korur (§6.2, §8.3)", () => {
    const { channelWizard, settingsSections } = SERVER_METRICS;

    assertReferenceContains(
      `margin-left:auto;padding:${channelWizard.settingValueChipPaddingY}px ${channelWizard.settingValueChipPaddingX}px;border-radius:${channelWizard.settingValueChipRadius}px;background:hsl(var(--primary)/.14)`,
    );
    assertReferenceContains(
      `padding:${settingsSections.contentCardPadding}px;border-radius:${settingsSections.contentCardRadius}px;background:hsl(var(--surface-card));border:1px solid hsl(var(--border)/.6)`,
    );
    assertReferenceContains(
      `padding:${settingsSections.contentChipPaddingY}px ${settingsSections.contentChipPaddingX}px;border:1px solid {{ o.bd }};border-radius:${settingsSections.contentChipRadius}px`,
    );
  });
});

describe("sunucu parity — sunucu ayarları (§8)", () => {
  it("kaplamayı, kartı ve iki kolonu korur", () => {
    const { settings } = SERVER_METRICS;

    assertReferenceContains(
      `z-index:${settings.overlayZIndex};display:grid;place-items:center;padding:${settings.overlayPadding}px;background:hsl(var(--background)/.74)`,
    );
    assertReferenceContains(
      `width:min(${settings.cardMaxWidth}px,100%);height:100%;border-radius:${settings.cardRadius}px`,
    );
    assertReferenceContains(
      `box-shadow:${settings.cardShadow.x} ${settings.cardShadow.y}px ${settings.cardShadow.blur}px ${settings.cardShadow.spread}px hsl(var(--shadow-color))`,
    );
    assertReferenceContains(`width:${settings.navWidth}px;flex:none;border-right:1px solid`);
    assertReferenceContains(
      `width:${settings.serverIconSize}px;height:${settings.serverIconSize}px;border-radius:${settings.serverIconRadius}px`,
    );
    assertReferenceContains(
      `padding:${settings.menuRowPaddingY}px ${settings.menuRowPaddingX}px;margin-bottom:${settings.menuRowMarginBottom}px;border:0;border-radius:${settings.menuRowRadius}px`,
    );
    assertReferenceContains(
      `padding:${settings.headerPaddingY}px ${settings.headerPaddingX}px;border-bottom:1px solid hsl(var(--border)/.5)`,
    );
    assertReferenceContains(
      `width:${settings.closeSize}px;height:${settings.closeSize}px;border:1px solid hsl(var(--border)/.7);border-radius:${settings.closeRadius}px`,
    );
    assertReferenceContains(
      `padding:${settings.bodyPaddingTop}px ${settings.bodyPaddingX}px ${settings.bodyPaddingBottom}px`,
    );
  });

  it("dokuz bölümün kendi ölçülerini korur (§8.1–§8.9)", () => {
    const s = SERVER_METRICS.settingsSections;

    assertReferenceContains(
      `grid-template-columns:minmax(0,1fr) ${s.generalPreviewColumnWidth}px;gap:${s.generalGridGap}px`,
    );
    assertReferenceContains(
      `width:${s.generalIconSize}px;height:${s.generalIconSize}px;border-radius:${s.generalIconRadius}px`,
    );
    assertReferenceContains(
      `width:${s.generalSwatchSize}px;height:${s.generalSwatchSize}px;padding:0;border:${s.generalSwatchBorderWidth}px solid {{ c.bd }};border-radius:${s.generalSwatchRadius}px`,
    );
    assertReferenceContains(
      `grid-template-columns:minmax(0,1fr) ${s.generalFormShortNameColumnWidth}px`,
    );
    assertReferenceContains(
      `width:${s.generalProfileIconSize}px;height:${s.generalProfileIconSize}px;border-radius:${s.generalProfileIconRadius}px`,
    );
    assertReferenceContains(
      `padding:${s.visibilityRowPaddingY}px ${s.visibilityRowPaddingX}px;border-radius:${s.visibilityRowRadius}px`,
    );
    assertReferenceContains(
      `width:${s.visibilityIconSize}px;height:${s.visibilityIconSize}px;border-radius:${s.visibilityIconRadius}px`,
    );
    // Keşif etiketi kartının kendi ölçüleri `discoveryTagPicker.settings` altına taşındı (Ş8);
    // bölüm sözlüğünde kalan tek sayı kartın bölüm içindeki yeri.
    assertReferenceContains(
      `margin-top:${s.discoveryCardMarginTop}px;padding:${SERVER_METRICS.discoveryTagPicker.settings.cardPadding}px;border-radius:${SERVER_METRICS.discoveryTagPicker.settings.cardRadius}px`,
    );
    assertReferenceContains(
      `padding:${s.contentChipPaddingY}px ${s.contentChipPaddingX}px;border:1px solid {{ o.bd }};border-radius:${s.contentChipRadius}px`,
    );
    assertReferenceContains(
      `height:${s.channelsButtonHeight}px;padding:0 ${s.channelsButtonPaddingX}px`,
    );
    assertReferenceContains(
      `width:${s.channelsActionSize}px;height:${s.channelsActionSize}px;border:0;border-radius:${s.channelsActionRadius}px`,
    );
    assertReferenceContains(
      `grid-template-columns:${s.rolesListColumnWidth}px minmax(0,1fr);gap:${s.rolesGridGap}px`,
    );
    assertReferenceContains(
      `width:${s.rolesDotSize}px;height:${s.rolesDotSize}px;border-radius:50%`,
    );
    // Yetki satırının anahtarı `toggleRow.compactSwitch*` altında ve orada denetleniyor (Ş8).
    assertReferenceContains(
      `width:${s.membersAvatarSize}px;height:${s.membersAvatarSize}px;border-radius:50%`,
    );
    assertReferenceContains(
      `width:${s.membersPresenceDotSize}px;height:${s.membersPresenceDotSize}px;border-radius:50%;background:{{ m.dot }};border:${s.membersPresenceDotBorderWidth}px solid hsl(var(--surface-card))`,
    );
    assertReferenceContains(
      `padding:${s.membersRowPaddingY}px ${s.membersRowPaddingX}px;border-radius:${s.membersRowRadius}px`,
    );
    assertReferenceContains(
      `height:${s.invitesCreateHeight}px;padding:0 ${s.invitesCreatePaddingX}px`,
    );
    assertReferenceContains(
      `height:${s.eventsTabHeight}px;padding:0 ${s.eventsTabPaddingX}px;border:0;border-radius:${s.eventsTabRadius}px`,
    );
    assertReferenceContains(
      `width:${s.eventsDateBoxWidth}px;height:${s.eventsDateBoxHeight}px;border-radius:${s.eventsDateBoxRadius}px`,
    );
    assertReferenceContains(`font:600 ${s.eventsDayFontSize}px/1 var(--w-display)`);
    assertReferenceContains(
      `padding:${s.eventsEmptyPaddingY}px ${s.eventsEmptyPaddingX}px;border-radius:${s.eventsEmptyRadius}px;border:1px dashed`,
    );
    assertReferenceContains(
      `padding:${s.dangerCardPadding}px;border-radius:${s.dangerCardRadius}px;background:hsl(var(--warning)/.06);border:1px solid hsl(var(--warning)/.35)`,
    );
    assertReferenceContains(
      `width:${s.transferRadioSize}px;height:${s.transferRadioSize}px;border-radius:50%;border:${s.transferRadioBorderWidth}px solid`,
    );
    assertReferenceContains(
      `height:${s.deleteButtonHeight}px;padding:0 ${s.deleteButtonPaddingX}px`,
    );
  });
});

describe("sunucu parity — ses başlığı çipleri (§5.1)", () => {
  it("Krisp çipini ve gecikme çipini korur", () => {
    const { voiceHeader } = SERVER_METRICS;

    assertReferenceContains(
      `padding:${voiceHeader.krispChipPaddingY}px ${voiceHeader.krispChipPaddingX}px;border-radius:${voiceHeader.krispChipRadius}px;background:hsl(var(--success)/.${String(voiceHeader.krispChipBackgroundAlpha).slice(2)});border:1px solid hsl(var(--success)/.${String(voiceHeader.krispChipBorderAlpha).slice(2)});font:600 ${voiceHeader.krispChipFontSize}px/`,
    );
    assertReferenceContains(
      `gap:${voiceHeader.latencyChipGap}px;padding:${voiceHeader.latencyChipPaddingY}px ${voiceHeader.latencyChipPaddingX}px;border-radius:${voiceHeader.latencyChipRadius}px;background:hsl(var(--surface-soft));border:1px solid hsl(var(--border)/.${String(voiceHeader.latencyChipBorderAlpha).slice(2)})`,
    );
  });

  it("gecikme çubuklarının dört yüksekliğini korur", () => {
    const { voiceHeader } = SERVER_METRICS;

    // §5.1 — dört çubuk, en yükseği çipin kendi yüksekliği kadar.
    assert.equal(voiceHeader.latencyBarHeights.length, 4);
    assert.equal(
      voiceHeader.latencyBarHeights[voiceHeader.latencyBarHeights.length - 1],
      voiceHeader.latencyBarsHeight,
    );

    for (const height of voiceHeader.latencyBarHeights) {
      assertReferenceContains(
        `width:${voiceHeader.latencyBarWidth}px;height:${height}px;border-radius:${voiceHeader.latencyBarRadius}px`,
      );
    }
  });
});

describe("sunucu parity — davet penceresi (§6.3)", () => {
  it("bağlantı satırını ve kopyalama düğmesini korur", () => {
    const { inviteModal } = SERVER_METRICS;

    assertReferenceContains(
      `gap:${inviteModal.linkRowGap}px;padding:${inviteModal.linkRowPaddingY}px ${inviteModal.linkRowPaddingX}px;border:1px solid hsl(var(--border));border-radius:${inviteModal.linkRowRadius}px`,
    );
    assertReferenceContains(
      `height:${inviteModal.copyHeight}px;padding:0 ${inviteModal.copyPaddingX}px`,
    );
  });

  it("iki çip kartını ve bilgi kutusunu korur", () => {
    const { inviteModal } = SERVER_METRICS;

    assertReferenceContains(
      `padding:${inviteModal.cardPaddingY}px ${inviteModal.cardPaddingX}px;border-radius:${inviteModal.cardRadius}px;background:hsl(var(--surface-base));border:1px solid hsl(var(--border)/.${String(inviteModal.cardBorderAlpha).slice(2)})`,
    );
    assertReferenceContains(
      `margin-top:${inviteModal.infoMarginTop}px;padding:${inviteModal.infoPaddingY}px ${inviteModal.infoPaddingX}px;border-radius:${inviteModal.infoRadius}px;background:hsl(var(--success)/.${String(inviteModal.infoBackgroundAlpha).slice(2)});border:1px solid hsl(var(--success)/.${String(inviteModal.infoBorderAlpha).slice(2)})`,
    );
  });

  it("QR kutusunun referansta karşılığı olmadığını kayda geçirir", () => {
    // Ş3 §3.5 / Ş9 §2.6 / Ş13 sapma 8 — tasarım QR'ı kesikli bir **çip** olarak çiziyordu ve
    // kutunun ölçüsü yoktu. K3 çipi kaldırıp iki gerçek yüzey açtı; ikisi aynı kutuyu çizmek
    // zorunda olduğu için sayı sözlüğe alındı. Referansta aranacak bir satır **yok**.
    assert.equal(SERVER_METRICS.inviteModal.qrBoxSize, 132);
    assert.equal(reference.includes(`${SERVER_METRICS.inviteModal.qrBoxSize}px`), false);
  });
});

describe("sunucu parity — kanal bildirimleri penceresi (§6.4)", () => {
  it("üç seçenek satırını korur", () => {
    const { notificationsModal } = SERVER_METRICS;

    assertReferenceContains(
      `padding:${notificationsModal.listPaddingTop}px ${notificationsModal.listPaddingX}px ${notificationsModal.listPaddingBottom}px`,
    );
    assertReferenceContains(
      `gap:${notificationsModal.optionGap}px;padding:${notificationsModal.optionPaddingY}px ${notificationsModal.optionPaddingX}px;border:${notificationsModal.optionBorderWidth}px solid`,
    );
    assertReferenceContains(
      `width:${notificationsModal.optionIconSize}px;height:${notificationsModal.optionIconSize}px;border-radius:${notificationsModal.optionIconRadius}px`,
    );
    assertReferenceContains(
      `width:${notificationsModal.optionRadioSize}px;height:${notificationsModal.optionRadioSize}px;border-radius:50%;border:${notificationsModal.optionRadioBorderWidth}px solid`,
    );
  });

  it("mobil susturma satırını ve anahtarını korur", () => {
    const { notificationsModal } = SERVER_METRICS;

    assertReferenceContains(
      `margin:${notificationsModal.muteRowMarginTop}px ${notificationsModal.muteRowMarginX}px 0;padding:${notificationsModal.muteRowPaddingY}px ${notificationsModal.muteRowPaddingX}px;border-radius:${notificationsModal.muteRowRadius}px;background:hsl(var(--surface-soft)/.${String(notificationsModal.muteRowBackgroundAlpha).slice(2)})`,
    );
    // §6.4'ün anahtarı 38×21; §8.2/§8.3'ün satır anahtarı 40×22 (Ş8 sapma S1).
    assertReferenceContains(
      `width:${notificationsModal.switchWidth}px;height:${notificationsModal.switchHeight}px`,
    );
    assertReferenceContains(
      `width:${notificationsModal.switchKnobSize}px;height:${notificationsModal.switchKnobSize}px;border-radius:50%`,
    );
    assert.notEqual(notificationsModal.switchWidth, SERVER_METRICS.toggleRow.switchWidth);
  });
});

describe("sunucu parity — sözlüğün sözleşmesi", () => {
  it("kayıtlı SPEC sapmalarının HTML değerlerini gerçekten içerir", () => {
    assert.deepEqual(
      SPEC_DEVIATIONS.map(({ field, html, spec }) => [field, html, spec]),
      [["sidebar.menuRowIconSize", 18, 17]],
    );
    assertReferenceContains(
      `width:${SERVER_METRICS.sidebar.menuRowIconSize}px;height:${SERVER_METRICS.sidebar.menuRowIconSize}px;flex:none">{{ m.icon }}`,
    );
  });

  it("kanal başlığını ve sunucu panelini ortak yüksekliğe hizalar", () => {
    assert.equal(SERVER_METRICS.headerHeight, 70);
    for (const path of [
      "../../components/chat/server-channel-header.tsx",
      "../../components/shell/channel-sidebar.tsx",
    ]) {
      const source = readFileSync(new URL(path, import.meta.url), "utf8");
      assert.match(source, /height: pxToRem\(SERVER_METRICS\.headerHeight\)/u);
    }
  });

  it("sözlüğün her grubu bu dosyada geçiyor", () => {
    /*
      "Tam kapsar" bir iddia değil, bir kapı: `SERVER_METRICS`e yeni bir grup eklenip parity
      denetimine hiç girmemesi mümkün olmasın. Grup adının bu dosyanın kaynağında geçmesi
      zayıf ama **ölçülebilir** bir alt sınır; satır satır eşleşmeyi üstteki bloklar yapıyor.
    */
    const source = readFileSync(new URL(import.meta.url), "utf8");
    const uncovered = Object.keys(SERVER_METRICS).filter(
      (group) => !new RegExp(`\\b${group}\\b`, "u").test(source),
    );

    assert.deepEqual(uncovered, []);
  });

  it("beyaz listede K1 dışında gerekçesiz girdi yok", () => {
    /*
      K1 (gezinme paneli 228 → 280) bir **plan kararı**, bir ölçü hatası değil ve gerekçesi
      `NAV_PANEL_ADJUSTMENTS`te yaşıyor. `SPEC_DEVIATIONS` ise HTML ile SPEC metninin
      çeliştiği satırları taşır ve her satırı bir sayı çiftidir — tek girdi, gerekçesi
      sözlüğün dosya başı yorumunda.
    */
    assert.equal(SPEC_DEVIATIONS.length, 1);
    assert.deepEqual(
      SPEC_DEVIATIONS.map((entry) => entry.field),
      ["sidebar.menuRowIconSize"],
    );
  });

  it("hiçbir renk taşımaz", () => {
    // Sözlük yalnız ölçü tutar; renk `hsl(var(--token))` olarak tüketicide yaşar. Bir hex ya da
    // `hsl(` sızarsa token denetimi (Ş14) değil, bu test yakalar — sızıntı sözlükte başlar.
    const serialized = JSON.stringify(SERVER_METRICS);

    assert.doesNotMatch(serialized, /#[0-9a-fA-F]{3,8}/u);
    assert.doesNotMatch(serialized, /hsla?\(|rgba?\(|oklch\(/u);
    assert.doesNotMatch(serialized, /--[a-z-]+/u);
    assert.doesNotMatch(serialized, /Outfit|Figtree/u);
  });

  it("iki merdiveni ayrı tutar", () => {
    // README'nin listesi yüzeyler içindir; 6'nın altındaki dört değer mikro listede yaşar ve
    // ikisi kesişmez — bir kart yarıçapının 2'ye düşmesi bu testi kırar.
    const surface = new Set<number>(SERVER_METRICS.radii);

    assert.deepEqual(
      SERVER_METRICS.microRadii.filter((radius) => surface.has(radius)),
      [],
    );
    assert.deepEqual(
      [...SERVER_METRICS.radii].sort((a, b) => a - b),
      [...SERVER_METRICS.radii],
    );
  });

  it("kullandığı her yarıçapı merdivende tutar", () => {
    const ladder = new Set<number>([...SERVER_METRICS.radii, ...SERVER_METRICS.microRadii]);
    const offenders: string[] = [];

    const walk = (value: unknown, path: string): void => {
      if (typeof value === "number") {
        if (/Radius$/u.test(path) && !ladder.has(value)) {
          offenders.push(`${path}=${value}`);
        }

        return;
      }

      if (Array.isArray(value)) {
        value.forEach((entry, index) => walk(entry, `${path}[${index}]`));
        return;
      }

      if (value && typeof value === "object") {
        for (const [key, entry] of Object.entries(value)) {
          walk(entry, path ? `${path}.${key}` : key);
        }
      }
    };

    walk(SERVER_METRICS, "");

    assert.deepEqual(offenders, []);
  });
});
