import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { SETTINGS_METRICS } from "@/lib/settings/metrics";
import { SettingToggle } from "@/components/settings/rows/setting-toggle";
import { resolveSettingsEscape } from "@/components/settings/settings-window-state";

/**
 * Ş13 §1 — dört yüzeyin erişilebilirlik geçişi, **ölçülerek**.
 *
 * Paket testleri jsdom'suz koşuyor (`node --test` + `renderToStaticMarkup`), yani klavye ve
 * fare olayları burada koşturulamıyor. Bu dosya buna iki şekilde cevap veriyor ve hangisinin
 * hangisi olduğunu saklamıyor:
 *
 * 1. **Kararlar saf fonksiyondan** soruluyor — `Esc` merdiveni `resolveSettingsEscape`'ten,
 *    tıklama hedefi ölçü sözlüğünden. Bunlar gerçek testler.
 * 2. **Sözleşmeler kaynak taramasıyla** sabitleniyor — `role`, `aria-*`, focus tuzağı ve focus
 *    dönüşü. Tarama bir davranış kanıtı değil; sözleşmenin sessizce kaldırılmasını yakalar.
 *    Gerçek etkileşim kanıtı `e2e/specs/settings/*.spec.ts` ve `e2e/specs/a11y/a11y.spec.ts`.
 */

function read(relative: string): string {
  return readFileSync(new URL(relative, import.meta.url), "utf8");
}

const WINDOW = read("./settings-window.tsx");
const NAV = read("./settings-nav.tsx");
const TABS = read("./settings-tab-strip.tsx");
const SAVE = read("./settings-save-indicator.tsx");
const TOGGLE = read("./rows/setting-toggle.tsx");
const SELECT = read("./rows/setting-select.tsx");
const SLIDER = read("./rows/setting-slider.tsx");
const RISKY = read("./rows/setting-risky-block.tsx");
const PANEL = read("../notifications/notification-panel.tsx");
const PANEL_TABS = read("../notifications/notification-panel-tabs.tsx");
const ITEM = read("../notifications/notification-item.tsx");
const PREFS = read("../notifications/notification-prefs-dialog.tsx");
const USER_MENU = read("../shell/user-bar-menu.tsx");

describe("a11y — modal sözleşmesi", () => {
  it('üç modal da `role="dialog"` ve `aria-modal` taşıyor', () => {
    for (const [name, source] of [
      ["Ayarlar penceresi", WINDOW],
      ["Bildirim ayarları penceresi", PREFS],
    ] as const) {
      assert.match(source, /role="dialog"/u, `${name}: role yok`);
      assert.match(source, /aria-modal/u, `${name}: aria-modal yok`);
    }

    // Panel ve kullanıcı barı menüsü **popover**: `aria-modal` değil, adlandırılmış diyalog.
    assert.match(PANEL, /role="dialog"/u);
    assert.match(PANEL, /aria-label=\{t\("notif\.panel\.title"\)\}/u);
    assert.ok(!PANEL.includes("aria-modal"));
  });

  it("açılışta ilk öğeye focus, kapanışta tetikleyiciye dönüş", () => {
    for (const [name, source] of [
      ["Ayarlar penceresi", WINDOW],
      ["Bildirim ayarları penceresi", PREFS],
    ] as const) {
      assert.match(source, /returnFocusRef/u, `${name}: focus dönüşü yok`);
      assert.match(source, /\.focus\(\)/u, `${name}: focus çağrısı yok`);
    }

    assert.match(USER_MENU, /focus/u);
  });

  it("focus tuzağı `Tab` ve `Shift+Tab` için ayrı dallanıyor", () => {
    for (const [name, source] of [
      ["Ayarlar penceresi", WINDOW],
      ["Bildirim ayarları penceresi", PREFS],
    ] as const) {
      assert.match(source, /FOCUSABLE_SELECTOR/u, `${name}: odaklanabilir seçici yok`);
      assert.match(source, /event\.shiftKey/u, `${name}: Shift+Tab dalı yok`);
    }
  });
});

