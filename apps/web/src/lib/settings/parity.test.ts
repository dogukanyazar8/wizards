import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { readDesignReference } from "@/lib/design-reference";
import { walkSettingsRows } from "@/lib/settings/tree";

import { SETTINGS_METRICS, SPEC_DEVIATIONS } from "./metrics";

/**
 * Parity kapısı — ölçü sözlüğü ↔ referans HTML.
 *
 * Sözlükteki her sayı referansın inline `style` metninde **birebir** aranır. Bir değer elle
 * "düzeltildiğinde" bu dosya kırmızı verir; tasarım gerçekten değiştiğinde ikisi birlikte
 * güncellenir. `lib/mentions/parity.test.ts` ile aynı desen.
 */
const reference = readDesignReference("ayarlar-paketi/referans/Ayarlar-referans.dc.html");

function assertReferenceContains(fragment: string): void {
  assert.ok(reference.includes(fragment), `Referans HTML parçası bulunamadı: ${fragment}`);
}

describe("settings parity — dört yüzeyin ölçüsü", () => {
  it("panel, pencere, menü ve ana pencere genişliklerini aynı kaynaktan taşır", () => {
    const { panel, prefsDialog, userMenu, window: win } = SETTINGS_METRICS;

    assertReferenceContains(
      `width:${panel.width}px;max-height:${panel.maxHeight}px;border-radius:${panel.radius}px`,
    );
    assertReferenceContains(
      `width:${prefsDialog.width}px;max-height:100%;border-radius:${prefsDialog.radius}px`,
    );
    assertReferenceContains(`width:${userMenu.width}px;border-radius:${userMenu.radius}px`);
    assertReferenceContains(
      `width:${win.width}px;height:100%;max-height:${win.height}px;border-radius:${win.radius}px`,
    );
  });

  it("popover'ların konumlandırmasını korur", () => {
    const { panel, userMenu } = SETTINGS_METRICS;

    assertReferenceContains(`top:${panel.top}px;right:${panel.right};z-index:${panel.zIndex}`);
    assertReferenceContains(
      `left:${userMenu.left}px;bottom:${userMenu.bottom}px;z-index:${userMenu.zIndex}`,
    );
  });

  it("gölge kayıtlarını referanstaki değerlerle taşır", () => {
    const { panel, prefsDialog, userMenu, window: win } = SETTINGS_METRICS;

    for (const { shadow } of [panel, prefsDialog, userMenu, win]) {
      assertReferenceContains(
        `box-shadow:${shadow.x} ${shadow.y}px ${shadow.blur}px ${shadow.spread}px hsl(var(--shadow-color))`,
      );
    }
  });
});

describe("settings parity — sol nav ve başlık", () => {
  it("nav genişliğini, üst boşluğunu ve arama alanını korur", () => {
    const { nav } = SETTINGS_METRICS;

    assertReferenceContains(`width:${nav.width}px;flex:none;border-right:1px solid`);
    assertReferenceContains(
      `padding:${nav.headerPaddingTop}px ${nav.headerPaddingX}px ${nav.headerPaddingBottom}px`,
    );
    assertReferenceContains(
      `margin-top:${nav.searchMarginTop}px;padding:${nav.searchPaddingY}px ${nav.searchPaddingX}px;border-radius:${nav.searchRadius}px`,
    );
    assertReferenceContains(
      `width:${nav.searchClearSize}px;height:${nav.searchClearSize}px;border:0;border-radius:${nav.searchClearRadius}px`,
    );
  });

  it("nav satırının ve alt kullanıcı kartının geometrisini korur", () => {
    const { nav } = SETTINGS_METRICS;

    assertReferenceContains(
      `padding:${nav.rowPaddingY}px ${nav.rowPaddingX}px;margin-bottom:${nav.rowMarginBottom}px;border:0;border-radius:${nav.rowRadius}px`,
    );
    assertReferenceContains(
      `padding:${nav.footerPaddingY}px ${nav.footerPaddingX}px;border-top:1px solid hsl(var(--border)/${String(nav.footerBorderTopAlpha).replace(/^0/u, "")})`,
    );
    assertReferenceContains(
      `width:${nav.footerLogoutSize}px;height:${nav.footerLogoutSize}px;border:0;border-radius:${nav.footerLogoutRadius}px`,
    );
  });

  it("başlık boşluğunu ve kapat düğmesini korur", () => {
    const { header } = SETTINGS_METRICS;

    assertReferenceContains(
      `padding:${header.paddingY}px ${header.paddingX}px;border-bottom:1px solid`,
    );
    assertReferenceContains(
      `width:${header.closeSize}px;height:${header.closeSize}px;border:1px solid hsl(var(--border)/${String(header.closeBorderAlpha).replace(/^0/u, "")});border-radius:${header.closeRadius}px`,
    );
  });
});

