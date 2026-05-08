"use client";

import { useCallback, useEffect, useState } from "react";

export type CameraDeviceOption = {
  deviceId: string;
  groupId: string;
  kind: "videoinput";
  label: string;
};

type CameraDevicesState = {
  devices: CameraDeviceOption[];
  isLoading: boolean;
  refreshDevices: () => Promise<void>;
  requestCameraLabels: () => Promise<void>;
  supportsDeviceEnumeration: boolean;
  supportsPreview: boolean;
};

function canEnumerateDevices() {
  return typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.enumerateDevices);
}

function canPreviewCamera() {
  return typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia);
}

function toCameraDeviceOption(device: MediaDeviceInfo): CameraDeviceOption | null {
  if (device.kind !== "videoinput" || !device.deviceId) {
    return null;
  }

  return {
    deviceId: device.deviceId,
    groupId: device.groupId,
    kind: device.kind,
    label: device.label,
  };
}

export function useCameraDevices(): CameraDevicesState {
  const [devices, setDevices] = useState<CameraDeviceOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const supportsDeviceEnumeration = canEnumerateDevices();
  const supportsPreview = canPreviewCamera();

  const refreshDevices = useCallback(async () => {
    if (!canEnumerateDevices()) {
      setDevices([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const mediaDevices = await navigator.mediaDevices.enumerateDevices();
      setDevices(
        mediaDevices.flatMap((device) => {
          const option = toCameraDeviceOption(device);
          return option ? [option] : [];
        }),
      );
    } catch {
      setDevices([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const requestCameraLabels = useCallback(async () => {
    if (!canPreviewCamera()) {
      await refreshDevices();
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: true,
      });

      for (const track of stream.getTracks()) {
        track.stop();
      }
    } catch {
      // Device labels may stay generic until the user grants camera access.
    }

    await refreshDevices();
  }, [refreshDevices]);

  useEffect(() => {
    void refreshDevices();

    if (!canEnumerateDevices()) {
      return;
    }

    navigator.mediaDevices.addEventListener("devicechange", refreshDevices);
    return () => navigator.mediaDevices.removeEventListener("devicechange", refreshDevices);
  }, [refreshDevices]);

  return {
    devices,
    isLoading,
    refreshDevices,
    requestCameraLabels,
    supportsDeviceEnumeration,
    supportsPreview,
  };
}
