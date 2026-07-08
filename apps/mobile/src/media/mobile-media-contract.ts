import {
  MOBILE_NATIVE_CAPABILITIES,
  validateMobileNativeCapabilityContract,
} from "../permissions/mobile-native-capability-contract";
import type { MobilePermissionStatus } from "../permissions/mobile-permission-contract";

export type MobileMediaPermissionTarget = "camera" | "documentPicker" | "photoLibrary";

export type MobileMediaSelectedAssetKind = "document" | "image" | "unknown" | "video";
export type MobileMediaSelectedAssetSource = "documentPicker" | "photoLibrary";

export interface MobileMediaSelectedAssetSummary {
  readonly kind: MobileMediaSelectedAssetKind;
  readonly mimeType: string | null;
  readonly name: string;
  readonly sizeBytes: number | null;
  readonly source: MobileMediaSelectedAssetSource;
}

export type MobileMediaRuntimeStatus =
  | "blocked"
  | "checking-camera"
  | "checking-document-picker"
  | "checking-photo-library"
  | "denied"
  | "error"
  | "not-requested"
  | "ready-local"
  | "unavailable";

export interface MobileMediaRuntimeState {
  readonly cameraStatus: MobilePermissionStatus;
  readonly errorMessage: string | null;
  readonly hasCameraPermission: boolean;
  readonly hasDocumentPickerAccess: boolean;
  readonly hasPhotoLibraryPermission: boolean;
  readonly lastAttemptAt: number | null;
  readonly lastRequestedTarget: MobileMediaPermissionTarget | null;
  readonly photoLibraryStatus: MobilePermissionStatus;
  readonly selectedAsset: MobileMediaSelectedAssetSummary | null;
  readonly status: MobileMediaRuntimeStatus;
}

export interface MobileMediaRuntimeSummary {
  readonly actionEnabled: boolean;
  readonly canAskCameraAfterUserAction: boolean;
  readonly canOpenDocumentPickerAfterUserAction: boolean;
  readonly canAskPhotoLibraryAfterUserAction: boolean;
  readonly isTerminalFailure: boolean;
  readonly localCameraReady: boolean;
  readonly localDocumentPickerReady: boolean;
  readonly localPhotoLibraryReady: boolean;
}

export type MobileAttachmentDraftSendBlockReason = "empty-message" | "upload-pending";

export type MobileAttachmentDraftSendGuard =
  | {
      readonly canSend: true;
      readonly reason: null;
    }
  | {
      readonly canSend: false;
      readonly reason: MobileAttachmentDraftSendBlockReason;
    };

const SENSITIVE_MEDIA_ERROR_PATTERN =
  /(access[_-]?token|refresh[_-]?token|oauth[_-]?code|password|secret|bearer\s+[a-z0-9._-]+)/i;
const MAX_SAFE_ASSET_NAME_LENGTH = 96;
const MAX_SAFE_MIME_TYPE_LENGTH = 80;

export function createInitialMobileMediaRuntimeState(): MobileMediaRuntimeState {
  return {
    cameraStatus: "unknown",
    errorMessage: null,
    hasCameraPermission: false,
    hasDocumentPickerAccess: false,
    hasPhotoLibraryPermission: false,
    lastAttemptAt: null,
    lastRequestedTarget: null,
    photoLibraryStatus: "unknown",
    selectedAsset: null,
    status: "not-requested",
  };
}

export function createCheckingMobileMediaRuntimeState(
  current: MobileMediaRuntimeState,
  target: MobileMediaPermissionTarget,
  now = Date.now(),
): MobileMediaRuntimeState {
  return {
    ...current,
    errorMessage: null,
    lastAttemptAt: now,
    lastRequestedTarget: target,
    status:
      target === "camera"
        ? "checking-camera"
        : target === "documentPicker"
          ? "checking-document-picker"
          : "checking-photo-library",
  };
}

export function createMobileMediaRuntimeStateFromPermission(
  current: MobileMediaRuntimeState,
  target: MobileMediaPermissionTarget,
  permissionStatus: MobilePermissionStatus,
  now = Date.now(),
): MobileMediaRuntimeState {
  const nextState: MobileMediaRuntimeState = {
    ...current,
    errorMessage: null,
    lastAttemptAt: now,
    lastRequestedTarget: target,
    ...(target === "camera"
      ? {
          cameraStatus: permissionStatus,
          hasCameraPermission: permissionStatus === "granted",
        }
      : {
          hasPhotoLibraryPermission: permissionStatus === "granted",
          photoLibraryStatus: permissionStatus,
        }),
    status: getMediaRuntimeStatusFromPermission(permissionStatus),
  };

  return nextState;
}