describe("settings parity — sekme şeridi ve içerik kolonu", () => {
  it("şerit ve sekme ölçülerini korur", () => {
    const { tabs } = SETTINGS_METRICS;

    assertReferenceContains(`padding:0 ${tabs.paddingX}px;border-bottom:1px solid`);
    assertReferenceContains(`height:${tabs.tabHeight}px;padding:0 ${tabs.tabPaddingX}px`);
    assertReferenceContains(
      `bottom:0;height:${tabs.barHeight}px;border-radius:${tabs.barRadiusTop}px ${tabs.barRadiusTop}px 0 0`,
    );
  });

  it("içerik kolonunu, grup kabını ve iskeletleri korur", () => {
    const { body } = SETTINGS_METRICS;

    assertReferenceContains(
      `max-width:${body.maxWidth}px;padding:${body.paddingTop}px ${body.paddingX}px ${body.paddingBottom}px`,
    );
    assertReferenceContains(`border-radius:${body.groupRadius}px;border:1px solid`);
    assertReferenceContains(
      `[${body.skeletonHeights.map((height) => `'${height}px'`).join(", ")}]`,
    );
  });
});

describe("settings parity — satır ve kontroller", () => {
  it("satır dolgusunu ve açıklama genişliğini korur", () => {
    const { row } = SETTINGS_METRICS;

    assertReferenceContains(`'${row.paddingY}px ${row.paddingX}px'`);
    assertReferenceContains(`subW: '${row.subMaxWidth}px'`);
  });

  it("anahtar, açılır menü ve eylem düğmesi geometrisini korur", () => {
    const { controls } = SETTINGS_METRICS;

    assertReferenceContains(
      `width:${controls.toggle.width}px;height:${controls.toggle.height}px;border:0;border-radius:999px`,
    );
    assertReferenceContains(`flex:none;width:${controls.select.width}px`);
    assertReferenceContains(
      `width:100%;height:${controls.select.height}px;padding:0 ${controls.select.paddingX}px`,
    );
    assertReferenceContains(`max-height:${controls.select.menuMaxHeight}px`);
    assertReferenceContains(
      `height:${controls.action.height}px;padding:0 ${controls.action.paddingX}px`,
    );
    assertReferenceContains(`flex:none;width:${controls.slider.blockWidth}px`);
    assertReferenceContains(`flex:none;width:${controls.input.width}px`);
  });

  it("ses satırının profil segmentini ve önizleme düğmesini korur", () => {
    const { sound } = SETTINGS_METRICS.controls;

    assertReferenceContains(
      `height:${sound.profileOptionHeight}px;padding:0 ${sound.profileOptionPaddingX}px;border:0;border-radius:${sound.profileOptionRadius}px`,
    );
    assertReferenceContains(
      `height:${sound.previewHeight}px;padding:0 ${sound.previewPaddingX}px;border:1px solid`,
    );
  });
});

