import { useMemo } from "react";
import {
  createInitialMobilePermissionReadiness,
  summarizeMobilePermissionReadiness,
  type MobilePermissionIntentId,
  type MobilePermissionStatus,
} from "../../permissions/mobile-permission-contract";

type MobilePermissionStatuses = Readonly<{
  cameraStatus: MobilePermissionStatus;
  microphoneStatus: MobilePermissionStatus;
  notificationStatus: MobilePermissionStatus;
  photoLibraryStatus: MobilePermissionStatus;
}>;

export function useMobilePermissionSummary({
  cameraStatus,
  microphoneStatus,
  notificationStatus,
  photoLibraryStatus,
}: MobilePermissionStatuses) {
  const baseReadiness = useMemo(() => createInitialMobilePermissionReadiness(), []);
  const permissionReadiness = useMemo(() => {
    const statusByIntent: Readonly<
      Partial<Record<MobilePermissionIntentId, MobilePermissionStatus>>
    > = {
      camera: cameraStatus,
      microphone: microphoneStatus,
      notifications: notificationStatus,
      photoLibrary: photoLibraryStatus,
    };

    return baseReadiness.map((item) => {
      const status = statusByIntent[item.intent.id];
      return status === undefined ? item : { ...item, status };
    });
  }, [baseReadiness, cameraStatus, microphoneStatus, notificationStatus, photoLibraryStatus]);

  const permissionSummary = useMemo(
    () => summarizeMobilePermissionReadiness(permissionReadiness),
    [permissionReadiness],
  );

  return {
    permissionReadiness,
    permissionSummary,
  };
}
