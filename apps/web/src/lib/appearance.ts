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
  | { kind: "solid"; color: string }
  | { kind: "gradient"; stops: [string, string, string] };

export type WizardsThemeDefinition = {
  category: WizardsThemeCategory;
  description: string;
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
    description: "Bright neutral canvas",
    category: "simple",
    mode: "light",
    preview: { kind: "solid", color: "#ffffff" },
  },
  {
    id: "theme-ash",
    label: "Ash",
    description: "Discord-inspired charcoal",
    category: "simple",
    mode: "dark",
    preview: { kind: "solid", color: "#36393f" },
  },
  {
    id: "theme-dark",
    label: "Dark",
    description: "Classic deep slate",
    category: "simple",
    mode: "dark",
    preview: { kind: "solid", color: "#2c2f33" },
  },
  {
    id: "theme-onyx",
    label: "Onyx",
    description: "Rich low-glare black",
    category: "simple",
    mode: "dark",
    preview: { kind: "solid", color: "#1a1b1e" },
  },
  {
    id: "theme-mint-green",
    label: "Mint Green",
    description: "Airy mint pastel",
    category: "advanced",
    mode: "light",
    preview: { kind: "gradient", stops: ["#d6f7e4", "#bdeed2", "#8fdcb3"] },
  },
  {
    id: "theme-peach-orange",
    label: "Peach Orange",
    description: "Warm citrus glow",
    category: "advanced",
    mode: "light",
    preview: { kind: "gradient", stops: ["#ffe6d7", "#ffd2b8", "#ffb688"] },
  },
  {
    id: "theme-lavender",
    label: "Lavender",
    description: "Soft lilac haze",
    category: "advanced",
    mode: "light",
    preview: { kind: "gradient", stops: ["#ebe5ff", "#ddd3ff", "#c0b2ff"] },
  },
  {
    id: "theme-sage-green",
    label: "Sage Green",
    description: "Muted botanical tones",
    category: "advanced",
    mode: "light",
    preview: { kind: "gradient", stops: ["#edf4ea", "#d7e7cf", "#b8cfaa"] },
  },
  {
    id: "theme-cream-yellow",
    label: "Cream Yellow",
    description: "Buttery soft daylight",
    category: "advanced",
    mode: "light",
    preview: { kind: "gradient", stops: ["#fff9dd", "#fff1b8", "#f6dd77"] },
  },
  {
    id: "theme-dusty-rose",
    label: "Dusty Rose",
    description: "Powdered rose blush",
    category: "advanced",
    mode: "light",
    preview: { kind: "gradient", stops: ["#f8e3e9", "#f0ccd8", "#d8a6ba"] },
  },
  {
    id: "theme-soft-pink",
    label: "Soft Pink",
    description: "Cotton candy shimmer",
    category: "advanced",
    mode: "light",
    preview: { kind: "gradient", stops: ["#ffe5f1", "#ffd0e8", "#ffb1d8"] },
  },
  {
    id: "theme-sky-blue",
    label: "Sky Blue",
    description: "Cloud-washed blue",
    category: "advanced",
    mode: "light",
    preview: { kind: "gradient", stops: ["#e2f1ff", "#c7e4ff", "#91c8ff"] },
  },
  {
    id: "theme-warm-beige",
    label: "Warm Beige",
    description: "Neutral cafe tones",
    category: "advanced",
    mode: "light",
    preview: { kind: "gradient", stops: ["#f7ecdf", "#eadbc8", "#d0b89b"] },
  },
  {
    id: "theme-deep-purple-gradient",
    label: "Deep Purple",
    description: "Velvet plum gradient",
    category: "advanced",
    mode: "dark",
    preview: { kind: "gradient", stops: ["#4f2d8c", "#6f42b6", "#c77dff"] },
  },
  {
    id: "theme-blue-purple-gradient",
    label: "Blue Purple",
    description: "Electric dusk blend",
    category: "advanced",
    mode: "dark",
    preview: { kind: "gradient", stops: ["#1f5fff", "#5b5ff7", "#8d6bff"] },
  },
  {
    id: "theme-forest-dark",
    label: "Forest Dark",
    description: "Mossy deep green",
    category: "advanced",
    mode: "dark",
    preview: { kind: "gradient", stops: ["#14281f", "#234535", "#5a7c54"] },
  },
  {
    id: "theme-crimson-dark",
    label: "Crimson Dark",
    description: "Smoky scarlet noir",
    category: "advanced",
    mode: "dark",
    preview: { kind: "gradient", stops: ["#2a060b", "#5a0f18", "#aa1f34"] },
  },
  {
    id: "theme-midnight-navy",
    label: "Midnight Navy",
    description: "Quiet midnight blue",
    category: "advanced",
    mode: "dark",
    preview: { kind: "gradient", stops: ["#08142d", "#102248", "#1c3d72"] },
  },
  {
    id: "theme-mauve-dark",
    label: "Mauve Dark",
    description: "Muted plum evening",
    category: "advanced",
    mode: "dark",
    preview: { kind: "gradient", stops: ["#2a1b2e", "#4d3254", "#8e5a8f"] },
  },
  {
    id: "theme-slate-dark",
    label: "Slate Dark",
    description: "Monochrome steel slate",
    category: "advanced",
    mode: "dark",
    preview: { kind: "gradient", stops: ["#1b222b", "#2d3745", "#516377"] },
  },
  {
    id: "theme-teal-dark",
    label: "Teal Dark",
    description: "Deep sea teal",
    category: "advanced",
    mode: "dark",
    preview: { kind: "gradient", stops: ["#0b2928", "#12504f", "#1b8a88"] },
  },
  {
    id: "theme-ocean-dark",
    label: "Ocean Dark",
    description: "Bluewater twilight",
    category: "advanced",
    mode: "dark",
    preview: { kind: "gradient", stops: ["#0a2338", "#124667", "#1f83a6"] },
  },
  {
    id: "theme-purple-teal",
    label: "Purple Teal",
    description: "Bioluminescent blend",
    category: "advanced",
    mode: "dark",
    preview: { kind: "gradient", stops: ["#5727a4", "#3f6cc9", "#26bfa9"] },
  },
  {
    id: "theme-amber-dark",
    label: "Amber Dark",
    description: "Golden ember glow",
    category: "advanced",
    mode: "dark",
    preview: { kind: "gradient", stops: ["#2b1a06", "#5d3608", "#d48b12"] },
  },
  {
    id: "theme-green-rainbow",
    label: "Green Rainbow",
    description: "Prismatic neon green",
    category: "advanced",
    mode: "dark",
    preview: { kind: "gradient", stops: ["#123e28", "#1f9f6e", "#7ed957"] },
  },
  {
    id: "theme-khaki-dark",
    label: "Khaki Dark",
    description: "Earthy olive dusk",
    category: "advanced",
    mode: "dark",
    preview: { kind: "gradient", stops: ["#2a2416", "#51452b", "#8b7c4c"] },
  },
  {
    id: "theme-royal-blue",
    label: "Royal Blue",
    description: "Bold saturated royal",
    category: "advanced",
    mode: "dark",
    preview: { kind: "solid", color: "#2d4bff" },
  },
];

