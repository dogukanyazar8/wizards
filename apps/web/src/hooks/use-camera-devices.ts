"use client";

import { useCallback, useMemo } from "react";
import { useAvailableMediaDevices } from "./use-available-media-devices";

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

function canPreviewCamera() {
  return typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia);
}

function toCameraDeviceOption(
  device: Pick<MediaDeviceInfo, "deviceId" | "groupId" | "kind" | "label">,
): CameraDeviceOption | null {
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
  const { query, supported, refresh: refreshDevices } = useAvailableMediaDevices();
  const devices = useMemo(
    () =>
      (query.data ?? []).flatMap((device) => {
        const option = toCameraDeviceOption(device);
        return option ? [option] : [];
      }),
    [query.data],
  );
  const requestCameraLabels = useCallback(async () => {
    if (canPreviewCamera()) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
        for (const track of stream.getTracks()) track.stop();
      } catch {
        // Explicit permission refusal still permits generic device labels.
      }
    }
    await refreshDevices();
  }, [refreshDevices]);
  return {
    devices,
    isLoading: supported && query.isPending,
    refreshDevices,
    requestCameraLabels,
    supportsDeviceEnumeration: supported,
    supportsPreview: canPreviewCamera(),
  };
}
