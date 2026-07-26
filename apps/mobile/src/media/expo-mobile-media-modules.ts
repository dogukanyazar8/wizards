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
