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
  process.env.NEXT_PUBLIC_WHISPR_VERSION ?? "0.8.5";
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
    categoryKey: "app.update.category.messaging",
    descriptionKey: "app.update.notes.mediaPreview.description",
    id: "media-preview-downloads",
    titleKey: "app.update.notes.mediaPreview.title",
  },
  {
    categoryKey: "app.update.category.settings",
    descriptionKey: "app.update.notes.authRefresh.description",
    id: "modern-auth-refresh",
    titleKey: "app.update.notes.authRefresh.title",
  },
  {
    categoryKey: "app.update.category.voice",
    descriptionKey: "app.update.notes.mediaExperience.description",
    id: "voice-video-screen-share-polish",
    titleKey: "app.update.notes.mediaExperience.title",
  },
  {
    categoryKey: "app.update.category.servers",
    descriptionKey: "app.update.notes.rolesPreview.description",
    id: "roles-preview-groundwork",
    titleKey: "app.update.notes.rolesPreview.title",
  },
  {
    categoryKey: "app.update.category.desktop",
    descriptionKey: "app.update.notes.iconRefresh.description",
    id: "whispr-icon-refresh",
    titleKey: "app.update.notes.iconRefresh.title",
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
