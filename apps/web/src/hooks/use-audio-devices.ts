"use client";

import { useCallback, useEffect, useState } from "react";

type AudioDeviceKind = "audioinput" | "audiooutput";

export type AudioDeviceEnumerationStatus = "error" | "loading" | "ready" | "unsupported";

export type AudioDeviceOption = {
  deviceId: string;
  groupId: string;
  kind: AudioDeviceKind;
  label: string;
};

type AudioDevicesState = {
  enumerationStatus: AudioDeviceEnumerationStatus;
  inputDevices: AudioDeviceOption[];
  isLoading: boolean;
  outputDevices: AudioDeviceOption[];
  refreshDevices: () => Promise<void>;
  requestMicrophoneLabels: () => Promise<void>;
  supportsDeviceEnumeration: boolean;
  supportsOutputSelection: boolean;
};

function canEnumerateDevices() {
  return typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.enumerateDevices);
}

function canSelectAudioOutput() {
  return typeof HTMLMediaElement !== "undefined" && "setSinkId" in HTMLMediaElement.prototype;
}

function toAudioDeviceOption(device: MediaDeviceInfo): AudioDeviceOption | null {
  if (device.kind !== "audioinput" && device.kind !== "audiooutput") {
    return null;
  }

  if (!device.deviceId) {
    return null;
  }

  return {
    deviceId: device.deviceId,
    groupId: device.groupId,
    kind: device.kind,
    label: device.label,
  };
}

export function useAudioDevices(): AudioDevicesState {
  const [inputDevices, setInputDevices] = useState<AudioDeviceOption[]>([]);
  const [outputDevices, setOutputDevices] = useState<AudioDeviceOption[]>([]);
  const [enumerationStatus, setEnumerationStatus] = useState<AudioDeviceEnumerationStatus>(() =>
    canEnumerateDevices() ? "loading" : "unsupported",
  );
  const isLoading = enumerationStatus === "loading";
  const supportsDeviceEnumeration = canEnumerateDevices();
  const supportsOutputSelection = canSelectAudioOutput();

  const refreshDevices = useCallback(async () => {
    if (!canEnumerateDevices()) {
      setInputDevices([]);
      setOutputDevices([]);
      setEnumerationStatus("unsupported");
      return;
    }

    setEnumerationStatus("loading");
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioDevices = devices.flatMap((device) => {
        const option = toAudioDeviceOption(device);
        return option ? [option] : [];
      });

      setInputDevices(audioDevices.filter((device) => device.kind === "audioinput"));
      setOutputDevices(audioDevices.filter((device) => device.kind === "audiooutput"));
      setEnumerationStatus("ready");
    } catch {
      setInputDevices([]);
      setOutputDevices([]);
      setEnumerationStatus("error");
    }
  }, []);

  const requestMicrophoneLabels = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      await refreshDevices();
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      for (const track of stream.getTracks()) {
        track.stop();
      }
    } catch {
      // The picker still works with browser-provided fallback labels.
    }

    await refreshDevices();
  }, [refreshDevices]);

  useEffect(() => {
    if (!canEnumerateDevices()) {
      return;
    }

    let cancelled = false;
    void navigator.mediaDevices
      .enumerateDevices()
      .then((devices) => {
        if (cancelled) {
          return;
        }

        const audioDevices = devices.flatMap((device) => {
          const option = toAudioDeviceOption(device);
          return option ? [option] : [];
        });
        setInputDevices(audioDevices.filter((device) => device.kind === "audioinput"));
        setOutputDevices(audioDevices.filter((device) => device.kind === "audiooutput"));
        setEnumerationStatus("ready");
      })
      .catch(() => {
        if (!cancelled) {
          setInputDevices([]);
          setOutputDevices([]);
          setEnumerationStatus("error");
        }
      });

    navigator.mediaDevices.addEventListener("devicechange", refreshDevices);
    return () => {
      cancelled = true;
      navigator.mediaDevices.removeEventListener("devicechange", refreshDevices);
    };
  }, [refreshDevices]);

  return {
    enumerationStatus,
    inputDevices,
    isLoading,
    outputDevices,
    refreshDevices,
    requestMicrophoneLabels,
    supportsDeviceEnumeration,
    supportsOutputSelection,
  };
}
