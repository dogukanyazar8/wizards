export type WhisprReleaseNote = {
  categoryKey: string;
  descriptionKey: string;
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
    id: "voice-reliability",
    titleKey: "app.update.notes.voiceReliability.title",
  },
  {
    categoryKey: "app.update.category.voice",
    descriptionKey: "app.update.notes.voiceParticipantSync.description",
    id: "voice-participant-sync",
    titleKey: "app.update.notes.voiceParticipantSync.title",
  },
  {
    categoryKey: "app.update.category.quality",
    descriptionKey: "app.update.notes.architectureSplit.description",
    id: "architecture-split",
    titleKey: "app.update.notes.architectureSplit.title",
  },
  {
    categoryKey: "app.update.category.security",
    descriptionKey: "app.update.notes.securityHardening.description",
    id: "security-hardening",
    titleKey: "app.update.notes.securityHardening.title",
  },
  {
    categoryKey: "app.update.category.desktop",
    descriptionKey: "app.update.notes.releaseReadiness.description",
    id: "release-readiness",
    titleKey: "app.update.notes.releaseReadiness.title",
  },
];

export function getWhisprVersionPayload(): WhisprVersionPayload {
  return {
    appName: "Whispr",
    buildId: WHISPR_BUILD_ID,
    buildTime: WHISPR_BUILD_TIME,
    releaseChannel: WHISPR_RELEASE_CHANNEL,
    version: WHISPR_APP_VERSION,
    notes: WHISPR_RELEASE_NOTES,
  };
}
