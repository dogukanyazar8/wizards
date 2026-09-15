import { HOME_METRICS } from "@/lib/home/metrics";
import { SERVER_METRICS } from "@/lib/servers/metrics";

export type WizardsThemeId =
  | "theme-light"
  | "theme-ash"
  | "theme-dark"
  | "theme-onyx"
  | "theme-mint-green"
  | "theme-peach-orange"
  | "theme-lavender"
  | "theme-sage-green"
  | "theme-cream-yellow"
  | "theme-dusty-rose"
  | "theme-soft-pink"
  | "theme-sky-blue"
  | "theme-warm-beige"
  | "theme-deep-purple-gradient"
  | "theme-blue-purple-gradient"
  | "theme-forest-dark"
  | "theme-crimson-dark"
  | "theme-midnight-navy"
  | "theme-mauve-dark"
  | "theme-slate-dark"
  | "theme-teal-dark"
  | "theme-ocean-dark"
  | "theme-purple-teal"
  | "theme-amber-dark"
  | "theme-green-rainbow"
  | "theme-khaki-dark"
  | "theme-royal-blue";

export type WizardsThemeCategory = "simple" | "advanced";

export type WizardsThemePreview =
  { kind: "solid"; color: string } | { kind: "gradient"; stops: [string, string, string] };

/**
 * K6 — **hiçbir temanın kimliği ve rengi değişmez**; yalnız görünen ad tasarımın listesinden
 * atanır. Bu yüzden ad bir alan değil bir **anahtar**: `label` İngilizce kalır (sözlük ve eski
 * yüzeyler onu okuyor), `displayNameKey` Ayarlar penceresinin çizdiği addır.
 *
 * ## Eşleme ve gerekçesi
 *
 * Tasarım 23 ad veriyor (13 `Koyu` + 10 `Açık`); kodda 23 gelişmiş tema var ama dağılım
 * **14 koyu + 9 açık** (SPEC_DEVIATIONS #1). Sayım tutmadığı için eşleme moda göre değil
 * **renk ailesine** göre yapıldı ve `Koyu`/`Açık` etiketi addan değil, kaydın kendi `mode`
 * alanından okunur. Bir tasarım adı (`Deniz Köpüğü`) bu yüzden koyu bir temaya düşüyor —
 * teal ailesinin tek karşılığı o ve etiketi yine `Koyu` çıkıyor.
 *
 * | Kimlik | Türkçe ad | Neden |
 * | --- | --- | --- |
 * | `theme-light` · `theme-ash` · `theme-dark` · `theme-onyx` | Light · Ash · Dark · Onyx | Basit dört tema; tasarım da bu adları kullanıyor, çeviri yok |
 * | `theme-deep-purple-gradient` | Mor Alacakaranlık | kadife erik gradyanı, morun alacakaranlık tonu |
 * | `theme-blue-purple-gradient` | Mürekkep | mavi–menekşe geçişi = mürekkep |
 * | `theme-forest-dark` | Orman | yosun yeşili |
 * | `theme-crimson-dark` | Kiraz | dumanlı kızıl |
 * | `theme-midnight-navy` | Gece Yarısı | adın kendisi (`midnight`) |
 * | `theme-mauve-dark` | Bordo | soluk erik/şarap ailesi |
 * | `theme-slate-dark` | Grafit | tek renk çelik = grafit |
 * | `theme-teal-dark` | Deniz Köpüğü | teal ailesinin tek karşılığı; etiketi yine `Koyu` (sapma #1) |
 * | `theme-ocean-dark` | Okyanus | adın kendisi |
 * | `theme-purple-teal` | Kobalt | gradyanın orta durağı (`#3f6cc9`) kobalt mavisi |
 * | `theme-amber-dark` | Bakır | altın köz = bakır |
 * | `theme-green-rainbow` | Zeytin | yeşil ailesinde kalan tek ad |
 * | `theme-khaki-dark` | Kömür | toprak koyusu; nötr koyu adların kalanı |
 * | `theme-royal-blue` | Gece Mavisi | doygun lacivert |
 * | `theme-mint-green` | Sisli Cam | soluk soğuk yeşil, buzlu cam |
 * | `theme-peach-orange` | Şafak | şeftali/turuncu = şafak |
 * | `theme-lavender` | Lavanta | adın kendisi |
 * | `theme-sage-green` | Adaçayı | adın kendisi (`sage`) |
 * | `theme-cream-yellow` | Kağıt | krem sarısı = kağıt |
 * | `theme-dusty-rose` | Gül | adın kendisi |
 * | `theme-soft-pink` | Kar | listenin en soluk tonu |
 * | `theme-sky-blue` | Buz | buz mavisi |
 * | `theme-warm-beige` | Kum | sıcak bej = kum |
 */
