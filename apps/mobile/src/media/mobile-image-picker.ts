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
  const ImagePicker = await import("expo-image-picker");
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

  // React Native uploads local files through a URI-backed FormData part. Reading
  // Android Photo Picker URIs with fetch() is not portable under the new runtime.
  const file = {
    lastModified: Date.now(),
    name: MOBILE_IMAGE_FILE_NAMES[mimeType as keyof typeof MOBILE_IMAGE_FILE_NAMES],
    size: asset.fileSize ?? 0,
    type: mimeType,
    uri: asset.uri,
  } as unknown as File;

  return { file, localUri: asset.uri };
}
