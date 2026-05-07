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
  process.env.NEXT_PUBLIC_WHISPR_VERSION ?? "0.8.3";
export const WHISPR_BUILD_ID =
  process.env.NEXT_PUBLIC_WHISPR_BUILD_ID ?? "development";
export const WHISPR_BUILD_TIME =
  process.env.NEXT_PUBLIC_WHISPR_BUILD_TIME ?? "";
export const WHISPR_RELEASE_CHANNEL =
  process.env.NEXT_PUBLIC_WHISPR_RELEASE_CHANNEL ?? "development";

export const WHISPR_RELEASE_NOTES: WhisprReleaseNote[] = [
  {
    categoryKey: "app.update.category.voice",
    descriptionKey: "app.update.notes.voice.description",
    id: "realtime-voice-activity",
    titleKey: "app.update.notes.voice.title",
  },
  {
    categoryKey: "app.update.category.devices",
    descriptionKey: "app.update.notes.devices.description",
    id: "voice-input-output-status",
    titleKey: "app.update.notes.devices.title",
  },
  {
    categoryKey: "app.update.category.quality",
    descriptionKey: "app.update.notes.quality.description",
    id: "voice-room-feedback-polish",
    titleKey: "app.update.notes.quality.title",
  },
  {
    categoryKey: "app.update.category.desktop",
    descriptionKey: "app.update.notes.desktop.description",
    id: "shared-audio-feedback",
    titleKey: "app.update.notes.desktop.title",
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