export function createMobileMediaRuntimeStateFromDocumentPickerResult(
  current: MobileMediaRuntimeState,
  asset: MobileMediaSelectedAssetSummary | null,
  now = Date.now(),
): MobileMediaRuntimeState {
  return {
    ...current,
    errorMessage: null,
    hasDocumentPickerAccess: true,
    lastAttemptAt: now,
    lastRequestedTarget: "documentPicker",
    selectedAsset: asset,
    status: "ready-local",
  };
}

export function createMobileMediaRuntimeStateFromPhotoLibraryResult(
  current: MobileMediaRuntimeState,
  asset: MobileMediaSelectedAssetSummary | null,
  now = Date.now(),
): MobileMediaRuntimeState {
  return {
    ...current,
    errorMessage: null,
    hasPhotoLibraryPermission: true,
    lastAttemptAt: now,
    lastRequestedTarget: "photoLibrary",
    photoLibraryStatus: "granted",
    selectedAsset: asset,
    status: "ready-local",
  };
}

export function clearMobileMediaSelectedAsset(
  current: MobileMediaRuntimeState,
): MobileMediaRuntimeState {
  return {
    ...current,
    errorMessage: null,
    selectedAsset: null,
  };
}

export function createUnavailableMobileMediaRuntimeState(
  current: MobileMediaRuntimeState,
  target: MobileMediaPermissionTarget,
  reason: string,
  now = Date.now(),
): MobileMediaRuntimeState {
  return {
    ...current,
    errorMessage: redactMobileMediaError(reason),
    lastAttemptAt: now,
    lastRequestedTarget: target,
    status: "unavailable",
  };
}

export function createErroredMobileMediaRuntimeState(
  current: MobileMediaRuntimeState,
  target: MobileMediaPermissionTarget,
  error: unknown,
  now = Date.now(),
): MobileMediaRuntimeState {
  return {
    ...current,
    errorMessage: redactMobileMediaError(error),
    lastAttemptAt: now,
    lastRequestedTarget: target,
    status: "error",
  };
}

export function getMobileAttachmentDraftSendGuard(input: {
  readonly content: string;
  readonly selectedAsset: MobileMediaSelectedAssetSummary | null;
}): MobileAttachmentDraftSendGuard {
  if (input.selectedAsset) {
    return {
      canSend: false,
      reason: "upload-pending",
    };
  }

  if (input.content.trim().length === 0) {
    return {
      canSend: false,
      reason: "empty-message",
    };
  }

  return {
    canSend: true,
    reason: null,
  };
}

export function summarizeMobileMediaRuntimeState(
  state: MobileMediaRuntimeState,
): MobileMediaRuntimeSummary {
  return {
    actionEnabled:
      state.status !== "checking-camera" &&
      state.status !== "checking-document-picker" &&
      state.status !== "checking-photo-library",
    canAskCameraAfterUserAction:
      state.cameraStatus === "unknown" || state.cameraStatus === "not-requested",
    canOpenDocumentPickerAfterUserAction: true,
    canAskPhotoLibraryAfterUserAction:
      state.photoLibraryStatus === "unknown" || state.photoLibraryStatus === "not-requested",
    isTerminalFailure:
      state.status === "blocked" || state.status === "error" || state.status === "unavailable",
    localCameraReady: state.hasCameraPermission,
    localDocumentPickerReady: state.hasDocumentPickerAccess,
    localPhotoLibraryReady: state.hasPhotoLibraryPermission,
  };
}

export function mapExpoImagePickerPermissionStatus(
  status: string | null | undefined,
  canAskAgain: boolean | null | undefined = true,
): MobilePermissionStatus {
  const normalizedStatus = String(status ?? "").toLowerCase();

  if (normalizedStatus === "granted" || normalizedStatus === "limited") {
    return "granted";
  }

  if (normalizedStatus === "denied") {
    return canAskAgain === false ? "blocked" : "denied";
  }

  if (normalizedStatus === "undetermined") {
    return "not-requested";
  }

  return "unknown";
}

export function redactMobileMediaError(error: unknown): string {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "Media setup could not be completed.";

  if (SENSITIVE_MEDIA_ERROR_PATTERN.test(message)) {
    return "Media setup failed without exposing sensitive details.";
  }

  return message.slice(0, 180);
}

export function createSafeMobileMediaAssetSummary(input: {
  readonly mimeType?: string | null;
  readonly name?: string | null;
  readonly size?: number | null;
  readonly source?: MobileMediaSelectedAssetSource;
}): MobileMediaSelectedAssetSummary {
  const name = sanitizeMediaAssetName(input.name, "Selected file");
  const mimeType =
    typeof input.mimeType === "string" && input.mimeType.trim()
      ? sanitizeMimeType(input.mimeType)
      : null;
  const sizeBytes =
    typeof input.size === "number" && Number.isFinite(input.size) && input.size >= 0
      ? Math.trunc(input.size)
      : null;

  return {
    kind: resolveSelectedAssetKind(mimeType),
    mimeType,
    name,
    sizeBytes,
    source: input.source ?? "documentPicker",
  };
}