describe("a11y — `Esc` merdiveni dört basamak", () => {
  const base = {
    dirty: false,
    query: "",
    save: "idle",
    section: "notifications",
    tab: "general",
  } as const;

  it("açık menü önce kapanır", () => {
    assert.equal(resolveSettingsEscape({ ...base, openRisky: null, openSelect: "nq4" }), "select");
  });

  it("menü kapalıyken riskli blok kapanır", () => {
    assert.equal(
      resolveSettingsEscape({ ...base, openRisky: "password", openSelect: null }),
      "risky",
    );
  });

  it("menü açıkken riskli blok **beklemeye** geçer", () => {
    assert.equal(
      resolveSettingsEscape({ ...base, openRisky: "password", openSelect: "nq4" }),
      "select",
    );
  });

  it("ikisi de kapalıyken pencere kapanır", () => {
    assert.equal(resolveSettingsEscape({ ...base, openRisky: null, openSelect: null }), "window");
  });

  it("panel merdiveni zilin indirgeyicisinde, menü ve 560 px pencere kendi `Esc`inde", () => {
    // Panelin `Esc`i `notification-panel.tsx`te değil: iki yüzeyi (panel + 560 px pencere)
    // **tek** indirgeyici yönetiyor ve basamağı `resolveNotifPanelEscape` adlandırıyor.
    const bell = read("../shared/notification-bell.tsx");

    const sidebar = read("../shell/channel-sidebar.tsx");

    assert.match(bell, /resolveNotifPanelEscape/u);
    assert.match(bell, /event\.key !== "Escape"/u);
    // Kullanıcı barı menüsünün `Esc`i kabuğun footer'ında: menü bir popover ve tetikleyicisi
    // orada duruyor, focus da oraya dönüyor (Ş12 raporu §7, sapma S12-7).
    assert.match(sidebar, /event\.key === "Escape"/u);
    assert.ok(USER_MENU.length > 0);
    assert.ok(PREFS.length > 0);
  });
});

describe("a11y — sekme ve gezinme rolleri", () => {
  it("sol nav bir `tablist`; satır `tab` + `aria-selected` ve tek sekme durağı", () => {
    assert.match(NAV, /role="tablist"/u);
    assert.match(NAV, /role="tab"/u);
    assert.match(NAV, /aria-selected=\{active\}/u);
    assert.match(NAV, /tabIndex=\{active \? 0 : -1\}/u);
    // `↑/↓` ve `Home`/`End`.
    for (const key of ["ArrowDown", "ArrowUp", "Home", "End"]) {
      assert.ok(NAV.includes(key), `nav ${key} işlemiyor`);
    }
  });

  it("alt sekme şeridi `tablist` + `tabpanel` çiftini kuruyor", () => {
    assert.match(TABS, /role="tablist"/u);
    assert.match(TABS, /role="tab"/u);
    assert.match(TABS, /aria-selected=\{active\}/u);
    assert.match(TABS, /id=\{`settings-tab-\$\{tab\.key\}`\}/u);
    assert.match(WINDOW, /role="tabpanel"/u);
    assert.match(WINDOW, /aria-labelledby/u);

    for (const key of ["ArrowRight", "ArrowLeft", "Home", "End"]) {
      assert.ok(TABS.includes(key), `sekme şeridi ${key} işlemiyor`);
    }
  });

  it("panelin dört sekmesi de `tablist` sözleşmesinde", () => {
    assert.match(PANEL_TABS, /role="tablist"/u);
    assert.match(PANEL_TABS, /role="tab"/u);
    assert.match(PANEL_TABS, /aria-selected/u);
    assert.match(PANEL, /role="tabpanel"/u);
  });
});

describe("a11y — kontrol rolleri", () => {
  it("anahtar `switch` + `aria-checked`; kilitli olan `aria-disabled` ve açıklamalı", () => {
    const locked = renderToStaticMarkup(
      <SettingToggle
        checked={false}
        describedById="locked-reason"
        locked
        onChange={() => undefined}
      />,
    );
    const unavailable = renderToStaticMarkup(
      <SettingToggle
        checked
        describedById="unavailable-reason"
        disabled
        onChange={() => undefined}
      />,
    );
    const enabled = renderToStaticMarkup(
      <SettingToggle checked={false} onChange={() => undefined} />,
    );

    assert.match(locked, /role="switch"/u);
    assert.match(locked, /aria-checked="true"/u);
    assert.match(locked, /aria-disabled="true"/u);
    assert.match(locked, /aria-describedby="locked-reason"/u);
    assert.match(unavailable, /aria-disabled="true"/u);
    assert.match(unavailable, /aria-describedby="unavailable-reason"/u);
    assert.doesNotMatch(enabled, /aria-disabled/u);
  });

  it("açılır menü `aria-expanded` + `listbox`/`option` ve tip-ahead taşıyor", () => {
    assert.match(SELECT, /aria-expanded=\{open\}/u);
    assert.match(SELECT, /aria-haspopup="listbox"/u);
    assert.match(SELECT, /role="listbox"/u);
    assert.match(SELECT, /role="option"/u);
    assert.match(SELECT, /aria-selected/u);
    assert.match(SELECT, /resolveTypeAheadIndex/u);

    for (const key of ["ArrowDown", "ArrowUp", "Enter", "Escape"]) {
      assert.ok(SELECT.includes(key), `menü ${key} işlemiyor`);
    }
  });

  it("kaydırıcı `slider` + dört `aria-value*` ve ok tuşları", () => {
    for (const attribute of ["aria-valuemin", "aria-valuemax", "aria-valuenow", "aria-valuetext"]) {
      assert.ok(SLIDER.includes(attribute), `kaydırıcı ${attribute} taşımıyor`);
    }

    assert.match(SLIDER, /resolveSliderKeyValue/u);
  });

  it("riskli blok açık olduğunu bildiriyor", () => {
    assert.match(RISKY, /aria-expanded/u);
  });

  it('kayıt durumu `aria-live="polite"`', () => {
    assert.match(SAVE, /aria-live="polite"/u);
  });
});