export type WizardsThemeDefinition = {
  category: WizardsThemeCategory;
  description: string;
  /** K6 — Ayarlar penceresinin çizdiği ad; kimlik ve renk değişmeden yalnız bu Türkçeleşir. */
  displayNameKey: string;
  id: WizardsThemeId;
  label: string;
  mode: "light" | "dark";
  preview: WizardsThemePreview;
};

export const DEFAULT_WIZARDS_THEME: WizardsThemeId = "theme-light";

export const LEGACY_THEME_ALIASES: Record<string, WizardsThemeId> = {
  dark: "theme-dark",
  light: "theme-light",
  "theme-dawn": "theme-light",
  "theme-graphite": "theme-ash",
  "theme-midnight": "theme-onyx",
  "theme-mist": "theme-sage-green",
  "theme-studio": "theme-purple-teal",
};

export const WIZARDS_THEMES: WizardsThemeDefinition[] = [
  {
    id: "theme-light",
    label: "Light",
    displayNameKey: "settings.block.theme.light",
    description: "Bright neutral canvas",
    category: "simple",
    mode: "light",
    preview: { kind: "solid", color: "#ffffff" },
  },
  {
    id: "theme-ash",
    label: "Ash",
    displayNameKey: "settings.block.theme.ash",
    description: "Discord-inspired charcoal",
    category: "simple",
    mode: "dark",
    preview: { kind: "solid", color: "#36393f" },
  },
  {
    id: "theme-dark",
    label: "Dark",
    displayNameKey: "settings.block.theme.dark",
    description: "Classic deep slate",
    category: "simple",
    mode: "dark",
    preview: { kind: "solid", color: "#2c2f33" },
  },
  {
    id: "theme-onyx",
    label: "Onyx",
    displayNameKey: "settings.block.theme.onyx",
    description: "Rich low-glare black",
    category: "simple",
    mode: "dark",
    preview: { kind: "solid", color: "#1a1b1e" },
  },
  {
    id: "theme-mint-green",
    label: "Mint Green",
    displayNameKey: "settings.block.theme.mistedGlass",
    description: "Airy mint pastel",
    category: "advanced",
    mode: "light",
    preview: { kind: "gradient", stops: ["#d6f7e4", "#bdeed2", "#8fdcb3"] },
  },
  {
    id: "theme-peach-orange",
    label: "Peach Orange",
    displayNameKey: "settings.block.theme.dawn",
    description: "Warm citrus glow",
    category: "advanced",
    mode: "light",
    preview: { kind: "gradient", stops: ["#ffe6d7", "#ffd2b8", "#ffb688"] },
  },
  {
    id: "theme-lavender",
    label: "Lavender",
    displayNameKey: "settings.block.theme.lavender",
    description: "Soft lilac haze",
    category: "advanced",
    mode: "light",
    preview: { kind: "gradient", stops: ["#ebe5ff", "#ddd3ff", "#c0b2ff"] },
  },
  {
    id: "theme-sage-green",
    label: "Sage Green",
    displayNameKey: "settings.block.theme.sage",
    description: "Muted botanical tones",
    category: "advanced",
    mode: "light",
    preview: { kind: "gradient", stops: ["#edf4ea", "#d7e7cf", "#b8cfaa"] },
  },
  {
    id: "theme-cream-yellow",
    label: "Cream Yellow",
    displayNameKey: "settings.block.theme.paper",
    description: "Buttery soft daylight",
    category: "advanced",
    mode: "light",
    preview: { kind: "gradient", stops: ["#fff9dd", "#fff1b8", "#f6dd77"] },
  },
  {
    id: "theme-dusty-rose",
    label: "Dusty Rose",
    displayNameKey: "settings.block.theme.rose",
    description: "Powdered rose blush",
    category: "advanced",
    mode: "light",
    preview: { kind: "gradient", stops: ["#f8e3e9", "#f0ccd8", "#d8a6ba"] },
  },
  {
    id: "theme-soft-pink",
    label: "Soft Pink",
    displayNameKey: "settings.block.theme.snow",
    description: "Cotton candy shimmer",
    category: "advanced",
    mode: "light",
    preview: { kind: "gradient", stops: ["#ffe5f1", "#ffd0e8", "#ffb1d8"] },
  },
  {
    id: "theme-sky-blue",
    label: "Sky Blue",
    displayNameKey: "settings.block.theme.ice",
    description: "Cloud-washed blue",
    category: "advanced",
    mode: "light",
    preview: { kind: "gradient", stops: ["#e2f1ff", "#c7e4ff", "#91c8ff"] },
  },
  {
    id: "theme-warm-beige",
    label: "Warm Beige",
    displayNameKey: "settings.block.theme.sand",
    description: "Neutral cafe tones",
    category: "advanced",
    mode: "light",
    preview: { kind: "gradient", stops: ["#f7ecdf", "#eadbc8", "#d0b89b"] },
  },
  {
    id: "theme-deep-purple-gradient",
    label: "Deep Purple",
    displayNameKey: "settings.block.theme.purpleTwilight",
    description: "Velvet plum gradient",
    category: "advanced",
    mode: "dark",
    preview: { kind: "gradient", stops: ["#4f2d8c", "#6f42b6", "#c77dff"] },
  },
  {
    id: "theme-blue-purple-gradient",
    label: "Blue Purple",
    displayNameKey: "settings.block.theme.ink",
    description: "Electric dusk blend",
    category: "advanced",
    mode: "dark",
    preview: { kind: "gradient", stops: ["#1f5fff", "#5b5ff7", "#8d6bff"] },
  },
  {
    id: "theme-forest-dark",
    label: "Forest Dark",
    displayNameKey: "settings.block.theme.forest",
    description: "Mossy deep green",
    category: "advanced",
    mode: "dark",
    preview: { kind: "gradient", stops: ["#14281f", "#234535", "#5a7c54"] },
  },
  {
    id: "theme-crimson-dark",
    label: "Crimson Dark",
    displayNameKey: "settings.block.theme.cherry",
    description: "Smoky scarlet noir",
    category: "advanced",
    mode: "dark",
    preview: { kind: "gradient", stops: ["#2a060b", "#5a0f18", "#aa1f34"] },
  },
  {
    id: "theme-midnight-navy",
    label: "Midnight Navy",
    displayNameKey: "settings.block.theme.midnight",
    description: "Quiet midnight blue",
    category: "advanced",
    mode: "dark",
    preview: { kind: "gradient", stops: ["#08142d", "#102248", "#1c3d72"] },
  },
  {
    id: "theme-mauve-dark",
    label: "Mauve Dark",
    displayNameKey: "settings.block.theme.bordeaux",
    description: "Muted plum evening",
    category: "advanced",
    mode: "dark",
    preview: { kind: "gradient", stops: ["#2a1b2e", "#4d3254", "#8e5a8f"] },
  },
  {
    id: "theme-slate-dark",
    label: "Slate Dark",
    displayNameKey: "settings.block.theme.graphite",
    description: "Monochrome steel slate",
    category: "advanced",
    mode: "dark",
    preview: { kind: "gradient", stops: ["#1b222b", "#2d3745", "#516377"] },
  },
  {
    id: "theme-teal-dark",
    label: "Teal Dark",
    displayNameKey: "settings.block.theme.seafoam",
    description: "Deep sea teal",
    category: "advanced",
    mode: "dark",
    preview: { kind: "gradient", stops: ["#0b2928", "#12504f", "#1b8a88"] },
  },
  {
    id: "theme-ocean-dark",
    label: "Ocean Dark",
    displayNameKey: "settings.block.theme.ocean",
    description: "Bluewater twilight",
    category: "advanced",
    mode: "dark",
    preview: { kind: "gradient", stops: ["#0a2338", "#124667", "#1f83a6"] },
  },
  {
    id: "theme-purple-teal",
    label: "Purple Teal",
    displayNameKey: "settings.block.theme.cobalt",
    description: "Bioluminescent blend",
    category: "advanced",
    mode: "dark",
    preview: { kind: "gradient", stops: ["#5727a4", "#3f6cc9", "#26bfa9"] },
  },
  {
    id: "theme-amber-dark",
    label: "Amber Dark",
    displayNameKey: "settings.block.theme.copper",
    description: "Golden ember glow",
    category: "advanced",
    mode: "dark",
    preview: { kind: "gradient", stops: ["#2b1a06", "#5d3608", "#d48b12"] },
  },
  {
    id: "theme-green-rainbow",
    label: "Green Rainbow",
    displayNameKey: "settings.block.theme.olive",
    description: "Prismatic neon green",
    category: "advanced",
    mode: "dark",
    preview: { kind: "gradient", stops: ["#123e28", "#1f9f6e", "#7ed957"] },
  },
  {
    id: "theme-khaki-dark",
    label: "Khaki Dark",
    displayNameKey: "settings.block.theme.charcoal",
    description: "Earthy olive dusk",
    category: "advanced",
    mode: "dark",
    preview: { kind: "gradient", stops: ["#2a2416", "#51452b", "#8b7c4c"] },
  },
  {
    id: "theme-royal-blue",
    label: "Royal Blue",
    displayNameKey: "settings.block.theme.nightBlue",
    description: "Bold saturated royal",
    category: "advanced",
    mode: "dark",
    preview: { kind: "solid", color: "#2d4bff" },
  },
];

