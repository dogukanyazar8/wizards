export function getExpoImagePickerModule(): typeof import("expo-image-picker") {
  return require("expo-image-picker") as typeof import("expo-image-picker");
}

export function getExpoDocumentPickerModule(): typeof import("expo-document-picker") {
  return require("expo-document-picker") as typeof import("expo-document-picker");
}

/** 4a diagnostics: device model and OS, required lazily like the pickers. */
export function getExpoDeviceModule(): typeof import("expo-device") {
  return require("expo-device") as typeof import("expo-device");
}

/** 4a/2a uploads read a picked asset's real byte size through this. */
export function getExpoFileSystemModule(): typeof import("expo-file-system") {
  return require("expo-file-system") as typeof import("expo-file-system");
}

/** Shrinks an oversized screenshot so it can be uploaded at all. */
export function getExpoImageManipulatorModule(): typeof import("expo-image-manipulator") {
  return require("expo-image-manipulator") as typeof import("expo-image-manipulator");
}
