import {
  MobileMediaUploadCompletionResponseSchema,
  MobileMediaUploadIntentSchema,
  type MobileMediaUploadCompletionResponse,
} from "@wizards/types";

export const MOBILE_IMAGE_UPLOAD_MAX_BYTES = 4 * 1024 * 1024;

const MOBILE_IMAGE_CONTENT_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MOBILE_LOCAL_IMAGE_URI_SCHEMES = new Set(["content:", "file:", "ph:"]);
const MOBILE_LOCAL_IMAGE_URI_MAX_LENGTH = 4_096;

export type MobilePickedImage = {
  file: File;
  localUri: string;
};

/**
 * The subset of an Expo picker asset an upload actually depends on. Both
 * optional fields accept an explicit `undefined` because that is exactly what
 * the picker hands back for an asset it could not describe.
 */
export type MobilePickerAsset = {
  readonly fileSize?: number | null | undefined;
  readonly mimeType?: string | null | undefined;
  readonly uri: string;
};

/**
 * One picker run can now return several images, and one unusable image among
 * them must not cost the user the rest of the selection. Accepted images and
 * the reasons the others were refused travel together, so the screen can show
 * both the tiles and the refusal.
 */
export type MobilePickedImageBatch = {
  readonly failures: readonly MobileImageUploadErrorCode[];
  readonly picked: readonly MobilePickedImage[];
};

const MOBILE_IMAGE_FILE_NAMES: Record<"image/jpeg" | "image/png" | "image/webp", string> = {
  "image/jpeg": "mobile-image.jpg",
  "image/png": "mobile-image.png",
  "image/webp": "mobile-image.webp",
};

export type MobileImageUploadTarget =
  | { purpose: "feedback-attachment" }
  | { purpose: "profile-avatar" }
  | { purpose: "profile-banner" }
  | { purpose: "server-icon"; targetServerId: string };

export type MobileImageUploadErrorCode =
  | "invalid-image-upload-target"
  | "invalid-local-image-uri"
  | "invalid-upload-completion"
  | "missing-selected-image"
  | "photo-library-permission-denied"
  | "selected-file-too-large"
  | "unable-to-read-selected-file"
  | "unknown-image-size"
  | "unsupported-image-content-type";

export class MobileImageUploadError extends Error {
  readonly code: MobileImageUploadErrorCode;

  constructor(code: MobileImageUploadErrorCode) {
    super("Mobile image upload could not be completed.");
    this.code = code;
    this.name = "MobileImageUploadError";
  }
}

export function parseMobileImageUploadTarget(input: unknown): MobileImageUploadTarget {
  const result = MobileMediaUploadIntentSchema.safeParse(input);

  if (!result.success) {
    throw new MobileImageUploadError("invalid-image-upload-target");
  }

  return result.data;
}

/**
 * The byte count the upload will declare — measured from the file that will
 * actually be sent, and only then taken from the picker's own report.
 *
 * UploadThing presigns against the size it is told, so a wrong one produces an
 * upload the service never considers finished: the request simply never answers,
 * which on the device looks like an image that "would not upload". Two ways to
 * get it wrong were live here. `?? 0` declared an unmeasurable asset as zero
 * bytes. And the picker's `fileSize` describes the *source* asset while its
 * `uri` points at an exported copy in the app cache — identical only while the
 * export is a raw byte copy. Measuring the URI that is being uploaded is the
 * one number that cannot disagree with the bytes.
 *
 * A file whose size cannot be established either way is rejected rather than
 * left to hang — the same rule the message-attachment path has always enforced.
 */
export function resolveMobilePickedImageSize(
  declaredSizeBytes: number | null | undefined,
  measureSizeBytes: () => number | null,
): number | null {
  const measured = measureSizeBytes();
  if (isUsableImageSize(measured)) {
    return Math.trunc(measured);
  }

  return isUsableImageSize(declaredSizeBytes) ? Math.trunc(declaredSizeBytes) : null;
}