export const WIZARDS_THEME_IDS = WIZARDS_THEMES.map((theme) => theme.id);
export const SIMPLE_WIZARDS_THEMES = WIZARDS_THEMES.filter((theme) => theme.category === "simple");
export const ADVANCED_WIZARDS_THEMES = WIZARDS_THEMES.filter(
  (theme) => theme.category === "advanced",
);

/**
 * Tema ızgarasının **okuma sırası** — `screens/06-gorunum-tema.png`.
 *
 * Referans üç kolonu satır satır dolduruyor ve sırayı adın kendisi belirliyor, kaydın kodda
 * tanımlanma sırası değil. Sıra bir sunum kararı: kimlik, renk ve mod değişmiyor, yalnız
 * kartların yeri tasarımdaki kareyle örtüşüyor. Sıralamayı bileşende yapmak, iki tema bloğunun
 * ileride ayrışması demekti.
 */
const ADVANCED_THEME_DISPLAY_ORDER: readonly string[] = [
  "settings.block.theme.nightBlue",
  "settings.block.theme.charcoal",
  "settings.block.theme.ink",
  "settings.block.theme.forest",
  "settings.block.theme.bordeaux",
  "settings.block.theme.purpleTwilight",
  "settings.block.theme.copper",
  "settings.block.theme.ocean",
  "settings.block.theme.olive",
  "settings.block.theme.midnight",
  "settings.block.theme.graphite",
  "settings.block.theme.cobalt",
  "settings.block.theme.cherry",
  "settings.block.theme.snow",
  "settings.block.theme.sand",
  "settings.block.theme.mistedGlass",
  "settings.block.theme.sage",
  "settings.block.theme.dawn",
  "settings.block.theme.ice",
  "settings.block.theme.lavender",
  "settings.block.theme.paper",
  "settings.block.theme.seafoam",
  "settings.block.theme.rose",
];

