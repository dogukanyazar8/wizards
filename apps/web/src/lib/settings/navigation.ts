/**
 * Ayarlar penceresinin rota çözücüsü.
 *
 * K2 — adres **yol segmentidir**: `/settings/[section]/[tab]`. Uygulama içinden açılınca kabuğun
 * üstüne modal (intercepting route), doğrudan URL ile açılınca aynı pencere tam ekran. Eski
 * `?section=&panel=` biçimi `migrateLegacySettingsQuery` ile yeni yola çevrilir.
 *
 * Sekme anahtarları İngilizce'dir çünkü adres çubuğunda görünürler: `/settings/notifications/
 * quiet-hours` paylaşılabilir, `/settings/notif/sessiz` değil. Referanstaki Türkçe anahtarlar
 * (`sessiz`, `guvenlik`, …) `lib/settings/tree.ts` içindeki eşleme yorumlarında durur.
 *
 * ## Eski yüzey
 *
 * Dosyanın alt yarısı, bu paketin Ş13'te sileceği `settings-panel.tsx` / `settings-sidebar.tsx`
 * ikilisinin hâlâ okuduğu sözleşmedir. Silinene kadar iki API yan yana yaşar; eski olan
 * `Legacy` önekiyle adlandırıldı ki çağrı yerlerinde hangisinin kullanıldığı okunsun.
 */

export type SettingsSection =
  "account" | "av" | "appearance" | "notifications" | "desktop" | "updates" | "about";

/** 27 sekme. Sıra, sol navigasyondaki ve alt şeritteki sırayla aynıdır. */
export type SettingsTab =
  // Hesabım
  | "profile"
  | "account"
  | "privacy"
  | "security"
  | "badges"
  | "data"
  // Ses ve Video
  | "audio"
  | "camera"
  | "screen-share"
  // Görünüm
  | "language"
  | "theme"
  | "text"
  | "media"
  | "layout"
  | "accessibility"
  // Bildirimler
  | "general"
  | "surfaces"
  | "types"
  | "quiet-hours"
  | "sounds"
  | "panel"
  | "exceptions"
  // Masaüstü
  | "app"
  | "shortcuts"
  | "overlay"
  | "permissions"
  // Güncelleme
  | "updates"
  // Hakkında
  | "about";

export type SettingsRoute = {
  section: SettingsSection;
  tab: SettingsTab;
};

/**
 * Bölüm başına sekme sırası — `6 / 3 / 6 / 7 / 4 / 1 / 1`.
 *
 * Rota çözücüsü ağacı **okumaz**: `tree.ts` bu dosyanın tiplerini içeri alır, tersi bir döngü
 * olurdu. `tree.test.ts` iki listenin aynı kaldığını doğrular.
 */
export const SETTINGS_TABS_BY_SECTION: Readonly<
  Record<SettingsSection, readonly [SettingsTab, ...SettingsTab[]]>
> = {
  account: ["profile", "account", "privacy", "security", "badges", "data"],
  av: ["audio", "camera", "screen-share"],
  appearance: ["theme", "text", "media", "layout", "accessibility", "language"],
  notifications: ["general", "surfaces", "types", "quiet-hours", "sounds", "panel", "exceptions"],
  desktop: ["app", "shortcuts", "overlay", "permissions"],
  updates: ["updates"],
  about: ["about"],
};

export const SETTINGS_SECTIONS = Object.keys(SETTINGS_TABS_BY_SECTION) as SettingsSection[];

/** Geçersiz bir adresin düştüğü yer. Menü › Ayarlar da buraya açar. */
export const DEFAULT_SETTINGS_ROUTE: SettingsRoute = { section: "account", tab: "profile" };

function isSettingsSection(value: string | null | undefined): value is SettingsSection {
  return value != null && value in SETTINGS_TABS_BY_SECTION;
}

/** `/settings/account/profile`. Sekme verilmezse bölümün ilk sekmesi kullanılır. */
export function buildSettingsHref(section: SettingsSection, tab?: SettingsTab): string {
  if (section === "desktop" && tab === "updates") return buildSettingsHref("updates");
  const tabs = SETTINGS_TABS_BY_SECTION[section];
  const resolved = tab && tabs.includes(tab) ? tab : tabs[0];

  return `/settings/${section}/${resolved}`;
}

/**
 * Yol segmentlerini rotaya çevirir. Geçersiz bölüm varsayılana, geçersiz sekme **bölümün ilk
 * sekmesine** düşer — 404 yerine, çünkü bölüm doğruysa kullanıcının nereye gitmek istediği
 * bellidir ve boş bir pencere göstermenin kimseye faydası yok.
 */
export function resolveSettingsRoute(section?: string | null, tab?: string | null): SettingsRoute {
  // Existing badge notification links predate the section/tab settings routes.
  if (section === "badges" && !tab) return { section: "account", tab: "badges" };
  if (section === "desktop" && tab === "updates") return { section: "updates", tab: "updates" };
  if (!isSettingsSection(section)) return DEFAULT_SETTINGS_ROUTE;

  const tabs = SETTINGS_TABS_BY_SECTION[section];
  const resolved = tabs.find((entry) => entry === tab) ?? tabs[0];

  return { section, tab: resolved };
}

// ---------------------------------------------------------------------------
// Eski `?section=&panel=` yüzeyi (Ş13'te silinir)
// ---------------------------------------------------------------------------

export type LegacySettingsSection =
  "account" | "voice" | "desktop" | "appearance" | "notifications" | "about";

