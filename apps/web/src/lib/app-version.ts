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
  process.env.NEXT_PUBLIC_WHISPR_VERSION ?? "0.8.7";
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
    categoryKey: "app.update.category.desktop",
    descriptionKey: "app.update.notes.desktopStartup.description",
    fallbackCategory: "Desktop",
    fallbackDescription:
      "Desktop now opens with a compact Whispr startup window, keeps the splash visible while the main workspace is promoted, and avoids blank first-run screens.",
    fallbackTitle: "Discord-style desktop startup",
    id: "desktop-startup",
    titleKey: "app.update.notes.desktopStartup.title",
  },
  {
    categoryKey: "app.update.category.security",
    descriptionKey: "app.update.notes.rememberedDesktopSession.description",
    fallbackCategory: "Security",
    fallbackDescription:
      "Remember me now extends trusted credential sessions, while regular logins keep a shorter lifetime and the desktop WebView stores its session in a stable app data profile.",
    fallbackTitle: "Remembered desktop sessions",
    id: "remembered-desktop-session",
    titleKey: "app.update.notes.rememberedDesktopSession.title",
  },
  {
    categoryKey: "app.update.category.performance",
    descriptionKey: "app.update.notes.startupReadiness.description",
    fallbackCategory: "Performance",
    fallbackDescription:
      "Browser startup now shows the Whispr splash before the shell, then fades into the workspace only after layout, route data, and workspace state are ready.",
    fallbackTitle: "First-paint startup readiness",
    id: "startup-readiness",
    titleKey: "app.update.notes.startupReadiness.title",
  },
  {
    categoryKey: "app.update.category.desktop",
    descriptionKey: "app.update.notes.desktopChrome.description",
    fallbackCategory: "Desktop",
    fallbackDescription:
      "The desktop title bar is slimmer and calmer, keeps the Whispr title consistent, and hides chrome entirely during startup.",
    fallbackTitle: "Cleaner desktop window chrome",
    id: "desktop-chrome",
    titleKey: "app.update.notes.desktopChrome.title",
  },
  {
    categoryKey: "app.update.category.quality",
    descriptionKey: "app.update.notes.startupSafety.description",
    fallbackCategory: "Quality",
    fallbackDescription:
      "Startup navigation now validates safe callback paths, keeps update and title copy localized, and uses fallback promotion paths when desktop resizing cannot complete in place.",
    fallbackTitle: "Safer app startup flow",
    id: "startup-safety",
    titleKey: "app.update.notes.startupSafety.title",
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