/** 23 gelişmiş tema, tasarımın ızgara sırasıyla. */
export const ADVANCED_WIZARDS_THEMES_IN_DESIGN_ORDER: readonly WizardsThemeDefinition[] = [
  ...ADVANCED_WIZARDS_THEMES,
].sort(
  (left, right) =>
    ADVANCED_THEME_DISPLAY_ORDER.indexOf(left.displayNameKey) -
    ADVANCED_THEME_DISPLAY_ORDER.indexOf(right.displayNameKey),
);

/**
 * SPEC_DEVIATIONS #1 — `Koyu`/`Açık` etiketi **koddan** sayılır, tasarımın 13/10 iddiasından
 * değil. Sayaç burada duruyor ki tema ızgarası bir sayı yazmak zorunda kalmasın: blok yalnız
 * etiketler, sayım gerekirse bu fonksiyondan gelir.
 */
export function countAdvancedThemesByMode(): { dark: number; light: number } {
  return ADVANCED_WIZARDS_THEMES.reduce(
    (counts, theme) => ({
      dark: counts.dark + (theme.mode === "dark" ? 1 : 0),
      light: counts.light + (theme.mode === "light" ? 1 : 0),
    }),
    { dark: 0, light: 0 },
  );
}
export const THEME_PICKER_TABS: Array<{
  id: WizardsThemeCategory;
  label: string;
}> = [
  { id: "simple", label: "Simple" },
  { id: "advanced", label: "Advanced" },
];

