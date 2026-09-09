import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildLegacySettingsHref,
  buildSettingsHref,
  DEFAULT_SETTINGS_ROUTE,
  isAdvancedAppearancePanel,
  migrateLegacySettingsQuery,
  resolveSettingsRoute,
  resolveSettingsSelection,
  SETTINGS_SECTIONS,
  SETTINGS_TABS_BY_SECTION,
  type SettingsPanelKey,
} from "./navigation";

describe("adres kurucu (K2)", () => {
  it("bölüm ve sekmeyi yol segmenti olarak yazar", () => {
    assert.equal(buildSettingsHref("account", "profile"), "/settings/account/profile");
    assert.equal(
      buildSettingsHref("notifications", "quiet-hours"),
      "/settings/notifications/quiet-hours",
    );
    assert.equal(buildSettingsHref("desktop", "updates"), "/settings/desktop/updates");
  });

  it("sekme verilmezse bölümün ilk sekmesine düşer", () => {
    for (const section of SETTINGS_SECTIONS) {
      const first = SETTINGS_TABS_BY_SECTION[section][0];

      assert.equal(buildSettingsHref(section), `/settings/${section}/${first}`);
    }
  });

  it("başka bölümün sekmesini kabul etmez", () => {
    // `theme` Görünüm'ün sekmesidir; Hesabım'a verilirse adres var olmayan bir sayfayı gösterir.
    assert.equal(buildSettingsHref("account", "theme"), "/settings/account/profile");
  });
});

describe("rota çözücü", () => {
  it("27 sekmenin hepsini kendi bölümünde çözer", () => {
    let resolved = 0;

    for (const section of SETTINGS_SECTIONS) {
      for (const tab of SETTINGS_TABS_BY_SECTION[section]) {
        assert.deepEqual(resolveSettingsRoute(section, tab), { section, tab });
        resolved += 1;
      }
    }

    assert.equal(resolved, 27);
  });

  it("geçersiz bölüm varsayılana düşer", () => {
    assert.deepEqual(resolveSettingsRoute("voice", "audio"), DEFAULT_SETTINGS_ROUTE);
    assert.deepEqual(resolveSettingsRoute(undefined, undefined), DEFAULT_SETTINGS_ROUTE);
    assert.deepEqual(resolveSettingsRoute(null, null), DEFAULT_SETTINGS_ROUTE);
  });

  it("geçersiz sekme bölümün ilk sekmesine düşer, 404'e değil", () => {
    assert.deepEqual(resolveSettingsRoute("notifications", "ozet"), {
      section: "notifications",
      tab: "general",
    });
    assert.deepEqual(resolveSettingsRoute("about", "whatsNew"), {
      section: "about",
      tab: "about",
    });
  });
});

describe("eski sorgu göçü", () => {
  /** Eski `SettingsPanelKey`'in **on dokuz** değeri. Hiçbiri eşleşmeden kalmamalı. */
  const LEGACY_PANELS: Record<SettingsPanelKey, string> = {
    badges: "/settings/account/badges",
    audio: "/settings/av/audio",
    camera: "/settings/av/camera",
    screenShare: "/settings/av/screen-share",
    language: "/settings/account/privacy",
    theme: "/settings/appearance/theme",
    messageFont: "/settings/appearance/text",
    advanced: "/settings/appearance/layout",
    appIcon: "/settings/appearance/layout",
    general: "/settings/notifications/general",
    sounds: "/settings/notifications/sounds",
    desktopBehavior: "/settings/desktop/app",
    desktopVoice: "/settings/desktop/shortcuts",
    desktopDiagnostics: "/settings/desktop/updates",
    overview: "/settings/about/about",
    build: "/settings/about/about",
    whatsNew: "/settings/about/about",
    desktop: "/settings/desktop/updates",
    developer: "/settings/about/about",
  };

  it("on dokuz eski panelin hepsini eşler", () => {
    assert.equal(Object.keys(LEGACY_PANELS).length, 19);

    for (const [panel, href] of Object.entries(LEGACY_PANELS)) {
      assert.equal(
        migrateLegacySettingsQuery(new URLSearchParams({ panel })),
        href,
        `panel=${panel}`,
      );
    }
  });

  it("eski özel dalı korur: `?section=about&panel=desktop`", () => {
    // Eski kodda bu ikili Hakkında'ya değil Masaüstü tanılamasına gidiyordu. Bölüme bakan bir
    // çeviri onu sessizce Hakkında'ya yollardı.
    assert.equal(
      migrateLegacySettingsQuery(new URLSearchParams({ panel: "desktop", section: "about" })),
      "/settings/desktop/updates",
    );
  });

  it("panelsiz bölümleri de eşler", () => {
    assert.equal(migrateLegacySettingsQuery(new URLSearchParams()), null);
    assert.equal(
      migrateLegacySettingsQuery(new URLSearchParams({ section: "voice" })),
      "/settings/av/audio",
    );
    assert.equal(
      migrateLegacySettingsQuery(new URLSearchParams({ section: "notifications" })),
      "/settings/notifications/general",
    );
    assert.equal(
      migrateLegacySettingsQuery(new URLSearchParams({ section: "about" })),
      "/settings/about/about",
    );
  });

  it("tanımadığı değeri uydurmaz", () => {
    assert.equal(migrateLegacySettingsQuery(new URLSearchParams({ panel: "ozet" })), null);
    assert.equal(migrateLegacySettingsQuery(new URLSearchParams({ section: "billing" })), null);
  });
});

describe("eski yüzey Ş13'e kadar ayakta", () => {
  it("eski adres kurucusu sorgu biçimini korur", () => {
    assert.equal(buildLegacySettingsHref("account"), "/settings");
    assert.equal(buildLegacySettingsHref("account", "badges"), "/settings?panel=badges");
    assert.equal(
      buildLegacySettingsHref("appearance", "theme"),
      "/settings?section=appearance&panel=theme",
    );
  });

  it("eski seçim çözücüsü aynı cevabı veriyor", () => {
    const params = new URLSearchParams({ section: "about", panel: "desktop" });

    assert.deepEqual(resolveSettingsSelection(params), {
      panel: "desktopDiagnostics",
      section: "desktop",
    });
    assert.deepEqual(resolveSettingsSelection(new URLSearchParams()), {
      panel: null,
      section: "account",
    });
    assert.equal(isAdvancedAppearancePanel("appIcon"), true);
    assert.equal(isAdvancedAppearancePanel("theme"), false);
  });
});
