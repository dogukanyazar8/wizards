"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Cihaz listeleri ve izin durumu — Ş8 §A.1.
 *
 * `VoicePreferencesPanel` silindi; cihaz menülerinin beslendiği yer burası. Liste **gerçek**
 * `enumerateDevices()` sonucudur: tasarımdaki `MacBook Pro Mikrofonu` / `AirPods Pro` gibi adlar
 * örnek veridir ve ürüne sabitlenmez.
 *
 * İzin okuma da burada, çünkü ikisi tek soruya bakar: tarayıcı etiketleri ancak izin verilmişken
 * doldurur. `useMediaPermission` mikrofon **ve** kamera için ortak; kamera sekmesi de bunu
 * çağırır ve `Engellendi` pili sabit bir değer değil, `navigator.permissions`'ın cevabıdır.
 */

type AudioDeviceKind = "audioinput" | "audiooutput";

/** `PermissionName` bu iki değeri tip düzeyinde taşımıyor; sözleşme burada daraltılır. */
export type MediaPermissionName = "camera" | "microphone";

export type MediaPermissionStatus = "denied" | "granted" | "prompt" | "unsupported";

type PermissionStatusLike = {
  addEventListener?: (type: "change", listener: () => void) => void;
  removeEventListener?: (type: "change", listener: () => void) => void;
  state: PermissionState;
};

export type PermissionQuery = (name: MediaPermissionName) => Promise<PermissionStatusLike>;

function defaultPermissionQuery(name: MediaPermissionName): Promise<PermissionStatusLike> {
  if (typeof navigator === "undefined" || !navigator.permissions?.query) {
    return Promise.reject(new Error("media-permission/unsupported"));
  }

  return navigator.permissions.query({ name: name as PermissionName });
}

/**
 * Canlı izin durumu.
 *
 * Firefox `permissions.query({ name: "camera" })` çağrısını reddeder; reddi `unsupported`
 * saymak, "bilinmiyor" ile "engellendi"yi ayırır. Tarayıcı `change` olayı yayınlıyorsa ona da
 * abone olunur: kullanıcı adres çubuğundan izni geri verdiğinde satır kendiliğinden düzelir ve
 * `Tekrar kontrol et` düğmesi bir zorunluluk değil, bir kısayol olur.
 */
export function useMediaPermission(
  name: MediaPermissionName,
  query: PermissionQuery = defaultPermissionQuery,
): { recheck: () => void; status: MediaPermissionStatus } {
  const [status, setStatus] = useState<MediaPermissionStatus>("unsupported");
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let detach: (() => void) | null = null;

    void query(name)
      .then((permission) => {
        if (cancelled) {
          return;
        }

        setStatus(permission.state);

        const handleChange = () => {
          if (!cancelled) {
            setStatus(permission.state);
          }
        };

        permission.addEventListener?.("change", handleChange);
        detach = () => permission.removeEventListener?.("change", handleChange);
      })
      .catch(() => {
        if (!cancelled) {
          setStatus("unsupported");
        }
      });

    return () => {
      cancelled = true;
      detach?.();
    };
  }, [name, nonce, query]);

  const recheck = useCallback(() => setNonce((value) => value + 1), []);

  return { recheck, status };
}

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
  /** Gerçek `navigator.permissions` cevabı; sabit değer yazılmaz. */
  microphonePermission: MediaPermissionStatus;
  outputDevices: AudioDeviceOption[];
  recheckMicrophonePermission: () => void;
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
  const microphone = useMediaPermission("microphone");
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
    microphonePermission: microphone.status,
    outputDevices,
    recheckMicrophonePermission: microphone.recheck,
    refreshDevices,
    requestMicrophoneLabels,
    supportsDeviceEnumeration,
    supportsOutputSelection,
  };
}
