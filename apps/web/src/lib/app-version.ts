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
    categoryKey: "app.update.category.voice",
    descriptionKey: "app.update.notes.voiceReliability.description",
    fallbackCategory: "Voice",
    fallbackDescription:
      "Voice joins are now idempotent, heartbeat timers bind safely in browsers, failed joins roll back their server state, and non-critical sync steps no longer tear down an active call.",
    fallbackTitle: "Voice connection stability",
    id: "voice-reliability",
    titleKey: "app.update.notes.voiceReliability.title",
  },
  {
    categoryKey: "app.update.category.voice",
    descriptionKey: "app.update.notes.voiceParticipantSync.description",
    fallbackCategory: "Voice",
    fallbackDescription:
      "Leaving a voice room now removes only the departing user from local cache and broadcasts state to both authorized viewers and active participants, so remaining names stay visible without a refresh.",
    fallbackTitle: "Live voice roster sync",
    id: "voice-participant-sync",
    titleKey: "app.update.notes.voiceParticipantSync.title",
  },
  {
    categoryKey: "app.update.category.quality",
    descriptionKey: "app.update.notes.architectureSplit.description",
    fallbackCategory: "Quality",
    fallbackDescription:
      "The voice provider and workspace service are now split into tested helpers and domain services, keeping lifecycle, cache, and transaction rules easier to reason about.",
    fallbackTitle: "Leaner voice and workspace architecture",
    id: "architecture-split",
    titleKey: "app.update.notes.architectureSplit.title",
  },
  {
    categoryKey: "app.update.category.security",
    descriptionKey: "app.update.notes.securityHardening.description",
    fallbackCategory: "Security",
    fallbackDescription:
      "JSON-only mutating APIs, stricter link and attachment fetch validation, OAuth, admin, session, permission, and rate-limit safeguards reduce cross-site and SSRF risk.",
    fallbackTitle: "Security hardening sweep",
    id: "security-hardening",
    titleKey: "app.update.notes.securityHardening.title",
  },
  {
    categoryKey: "app.update.category.desktop",
    descriptionKey: "app.update.notes.releaseReadiness.description",
    fallbackCategory: "Desktop",
    fallbackDescription:
      "The desktop build now targets whispr.team capabilities, LiveKit/Krisp CSP support, health and readiness checks, Railway config, and migration-aware startup paths.",
    fallbackTitle: "Desktop and deploy readiness",
    id: "release-readiness",
    titleKey: "app.update.notes.releaseReadiness.title",
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
