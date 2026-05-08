export type SettingsSection =
  | "account"
  | "voice"
  | "appearance"
  | "notifications"
  | "about";

export type SettingsPanelKey =
  | "audio"
  | "camera"
  | "screenShare"
  | "language"
  | "theme"
  | "advanced"
  | "appIcon"
  | "serverRail"
  | "mainCanvas"
  | "channelSidebar"
  | "general"
  | "sounds"
  | "overview"
  | "build"
  | "whatsNew"
  | "desktop"
  | "developer";

export type SettingsSelection = {
  panel: SettingsPanelKey | null;
  section: SettingsSection;
};

const PANELS_BY_SECTION: Record<SettingsSection, readonly SettingsPanelKey[]> = {
  account: [],
  voice: ["audio", "camera", "screenShare"],
  appearance: [
    "language",
    "theme",
    "advanced",
    "appIcon",
    "serverRail",
    "mainCanvas",
    "channelSidebar",
  ],
  notifications: ["general", "sounds"],
  about: ["overview", "build", "whatsNew", "desktop", "developer"],
};

export function buildSettingsHref(
  section: SettingsSection,
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

  const section = (
    rawSection &&
    ["account", "voice", "appearance", "notifications", "about"].includes(rawSection)
      ? rawSection
      : "account"
  ) as SettingsSection;

  const validPanels = PANELS_BY_SECTION[section];
  const panel = (rawPanel && validPanels.includes(rawPanel as SettingsPanelKey)
    ? rawPanel
    : null) as SettingsPanelKey | null;

  return { panel, section };
}

export function isAdvancedAppearancePanel(panel: SettingsPanelKey | null) {
  return (
    panel === "advanced" ||
    panel === "appIcon" ||
    panel === "serverRail" ||
    panel === "mainCanvas" ||
    panel === "channelSidebar"
  );
}
