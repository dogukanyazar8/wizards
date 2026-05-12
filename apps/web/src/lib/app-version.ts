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
  process.env.NEXT_PUBLIC_WHISPR_VERSION ?? "0.8.6";
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
    descriptionKey: "app.update.notes.voiceInvites.description",
    id: "voice-room-invites",
    titleKey: "app.update.notes.voiceInvites.title",
  },
  {
    categoryKey: "app.update.category.quality",
    descriptionKey: "app.update.notes.voiceRecovery.description",
    id: "voice-room-recovery",
    titleKey: "app.update.notes.voiceRecovery.title",
  },
  {
    categoryKey: "app.update.category.voice",
    descriptionKey: "app.update.notes.voiceActivitySync.description",
    id: "voice-activity-sync",
    titleKey: "app.update.notes.voiceActivitySync.title",
  },
  {
    categoryKey: "app.update.category.servers",
    descriptionKey: "app.update.notes.memberPanelRoles.description",
    id: "role-aware-member-panel",
    titleKey: "app.update.notes.memberPanelRoles.title",
  },
  {
    categoryKey: "app.update.category.notifications",
    descriptionKey: "app.update.notes.roleNotifications.description",
    id: "role-and-invite-notifications",
    titleKey: "app.update.notes.roleNotifications.title",
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
