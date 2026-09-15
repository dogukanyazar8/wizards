import { resolveWebReleaseChannel } from "@/lib/build-release-channel";
import { getMessage, type AppLocale } from "@/lib/locale";
export { WHISPR_DESKTOP_DOWNLOAD_URL } from "@/lib/desktop-download";

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

/** Çıplak semver — süslenmemiş hâli açılış ekranının sürüm satırına girer. */
export const WHISPR_VERSION_NUMBER = process.env.NEXT_PUBLIC_WHISPR_VERSION ?? "0.9.0";
export const WHISPR_RELEASE_CODENAME =
  process.env.NEXT_PUBLIC_WHISPR_RELEASE_CODENAME ?? "Resonance";
export const WHISPR_APP_VERSION = formatWhisprVersion(
  WHISPR_VERSION_NUMBER,
  WHISPR_RELEASE_CODENAME,
);
export const WHISPR_BUILD_ID = process.env.NEXT_PUBLIC_WHISPR_BUILD_ID ?? "development";
/**
 * Yayın numarası — açılış ekranının sürüm satırındaki parantez (SPEC-SPLASH §3.4).
 *
 * `WHISPR_BUILD_ID`'den ayrıdır: o commit/deploy kimliğinden türer ve güncelleme
 * bildiricisinin `x-whispr-client-build` başlığını besler. Verilmediğinde boş kalır
 * ve satırdan parantez bloğu tümüyle düşer.
 */
export const WHISPR_BUILD_NUMBER = process.env.NEXT_PUBLIC_WHISPR_BUILD_NUMBER ?? "";
export const WHISPR_BUILD_TIME = process.env.NEXT_PUBLIC_WHISPR_BUILD_TIME ?? "";
export const WHISPR_RELEASE_CHANNEL = resolveWebReleaseChannel(
  process.env.NEXT_PUBLIC_WHISPR_RELEASE_CHANNEL,
);

export const WHISPR_RELEASE_NOTES: WhisprReleaseNote[] = [
  {
    categoryKey: "app.update.category.desktop",
    descriptionKey: "app.update.notes.releaseAutomation.description",
    fallbackCategory: "Desktop",
    fallbackDescription:
      "Desktop release builds now run through a guarded GitHub workflow, produce signed updater artifacts, publish UAT evidence, and keep latest.json separate from immutable installers.",
    fallbackTitle: "Signed desktop release pipeline",
    id: "release-automation",
    titleKey: "app.update.notes.releaseAutomation.title",
  },
  {
    categoryKey: "app.update.category.messaging",
    descriptionKey: "app.update.notes.dmMobileExperience.description",
    fallbackCategory: "Messaging",
    fallbackDescription:
      "Direct messages, mobile navigation, chat surfaces, popups, and side panels were tightened for smaller screens without introducing demo data or changing realtime contracts.",
    fallbackTitle: "Sharper DM and mobile experience",
    id: "dm-mobile-experience",
    titleKey: "app.update.notes.dmMobileExperience.title",
  },
  {
    categoryKey: "app.update.category.voice",
    descriptionKey: "app.update.notes.voiceRealtimeQuality.description",
    fallbackCategory: "Voice",
    fallbackDescription:
      "Voice and realtime flows now have stronger cleanup, participant sync, screen share coverage, and responsive voice layouts for multi-user and small viewport scenarios.",
    fallbackTitle: "More reliable voice and realtime",
    id: "voice-realtime-quality",
    titleKey: "app.update.notes.voiceRealtimeQuality.title",
  },
  {
    categoryKey: "app.update.category.quality",
    descriptionKey: "app.update.notes.qualityGate.description",
    fallbackCategory: "Quality",
    fallbackDescription:
      "The test matrix now covers mobile, DM, realtime, voice, desktop release checks, Playwright diagnostics, and local/CI parity before UAT promotion.",
    fallbackTitle: "Stronger release quality gate",
    id: "quality-gate",
    titleKey: "app.update.notes.qualityGate.title",
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
