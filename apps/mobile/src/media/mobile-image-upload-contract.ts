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

  if (isKnownImageSizeAboveLimit(input.sizeBytes)) {
    throw new MobileImageUploadError("selected-file-too-large");
  }
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
