import {
  createErroredMobileMediaRuntimeState,
  createMobileMediaRuntimeStateFromDocumentPickerResult,
  createMobileMediaRuntimeStateFromPhotoLibraryResult,
  createMobileMediaRuntimeStateFromPermission,
  createUnavailableMobileMediaRuntimeState,
  createSafeMobileMediaAssetSummary,
  mapExpoImagePickerPermissionStatus,
  type MobileMediaRuntimeState,
} from "./mobile-media-contract";
import { getExpoDocumentPickerModule, getExpoImagePickerModule } from "./expo-mobile-media-modules";

export async function requestMobilePhotoLibraryPermissionAfterUserAction(
  current: MobileMediaRuntimeState,
  now = Date.now(),
): Promise<MobileMediaRuntimeState> {
  try {
    const ImagePicker = getExpoImagePickerModule();

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

export async function requestMobilePhotoLibraryPickerAfterUserAction(
  current: MobileMediaRuntimeState,
  now = Date.now(),
): Promise<MobileMediaRuntimeState> {
  try {
    const ImagePicker = getExpoImagePickerModule();

    const currentPermissions = await ImagePicker.getMediaLibraryPermissionsAsync();
    let permissionStatus = mapExpoImagePickerPermissionStatus(
      currentPermissions.status,
      currentPermissions.canAskAgain,
    );

    if (permissionStatus !== "granted" && permissionStatus !== "blocked") {
      const requestedPermissions = await ImagePicker.requestMediaLibraryPermissionsAsync();
      permissionStatus = mapExpoImagePickerPermissionStatus(
        requestedPermissions.status,
        requestedPermissions.canAskAgain,
      );
    }

    if (permissionStatus !== "granted") {
      return createMobileMediaRuntimeStateFromPermission(
        current,
        "photoLibrary",
        permissionStatus,
        now,
      );
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: false,
      allowsMultipleSelection: false,
      mediaTypes: ["images"],
      quality: 0.92,
    });

    if (result.canceled) {
      return createMobileMediaRuntimeStateFromPhotoLibraryResult(current, null, now);
    }

    const selectedAsset = result.assets[0];
    const asset = selectedAsset
      ? createSafeMobileMediaAssetSummary({
          mimeType: selectedAsset.mimeType ?? null,
          name: selectedAsset.fileName ?? "Selected image",
          size: selectedAsset.fileSize ?? null,
          source: "photoLibrary",
        })
      : null;

    return createMobileMediaRuntimeStateFromPhotoLibraryResult(current, asset, now);
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
    const ImagePicker = getExpoImagePickerModule();

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
    const DocumentPicker = getExpoDocumentPickerModule();
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
