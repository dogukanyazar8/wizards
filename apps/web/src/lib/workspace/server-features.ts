export const SERVER_FEATURE_TEXT_GIFS_DISABLED = "TEXT_GIFS_DISABLED";
export const SERVER_FEATURE_TEXT_FILE_UPLOADS_DISABLED = "TEXT_FILE_UPLOADS_DISABLED";
export const SERVER_FEATURE_MEMBER_ADDS_DISABLED = "MEMBER_ADDS_DISABLED";

export type ServerMediaSettings = {
  allowFileUploads: boolean;
  allowGifs: boolean;
  allowMemberAdds: boolean;
};

export function getServerMediaSettings(features: readonly string[] = []): ServerMediaSettings {
  const featureSet = new Set(features);

  return {
    allowFileUploads: !featureSet.has(SERVER_FEATURE_TEXT_FILE_UPLOADS_DISABLED),
    allowGifs: !featureSet.has(SERVER_FEATURE_TEXT_GIFS_DISABLED),
    allowMemberAdds: !featureSet.has(SERVER_FEATURE_MEMBER_ADDS_DISABLED),
  };
}

export function applyServerMediaSettings(
  features: readonly string[] = [],
  settings: {
    allowFileUploads?: boolean | undefined;
    allowGifs?: boolean | undefined;
    allowMemberAdds?: boolean | undefined;
  },
) {
  const nextFeatures = new Set(features);

  if (settings.allowGifs !== undefined) {
    if (settings.allowGifs) {
      nextFeatures.delete(SERVER_FEATURE_TEXT_GIFS_DISABLED);
    } else {
      nextFeatures.add(SERVER_FEATURE_TEXT_GIFS_DISABLED);
    }
  }

  if (settings.allowFileUploads !== undefined) {
    if (settings.allowFileUploads) {
      nextFeatures.delete(SERVER_FEATURE_TEXT_FILE_UPLOADS_DISABLED);
    } else {
      nextFeatures.add(SERVER_FEATURE_TEXT_FILE_UPLOADS_DISABLED);
    }
  }

  if (settings.allowMemberAdds !== undefined) {
    if (settings.allowMemberAdds) {
      nextFeatures.delete(SERVER_FEATURE_MEMBER_ADDS_DISABLED);
    } else {
      nextFeatures.add(SERVER_FEATURE_MEMBER_ADDS_DISABLED);
    }
  }

  return Array.from(nextFeatures);
}