describe("settings parity — hero ve diğer özel bloklar", () => {
  it("hero bloğunun banner, avatar ve halka ölçülerini korur", () => {
    const { hero } = SETTINGS_METRICS.blocks;

    assertReferenceContains(`height:${hero.bannerHeight}px;background:linear-gradient(120deg`);
    assertReferenceContains(`hint-size="${hero.avatarSize}px,${hero.avatarSize}px"`);
    assertReferenceContains(`box-shadow:0 0 0 ${hero.avatarRing}px hsl(var(--surface-card))`);
    assertReferenceContains(`margin-top:${hero.avatarRowMarginTop}px`);
    assertReferenceContains(
      `width:${hero.statusDotSize}px;height:${hero.statusDotSize}px;border-radius:50%`,
    );
    assertReferenceContains(
      `width:${hero.cameraButtonSize}px;height:${hero.cameraButtonSize}px;border:${hero.cameraButtonRing}px solid`,
    );
  });

  it("QR, kamera önizlemesi ve tema kartlarının ölçülerini korur", () => {
    const { twoFactorQr, cameraPreview, simpleThemes, themeGrid } = SETTINGS_METRICS.blocks;

    assertReferenceContains(
      `width:${twoFactorQr.size}px;height:${twoFactorQr.size}px;border-radius:${twoFactorQr.radius}px`,
    );
    assertReferenceContains(
      `width:${cameraPreview.width}px;aspect-ratio:${cameraPreview.aspectWidth}/${cameraPreview.aspectHeight};border-radius:${cameraPreview.radius}px`,
    );
    assertReferenceContains(`height:${simpleThemes.previewHeight}px`);
    assertReferenceContains(
      `width:${themeGrid.swatchSize}px;height:${themeGrid.swatchSize}px;border-radius:${themeGrid.swatchRadius}px`,
    );
  });

  it("istisna satırının düzenle ve kaldır düğmelerini korur", () => {
    const { exceptions } = SETTINGS_METRICS.blocks;

    assertReferenceContains(
      `height:${exceptions.editHeight}px;padding:0 ${exceptions.editPaddingX}px;border:1px solid`,
    );
    assertReferenceContains(
      `width:${exceptions.removeSize}px;height:${exceptions.removeSize}px;border:1px solid`,
    );
  });
});

describe("settings parity — 400 / 560 / 308 px yüzeylerin iç geometrisi", () => {
  it("panel başlığını, sekmelerini ve satırını korur", () => {
    const { panel } = SETTINGS_METRICS;

    assertReferenceContains(
      `padding:${panel.header.paddingTop}px ${panel.header.paddingX}px ${panel.header.paddingBottom}px;border-bottom:1px solid`,
    );
    assertReferenceContains(
      `min-width:${panel.header.countMinWidth}px;height:${panel.header.countHeight}px;padding:0 ${panel.header.countPaddingX}px;border-radius:${panel.header.countRadius}px`,
    );
    assertReferenceContains(
      `height:${panel.tabs.tabHeight}px;padding:0 ${panel.tabs.tabPaddingX}px;border:0;border-radius:${panel.tabs.tabRadius}px`,
    );
    assertReferenceContains(
      `padding:${panel.list.paddingTop}px ${panel.list.paddingX}px ${panel.list.paddingBottom}px`,
    );
    assertReferenceContains(
      `padding:${panel.row.paddingY}px ${panel.row.paddingX}px;border-radius:${panel.row.radius}px`,
    );
    assertReferenceContains(
      `width:${panel.row.iconSize}px;height:${panel.row.iconSize}px;border-radius:${panel.row.iconRadius}px`,
    );
    assertReferenceContains(
      `padding:${panel.footer.paddingY}px ${panel.footer.paddingX}px;border-top:1px solid`,
    );
  });

  it("bildirim ayarları penceresinin zil kutusunu ve radyo kartını korur", () => {
    const { prefsDialog } = SETTINGS_METRICS;

    assertReferenceContains(
      `width:${prefsDialog.header.bellBox}px;height:${prefsDialog.header.bellBox}px;border-radius:${prefsDialog.header.bellRadius}px`,
    );
    assertReferenceContains(
      `padding:${prefsDialog.levelCard.paddingY}px ${prefsDialog.levelCard.paddingX}px;border:1px solid`,
    );
    assertReferenceContains(
      `height:${prefsDialog.footer.doneHeight}px;padding:0 ${prefsDialog.footer.donePaddingX}px;border:0;border-radius:${prefsDialog.footer.doneRadius}px`,
    );
  });

  it("kullanıcı barı menüsünün DND kartını, çipini ve cihaz satırını korur", () => {
    const { userMenu } = SETTINGS_METRICS;

    assertReferenceContains(
      `width:${userMenu.dnd.switchWidth}px;height:${userMenu.dnd.switchHeight}px;border:0;border-radius:999px`,
    );
    assertReferenceContains(
      `height:${userMenu.dnd.chipHeight}px;padding:0 ${userMenu.dnd.chipPaddingX}px;border:1px solid`,
    );
    assertReferenceContains(
      `padding:${userMenu.devices.rowPaddingY}px ${userMenu.devices.rowPaddingX}px;border:1px solid`,
    );
    assertReferenceContains(
      `width:${userMenu.actions.iconSize}px;height:${userMenu.actions.iconSize}px;border-radius:${userMenu.actions.iconRadius}px`,
    );
    assertReferenceContains(`hint-placeholder-count="${userMenu.meter.segmentCount}"`);
  });
});

