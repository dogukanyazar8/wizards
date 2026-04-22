export type WizardsThemeId =
  | "theme-graphite"
  | "theme-midnight"
  | "theme-dawn"
  | "theme-studio"
  | "theme-mist";

export const WIZARDS_THEMES: Array<{
  description: string;
  id: WizardsThemeId;
  label: string;
  preview: [string, string, string];
}> = [
  {
    description: "Soft dark",
    id: "theme-graphite",
    label: "Graphite",
    preview: ["#151a24", "#293245", "#7dd3fc"],
  },
  {
    description: "Deep dark",
    id: "theme-midnight",
    label: "Midnight",
    preview: ["#09090f", "#151a2e", "#38bdf8"],
  },
  {
    description: "Bright light",
    id: "theme-dawn",
    label: "Dawn",
    preview: ["#f4f7fb", "#dbe5f2", "#3b82f6"],
  },
  {
    description: "Colorful",
    id: "theme-studio",
    label: "Studio",
    preview: ["#1a1333", "#3f2e73", "#f472b6"],
  },
  {
    description: "Soft light",
    id: "theme-mist",
    label: "Mist",
    preview: ["#f8f4ef", "#ebe7df", "#22c55e"],
  },
];

export const WIZARDS_THEME_IDS = WIZARDS_THEMES.map((theme) => theme.id);

export const DEFAULT_SERVER_RAIL_WIDTH = 88;
export const MIN_SERVER_RAIL_WIDTH = 80;
export const MAX_SERVER_RAIL_WIDTH = 124;
export const SERVER_RAIL_WIDTH_STEP = 4;

const SERVER_RAIL_WIDTH_STORAGE_KEY = "wizards.serverRailWidth";

export function clampServerRailWidth(value: number) {
  return Math.min(MAX_SERVER_RAIL_WIDTH, Math.max(MIN_SERVER_RAIL_WIDTH, value));
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