export const WIZARDS_THEME_MAP = Object.fromEntries(
  WIZARDS_THEMES.map((theme) => [theme.id, theme]),
) as Record<WizardsThemeId, WizardsThemeDefinition>;

export function normalizeWizardsThemeId(value: string | null | undefined): WizardsThemeId {
  if (!value) {
    return DEFAULT_WIZARDS_THEME;
  }

  const legacyTheme = LEGACY_THEME_ALIASES[value];

  if (legacyTheme) {
    return legacyTheme;
  }

  return WIZARDS_THEME_MAP[value as WizardsThemeId]?.id ?? DEFAULT_WIZARDS_THEME;
}

export function getThemePreviewBackground(preview: WizardsThemePreview) {
  if (preview.kind === "solid") {
    return preview.color;
  }

  return `linear-gradient(135deg, ${preview.stops[0]} 0%, ${preview.stops[1]} 55%, ${preview.stops[2]} 100%)`;
}

export function getWizardsThemeMode(value: string | null | undefined) {
  return WIZARDS_THEME_MAP[normalizeWizardsThemeId(value)].mode;
}

export const ICON_ONLY_SERVER_RAIL_WIDTH = 88;
export const EXPANDED_MIN_SERVER_RAIL_WIDTH = 60;
export const DEFAULT_SERVER_RAIL_WIDTH = 74;
export const MIN_SERVER_RAIL_WIDTH = 60;
export const MAX_SERVER_RAIL_WIDTH = 92;
export const SERVER_RAIL_WIDTH_STEP = 4;
export const DEFAULT_SERVER_RAIL_ICON_SIZE = 44;
export const MIN_SERVER_RAIL_ICON_SIZE = 36;
export const MAX_SERVER_RAIL_ICON_SIZE = 56;
export const SERVER_RAIL_ICON_SIZE_STEP = 2;
/**
 * Kabuk rayının tek genişliği — SPEC-ANA-SAYFA §2.1 (74). Eski adı `COMPACT_SERVER_RAIL_WIDTH`
 * idi; "compact" bir varyant değil, tek ray olduğu için ad düzeltildi. Değer ölçü sözlüğünden
 * okunur, ikinci bir kaynak yok.
 */