describe("settings parity — kayıt şeridi ve sapmaların HTML tarafı", () => {
  it("kirli şeridin dolgusunu korur", () => {
    const { saveBar } = SETTINGS_METRICS;

    assertReferenceContains(
      `padding:${saveBar.paddingY}px ${saveBar.paddingX}px;border-top:1px solid`,
    );
    assertReferenceContains(
      `height:${saveBar.saveHeight}px;padding:0 ${saveBar.savePaddingX}px;border:0;border-radius:${saveBar.saveRadius}px`,
    );
  });

  it("kayıtlı sapmaların referanstaki karşılığı gerçekten orada", () => {
    // #7 ölü hedef ve #9 yanlış grup: ikisi de referansın kendi verisinde durur. Sapma listesi
    // bir iddia değil, dosyadan okunabilen bir kayıt olmalı.
    assertReferenceContains("'Bildirimler › Özet', 'notif', 'ozet'");
    assertReferenceContains("'Yeni istisnalar için geçici sessize alma'");
    // #3 — segment referansta var; üründe çizilmiyor.
    assertReferenceContains("runtimes");
    // #4 — `Hareketi azalt` iki ayrı anahtarla iki kez geçiyor.
    assert.equal(reference.match(/'Hareketi azalt'/gu)?.length, 2);
    assert.equal(reference.match(/'Text-to-speech'/gu)?.length, 2);
    // #10 — not tasarımda "bu cihaza", saklama K3 gereği sunucuda. Metin korunuyor.
    assertReferenceContains("Ses ayarları bu cihaza kaydedilir.");
    // #13 — uzak WebView'deki Kaydet/Sıfırla, güvenilir Desktop Control geçişine iner.
    assertReferenceContains("'Kaydet', 'Sıfırla'");

    assert.deepEqual(
      SPEC_DEVIATIONS.map(({ field }) => field),
      [
        "themeGrid.darkLightSplit",
        "privacy.visibility.rowCount",
        "header.runtimeSegmentRendered",
        "sharedStateRowPairs.stateCount",
        "profileDirtyKeys.count",
        "level.labelSets",
        "searchIndex.source",
        "group.titleOptional",
        "exceptions.ne1Group",
        "sounds.storage",
        "desktopShortcuts.storage",
        "desktopShortcuts.remoteActions",
      ],
    );
  });
});

