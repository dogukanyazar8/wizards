import {
  optimizeMobileImageForUpload,
  resolveMobileImageResizeSize,
  toMobileImageMimeType,
  type MobileImageEncodeFormat,
  type MobileImageOptimizationLimits,
} from "./mobile-image-compression";
import {
  MobileImageUploadError,
  resolveMobilePickedImageSize,
  prepareMobileImageAssetsSequentially,
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
import { deleteMobileTemporaryFile } from "./mobile-temporary-file";

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

const ENCODE_FORMAT_KEYS = {
  jpeg: "JPEG",
  png: "PNG",
  webp: "WEBP",
} as const satisfies Record<MobileImageEncodeFormat, "JPEG" | "PNG" | "WEBP">;

/** One re-encode pass, on the device, in the format the plan asked for. */
export async function encodeMobileImageOnDevice(input: {
  readonly compress: number;
  readonly format: MobileImageEncodeFormat;
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
    const saved = await image.saveAsync({
      compress: input.compress,
      format: SaveFormat[ENCODE_FORMAT_KEYS[input.format]],
    });
    return saved.uri;
  } finally {
    // A full-resolution bitmap per pass is a lot of native memory to leave to
    // the garbage collector's timing.
    image.release();
  }
}

/**
 * Prepares one picked asset for upload.
 *
 * Most images are shrunk here rather than sent at camera resolution: the bytes
 * that never leave the phone are the ones that cost nothing to upload, nothing
 * to verify and nothing to wait for. An image that is already small is handed
 * on untouched, and one that cannot be shrunk under the limit is handed on as
 * it is so validation can refuse it with a message the user can act on.
 */
export async function prepareMobileImageAsset(
  asset: {
    readonly fileSize?: number | null | undefined;
    readonly height?: number | null | undefined;
    readonly mimeType?: string | null | undefined;
    readonly uri: string;
    readonly width?: number | null | undefined;
  },
  dependencies: {
    encode: typeof encodeMobileImageOnDevice;
    measure: (uri: string) => number | null;
  } = { encode: encodeMobileImageOnDevice, measure: measureMobileImageSize },
  limits: MobileImageOptimizationLimits = {},
): Promise<MobilePickerAsset> {
  const sizeBytes = resolveMobilePickedImageSize(asset.fileSize, () =>
    dependencies.measure(asset.uri),
  );
  const original: MobilePickerAsset = {
    fileSize: sizeBytes,
    mimeType: asset.mimeType,
    uri: asset.uri,
  };

  const height = asset.height ?? null;
  const width = asset.width ?? null;
  const optimized = await optimizeMobileImageForUpload(
    { height, mimeType: asset.mimeType, sizeBytes, uri: asset.uri, width },
    {
      encode: (pass) =>
        dependencies.encode({
          compress: pass.compress,
          format: pass.format,
          height,
          maxEdge: pass.maxEdge,
          uri: pass.uri,
          width,
        }),
      measure: dependencies.measure,
      remove: async (uri) => {
        await deleteMobileTemporaryFile(uri);
      },
    },
    limits,
  );

  if (!optimized) {
    return original;
  }

  return {
    fileSize: optimized.sizeBytes,
    mimeType: toMobileImageMimeType(optimized.format),
    temporaryFileUri: optimized.uri,
    uri: optimized.uri,
  };
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

  const prepared = await prepareMobileImageAssetsSequentially(
    result.assets.slice(0, allowed),
    prepareMobileImageAsset,
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
