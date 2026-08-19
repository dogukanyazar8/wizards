export function canAttemptMicrophoneCapture(permissionState: PermissionState | null) {
  return permissionState !== "denied";
}
