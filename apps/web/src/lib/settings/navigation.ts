export type SettingsSection =
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
  section: SettingsSection;
};

const PANELS_BY_SECTION: Record<SettingsSection, readonly SettingsPanelKey[]> = {
  account: ["badges"],
  voice: ["audio", "camera", "screenShare"],
  desktop: ["desktopBehavior", "desktopVoice", "desktopDiagnostics"],
  appearance: ["language", "theme", "messageFont", "advanced", "appIcon"],
  notifications: ["general", "sounds"],
  about: ["overview", "build", "whatsNew", "developer"],
};

export function buildSettingsHref(section: SettingsSection, panel?: SettingsPanelKey | null) {
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
  ) as SettingsSection;

  const validPanels = PANELS_BY_SECTION[section];
  const panel = (
    rawPanel && validPanels.includes(rawPanel as SettingsPanelKey) ? rawPanel : null
  ) as SettingsPanelKey | null;

  return { panel, section };
}

export function isAdvancedAppearancePanel(panel: SettingsPanelKey | null) {
  return panel === "advanced" || panel === "appIcon";
}
