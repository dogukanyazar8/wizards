import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { SETTINGS_METRICS, pxToRem } from "@/lib/settings/metrics";
import {
  SETTINGS_TABS_BY_SECTION,
  buildSettingsHref,
  migrateLegacySettingsQuery,
  resolveSettingsRoute,
  type SettingsSection,
} from "@/lib/settings/navigation";

/**
 * Kabuğun **kaynak sözleşmesi** — Ş5.
 *
 * Pencerenin kendisi `useRouter` istiyor ve sunucuda çizilemez (`mentions-page.test.ts` aynı
 * duvara çarpıyor). Kırılabilecek olan ve burada ölçülen şey davranışın kendisi değil, onu
 * mümkün kılan kurulum: rota dosyalarının varlığı, yakalayıcı yuvanın yeri, kırılımların
 * CSS'te oluşu ve sabit 850 ms'in kodda olmayışı.
 */

const settingsDirectory = dirname(fileURLToPath(import.meta.url));
const webSource = join(settingsDirectory, "..", "..");

function read(...segments: string[]): string {
  return readFileSync(join(webSource, ...segments), "utf8");
}

function exists(...segments: string[]): boolean {
  try {
    read(...segments);
    return true;
  } catch {
    return false;
  }
}

/**
 * Yorumları düşürür. Kural "kodda yok" der, "hiç yazılmasın" demez: sabit 850 ms'in **neden**
 * taklit edilmediği bu dosyaların doküman blokunda yazıyor ve orada durması gerekiyor.
 */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//gu, "").replace(/(^|[^:])\/\/.*/gu, "$1");
}

const windowSource = read("components", "settings", "settings-window.tsx");
const windowCode = code(windowSource);
const globalsSource = read("app", "globals.css");

describe("Ayarlar rotası (K2)", () => {
  it("owns both surfaces: the real route and the intercepting slot", () => {
    assert.ok(exists("app", "settings", "[section]", "[tab]", "page.tsx"));
    assert.ok(exists("app", "(main)", "@modal", "(.)settings", "[section]", "[tab]", "page.tsx"));
    assert.ok(exists("app", "(main)", "@modal", "default.tsx"));
  });

  it("renders the same window in two modes", () => {
    assert.match(read("app", "settings", "[section]", "[tab]", "page.tsx"), /mode="page"/u);
    assert.match(
      read("app", "(main)", "@modal", "(.)settings", "[section]", "[tab]", "page.tsx"),
      /mode="modal"/u,
    );
  });

  it("consumes the `@modal` slot from the shell layout", () => {
    const layout = read("app", "(main)", "layout.tsx");

    assert.match(layout, /modal,/u);
    assert.match(layout, /\{modal\}/u);
  });

  it("drops the legacy `/settings/appearance` page", () => {
    assert.equal(exists("app", "settings", "appearance", "page.tsx"), false);
  });

  it("migrates the legacy query permanently instead of rendering a panel", () => {
    const page = read("app", "settings", "page.tsx");

    assert.match(page, /migrateLegacySettingsQuery/u);
    assert.match(page, /permanentRedirect/u);
    assert.doesNotMatch(page, /SettingsPanel/u);
  });

  it("lands every one of the nineteen legacy panels on a route the tree can draw", () => {
    const legacyPanels = [
      "badges",
      "audio",
      "camera",
      "screenShare",
      "language",
      "theme",
      "messageFont",
      "advanced",
      "appIcon",
      "general",
      "sounds",
      "desktopBehavior",
      "desktopVoice",
      "desktopDiagnostics",
      "overview",
      "build",
      "whatsNew",
      "desktop",
      "developer",
    ];

    assert.equal(legacyPanels.length, 19);

    for (const panel of legacyPanels) {
      const href = migrateLegacySettingsQuery(new URLSearchParams(`panel=${panel}`));

      assert.ok(href, `panel=${panel} must migrate`);

      const [, , section, tab] = href.split("/");
      const route = resolveSettingsRoute(section, tab);

      // Göç ettiği adres **çizilebilir** olmalı: bölüm doğru, sekme o bölümün gerçek sekmesi.
      assert.equal(buildSettingsHref(route.section, route.tab), href, `panel=${panel} → ${href}`);
      assert.ok(
        SETTINGS_TABS_BY_SECTION[section as SettingsSection].includes(route.tab),
        `panel=${panel} lands on a tab its section does not carry`,
      );
    }
  });
});