export type SettingsPanelKey =
  /** 07 §3 "Rozetlerim". A panel of the account section, not a route of its own. */
  | "badges"
  | "audio"
  | "camera"
  | "screenShare"
  | "language"
  | "theme"
  | "messageFont"
  | "advanced"
  | "appIcon"
  | "general"
  | "sounds"
  | "desktopBehavior"
  | "desktopVoice"
  | "desktopDiagnostics"
  | "overview"
  | "build"
  | "whatsNew"
  | "desktop"
  | "developer";

export type SettingsSelection = {
  panel: SettingsPanelKey | null;
  section: LegacySettingsSection;
};

const PANELS_BY_SECTION: Record<LegacySettingsSection, readonly SettingsPanelKey[]> = {
  account: ["badges"],
  voice: ["audio", "camera", "screenShare"],
  desktop: ["desktopBehavior", "desktopVoice", "desktopDiagnostics"],
  appearance: ["language", "theme", "messageFont", "advanced", "appIcon"],
  notifications: ["general", "sounds"],
  about: ["overview", "build", "whatsNew", "developer"],
};

/**
 * Eski 19 panelin yeni karşılıkları. Üç grup dikkat ister:
 *
 * - `language` Görünüm'den **Hesabım › Gizlilik**'e taşındı: referansta `Dil ve bölge` grubu
 *   orada duruyor.
 * - `advanced` ve `appIcon` tek sekmede birleşti (`Görünüm › Düzen`): ikisi de o sekmenin iki
 *   grubudur.
 * - `overview` / `build` / `whatsNew` / `developer` tek sayfaya indi; Hakkında artık tek
 *   sekmelidir ve şerit render edilmez.
 */
const LEGACY_PANEL_ROUTES: Readonly<Record<SettingsPanelKey, SettingsRoute>> = {
  badges: { section: "account", tab: "badges" },
  audio: { section: "av", tab: "audio" },
  camera: { section: "av", tab: "camera" },
  screenShare: { section: "av", tab: "screen-share" },
  language: { section: "appearance", tab: "language" },
  theme: { section: "appearance", tab: "theme" },
  messageFont: { section: "appearance", tab: "text" },
  advanced: { section: "appearance", tab: "layout" },
  appIcon: { section: "appearance", tab: "layout" },
  general: { section: "notifications", tab: "general" },
  sounds: { section: "notifications", tab: "sounds" },
  desktopBehavior: { section: "desktop", tab: "app" },
  /** `settings.desktop.voice.title` = "Kısayollar ve overlay"; ilki Kısayollar sekmesidir. */
  desktopVoice: { section: "desktop", tab: "shortcuts" },
  desktopDiagnostics: { section: "updates", tab: "updates" },
  overview: { section: "about", tab: "about" },
  build: { section: "updates", tab: "updates" },
  whatsNew: { section: "updates", tab: "updates" },
  /** Eski özel dal: `?section=about&panel=desktop`. */
  desktop: { section: "updates", tab: "updates" },
  developer: { section: "about", tab: "about" },
};

const LEGACY_SECTION_ROUTES: Readonly<Record<LegacySettingsSection, SettingsRoute>> = {
  account: { section: "account", tab: "profile" },
  voice: { section: "av", tab: "audio" },
  desktop: { section: "desktop", tab: "app" },
  appearance: { section: "appearance", tab: "theme" },
  notifications: { section: "notifications", tab: "general" },
  about: { section: "about", tab: "about" },
};

/**
 * Eski sorgu biçimini yeni yola çevirir; hiçbir şey eşleşmezse `null` döner ve çağıran
 * `/settings/account/profile`'a düşer.
 *
 * Panel bölümden **önce** okunur: `?section=about&panel=desktop` eski kodda da Masaüstü
 * tanılamasına gidiyordu, bölüme bakan bir çeviri onu Hakkında'ya yollardı.
 */
export function migrateLegacySettingsQuery(params: URLSearchParams): string | null {
  const rawPanel = params.get("panel");
  const rawSection = params.get("section");

  if (rawPanel && rawPanel in LEGACY_PANEL_ROUTES) {
    const route = LEGACY_PANEL_ROUTES[rawPanel as SettingsPanelKey];
    return buildSettingsHref(route.section, route.tab);
  }

  if (rawSection && rawSection in LEGACY_SECTION_ROUTES) {
    const route = LEGACY_SECTION_ROUTES[rawSection as LegacySettingsSection];
    return buildSettingsHref(route.section, route.tab);
  }

  return null;
}

/** Eski yüzeyin adres kurucusu. Ş13'e kadar eski panel bunu kullanır. */
export function buildLegacySettingsHref(
  section: LegacySettingsSection,
  panel?: SettingsPanelKey | null,
) {
  const params = new URLSearchParams();

  if (section !== "account") {
    params.set("section", section);
  }

  if (panel) {
    params.set("panel", panel);
  }

  const query = params.toString();
  return query ? `/settings?${query}` : "/settings";
}

export function resolveSettingsSelection(searchParams: {
  get: (key: string) => string | null;
}): SettingsSelection {
  const rawSection = searchParams.get("section");
  const rawPanel = searchParams.get("panel");

  if (rawSection === "about" && rawPanel === "desktop") {
    return { panel: "desktopDiagnostics", section: "desktop" };
  }

  const section = (
    rawSection &&
    ["account", "voice", "desktop", "appearance", "notifications", "about"].includes(rawSection)
      ? rawSection
      : "account"
  ) as LegacySettingsSection;

  const validPanels = PANELS_BY_SECTION[section];
  const panel = (
    rawPanel && validPanels.includes(rawPanel as SettingsPanelKey) ? rawPanel : null
  ) as SettingsPanelKey | null;

  return { panel, section };
}

export function isAdvancedAppearancePanel(panel: SettingsPanelKey | null) {
  return panel === "advanced" || panel === "appIcon";
}
