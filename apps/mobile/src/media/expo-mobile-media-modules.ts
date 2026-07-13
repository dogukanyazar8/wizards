export function getExpoImagePickerModule(): typeof import("expo-image-picker") {
  return require("expo-image-picker") as typeof import("expo-image-picker");
}

export function getExpoDocumentPickerModule(): typeof import("expo-document-picker") {
  return require("expo-document-picker") as typeof import("expo-document-picker");
}
