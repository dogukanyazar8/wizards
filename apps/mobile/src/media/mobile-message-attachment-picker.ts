import { getExpoDocumentPickerModule, getExpoImagePickerModule } from "./expo-mobile-media-modules";
import {
  getMobileMessageAttachmentKind,
  validateMobileMessageAttachment,
  type MobilePickedMessageAttachment,
} from "./mobile-message-attachment-contract";

export async function pickMobileMessageAttachmentFromDocument(): Promise<MobilePickedMessageAttachment | null> {
  const DocumentPicker = getExpoDocumentPickerModule();
  const result = await DocumentPicker.getDocumentAsync({
    copyToCacheDirectory: true,
    multiple: false,
  });

  if (result.canceled) {
    return null;
  }

  const asset = result.assets[0];
  if (!asset) {
    return null;
  }

  return createPickedAttachment({
    mimeType: asset.mimeType,
    name: asset.name,
    size: asset.size,
    uri: asset.uri,
  });
}

export async function pickMobileMessageAttachmentFromPhotoLibrary(): Promise<MobilePickedMessageAttachment | null> {
  const ImagePicker = getExpoImagePickerModule();
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

  if (!permission.granted) {
    throw new Error("photo-library-permission-denied");
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
    return null;
  }

  return createPickedAttachment({
    mimeType: asset.mimeType,
    name: asset.fileName ?? "mobile-image",
    size: asset.fileSize,
    uri: asset.uri,
  });
}

function createPickedAttachment(input: {
  readonly mimeType: string | null | undefined;
  readonly name: string | null | undefined;
  readonly size: number | null | undefined;
  readonly uri: string;
}): MobilePickedMessageAttachment {
  validateMobileMessageAttachment({
    contentType: input.mimeType,
    name: input.name,
    size: input.size,
    uri: input.uri,
  });

  const contentType = input.mimeType!.trim().toLowerCase();
  const name = input.name!.trim();
  const size = Math.trunc(input.size!);

  return {
    file: {
      lastModified: Date.now(),
      name,
      size,
      type: contentType,
      uri: input.uri,
    } as unknown as File,
    kind: getMobileMessageAttachmentKind(contentType),
    localUri: input.uri,
  };
}
