import * as ImagePicker from "expo-image-picker";

import {
  MobileImageUploadError,
  type MobilePickedImage,
  validateMobilePickedImageAsset,
} from "./mobile-image-upload-contract";

const MOBILE_IMAGE_FILE_NAMES: Record<"image/jpeg" | "image/png" | "image/webp", string> = {
  "image/jpeg": "mobile-image.jpg",
  "image/png": "mobile-image.png",
  "image/webp": "mobile-image.webp",
};

export async function pickMobileImage(): Promise<MobilePickedImage | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

  if (!permission.granted) {
    throw new MobileImageUploadError("photo-library-permission-denied");
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    allowsEditing: false,
    allowsMultipleSelection: false,
    base64: false,
    exif: false,
    mediaTypes: ["images"],
    quality: 1,
  });

  if (result.canceled) {
    return null;
  }

  const asset = result.assets[0];

  if (!asset) {
    throw new MobileImageUploadError("missing-selected-image");
  }

  validateMobilePickedImageAsset({
    mimeType: asset.mimeType,
    sizeBytes: asset.fileSize,
    uri: asset.uri,
  });

  const mimeType = asset.mimeType?.trim().toLowerCase();

  if (!mimeType || !(mimeType in MOBILE_IMAGE_FILE_NAMES)) {
    throw new MobileImageUploadError("unsupported-image-content-type");
  }

  let blob: Blob;

  try {
    blob = await fetch(asset.uri).then((response) => response.blob());
  } catch {
    throw new MobileImageUploadError("unable-to-read-selected-file");
  }

  validateMobilePickedImageAsset({
    mimeType,
    sizeBytes: blob.size,
    uri: asset.uri,
  });

  const file = Object.assign(
    new File([blob], MOBILE_IMAGE_FILE_NAMES[mimeType as keyof typeof MOBILE_IMAGE_FILE_NAMES], {
      type: mimeType,
    }),
    { uri: asset.uri },
  );

  return { file: file as File, localUri: asset.uri };
}
