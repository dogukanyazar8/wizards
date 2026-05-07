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

export const WHISPR_APP_VERSION =
  process.env.NEXT_PUBLIC_WHISPR_VERSION ?? "0.8.2";
export const WHISPR_BUILD_ID =
  process.env.NEXT_PUBLIC_WHISPR_BUILD_ID ?? "development";
export const WHISPR_BUILD_TIME =
  process.env.NEXT_PUBLIC_WHISPR_BUILD_TIME ?? "";
export const WHISPR_RELEASE_CHANNEL =
  process.env.NEXT_PUBLIC_WHISPR_RELEASE_CHANNEL ?? "development";

export const WHISPR_RELEASE_NOTES: WhisprReleaseNote[] = [
  {
    categoryKey: "app.update.category.messaging",
    descriptionKey: "app.update.notes.messaging.description",
    id: "messaging-separator-polish",
    titleKey: "app.update.notes.messaging.title",
  },
  {
    categoryKey: "app.update.category.servers",
    descriptionKey: "app.update.notes.settings.description",
    id: "channel-sidebar-alignment",
    titleKey: "app.update.notes.settings.title",
  },
  {
    categoryKey: "app.update.category.quality",
    descriptionKey: "app.update.notes.servers.description",
    id: "thread-prop-cleanup",
    titleKey: "app.update.notes.servers.title",
  },
  {
    categoryKey: "app.update.category.settings",
    descriptionKey: "app.update.notes.voice.description",
    id: "short-release-notes",
    titleKey: "app.update.notes.voice.title",
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