/**
 * Ş13 §6 — parity kapısı dört yüzeyin **tamamını** kapsar.
 *
 * Ş0 beş iddia grubuyla başladı; burada yirmi özel bloğun geometrisi, satır motorunun on üç
 * kontrol ölçüsü ve SPEC §10 kırılımlarının CSS tarafı ekleniyor.
 */
describe("settings parity — yirmi özel bloğun tamamı", () => {
  /** `SettingsBlockKey`'in yirmi değeri ↔ sözlükteki ölçü kaydı. */
  const BLOCK_METRICS: Readonly<Record<string, string>> = {
    hero: "hero",
    profileEmoji: "input",
    connections: "connections",
    secEvents: "securityEvents",
    sessions: "sessions",
    badges: "badgeGrid",
    mic: "micMeter",
    camera: "cameraPreview",
    themes: "simpleThemes",
    themeGrid: "themeGrid",
    msgPreview: "messagePreview",
    notifSummary: "notifSummary",
    exceptions: "exceptions",
    shortcuts: "shortcuts",
    perms: "permissions",
    diag: "diagnostics",
    about: "about",
    version: "versionGrid",
    whatsNew: "whatsNew",
    contributors: "contributors",
  };

  it("yirmi yuvanın yirmisinin de ölçü kaydı var", () => {
    const blocks = { ...SETTINGS_METRICS.blocks, input: SETTINGS_METRICS.controls.input } as Record<
      string,
      unknown
    >;
    const missing = Object.entries(BLOCK_METRICS)
      .filter(([, metricKey]) => blocks[metricKey] === undefined)
      .map(([blockKey]) => blockKey);

    assert.equal(Object.keys(BLOCK_METRICS).length, 20);
    assert.deepEqual(missing, []);
  });

  it("ağaçtaki her `custom` satırın blok anahtarı defterde var", () => {
    const treeBlocks = [...walkSettingsRows()]
      .map(({ row }) => row.block)
      .filter((key): key is NonNullable<typeof key> => Boolean(key));

    assert.equal(new Set(treeBlocks).size, 20);
    assert.deepEqual(
      [...new Set(treeBlocks)].filter((key) => !(key in BLOCK_METRICS)),
      [],
    );
  });

  it("blok ölçülerinin referanstaki karşılığı gerçekten orada", () => {
    const { micMeter, securityEvents, connections } = SETTINGS_METRICS.blocks;

    assertReferenceContains(
      `height:${micMeter.segmentHeight}px;border-radius:${micMeter.radius}px`,
    );
    assertReferenceContains(
      `width:${securityEvents.dotSize}px;height:${securityEvents.dotSize}px;border-radius:50%`,
    );
    assertReferenceContains(
      `width:${connections.iconSize}px;height:${connections.iconSize}px;border-radius:${connections.iconRadius}px`,
    );
  });
});

describe("settings parity — satır motorunun on üç kontrolü", () => {
  it("on üç kontrol tipinin hepsi ağaçta", () => {
    const types = new Set([...walkSettingsRows()].map(({ row }) => row.type));

    assert.deepEqual([...types].sort(), [
      "action",
      "custom",
      "input",
      "jump",
      "lockedToggle",
      "nav",
      "risky",
      "segment",
      "select",
      "slider",
      "sound",
      "textarea",
      "toggle",
    ]);
  });

  it("kaydırıcı, segment ve giriş kutusu ölçülerini korur", () => {
    const { input, segment, slider, textarea } = SETTINGS_METRICS.controls;

    assertReferenceContains(`flex:none;width:${slider.blockWidth}px`);
    assertReferenceContains(
      `height:${segment.optionHeight}px;padding:0 ${segment.optionPaddingX}px;border:0;border-radius:${segment.optionRadius}px`,
    );
    assertReferenceContains(
      `padding:${input.paddingY}px ${input.paddingX}px;border-radius:${input.radius}px`,
    );
    assertReferenceContains(
      `padding:${textarea.paddingY}px ${textarea.paddingX}px;border-radius:${textarea.radius}px;border:1px solid hsl(var(--border)/${String(textarea.borderAlpha).replace(/^0/u, "")})`,
    );
  });
});

