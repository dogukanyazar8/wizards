import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { DesktopPermissions } from "@wizards/types";

import { LocaleProvider } from "@/components/providers/locale-provider";
import {
  DiagnosticsBlock,
  buildDesktopDiagnosticRows,
} from "@/components/settings/blocks/diagnostics-block";
import { PermissionsBlock } from "@/components/settings/blocks/permissions-block";
import { ShortcutsBlock } from "@/components/settings/blocks/shortcuts-block";
import {
  VersionGridBlock,
  buildVersionGridRows,
} from "@/components/settings/blocks/version-grid-block";
import {
  ContributorsBlock,
  resolveContributorRole,
} from "@/components/settings/blocks/contributors-block";
import { AboutCardBlock } from "@/components/settings/blocks/about-card-block";
import { WhatsNewBlock } from "@/components/settings/blocks/whats-new-block";
import {
  DesktopSettingsContext,
  UNKNOWN_DESKTOP_SETTINGS,
  type DesktopSettingsValue,
} from "@/components/settings/sections/desktop/desktop-settings-context";
import { getMessagesForLocale } from "@/lib/locale";
import {
  mergeDesktopShortcutStatus,
  DEFAULT_DESKTOP_SHORTCUT_ASSIGNMENTS,
} from "@/lib/desktop/shortcuts";
import type { SettingsRowDef } from "@/lib/settings/tree";

/** Ş10 — Masaüstü ve Hakkında blokları. */

const messages = getMessagesForLocale("tr");

const ROW: SettingsRowDef = { block: "perms", key: "j1", type: "custom" };

/**
 * Bloklar **element** olarak çizilir, fonksiyon olarak çağrılmaz: `Block({...})` kancaları
 * React'in dışında çalıştırır ve `useContext` boş bir dispatcher'a düşer.
 */
function renderBlock(
  Block: React.ComponentType<{
    data: Readonly<Record<string, string>>;
    row: SettingsRowDef;
  }>,
  overrides: Partial<DesktopSettingsValue> = {},
): string {
  const value: DesktopSettingsValue = { ...UNKNOWN_DESKTOP_SETTINGS, ...overrides };

  return renderToStaticMarkup(
    <LocaleProvider initialLocale="tr" initialMessages={messages}>
      <DesktopSettingsContext.Provider value={value}>
        <Block data={{}} row={ROW} />
      </DesktopSettingsContext.Provider>
    </LocaleProvider>,
  );
}

const PERMISSIONS: DesktopPermissions = {
  camera: "prompt",
  globalShortcuts: "unknown",
  microphone: "granted",
  notifications: "denied",
  screenShare: "prompt",
};

describe("PermissionsBlock — beş satır, üç durum", () => {
  it("beş izin satırının hepsi çizilir", () => {
    const markup = renderBlock(PermissionsBlock, { permissions: PERMISSIONS });

    for (const key of ["notifications", "microphone", "camera", "screenShare", "globalShortcuts"]) {
      assert.ok(markup.includes(`data-permission="${key}"`), `${key} satırı yok`);
    }
  });

  it("durum renkle değil metinle de yazılır", () => {
    const markup = renderBlock(PermissionsBlock, { permissions: PERMISSIONS });

    assert.ok(markup.includes("İzin verildi"));
    assert.ok(markup.includes("Engellendi"));
    assert.ok(markup.includes("Doğrulanamadı"));
  });

  it("sorgulanamayan global kısayol izni `Doğrulanamadı` çizer", () => {
    const markup = renderBlock(PermissionsBlock, { permissions: PERMISSIONS });
    const row = markup.slice(markup.indexOf('data-permission="globalShortcuts"'));

    assert.ok(row.includes("Doğrulanamadı"));
    assert.ok(row.includes("settings-permission-globalShortcuts-manageShortcuts"));
    assert.ok(row.includes("settings-permission-globalShortcuts-recheck"));
  });

  it("ekran paylaşımı sahte izin isteği yerine seçici testi sunar", () => {
    const markup = renderBlock(PermissionsBlock, { permissions: PERMISSIONS });
    const row = markup.slice(
      markup.indexOf('data-permission="screenShare"'),
      markup.indexOf('data-permission="globalShortcuts"'),
    );

    assert.ok(row.includes("settings-permission-screenShare-testScreenShare"));
    assert.equal(row.includes("settings-permission-screenShare-request"), false);
  });

  it("engellenen satır sistem ayarları ile kontrol düğmesini birlikte çizer", () => {
    const markup = renderBlock(PermissionsBlock, { permissions: PERMISSIONS });
    const row = markup.slice(markup.indexOf('data-permission="notifications"'));

    assert.ok(row.includes("settings-permission-notifications-openSystem"));
    assert.ok(row.includes("settings-permission-notifications-recheck"));
  });

  it("izin verilmiş satırda `Kontrol et` yok", () => {
    const markup = renderBlock(PermissionsBlock, { permissions: PERMISSIONS });
    const row = markup.slice(
      markup.indexOf('data-permission="microphone"'),
      markup.indexOf('data-permission="camera"'),
    );

    assert.ok(row.includes("settings-permission-microphone-openSystem"));
    assert.equal(row.includes("settings-permission-microphone-recheck"), false);
  });

  it("ekran paylaşımı yardım metni macOS dışında değişir", () => {
    const mac = renderBlock(PermissionsBlock, { permissions: PERMISSIONS, platform: "macos" });
    const windows = renderBlock(PermissionsBlock, {
      permissions: PERMISSIONS,
      platform: "windows",
    });

    assert.ok(mac.includes("macOS ekran kaydı izni açık."));
    assert.equal(windows.includes("macOS ekran kaydı izni açık."), false);
  });

  it("Windows global kısayol satırı olmayan erişilebilirlik iznini istemez", () => {
    const markup = renderBlock(PermissionsBlock, {
      permissions: PERMISSIONS,
      platform: "windows",
    });
    const row = markup.slice(markup.indexOf('data-permission="globalShortcuts"'));

    assert.ok(row.includes("Windows’ta ayrı bir izin gerekmez"));
    assert.equal(row.includes("Erişilebilirlik izni verilmemiş olabilir"), false);
  });
});