export const WIZARDS_THEME_IDS = WIZARDS_THEMES.map((theme) => theme.id);
export const SIMPLE_WIZARDS_THEMES = WIZARDS_THEMES.filter(
  (theme) => theme.category === "simple",
);
export const ADVANCED_WIZARDS_THEMES = WIZARDS_THEMES.filter(
  (theme) => theme.category === "advanced",
);
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

export function normalizeWizardsThemeId(
  value: string | null | undefined,
): WizardsThemeId {
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

export const ICON_ONLY_SERVER_RAIL_WIDTH = 88;
export const EXPANDED_MIN_SERVER_RAIL_WIDTH = 136;
export const DEFAULT_SERVER_RAIL_WIDTH = 136;
export const MIN_SERVER_RAIL_WIDTH = ICON_ONLY_SERVER_RAIL_WIDTH;
export const MAX_SERVER_RAIL_WIDTH = 184;
export const SERVER_RAIL_WIDTH_STEP = 4;
export const DEFAULT_SERVER_RAIL_ICON_SIZE = 40;
export const MIN_SERVER_RAIL_ICON_SIZE = 34;
export const MAX_SERVER_RAIL_ICON_SIZE = 54;
export const SERVER_RAIL_ICON_SIZE_STEP = 2;
export const DEFAULT_CHANNEL_SIDEBAR_WIDTH = 288;
export const MIN_CHANNEL_SIDEBAR_WIDTH = 264;
export const MAX_CHANNEL_SIDEBAR_WIDTH = 600;
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

const SERVER_RAIL_WIDTH_STORAGE_KEY = "wizards.serverRailWidth";
const CHANNEL_SIDEBAR_WIDTH_STORAGE_KEY = "wizards.channelSidebarWidth";
const NOTIFICATION_LIMIT_STORAGE_KEY = "wizards.notificationLimit";
const NOTIFICATION_AUTO_CLOSE_STORAGE_KEY = "wizards.notificationAutoClose";

export function clampServerRailWidth(value: number) {
  return Math.min(MAX_SERVER_RAIL_WIDTH, Math.max(MIN_SERVER_RAIL_WIDTH, value));
}

export function clampExpandedServerRailWidth(value: number) {
  return Math.min(
    MAX_SERVER_RAIL_WIDTH,
    Math.max(EXPANDED_MIN_SERVER_RAIL_WIDTH, value),
  );
}

export function clampServerRailIconSize(value: number) {
  return Math.min(
    MAX_SERVER_RAIL_ICON_SIZE,
    Math.max(MIN_SERVER_RAIL_ICON_SIZE, value),
  );
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

  window.localStorage.setItem(
    SERVER_RAIL_WIDTH_STORAGE_KEY,
    String(clampServerRailWidth(value)),
  );
}

export function clampChannelSidebarWidth(value: number) {
  return Math.min(
    MAX_CHANNEL_SIDEBAR_WIDTH,
    Math.max(MIN_CHANNEL_SIDEBAR_WIDTH, value),
  );
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
