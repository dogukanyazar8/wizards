import type { MobileBootstrapFeature } from "@wizards/types";
import type { MobileMediaSelectedAssetSummary } from "./mobile-media-contract";

export type MobileAttachmentUploadReadinessReason =
  | "disabled"
  | "file-size-unavailable"
  | "file-too-large"
  | "missing-feature"
  | "missing-mime-type"
  | "native-permission-required"
  | "no-selected-asset"
  | "ready"
  | "server-contract-required"
  | "unsupported-content-type";

export type MobileAttachmentUploadReadinessStatus =
  | "available"
  | "disabled"
  | "requires-native-permission"
  | "requires-server-contract"
  | "unknown";

export type MobileAttachmentUploadReadiness = {
  canUploadSelectedAsset: boolean;
  reason: MobileAttachmentUploadReadinessReason;
  status: MobileAttachmentUploadReadinessStatus;
};

export const MOBILE_ATTACHMENT_MAX_COUNT = 5;
export const MOBILE_IMAGE_CONTENT_TYPES = [
  "image/gif",
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;
export const MOBILE_FILE_CONTENT_TYPES = [
  "application/pdf",
  "application/msword",
  "application/rtf",
  "application/vnd.ms-excel",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/csv",
  "text/markdown",
  "text/plain",
] as const;
export const MOBILE_VIDEO_CONTENT_TYPES = ["video/mp4", "video/quicktime", "video/webm"] as const;
export const MOBILE_ATTACHMENT_IMAGE_MAX_BYTES = 8 * 1024 * 1024;
export const MOBILE_ATTACHMENT_GIF_MAX_BYTES = 8 * 1024 * 1024;
export const MOBILE_ATTACHMENT_FILE_MAX_BYTES = 16 * 1024 * 1024;
export const MOBILE_ATTACHMENT_VIDEO_MAX_BYTES = 32 * 1024 * 1024;

const MOBILE_IMAGE_CONTENT_TYPE_SET = new Set<string>(MOBILE_IMAGE_CONTENT_TYPES);
const MOBILE_FILE_CONTENT_TYPE_SET = new Set<string>(MOBILE_FILE_CONTENT_TYPES);
const MOBILE_VIDEO_CONTENT_TYPE_SET = new Set<string>(MOBILE_VIDEO_CONTENT_TYPES);
const MOBILE_ATTACHMENT_CONTENT_TYPE_SET = new Set<string>([
  ...MOBILE_IMAGE_CONTENT_TYPES,
  ...MOBILE_FILE_CONTENT_TYPES,
  ...MOBILE_VIDEO_CONTENT_TYPES,
]);

export function getMobileAttachmentUploadReadiness({
  attachmentsFeature,
  selectedAsset,
}: {
  attachmentsFeature?: MobileBootstrapFeature | null;
  selectedAsset: MobileMediaSelectedAssetSummary | null;
}): MobileAttachmentUploadReadiness {
  if (!selectedAsset) {
    return {
      canUploadSelectedAsset: false,
      reason: "no-selected-asset",
      status: attachmentsFeature?.status ?? "unknown",
    };
  }

  const assetValidation = getMobileAttachmentAssetValidationReason(selectedAsset);
  if (assetValidation !== "ready") {
    return {
      canUploadSelectedAsset: false,
      reason: assetValidation,
      status: attachmentsFeature?.status ?? "unknown",
    };
  }

  if (!attachmentsFeature) {
    return {
      canUploadSelectedAsset: false,
      reason: "missing-feature",
      status: "unknown",
    };
  }

  switch (attachmentsFeature.status) {
    case "available":
      return {
        canUploadSelectedAsset: true,
        reason: "ready",
        status: "available",
      };
    case "disabled":
      return {
        canUploadSelectedAsset: false,
        reason: "disabled",
        status: "disabled",
      };
    case "requires-native-permission":
      return {
        canUploadSelectedAsset: false,
        reason: "native-permission-required",
        status: "requires-native-permission",
      };
    case "requires-server-contract":
      return {
        canUploadSelectedAsset: false,
        reason: "server-contract-required",
        status: "requires-server-contract",
      };
    default:
      return {
        canUploadSelectedAsset: false,
        reason: "missing-feature",
        status: "unknown",
      };
  }
}

export function isSupportedMobileAttachmentContentType(contentType: string) {
  return MOBILE_ATTACHMENT_CONTENT_TYPE_SET.has(contentType.toLowerCase());
}

export function getMobileAttachmentMaxBytes(contentType: string) {
  const normalized = contentType.toLowerCase();

  if (normalized === "image/gif") {
    return MOBILE_ATTACHMENT_GIF_MAX_BYTES;
  }

  if (MOBILE_IMAGE_CONTENT_TYPE_SET.has(normalized)) {
    return MOBILE_ATTACHMENT_IMAGE_MAX_BYTES;
  }

  if (MOBILE_FILE_CONTENT_TYPE_SET.has(normalized)) {
    return MOBILE_ATTACHMENT_FILE_MAX_BYTES;
  }

  if (MOBILE_VIDEO_CONTENT_TYPE_SET.has(normalized)) {
    return MOBILE_ATTACHMENT_VIDEO_MAX_BYTES;
  }

  return 0;
}

export function validateMobileAttachmentUploadContract(): string[] {
  const issues: string[] = [];
  const selectedAsset: MobileMediaSelectedAssetSummary = {
    kind: "document",
    mimeType: "application/pdf",
    name: "contract.pdf",
    sizeBytes: 1024,
    source: "documentPicker",
  };

  if (
    MOBILE_ATTACHMENT_MAX_COUNT !== 5 ||
    getMobileAttachmentMaxBytes("image/png") !== 8 * 1024 * 1024 ||
    getMobileAttachmentMaxBytes("application/pdf") !== 16 * 1024 * 1024 ||
    getMobileAttachmentMaxBytes("video/mp4") !== 32 * 1024 * 1024
  ) {
    issues.push("Mobile attachment limits must stay aligned with the web message contract.");
  }

  const pending = getMobileAttachmentUploadReadiness({
    attachmentsFeature: {
      label: "Attachments",
      status: "requires-server-contract",
    },
    selectedAsset,
  });
  if (pending.canUploadSelectedAsset || pending.reason !== "server-contract-required") {
    issues.push("Mobile attachment upload must stay blocked until the server contract is ready.");
  }

  const missing = getMobileAttachmentUploadReadiness({
    attachmentsFeature: null,
    selectedAsset,
  });
  if (missing.canUploadSelectedAsset || missing.reason !== "missing-feature") {
    issues.push("Missing attachment feature metadata must fail closed.");
  }

  const available = getMobileAttachmentUploadReadiness({
    attachmentsFeature: {
      label: "Attachments",
      status: "available",
    },
    selectedAsset,
  });
  if (!available.canUploadSelectedAsset || available.reason !== "ready") {
    issues.push("Available attachment feature metadata should allow upload-capable callers.");
  }

  const unsafe = getMobileAttachmentUploadReadiness({
    attachmentsFeature: {
      label: "Attachments",
      status: "available",
    },
    selectedAsset: {
      kind: "document",
      mimeType: "application/x-msdownload",
      name: "setup.exe",
      sizeBytes: 42,
      source: "documentPicker",
    },
  });
  if (unsafe.canUploadSelectedAsset || unsafe.reason !== "unsupported-content-type") {
    issues.push("Mobile attachment upload must reject unsupported content types before upload.");
  }

  return issues;
}

function getMobileAttachmentAssetValidationReason(
  selectedAsset: MobileMediaSelectedAssetSummary,
): Extract<
  MobileAttachmentUploadReadinessReason,
  "file-size-unavailable" | "file-too-large" | "missing-mime-type" | "ready" | "unsupported-content-type"
> {
  const contentType = selectedAsset.mimeType?.toLowerCase() ?? null;

  if (!contentType) {
    return "missing-mime-type";
  }

  if (!isSupportedMobileAttachmentContentType(contentType)) {
    return "unsupported-content-type";
  }

  const maxBytes = getMobileAttachmentMaxBytes(contentType);
  if (selectedAsset.sizeBytes === null) {
    return "file-size-unavailable";
  }

  if (selectedAsset.sizeBytes > maxBytes) {
    return "file-too-large";
  }

  return "ready";
}
