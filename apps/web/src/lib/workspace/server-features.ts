export const SERVER_FEATURE_TEXT_GIFS_DISABLED = "TEXT_GIFS_DISABLED";
export const SERVER_FEATURE_TEXT_FILE_UPLOADS_DISABLED = "TEXT_FILE_UPLOADS_DISABLED";

export type ServerMediaSettings = {
  allowFileUploads: boolean;
  allowGifs: boolean;
};

export function getServerMediaSettings(features: readonly string[] = []): ServerMediaSettings {
  const featureSet = new Set(features);

  return {
    allowFileUploads: !featureSet.has(SERVER_FEATURE_TEXT_FILE_UPLOADS_DISABLED),
    allowGifs: !featureSet.has(SERVER_FEATURE_TEXT_GIFS_DISABLED),
  };
}

export function applyServerMediaSettings(
  features: readonly string[] = [],
  settings: {
    allowFileUploads?: boolean | undefined;
    allowGifs?: boolean | undefined;
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

  return Array.from(nextFeatures);
}