describe("settings parity — SPEC §10 kırılımları CSS'te", () => {
  const globals = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");

  it("dört pencere kırılımı sözlükteki eşikle birebir", () => {
    const { breakpoints } = SETTINGS_METRICS.window;

    for (const width of Object.values(breakpoints)) {
      assert.ok(
        globals.includes(`@media (max-width: ${width}px)`),
        `globals.css içinde ${width}px kırılımı yok`,
      );
    }

    assert.deepEqual(Object.values(breakpoints), [1240, 1024, 860, 720]);
  });

  it("panelin `<520px` alt sayfası da CSS'te", () => {
    assert.equal(SETTINGS_METRICS.panel.sheetBreakpoint, 520);

    const sheet = globals.slice(globals.indexOf("@media (max-width: 520px)"));

    assert.ok(sheet.startsWith("@media (max-width: 520px)"));
    assert.ok(sheet.slice(0, 400).includes(".notification-panel-popover"));
  });

  it("kırılımlar JavaScript'te seçilmiyor (tuzak #10)", () => {
    for (const relative of [
      "../../components/settings/settings-window.tsx",
      "../../components/settings/settings-nav.tsx",
      "../../components/settings/settings-tab-strip.tsx",
      "../../components/notifications/notification-panel.tsx",
    ]) {
      const source = readFileSync(new URL(relative, import.meta.url), "utf8");

      assert.ok(!source.includes("matchMedia"), `${relative} matchMedia okuyor`);
      assert.ok(!source.includes("innerWidth"), `${relative} innerWidth okuyor`);
    }
  });
});

describe("settings parity — Ş13'te sözlüğe taşınan ölçüler", () => {
  it("panel ve 560 px pencerenin on iki kaydı sözlükte", () => {
    const { panel, prefsDialog, window: win } = SETTINGS_METRICS;

    assert.equal(panel.viewportMargin, 12);
    assert.equal(panel.row.iconSurfaceAlpha, 0.14);
    assert.equal(panel.row.titleTimeGap, 8);
    assert.equal(panel.empty.iconSurfaceAlpha, 0.14);
    assert.equal(panel.empty.iconBorderAlpha, 0.3);
    assert.equal(prefsDialog.body.sectionRuleAlpha, 0.5);
    assert.equal(prefsDialog.body.titlePillGap, 8);
    assert.equal(prefsDialog.body.pillSurfaceAlpha, 0.16);
    assert.equal(prefsDialog.levelCard.idleSurfaceAlpha, 0.4);
    assert.equal(prefsDialog.footer.outlineBorderAlpha, 0.8);
    assert.equal(prefsDialog.footer.saveWeight, 500);
    assert.equal(win.viewportPadding, 26);
  });

  it("taşınan sayıların bileşenlerde sabit kopyası kalmadı", () => {
    for (const relative of [
      "../../components/notifications/notification-item.tsx",
      "../../components/notifications/notification-panel.tsx",
      "../../components/notifications/notification-prefs-dialog.tsx",
    ]) {
      const source = readFileSync(new URL(relative, import.meta.url), "utf8");

      for (const name of [
        "ICON_SURFACE_ALPHA",
        "TITLE_TIME_GAP",
        "SOFT_SURFACE_ALPHA",
        "EMPTY_BORDER_ALPHA",
        "SECTION_RULE_ALPHA",
        "PILL_SURFACE_ALPHA",
        "LEVEL_IDLE_SURFACE_ALPHA",
        "OUTLINE_BUTTON_BORDER_ALPHA",
        "TITLE_PILL_GAP",
        "SAVE_WEIGHT",
      ]) {
        assert.ok(!source.includes(`const ${name} =`), `${relative} hâlâ ${name} tanımlıyor`);
      }
    }
  });
});