describe("Pencere kabuğu", () => {
  it("keeps the overlay a sibling of the card, not its ancestor (tuzak #11)", () => {
    assert.match(windowSource, /data-testid="settings-window-backdrop"/u);
    assert.match(windowSource, /pointerEvents: "none"/u);
    assert.match(windowSource, /pointerEvents: "auto"/u);
    // Kartın içine tıklamayı yutan bir kapatma kurulmaz.
    assert.doesNotMatch(windowCode, /stopPropagation/u);
  });

  it("modal içinde rota değişimlerini replace eder; çarpı tek geri adımda kapatır", () => {
    assert.match(windowSource, /resolveSettingsNavigationMethod\(mode\)/u);
    assert.match(windowSource, /writeSettingsHistory\(window\.history, navigationMethod,/u);
    assert.match(windowSource, /if \(mode === "modal"\) \{\s+router\.back\(\)/u);
  });

  it("arama hedefinin satır anahtarını vurgulama katmanına taşır", () => {
    assert.match(windowSource, /rowKey: string/u);
    assert.match(windowSource, /setHighlightedRowKey\(target\.rowKey\)/u);
    assert.match(windowSource, /useSearchParams\(\)/u);
    assert.match(
      windowSource,
      /writeSettingsHistory\(window\.history, navigationMethod, target, target\.rowKey\)/u,
    );
    assert.match(windowSource, /<SettingsSearchHighlightProvider rowKey=\{highlightedRowKey\}>/u);
  });

  it("resets the scroll position on both section and tab changes", () => {
    assert.match(
      windowSource,
      /scrollRef\.current\?\.scrollTo\(\{ top: 0 \}\);\s*\n\s*\}, \[state\.section, state\.tab\]\)/u,
    );
  });

  it("never imitates the reference's fixed 850 ms save delay (tuzak #14)", () => {
    assert.doesNotMatch(windowCode, /850/u);
    assert.doesNotMatch(
      code(read("components", "settings", "settings-save-indicator.tsx")),
      /850/u,
    );

    // Göstergede hiç zamanlayıcı yok; penceredeki tek `setTimeout` arama debounce'udur ve
    // gecikmesini sözlükten alır.
    assert.doesNotMatch(
      code(read("components", "settings", "settings-save-indicator.tsx")),
      /setTimeout/u,
    );
    assert.deepEqual(windowCode.match(/setTimeout\(.*/gu), [
      "setTimeout(() => setDebounced(value), delayMs);",
    ]);
  });

  it("debounces search with the dictionary's value, not a literal", () => {
    assert.equal(SETTINGS_METRICS.body.searchDebounceMs, 250);
    assert.match(windowSource, /body\.searchDebounceMs/u);
  });

  it("filters the desktop section by runtime, not by a user choice (K11)", () => {
    assert.match(windowSource, /isWhisprDesktopRuntime/u);
    assert.match(windowSource, /section\.desktopOnly \|\| desktopRuntime/u);
  });
});

describe("Küçük ekran (SPEC §10)", () => {
  it("selects every breakpoint in CSS, never in JavaScript (tuzak #10)", () => {
    for (const threshold of Object.values(SETTINGS_METRICS.window.breakpoints)) {
      assert.match(
        globalsSource,
        new RegExp(`@media \\(max-width: ${threshold}px\\)`, "u"),
        `breakpoint ${threshold} must live in globals.css`,
      );
    }

    // Kırılım eşiği bileşen kodunda hiç geçmez; `window.breakpoints` yalnız bu testin girdisi.
    assert.doesNotMatch(windowSource, /matchMedia/u);
    assert.doesNotMatch(windowSource, /breakpoints/u);
  });

  it("hands the card its measurements as custom properties so CSS can override them", () => {
    for (const name of [
      "--settings-window-width",
      "--settings-window-height",
      "--settings-window-radius",
      "--settings-window-nav-width",
      "--settings-window-nav-icon-width",
    ]) {
      assert.match(windowSource, new RegExp(name, "u"), `${name} must be set from the dictionary`);
      assert.match(globalsSource, new RegExp(`var\\(${name}\\)`, "u"), `${name} must be consumed`);
    }
  });

  it("goes full screen under 720 and drops the nav to icons under 1024", () => {
    const fullScreen = globalsSource.slice(globalsSource.indexOf("@media (max-width: 720px)"));

    assert.match(fullScreen, /border-radius: 0;/u);
    assert.match(globalsSource, /\.settings-window-nav-text \{\s*display: none;/u);
  });

  it("never fakes the scale step with `zoom` (tuzak #8)", () => {
    assert.doesNotMatch(windowSource, /\bzoom\b/u);
    assert.equal(pxToRem(SETTINGS_METRICS.window.width), "73.75rem");
  });
});

/**
 * F1 — kutu ↔ kabuk dikişi.
 *
 * Bu paketin en pahalı hatası bir davranış hatası değil, **bağlanmamış bir yuvaydı**:
 * `SettingsSectionRenderInput` üzerinde `runSave` ve `onTouch` alanları vardı, kayıt defteri
 * onları aşağı geçirmiyordu ve hiçbir bölüm çağırmıyordu. Kayıt göstergesi `idle`da donuyor,
 * kirli şerit hiç çıkmıyordu — bileşen testleri prop'ları elle verdiği için hepsi yeşildi.
 *
 * Buradaki iddialar davranışı değil **dikişin varlığını** ölçer; kaybolan tam olarak oydu.
 */
describe("Ayarlar kabuğu — kutu raporu (F1)", () => {
  const ladderSource = read("components", "settings", "settings-ladder.tsx");

  /** Kendi `SettingsValueStore`unu kuran her bölüm kökü. */
  const STORE_OWNERS = [
    join("components", "settings", "sections", "account", "account-section.tsx"),
    join("components", "settings", "sections", "appearance", "appearance-settings-bridge.tsx"),
    join("components", "settings", "sections", "av", "av-settings-bridge.tsx"),
    join("components", "settings", "sections", "desktop", "desktop-section.tsx"),
    join("components", "settings", "sections", "notifications", "notifications-section.tsx"),
  ];

  it("kutu kuran her bölüm kendini kabuğa raporluyor", () => {
    for (const owner of STORE_OWNERS) {
      const source = read(owner);

      assert.match(
        source,
        /new SettingsValueStore\(/u,
        `${owner} kutu kurmuyor — liste eskimiş olabilir`,
      );
      assert.match(
        source,
        /useReportSettingsStore\(/u,
        `${owner} kutusunu kabuğa raporlamıyor: gösterge donar, kirli şerit çıkmaz`,
      );
    }
  });

  it("kabuk raporu sağlıyor ve üç kanalın hepsini indirgeyiciye bağlıyor", () => {
    assert.match(windowSource, /<SettingsStoreReportProvider value=\{storeReport\}>/u);
    assert.match(windowSource, /onStatus: \(save\) => dispatch\(\{ save, type: "save" \}\)/u);
    assert.match(windowSource, /dispatch\(\{ key, type: "touch" \}\)/u);
    assert.match(windowSource, /onRetry: \(retry\) => setStoreRetry/u);
  });

  it("ölü `runSave` / `onTouch` alanları bölüm sözleşmesinden kaldırıldı", () => {
    const contract = windowSource.slice(
      windowSource.indexOf("export type SettingsSectionRenderInput"),
      windowSource.indexOf("export type SettingsWindowProps"),
    );

    assert.doesNotMatch(contract, /readonly runSave/u);
    assert.doesNotMatch(contract, /readonly onTouch/u);
  });

  it("rapor sökülürken kabuğu boşa çeviriyor — bölüm değişiminde eski `Kaydedildi` asılı kalmaz", () => {
    const hook = ladderSource.slice(ladderSource.indexOf("export function useReportSettingsStore"));

    assert.match(hook, /report\.onStatus\("idle"\)/u);
    assert.match(hook, /report\.onDirtyKeys\(\[\]\)/u);
  });
});
