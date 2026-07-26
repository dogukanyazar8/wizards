import {
  compressMobileImageToLimit,
  needsMobileImageCompression,
  resolveMobileImageResizeSize,
} from "./mobile-image-compression";
import {
  MobileImageUploadError,
  resolveMobilePickedImageSize,
  toMobilePickedImageBatch,
  type MobilePickedImage,
  type MobilePickedImageBatch,
  type MobilePickerAsset,
} from "./mobile-image-upload-contract";
import {
  getExpoFileSystemModule,
  getExpoImageManipulatorModule,
  getExpoImagePickerModule,
} from "./expo-mobile-media-modules";

/**
 * Measures the asset on disk when the picker did not say how large it is. The
 * URI may be a `content://` handle the file system cannot stat, so a failure
 * here is an answer ("unknown"), not a crash.
 */
function measureMobileImageSize(uri: string): number | null {
  try {
    const { File } = getExpoFileSystemModule();
    return new File(uri).size ?? null;
  } catch {
    return null;
  }
}

/**
 * One re-encode pass, on the device. The result is always JPEG: it is the only
 * format of the three where dropping quality actually buys bytes, and a 4 MB+
 * screenshot is virtually always a PNG.
 */
async function compressMobileImageOnDevice(input: {
  readonly compress: number;
  readonly height: number | null;
  readonly maxEdge: number;
  readonly uri: string;
  readonly width: number | null;
}): Promise<string> {
  const { ImageManipulator, SaveFormat } = getExpoImageManipulatorModule();
  const context = ImageManipulator.manipulate(input.uri);
  const size = resolveMobileImageResizeSize(input.width, input.height, input.maxEdge);

  if (size) {
    context.resize(size);
  }

  const image = await context.renderAsync();
  try {
    const saved = await image.saveAsync({ compress: input.compress, format: SaveFormat.JPEG });
    return saved.uri;
  } finally {
    // Three passes over a full-resolution bitmap is a lot of native memory to
    // leave to the garbage collector's timing.
    image.release();
  }
}

/**
 * Brings one picked asset within the upload limit.
 *
 * An image that already fits is handed on untouched — re-encoding it would cost
 * quality for nothing. One that cannot be shrunk enough is handed on as it is
 * and refused by validation, which is a message the user can act on rather than
 * an upload the service would reject.
 */
async function prepareMobileImageAsset(asset: {
  readonly fileSize?: number | null | undefined;
  readonly height?: number | null | undefined;
  readonly mimeType?: string | null | undefined;
  readonly uri: string;
  readonly width?: number | null | undefined;
}): Promise<MobilePickerAsset> {
  const sizeBytes = resolveMobilePickedImageSize(asset.fileSize, () =>
    measureMobileImageSize(asset.uri),
  );
  const original: MobilePickerAsset = {
    fileSize: sizeBytes,
    mimeType: asset.mimeType,
    uri: asset.uri,
  };

  if (!needsMobileImageCompression(sizeBytes)) {
    return original;
  }

  const height = asset.height ?? null;
  const width = asset.width ?? null;
  const compressed = await compressMobileImageToLimit(
    { height, sizeBytes, uri: asset.uri, width },
    {
      compress: (step) =>
        compressMobileImageOnDevice({
          compress: step.compress,
          height,
          maxEdge: step.maxEdge,
          uri: step.uri,
          width,
        }),
      measure: measureMobileImageSize,
    },
  );

  if (!compressed) {
    return original;
  }

  return { fileSize: compressed.sizeBytes, mimeType: "image/jpeg", uri: compressed.uri };
}

async function launchMobileImageLibrary(limit: number) {
  const ImagePicker = getExpoImagePickerModule();
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

  if (!permission.granted) {
    throw new MobileImageUploadError("photo-library-permission-denied");
  }

  // `selectionLimit` is what stops the gallery from letting the user pick more
  // images than the form still has room for — refusing them afterwards would
  // mean throwing away a choice the picker had already accepted.
  return await ImagePicker.launchImageLibraryAsync({
    allowsEditing: false,
    allowsMultipleSelection: limit > 1,
    base64: false,
    exif: false,
    mediaTypes: ["images"],
    quality: 1,
    ...(limit > 1 ? { selectionLimit: limit } : {}),
  });
}

/**
 * Picks up to `limit` images in one gallery visit.
 *
 * Accepted images and refusals come back together: a screenshot the upload
 * cannot describe (unknown size, unsupported type) is refused here rather than
 * declared with a guessed byte count, because UploadThing presigns against the
 * declared size and a wrong one produces an upload that never completes.
 */
export async function pickMobileImages(limit: number): Promise<MobilePickedImageBatch> {
  const allowed = Math.max(1, Math.trunc(limit));
  const result = await launchMobileImageLibrary(allowed);

  if (result.canceled) {
    return { failures: [], picked: [] };
  }

  const prepared = await Promise.all(
    result.assets.slice(0, allowed).map((asset) => prepareMobileImageAsset(asset)),
  );

  return toMobilePickedImageBatch(prepared, measureMobileImageSize);
}

/**
 * The single-image entry point the avatar, banner and server-icon flows use:
 * they replace one image, so a refusal is the whole outcome and throwing is the
 * honest shape.
 */
export async function pickMobileImage(): Promise<MobilePickedImage | null> {
  const batch = await pickMobileImages(1);
  const failure = batch.failures[0];

  if (failure) {
    throw new MobileImageUploadError(failure);
  }

  return batch.picked[0] ?? null;
}
