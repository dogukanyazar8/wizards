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
  process.env.NEXT_PUBLIC_WHISPR_VERSION ?? "0.8.0";
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
    id: "messaging-thread-polish",
    titleKey: "app.update.notes.messaging.title",
  },
  {
    categoryKey: "app.update.category.settings",
    descriptionKey: "app.update.notes.settings.description",
    id: "settings-release-notes",
    titleKey: "app.update.notes.settings.title",
  },
  {
    categoryKey: "app.update.category.servers",
    descriptionKey: "app.update.notes.servers.description",
    id: "server-sidebar-settings-polish",
    titleKey: "app.update.notes.servers.title",
  },
  {
    categoryKey: "app.update.category.voice",
    descriptionKey: "app.update.notes.voice.description",
    id: "voice-stability-cleanup",
    titleKey: "app.update.notes.voice.title",
  },
  {
    categoryKey: "app.update.category.notifications",
    descriptionKey: "app.update.notes.sounds.description",
    id: "whispr-sound-defaults",
    titleKey: "app.update.notes.sounds.title",
  },
  {
    categoryKey: "app.update.category.friends",
    descriptionKey: "app.update.notes.friends.description",
    id: "friend-removal-polish",
    titleKey: "app.update.notes.friends.title",
  },
  {
    categoryKey: "app.update.category.devices",
    descriptionKey: "app.update.notes.devices.description",
    id: "shared-audio-device-selection",
    titleKey: "app.update.notes.devices.title",
  },
  {
    categoryKey: "app.update.category.security",
    descriptionKey: "app.update.notes.security.description",
    id: "production-hardening",
    titleKey: "app.update.notes.security.title",
  },
  {
    categoryKey: "app.update.category.performance",
    descriptionKey: "app.update.notes.performance.description",
    id: "messaging-performance",
    titleKey: "app.update.notes.performance.title",
  },
  {
    categoryKey: "app.update.category.desktop",
    descriptionKey: "app.update.notes.desktop.description",
    id: "desktop-readiness",
    titleKey: "app.update.notes.desktop.title",
  },
  {
    categoryKey: "app.update.category.quality",
    descriptionKey: "app.update.notes.quality.description",
    id: "developer-quality",
    titleKey: "app.update.notes.quality.title",
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
