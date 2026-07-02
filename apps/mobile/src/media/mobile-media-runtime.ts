import {
  createErroredMobileMediaRuntimeState,
  createMobileMediaRuntimeStateFromDocumentPickerResult,
  createMobileMediaRuntimeStateFromPermission,
  createUnavailableMobileMediaRuntimeState,
  createSafeMobileMediaAssetSummary,
  mapExpoImagePickerPermissionStatus,
  type MobileMediaRuntimeState,
} from "./mobile-media-contract";

export async function requestMobilePhotoLibraryPermissionAfterUserAction(
  current: MobileMediaRuntimeState,
  now = Date.now(),
): Promise<MobileMediaRuntimeState> {
  try {
    const ImagePicker = await import("expo-image-picker");

    const currentPermissions = await ImagePicker.getMediaLibraryPermissionsAsync();
    const currentStatus = mapExpoImagePickerPermissionStatus(
      currentPermissions.status,
      currentPermissions.canAskAgain,
    );

    if (currentStatus === "granted" || currentStatus === "blocked") {
      return createMobileMediaRuntimeStateFromPermission(
        current,
        "photoLibrary",
        currentStatus,
        now,
      );
    }

    const requestedPermissions = await ImagePicker.requestMediaLibraryPermissionsAsync();
    const requestedStatus = mapExpoImagePickerPermissionStatus(
      requestedPermissions.status,
      requestedPermissions.canAskAgain,
    );

    return createMobileMediaRuntimeStateFromPermission(
      current,
      "photoLibrary",
      requestedStatus,
      now,
    );
  } catch (error) {
    const message =
      error instanceof Error && /native module|not available|unavailable/i.test(error.message)
        ? error.message
        : null;

    if (message) {
      return createUnavailableMobileMediaRuntimeState(current, "photoLibrary", message, now);
    }

    return createErroredMobileMediaRuntimeState(current, "photoLibrary", error, now);
  }
}

export async function requestMobileCameraPermissionAfterUserAction(
  current: MobileMediaRuntimeState,
  now = Date.now(),
): Promise<MobileMediaRuntimeState> {
  try {
    const ImagePicker = await import("expo-image-picker");

    const currentPermissions = await ImagePicker.getCameraPermissionsAsync();
    const currentStatus = mapExpoImagePickerPermissionStatus(
      currentPermissions.status,
      currentPermissions.canAskAgain,
    );

    if (currentStatus === "granted" || currentStatus === "blocked") {
      return createMobileMediaRuntimeStateFromPermission(current, "camera", currentStatus, now);
    }

    const requestedPermissions = await ImagePicker.requestCameraPermissionsAsync();
    const requestedStatus = mapExpoImagePickerPermissionStatus(
      requestedPermissions.status,
      requestedPermissions.canAskAgain,
    );

    return createMobileMediaRuntimeStateFromPermission(current, "camera", requestedStatus, now);
  } catch (error) {
    const message =
      error instanceof Error && /native module|not available|unavailable/i.test(error.message)
        ? error.message
        : null;

    if (message) {
      return createUnavailableMobileMediaRuntimeState(current, "camera", message, now);
    }

    return createErroredMobileMediaRuntimeState(current, "camera", error, now);
  }
}

export async function requestMobileDocumentPickerAfterUserAction(
  current: MobileMediaRuntimeState,
  now = Date.now(),
): Promise<MobileMediaRuntimeState> {
  try {
    const DocumentPicker = await import("expo-document-picker");
    const result = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: false,
    });

    if (result.canceled) {
      return createMobileMediaRuntimeStateFromDocumentPickerResult(current, null, now);
    }

    const selectedAsset = result.assets[0];
    const asset = selectedAsset
      ? createSafeMobileMediaAssetSummary({
          mimeType: selectedAsset.mimeType ?? null,
          name: selectedAsset.name,
          size: selectedAsset.size ?? null,
        })
      : null;

    return createMobileMediaRuntimeStateFromDocumentPickerResult(current, asset, now);
  } catch (error) {
    const message =
      error instanceof Error && /native module|not available|unavailable/i.test(error.message)
        ? error.message
        : null;

    if (message) {
      return createUnavailableMobileMediaRuntimeState(current, "documentPicker", message, now);
    }

    return createErroredMobileMediaRuntimeState(current, "documentPicker", error, now);
  }
}