describe("ShortcutsBlock — beş eylem", () => {
  const shortcuts = mergeDesktopShortcutStatus(
    DEFAULT_DESKTOP_SHORTCUT_ASSIGNMENTS,
    // Kabuk kendi eylem adlarını konuşuyor (`hideGameOverlay`), sözleşme kendi adlarını
    // (`hideOverlay`); eşleme `mergeDesktopShortcutStatus` içinde.
    [
      { action: "hideGameOverlay", conflict: true, keys: ["Alt", "H"], registered: false },
      { action: "toggleMute", conflict: false, keys: ["Alt", "M"], registered: true },
    ],
    true,
  );

  it("beş satır çizilir", () => {
    const markup = renderBlock(ShortcutsBlock, { shortcuts });

    for (const action of [
      "toggleMute",
      "toggleDeafen",
      "pushToTalk",
      "hideOverlay",
      "moderationConsole",
    ]) {
      assert.ok(markup.includes(`data-testid="settings-shortcut-${action}"`), `${action} yok`);
    }
  });

  it("çakışan satır danger durumunda ve metinle işaretli", () => {
    const markup = renderBlock(ShortcutsBlock, { conflictCount: 1, shortcuts });

    // Tek satır çakışmalı; nitelik sırası değil sayısı sabittir.
    assert.equal(markup.split('data-conflict="true"').length - 1, 1);
    assert.equal(markup.split("Başka bir uygulamayla çakışıyor").length - 1, 1);
    assert.ok(markup.includes("hsl(var(--danger)"));

    const row = markup.slice(markup.indexOf('data-testid="settings-shortcut-hideOverlay"'));

    assert.ok(row.includes("Başka bir uygulamayla çakışıyor"));
  });

  it("çakışmayan satır danger zemini almaz", () => {
    const markup = renderBlock(ShortcutsBlock, { shortcuts });
    const row = markup.slice(
      markup.indexOf('data-testid="settings-shortcut-toggleMute"'),
      markup.indexOf('data-testid="settings-shortcut-toggleDeafen"'),
    );

    assert.equal(row.includes("data-conflict"), false);
    assert.ok(row.includes("Başka bir uygulamayla çakışıyor") === false);
  });

  it("her satırda güvenilir kısayol yöneticisini açan düğme var", () => {
    const markup = renderBlock(ShortcutsBlock, { shortcuts });

    assert.equal(markup.split("settings-shortcut-rebind-").length - 1, 5);
    assert.equal(markup.includes("Tuş bekleniyor"), false);
  });

  it("uygulama içi kısayol yardımını platform etiketiyle görünür kılar", () => {
    const markup = renderBlock(ShortcutsBlock, { shortcuts });

    assert.ok(markup.includes('data-testid="settings-shortcut-help"'));
    assert.ok(markup.includes("Uygulama içi kısayollar"));
    assert.ok(markup.includes("Ctrl+/"));
  });
});