export function validateMobileMediaContract(): string[] {
  const issues = validateMobileNativeCapabilityContract();
  const mediaAttachments = MOBILE_NATIVE_CAPABILITIES.find(
    (capability) => capability.id === "mediaAttachments",
  );
  const videoCalls = MOBILE_NATIVE_CAPABILITIES.find(
    (capability) => capability.id === "videoCalls",
  );

  if (!mediaAttachments) {
    issues.push("mediaAttachments capability must be declared.");
  } else {
    if (mediaAttachments.stage !== "foundation-ready") {
      issues.push("mediaAttachments must stay foundation-ready for local picker permission only.");
    }

    if (!mediaAttachments.permissionIntents.includes("photoLibrary")) {
      issues.push("mediaAttachments must depend on the photoLibrary permission intent.");
    }
  }

  const unsafeAsset = createSafeMobileMediaAssetSummary({
    mimeType: "application/pdf",
    name: "../very-sensitive-token-name.pdf".repeat(20),
    size: 42.8,
  });
  if (
    unsafeAsset.name.includes("..") ||
    unsafeAsset.name.length > MAX_SAFE_ASSET_NAME_LENGTH ||
    unsafeAsset.sizeBytes !== 42
  ) {
    issues.push("Document picker asset summaries must be bounded and path-free.");
  }

  if (!videoCalls) {
    issues.push("videoCalls capability must be declared.");
  } else {
    if (videoCalls.stage !== "requires-native-module") {
      issues.push("videoCalls must stay requires-native-module until camera track flow exists.");
    }

    if (!videoCalls.permissionIntents.includes("camera")) {
      issues.push("videoCalls must depend on the camera permission intent.");
    }
  }

  const redacted = redactMobileMediaError("bearer abc.def.ghi should not appear in media errors");
  if (/bearer|abc\.def\.ghi/i.test(redacted)) {
    issues.push("Media error redaction must remove bearer-like secrets.");
  }

  const uploadPendingGuard = getMobileAttachmentDraftSendGuard({
    content: "hello",
    selectedAsset: createSafeMobileMediaAssetSummary({
      mimeType: "application/pdf",
      name: "contract.pdf",
      size: 100,
    }),
  });
  if (uploadPendingGuard.canSend || uploadPendingGuard.reason !== "upload-pending") {
    issues.push("Local attachment drafts must not be sent before upload support exists.");
  }

  return issues;
}

function sanitizeMediaText(value: string | null | undefined, fallback: string, maxLength: number) {
  const normalized = String(value ?? "")
    .replace(/[\\/]+/g, " ")
    .replace(/\.\.+/g, ".")
    .replace(/[\u0000-\u001F\u007F]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const safeValue = normalized || fallback;

  return safeValue.slice(0, maxLength);
}

function sanitizeMediaAssetName(value: string | null | undefined, fallback: string) {
  const rawValue = String(value ?? "").trim();
  const withoutQuery = rawValue.split(/[?#]/u)[0] ?? "";
  const segments = withoutQuery.split(/[\\/]+/u).filter(Boolean);
  const leafName = segments.length > 0 ? (segments[segments.length - 1] ?? "") : withoutQuery;
  const withoutScheme = leafName.replace(/^[a-z][a-z0-9+.-]*:+/iu, "");

  return sanitizeMediaText(withoutScheme || fallback, fallback, MAX_SAFE_ASSET_NAME_LENGTH);
}

function sanitizeMimeType(value: string) {
  const normalized = value
    .replace(/[\u0000-\u001F\u007F\s]+/g, "")
    .trim()
    .toLowerCase()
    .slice(0, MAX_SAFE_MIME_TYPE_LENGTH);

  return /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/.test(normalized) ? normalized : null;
}

function resolveSelectedAssetKind(mimeType: string | null): MobileMediaSelectedAssetKind {
  if (!mimeType) {
    return "unknown";
  }

  if (mimeType.toLowerCase().startsWith("image/")) {
    return "image";
  }

  if (mimeType.toLowerCase().startsWith("video/")) {
    return "video";
  }

  return "document";
}

function getMediaRuntimeStatusFromPermission(
  permissionStatus: MobilePermissionStatus,
): MobileMediaRuntimeStatus {
  switch (permissionStatus) {
    case "granted":
      return "ready-local";
    case "blocked":
      return "blocked";
    case "denied":
      return "denied";
    case "not-requested":
    case "unknown":
    default:
      return "not-requested";
  }
}