export const SERVER_RAIL_WIDTH = HOME_METRICS.rail.width;
/** Ray ikonunun kutusu ve tıklama hedefi aynıdır: 44×44 (§2.1, §8.2.5 tabanı). */
export const SERVER_RAIL_ICON_SIZE = HOME_METRICS.rail.iconSize;
export const SERVER_RAIL_TOUCH_SIZE = HOME_METRICS.rail.iconSize;
/** Channel width stays within the same 200–300 px range exposed in Settings. */
export const DEFAULT_CHANNEL_SIDEBAR_WIDTH = SERVER_METRICS.layout.sidebarWidth;
export const MIN_CHANNEL_SIDEBAR_WIDTH = 200;
export const MAX_CHANNEL_SIDEBAR_WIDTH = 300;
export const CHANNEL_SIDEBAR_WIDTH_STEP = 8;
export const LEGACY_DEFAULT_MAIN_PANEL_WIDTH = 1280;
export const DEFAULT_MAIN_PANEL_WIDTH = 1400;
export const MIN_MAIN_PANEL_WIDTH = 980;
export const MAX_MAIN_PANEL_WIDTH = 1720;
export const MAIN_PANEL_WIDTH_STEP = 20;

export const DEFAULT_NOTIFICATION_LIMIT = 5;
export const MIN_NOTIFICATION_LIMIT = 3;
export const MAX_NOTIFICATION_LIMIT = 20;
export const NOTIFICATION_LIMIT_STEP = 1;
export const NOTIFICATION_LIMIT_OPTIONS = [3, 5, 10, 15, 20] as const;
export const DEFAULT_NOTIFICATION_POPUP_TIMEOUT_SECONDS = 10;
export const MIN_NOTIFICATION_POPUP_TIMEOUT_SECONDS = 5;
export const MAX_NOTIFICATION_POPUP_TIMEOUT_SECONDS = 30;
export const NOTIFICATION_POPUP_TIMEOUT_STEP = 5;
export const NOTIFICATION_POPUP_TIMEOUT_OPTIONS = [5, 10, 15, 20, 30] as const;
export const APP_THEME_STORAGE_KEY = "wizards-theme";

const WIZARDS_THEME_CLASS_NAMES = Array.from(
  new Set([...WIZARDS_THEME_IDS, ...Object.keys(LEGACY_THEME_ALIASES)]),
);

export function applyWizardsThemeToDocument(value: string | null | undefined) {
  const theme = normalizeWizardsThemeId(value);

  if (typeof document === "undefined") {
    return theme;
  }

  const root = document.documentElement;
  const mode = getWizardsThemeMode(theme);

  root.classList.remove(...WIZARDS_THEME_CLASS_NAMES);
  root.classList.add(theme);
  root.dataset.theme = mode;
  root.style.colorScheme = mode;

  try {
    window.localStorage.setItem(APP_THEME_STORAGE_KEY, theme);
  } catch {
    // Ignore storage failures; the visual theme is already applied for this runtime.
  }

  return theme;
}

const SERVER_RAIL_WIDTH_STORAGE_KEY = "wizards.serverRailWidth";
const CHANNEL_SIDEBAR_WIDTH_STORAGE_KEY = "wizards.channelSidebarWidth";
const NOTIFICATION_LIMIT_STORAGE_KEY = "wizards.notificationLimit";
const NOTIFICATION_AUTO_CLOSE_STORAGE_KEY = "wizards.notificationAutoClose";

export function clampServerRailWidth(value: number) {
  return Math.min(MAX_SERVER_RAIL_WIDTH, Math.max(MIN_SERVER_RAIL_WIDTH, value));
}

/** Old expanded-rail values were ignored by the fixed 74 px shell. Preserve that appearance. */
export function normalizeStoredServerRailWidth(value: number) {
  return !Number.isFinite(value) || value > MAX_SERVER_RAIL_WIDTH
    ? DEFAULT_SERVER_RAIL_WIDTH
    : clampServerRailWidth(value);
}

export function clampExpandedServerRailWidth(value: number) {
  return Math.min(MAX_SERVER_RAIL_WIDTH, Math.max(EXPANDED_MIN_SERVER_RAIL_WIDTH, value));
}

