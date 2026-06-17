import { getMessage, type AppLocale } from "@/lib/locale";

export type WhisprReleaseNote = {
  categoryKey: string;
  descriptionKey: string;
  fallbackCategory?: string;
  fallbackDescription?: string;
  fallbackTitle?: string;
  id: string;
  titleKey: string;
};

export type WhisprVersionPayload = {
  appName: "Whispr";
  buildId: string;
  buildTime: string;
  releaseChannel: string;
  version: string;
  notes: WhisprReleaseNote[];
};

function formatWhisprVersion(version: string, codename: string) {
  const trimmedVersion = version.trim();
  const trimmedCodename = codename.trim();

  if (!trimmedCodename || trimmedVersion.toLowerCase().includes(trimmedCodename.toLowerCase())) {
    return trimmedVersion;
  }

  return `${trimmedVersion} "${trimmedCodename}"`;
}

const WHISPR_VERSION_NUMBER =
  process.env.NEXT_PUBLIC_WHISPR_VERSION ?? "0.8.9";
export const WHISPR_RELEASE_CODENAME =
  process.env.NEXT_PUBLIC_WHISPR_RELEASE_CODENAME ?? "Echo";
export const WHISPR_APP_VERSION = formatWhisprVersion(
  WHISPR_VERSION_NUMBER,
  WHISPR_RELEASE_CODENAME,
);
export const WHISPR_BUILD_ID =
  process.env.NEXT_PUBLIC_WHISPR_BUILD_ID ?? "development";
export const WHISPR_BUILD_TIME =
  process.env.NEXT_PUBLIC_WHISPR_BUILD_TIME ?? "";
export const WHISPR_RELEASE_CHANNEL =
  process.env.NEXT_PUBLIC_WHISPR_RELEASE_CHANNEL ?? "beta";

export const WHISPR_RELEASE_NOTES: WhisprReleaseNote[] = [
  {
    categoryKey: "app.update.category.design",
    descriptionKey: "app.update.notes.mainShellRefresh.description",
    fallbackCategory: "Design",
    fallbackDescription:
      "The main workspace now uses a calmer four-column shell, fewer nested borders, tighter chat spacing, a cleaner composer, and a better-aligned compact user bar.",
    fallbackTitle: "Main workspace refresh",
    id: "main-shell-refresh",
    titleKey: "app.update.notes.mainShellRefresh.title",
  },
  {
    categoryKey: "app.update.category.design",
    descriptionKey: "app.update.notes.settingsRefresh.description",
    fallbackCategory: "Design",
    fallbackDescription:
      "Settings now has a modern sidebar, redesigned account profile cards, profile completion, privacy previews, and safer desktop preference surfaces.",
    fallbackTitle: "Modern settings experience",
    id: "settings-refresh",
    titleKey: "app.update.notes.settingsRefresh.title",
  },
  {
    categoryKey: "app.update.category.design",
    descriptionKey: "app.update.notes.compactServerRail.description",
    fallbackCategory: "Design",
    fallbackDescription:
      "The server rail is now always compact and icon-first, differentiates DMs from servers, tightens icon spacing, and uses a cleaner active server ring without the old density controls.",
    fallbackTitle: "Compact server rail",
    id: "compact-server-rail",
    titleKey: "app.update.notes.compactServerRail.title",
  },
  {
    categoryKey: "app.update.category.desktop",
    descriptionKey: "app.update.notes.desktopStartup.description",
    fallbackCategory: "Desktop",
    fallbackDescription:
      "Desktop now opens with a compact startup window, keeps the Whispr splash consistent through promotion, restores remembered sessions, and preserves the main window size and position.",
    fallbackTitle: "Desktop startup and session polish",
    id: "desktop-startup-session",
    titleKey: "app.update.notes.desktopStartup.title",
  },
  {
    categoryKey: "app.update.category.voice",
    descriptionKey: "app.update.notes.desktopVoiceControls.description",
    fallbackCategory: "Voice",
    fallbackDescription:
      "Desktop voice controls now support safer global shortcuts, push-to-talk hold behavior, mute and deafen shortcuts, and a calmer voice settings panel.",
    fallbackTitle: "Desktop voice controls",
    id: "desktop-voice-controls",
    titleKey: "app.update.notes.desktopVoiceControls.title",
  },
  {
    categoryKey: "app.update.category.desktop",
    descriptionKey: "app.update.notes.desktopOverlay.description",
    fallbackCategory: "Desktop",
    fallbackDescription:
      "Voice mini window and game overlay surfaces now stream sanitized voice state, show mute and deafen status from desktop or web users, and avoid blocking the game view.",
    fallbackTitle: "Voice overlay and mini window",
    id: "desktop-overlay-mini",
    titleKey: "app.update.notes.desktopOverlay.title",
  },
  {
    categoryKey: "app.update.category.security",
    descriptionKey: "app.update.notes.desktopSecurityFoundation.description",
    fallbackCategory: "Security",
    fallbackDescription:
      "Tauri capabilities are split by surface, production CSP covers the desktop WebSocket path, close-to-tray is configurable, and updater/autostart foundations stay opt-in.",
    fallbackTitle: "Safer desktop shell foundation",
    id: "desktop-security-foundation",
    titleKey: "app.update.notes.desktopSecurityFoundation.title",
  },
  {
    categoryKey: "app.update.category.quality",
    descriptionKey: "app.update.notes.releaseVerification.description",
    fallbackCategory: "Quality",
    fallbackDescription:
      "Release checks now cover desktop helpers, session cookies, Turnstile dev bypasses, voice participant mapping, route contracts, and refreshed Playwright message helpers.",
    fallbackTitle: "Release verification pass",
    id: "release-verification",
    titleKey: "app.update.notes.releaseVerification.title",
  },
];

function localizeReleaseNoteText(locale: AppLocale, key: string, fallback: string | undefined) {
  return getMessage(locale, key) ?? fallback ?? key;
}

function getWhisprReleaseNotes(locale?: AppLocale): WhisprReleaseNote[] {
  if (!locale) {
    return WHISPR_RELEASE_NOTES;
  }

  return WHISPR_RELEASE_NOTES.map((note) => ({
    ...note,
    categoryKey: localizeReleaseNoteText(locale, note.categoryKey, note.fallbackCategory),
    descriptionKey: localizeReleaseNoteText(locale, note.descriptionKey, note.fallbackDescription),
    titleKey: localizeReleaseNoteText(locale, note.titleKey, note.fallbackTitle),
  }));
}

export function getWhisprVersionPayload(locale?: AppLocale): WhisprVersionPayload {
  return {
    appName: "Whispr",
    buildId: WHISPR_BUILD_ID,
    buildTime: WHISPR_BUILD_TIME,
    releaseChannel: WHISPR_RELEASE_CHANNEL,
    version: WHISPR_APP_VERSION,
    notes: getWhisprReleaseNotes(locale),
  };
}