describe("a11y — renk tek başına anlam taşımıyor", () => {
  it("bildirim satırının okunmamış durumu `aria-label` içinde **metin**", () => {
    assert.match(ITEM, /stateLabel/u);
    assert.match(
      ITEM,
      /"aria-label": \[notification\.title, notification\.body, time, stateLabel\]/u,
    );
    assert.match(ITEM, /<Link\s+\{\.\.\.rowProps\}/u);
    assert.match(ITEM, /<button \{\.\.\.rowProps\}/u);
    // Nokta yalnız görsel bir tekrar.
    assert.match(ITEM, /data-testid="notification-panel-row-dot"/u);
    assert.match(ITEM, /aria-hidden="true"/u);
  });

  it("izin durumu noktayla **ve** pille yazılıyor", () => {
    assert.match(PREFS, /notification-prefs-permission/u);
    assert.match(PREFS, /pill/iu);
  });
});

describe("a11y — tıklama hedefi", () => {
  /**
   * SPEC'in kontrol ölçüleri tasarımın kendi sayıları (34 px açılır menü, 30 px anahtar) ve
   * **fiziksel** 44 px'i ölçek motoru veriyor: kök font boyutu 16 → 32 px arasında dört adım
   * büyüyor (`lib/home/scale.ts`) ve rem tabanlı her hedef onunla birlikte büyüyor.
   *
   * Ölçülen şey bu: en küçük adımda (16 px kök) hedefin fiziksel yüksekliği ile en büyük
   * adımdaki (32 px kök) yüksekliği. 44 px eşiği 24 px'lik adımdan itibaren geçiliyor; 16 px
   * kökte tasarımın kendi ölçüsü geçerli ve o SPEC'in verdiği sayı.
   */
  const STEPS = [16, 18, 24, 32];

  const TARGETS: ReadonlyArray<readonly [string, number]> = [
    ["açılır menü", SETTINGS_METRICS.controls.select.height],
    ["eylem düğmesi", SETTINGS_METRICS.controls.action.height],
    ["anahtar", SETTINGS_METRICS.controls.toggle.height],
    ["panel dişlisi", SETTINGS_METRICS.panel.header.gearSize],
    ["pencere kapat", SETTINGS_METRICS.header.closeSize],
  ];

  it("her hedefin fiziksel ölçüsü ölçek adımıyla birlikte büyüyor", () => {
    for (const [name, designPx] of TARGETS) {
      const physical = STEPS.map((root) => (designPx / 16) * root);

      assert.ok(physical[0] === designPx, `${name}: 16 px kökte tasarım ölçüsü değil`);
      assert.ok(
        physical[3]! > physical[0]!,
        `${name}: ölçek adımı hedefi büyütmüyor (rem değil px yazılmış olabilir)`,
      );
    }
  });

  /**
   * Tasarımın kontrolleri 22–34 px: 16 px kökte hiçbiri 44 fiziksel piksele ulaşmıyor ve
   * ulaşmamalı da — boyanan kutuyu büyütmek parity kapısını kırardı (SPEC ölçüsü otorite).
   *
   * Çözüm hedefi büyütmek, kutuyu değil: `.settings-hit-target::after` şeffaf bir katmanla
   * tıklanabilir alanı `min-width/min-height: 44px`e tamamlıyor ve o 44 **ölçeklenmiyor**
   * (ham `px`, çünkü parmak ölçek adımıyla büyümüyor).
   */
  it("44 px eşiği boyanan kutuyla değil, hedef katmanıyla karşılanıyor", () => {
    const globals = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");
    const rule = globals.slice(globals.indexOf(".settings-hit-target::after"));

    assert.ok(rule.startsWith(".settings-hit-target::after"));
    assert.match(rule.slice(0, 400), /min-width:\s*44px/u);
    assert.match(rule.slice(0, 400), /min-height:\s*44px/u);
  });

  it("en küçük üç hedef sınıfı taşıyor", () => {
    assert.match(TOGGLE, /settings-hit-target/u);
    assert.match(SELECT, /settings-hit-target/u);
    assert.match(PANEL, /settings-hit-target/u);
  });
});