export function clampServerRailIconSize(value: number) {
  return Math.min(MAX_SERVER_RAIL_ICON_SIZE, Math.max(MIN_SERVER_RAIL_ICON_SIZE, value));
}

export function readStoredServerRailWidth() {
  if (typeof window === "undefined") {
    return DEFAULT_SERVER_RAIL_WIDTH;
  }

  const rawValue = window.localStorage.getItem(SERVER_RAIL_WIDTH_STORAGE_KEY);
  const parsedValue = Number(rawValue);

  if (!Number.isFinite(parsedValue)) {
    return DEFAULT_SERVER_RAIL_WIDTH;
  }

  return clampServerRailWidth(parsedValue);
}

export function writeStoredServerRailWidth(value: number) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(SERVER_RAIL_WIDTH_STORAGE_KEY, String(clampServerRailWidth(value)));
}

export function clampChannelSidebarWidth(value: number) {
  return Math.min(MAX_CHANNEL_SIDEBAR_WIDTH, Math.max(MIN_CHANNEL_SIDEBAR_WIDTH, value));
}

export function clampMainPanelWidth(value: number) {
  return Math.min(MAX_MAIN_PANEL_WIDTH, Math.max(MIN_MAIN_PANEL_WIDTH, value));
}

export function readStoredChannelSidebarWidth() {
  if (typeof window === "undefined") {
    return DEFAULT_CHANNEL_SIDEBAR_WIDTH;
  }

  const rawValue = window.localStorage.getItem(CHANNEL_SIDEBAR_WIDTH_STORAGE_KEY);
  const parsedValue = Number(rawValue);

  if (!Number.isFinite(parsedValue)) {
    return DEFAULT_CHANNEL_SIDEBAR_WIDTH;
  }

  return clampChannelSidebarWidth(parsedValue);
}

export function writeStoredChannelSidebarWidth(value: number) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    CHANNEL_SIDEBAR_WIDTH_STORAGE_KEY,
    String(clampChannelSidebarWidth(value)),
  );
}

function clampNotificationLimit(value: number) {
  return Math.min(MAX_NOTIFICATION_LIMIT, Math.max(MIN_NOTIFICATION_LIMIT, value));
}

export function clampNotificationPopupTimeoutSeconds(value: number) {
  return Math.min(
    MAX_NOTIFICATION_POPUP_TIMEOUT_SECONDS,
    Math.max(MIN_NOTIFICATION_POPUP_TIMEOUT_SECONDS, value),
  );
}

export function readStoredNotificationLimit() {
  if (typeof window === "undefined") {
    return DEFAULT_NOTIFICATION_LIMIT;
  }

  const rawValue = window.localStorage.getItem(NOTIFICATION_LIMIT_STORAGE_KEY);
  const parsedValue = Number(rawValue);

  if (!Number.isFinite(parsedValue)) {
    return DEFAULT_NOTIFICATION_LIMIT;
  }

  return clampNotificationLimit(parsedValue);
}

export function writeStoredNotificationLimit(value: number) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    NOTIFICATION_LIMIT_STORAGE_KEY,
    String(clampNotificationLimit(value)),
  );
}

export function readStoredNotificationAutoClose() {
  if (typeof window === "undefined") {
    return true;
  }

  const rawValue = window.localStorage.getItem(NOTIFICATION_AUTO_CLOSE_STORAGE_KEY);
  return rawValue !== "false";
}

export function writeStoredNotificationAutoClose(value: boolean) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(NOTIFICATION_AUTO_CLOSE_STORAGE_KEY, String(value));
}

export function clearLegacyAppearanceStorage() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(SERVER_RAIL_WIDTH_STORAGE_KEY);
  window.localStorage.removeItem(CHANNEL_SIDEBAR_WIDTH_STORAGE_KEY);
  window.localStorage.removeItem(NOTIFICATION_LIMIT_STORAGE_KEY);
  window.localStorage.removeItem(NOTIFICATION_AUTO_CLOSE_STORAGE_KEY);
}