function isUsableImageSize(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export function validateMobilePickedImageAsset(input: {
  mimeType: string | null | undefined;
  sizeBytes: number | null | undefined;
  uri: string;
}) {
  const mimeType = input.mimeType?.trim().toLowerCase();

  if (!mimeType || !MOBILE_IMAGE_CONTENT_TYPES.has(mimeType)) {
    throw new MobileImageUploadError("unsupported-image-content-type");
  }

  if (!isVolatileMobileLocalImageUri(input.uri)) {
    throw new MobileImageUploadError("invalid-local-image-uri");
  }

  if (!isUsableImageSize(input.sizeBytes)) {
    throw new MobileImageUploadError("unknown-image-size");
  }

  if (isKnownImageSizeAboveLimit(input.sizeBytes)) {
    throw new MobileImageUploadError("selected-file-too-large");
  }
}

/**
 * Turns raw picker assets into upload-ready files.
 *
 * React Native streams a local file through a URI-backed FormData part, so the
 * "file" here is deliberately a plain `{uri, name, size, type}` object rather
 * than a real `File`: iOS needs exactly that shape to build its NSDictionary,
 * and reading a Photo Picker URI with `fetch()` is not portable under the new
 * runtime.
 */
export function toMobilePickedImageBatch(
  assets: readonly MobilePickerAsset[],
  measureSizeBytes: (uri: string) => number | null,
): MobilePickedImageBatch {
  const failures: MobileImageUploadErrorCode[] = [];
  const picked: MobilePickedImage[] = [];

  for (const asset of assets) {
    const sizeBytes = resolveMobilePickedImageSize(asset.fileSize, () =>
      measureSizeBytes(asset.uri),
    );

    try {
      validateMobilePickedImageAsset({
        mimeType: asset.mimeType,
        sizeBytes,
        uri: asset.uri,
      });
    } catch (error) {
      failures.push(
        error instanceof MobileImageUploadError ? error.code : "unable-to-read-selected-file",
      );
      continue;
    }

    const mimeType = asset.mimeType!.trim().toLowerCase() as keyof typeof MOBILE_IMAGE_FILE_NAMES;
    const file = {
      lastModified: Date.now(),
      name: MOBILE_IMAGE_FILE_NAMES[mimeType],
      size: sizeBytes!,
      type: mimeType,
      uri: asset.uri,
    } as unknown as File;

    picked.push({ file, localUri: asset.uri });
  }

  return { failures, picked };
}

export function parseMobileUploadCompletion(rows: unknown): MobileMediaUploadCompletionResponse {
  if (!Array.isArray(rows) || rows.length !== 1) {
    throw new MobileImageUploadError("invalid-upload-completion");
  }

  const row = rows[0];
  const serverData =
    row && typeof row === "object" && "serverData" in row
      ? (row as { serverData: unknown }).serverData
      : undefined;
  const result = MobileMediaUploadCompletionResponseSchema.safeParse(serverData);

  if (!result.success) {
    throw new MobileImageUploadError("invalid-upload-completion");
  }

  return result.data;
}

function isKnownImageSizeAboveLimit(sizeBytes: number | null | undefined) {
  return (
    typeof sizeBytes === "number" &&
    Number.isFinite(sizeBytes) &&
    sizeBytes > MOBILE_IMAGE_UPLOAD_MAX_BYTES
  );
}

function isVolatileMobileLocalImageUri(uri: string) {
  if (uri.length === 0 || uri.length > MOBILE_LOCAL_IMAGE_URI_MAX_LENGTH) {
    return false;
  }

  try {
    const parsed = new URL(uri);

    if (!MOBILE_LOCAL_IMAGE_URI_SCHEMES.has(parsed.protocol)) {
      return false;
    }

    return parsed.protocol !== "file:" || parsed.host.length === 0 || parsed.host === "localhost";
  } catch {
    return false;
  }
}