describe("DiagnosticsBlock — İzinler ve Kısayollar ile aynı kaynak", () => {
  const value: DesktopSettingsValue = {
    ...UNKNOWN_DESKTOP_SETTINGS,
    conflictCount: 2,
    permissions: PERMISSIONS,
    shortcutsEnabled: true,
  };

  it("on satır çizilir", () => {
    const rows = buildDesktopDiagnosticRows(value, (key) => key);

    assert.equal(rows.length, 10);
  });

  it("bildirim izni satırı İzinler sekmesiyle aynı durumu gösterir", () => {
    const rows = buildDesktopDiagnosticRows(value, (key) => key);
    const row = rows.find((entry) => entry.key === "notificationPermission");

    // İzin `denied`; ızgara da `Engellendi` demeli, kendi ikinci sorgusunu kurmamalı.
    assert.equal(row?.value, "settings.block.perms.status.blocked");
    assert.equal(row?.tone, "danger");
  });

  it("kısayol satırı gerçek çakışma sayısını taşır", () => {
    const rows = buildDesktopDiagnosticRows(value, (key, values) =>
      values ? `${key}:${values.count}` : key,
    );
    const row = rows.find((entry) => entry.key === "shortcuts");

    assert.equal(row?.value, "settings.block.shortcuts.conflictCount:2");
    assert.equal(row?.tone, "warning");
  });

  it("kısayollar kapalıyken çakışma iddia edilmez", () => {
    const rows = buildDesktopDiagnosticRows(
      { ...value, conflictCount: 0, shortcutsEnabled: false },
      (key) => key,
    );
    const row = rows.find((entry) => entry.key === "shortcuts");

    assert.equal(row?.value, "settings.block.diag.value.shortcutsOff");
    assert.equal(row?.tone, "muted");
  });

  it("yükleniyorken hücreler değer uydurmaz", () => {
    const markup = renderBlock(DiagnosticsBlock, { ...value, loading: true });

    assert.ok(markup.includes('aria-busy="true"'));
    assert.equal(markup.includes("settings.block.perms.status.blocked"), false);
  });
});

describe("VersionGridBlock — sekiz satır", () => {
  it("web'de masaüstü satırları gizlenmez, `—` gösterir", () => {
    const rows = buildVersionGridRows(UNKNOWN_DESKTOP_SETTINGS, () => "—");

    assert.equal(rows.length, 8);
    assert.ok(rows.some((row) => row.key === "desktopVersion"));
    assert.ok(rows.some((row) => row.key === "releaseRing"));
    assert.equal(rows.find((row) => row.key === "desktopVersion")?.value, "—");
  });

  it("kabuk varken gerçek sürüm okunur", () => {
    const markup = renderBlock(VersionGridBlock, {
      appInfo: {
        appVersion: "2.4.1",
        buildTime: "",
        releaseRing: "beta",
        tauriVersion: "2.0.0",
        updaterEnabled: true,
        webviewVersion: "120",
      },
    });

    assert.ok(markup.includes("2.4.1"));
    assert.ok(markup.includes("beta"));
  });
});

describe("AboutCardBlock — dört bağlantı", () => {
  it("gerçek hedeflere gider", () => {
    const markup = renderBlock(AboutCardBlock);

    assert.ok(markup.includes('href="/privacy"'));
    assert.ok(markup.includes('href="/terms"'));
    assert.ok(markup.includes('href="/"'));
  });

  it("karşılığı olmayan bağlantı uydurulmaz", () => {
    const markup = renderBlock(AboutCardBlock);

    // Tek bağlantı hedefsiz; `href` taşımayan bir `<a>` hiç çizilmez.
    assert.equal(markup.split('data-unavailable="true"').length - 1, 1);
    assert.ok(markup.includes('aria-disabled="true"'));
    assert.equal(markup.includes('<a href="/licenses"'), false);
  });
});

describe("WhatsNewBlock — üç kart", () => {
  it("Bildirimler · Etkinlikler · Keşfet", () => {
    const markup = renderBlock(WhatsNewBlock);

    assert.ok(markup.includes('data-whats-new="1"'));
    assert.ok(markup.includes('data-whats-new="2"'));
    assert.ok(markup.includes('data-whats-new="3"'));
    assert.equal(markup.includes('data-whats-new="4"'), false);
  });

  it("tür rozetlerinden sonraki içerikleri ortak dikey eksende hizalar", () => {
    const markup = renderBlock(WhatsNewBlock);

    assert.ok(markup.includes("grid-template-columns:max-content minmax(0,1fr)"));
    assert.equal(markup.match(/grid-template-columns:subgrid/gu)?.length, 3);
  });
});

describe("ContributorsBlock — türetilmiş roller", () => {
  it("geliştirici · öne çıkan · katkıcı", () => {
    assert.equal(resolveContributorRole("Ada", "Ada", "Grace"), "developer");
    assert.equal(resolveContributorRole("Grace", "Ada", "Grace"), "featured");
    assert.equal(resolveContributorRole("Linus", "Ada", "Grace"), "contributor");
  });

  it("öne çıkan katkıcı bilinmiyorsa kimse öyle işaretlenmez", () => {
    assert.equal(resolveContributorRole("Grace", "Ada", null), "contributor");
  });

  it("satırlar rol pilleriyle çizilir", () => {
    const markup = renderBlock(ContributorsBlock, {
      buildInfo: {
        buildId: "4812",
        buildTime: "",
        contributors: ["Ada", "Grace", "Linus"],
        developerName: "Ada",
        featuredContributor: "Grace",
        lastUpdated: "",
        notes: [],
        releaseChannel: "stable",
        version: "2.4.1",
      },
      featuredContributor: "Grace",
    });

    assert.ok(markup.includes('data-contributor-role="developer"'));
    assert.ok(markup.includes('data-contributor-role="featured"'));
    assert.ok(markup.includes('data-contributor-role="contributor"'));
    assert.ok(markup.includes("Geliştirici"));
    assert.ok(markup.includes("Katkıcı"));
  });
});
