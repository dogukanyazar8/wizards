"use client";

import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";

import type { StoppableTrack } from "@/hooks/use-mic-level";
import {
  DEFAULT_CAMERA_DEVICE_ID,
  type VoiceCameraPreferences,
  type VoiceCameraRotation,
} from "@/store/voice-store";

/**
 * Kamera önizlemesi — K13'ün ikinci parçası.
 *
 * `CameraPreferencesPanel` silindi; önizlemenin ömrü buraya indi. Ölçerle aynı gerekçe:
 * "önizleme kapanınca track duruyor mu" bir görünüm iddiası değil, ölçülebilir bir kaynak
 * iddiası. Sınıf React'ten bağımsız, hook yalnız bir `useSyncExternalStore` sarmalayıcısı.
 *
 * Sekme gizlenince önizleme **durur** (mobildeki `AppState` korumasının web karşılığı): arka
 * planda açık kalan bir kamera, kullanıcının görmediği bir ışıktır.
 */

export type CameraPreviewStatus =
  "denied" | "device-unavailable" | "error" | "idle" | "ready" | "starting" | "unsupported";

type CapturedVideoTrack = StoppableTrack & {
  addEventListener?: (type: "ended", listener: () => void) => void;
  removeEventListener?: (type: "ended", listener: () => void) => void;
};
export type CapturedVideoStream = { getTracks: () => readonly CapturedVideoTrack[] };

export type CameraPreviewSnapshot = {
  readonly status: CameraPreviewStatus;
  readonly stream: CapturedVideoStream | null;
};

const IDLE_SNAPSHOT: CameraPreviewSnapshot = { status: "idle", stream: null };

export type CameraPreviewQuality = Pick<VoiceCameraPreferences, "quality" | "frameRate">;
const DEFAULT_PREVIEW_QUALITY: CameraPreviewQuality = { quality: "h1080", frameRate: 30 };

export type CameraPreviewSessionOptions = {
  capture?: (deviceId: string, quality: CameraPreviewQuality) => Promise<CapturedVideoStream>;
};

/** Device constraints shared by every local preview start or reconfiguration. */
export function buildCameraPreviewConstraints(
  deviceId: string,
  quality: CameraPreviewQuality = DEFAULT_PREVIEW_QUALITY,
): MediaStreamConstraints {
  const video: MediaTrackConstraints = {
    facingMode: { ideal: "user" },
    frameRate: { ideal: quality.frameRate, max: quality.frameRate },
    height: { ideal: quality.quality === "h720" ? 720 : 1080 },
    width: { ideal: quality.quality === "h720" ? 1280 : 1920 },
  };

  if (deviceId !== DEFAULT_CAMERA_DEVICE_ID) {
    video.deviceId = { exact: deviceId };
  }

  return { audio: false, video };
}

/** Aynalama ve döndürme tek dizede birleşir; iki ayrı transform birbirini ezerdi. */
export function buildCameraPreviewTransform(input: {
  mirrored: boolean;
  rotation: VoiceCameraRotation;
}): string {
  return `scaleX(${input.mirrored ? -1 : 1}) rotate(${input.rotation}deg)`;
}

export function rotateCameraPreview(
  current: VoiceCameraRotation,
  delta: -90 | 90,
): VoiceCameraRotation {
  return ((current + delta + 360) % 360) as VoiceCameraRotation satisfies VoiceCameraRotation;
}

function defaultCapture(
  deviceId: string,
  quality: CameraPreviewQuality,
): Promise<CapturedVideoStream> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    return Promise.reject(new Error("camera-preview/unsupported"));
  }

  return navigator.mediaDevices.getUserMedia(buildCameraPreviewConstraints(deviceId, quality));
}

function classifyCaptureError(error: unknown): CameraPreviewStatus {
  if (error instanceof Error && error.message === "camera-preview/unsupported") {
    return "unsupported";
  }

  if (typeof DOMException !== "undefined" && error instanceof DOMException) {
    if (["NotAllowedError", "SecurityError"].includes(error.name)) {
      return "denied";
    }

    if (["NotFoundError", "NotReadableError", "OverconstrainedError"].includes(error.name)) {
      return "device-unavailable";
    }
  }

  return "error";
}

export class CameraPreviewSession {
  private readonly listeners = new Set<() => void>();

  private readonly capture: (
    deviceId: string,
    quality: CameraPreviewQuality,
  ) => Promise<CapturedVideoStream>;

  private snapshot: CameraPreviewSnapshot = IDLE_SNAPSHOT;

  private generation = 0;
  private detachTrackListeners: (() => void) | null = null;

  constructor(options: CameraPreviewSessionOptions = {}) {
    this.capture = options.capture ?? defaultCapture;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): CameraPreviewSnapshot => this.snapshot;

  isRunning = (): boolean =>
    this.snapshot.status === "ready" || this.snapshot.status === "starting";

  start = async (
    deviceId: string = DEFAULT_CAMERA_DEVICE_ID,
    quality: CameraPreviewQuality = DEFAULT_PREVIEW_QUALITY,
  ): Promise<void> => {
    if (this.isRunning()) {
      return;
    }

    const generation = ++this.generation;
    this.write({ status: "starting", stream: null });

    let stream: CapturedVideoStream;

    try {
      stream = await this.capture(deviceId, quality);
    } catch (error) {
      if (generation === this.generation) {
        this.write({ status: classifyCaptureError(error), stream: null });
      }

      return;
    }

    if (generation !== this.generation) {
      stopTracks(stream);
      return;
    }

    const tracks = stream.getTracks();
    const onEnded = () => {
      if (generation !== this.generation) return;
      this.stop();
      this.write({ status: "device-unavailable", stream: null });
    };
    for (const track of tracks) track.addEventListener?.("ended", onEnded);
    this.detachTrackListeners = () => {
      for (const track of tracks) track.removeEventListener?.("ended", onEnded);
    };
    this.write({ status: "ready", stream });
  };

  reconfigure = (deviceId: string, quality: CameraPreviewQuality): void => {
    if (!this.isRunning()) return;
    this.stop();
    void this.start(deviceId, quality);
  };

  stop = (): void => {
    this.generation += 1;
    this.detachTrackListeners?.();
    this.detachTrackListeners = null;

    const { stream } = this.snapshot;

    if (stream) {
      stopTracks(stream);
    }

    this.write(IDLE_SNAPSHOT);
  };

  dispose = (): void => {
    this.stop();
    this.listeners.clear();
  };

  private write(next: CameraPreviewSnapshot): void {
    if (this.snapshot.status === next.status && this.snapshot.stream === next.stream) {
      return;
    }

    this.snapshot = next;

    for (const listener of this.listeners) {
      listener();
    }
  }
}

function stopTracks(stream: CapturedVideoStream): void {
  for (const track of stream.getTracks()) {
    track.stop();
  }
}

export type UseCameraPreviewResult = CameraPreviewSnapshot & {
  readonly start: () => void;
  readonly stop: () => void;
  readonly toggle: () => void;
};

export function useCameraPreview(
  deviceId: string = DEFAULT_CAMERA_DEVICE_ID,
  quality: CameraPreviewQuality = DEFAULT_PREVIEW_QUALITY,
): UseCameraPreviewResult {
  const session = useMemo(() => new CameraPreviewSession(), []);

  useEffect(() => () => session.dispose(), [session]);
  const { quality: tier, frameRate } = quality;
  useEffect(() => {
    session.reconfigure(deviceId, { quality: tier, frameRate });
  }, [deviceId, tier, frameRate, session]);

  // Görünürlük koruması: sekme arkaya düşünce kamera kapanır.
  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    const handleVisibility = () => {
      if (document.visibilityState === "hidden") {
        session.stop();
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);

    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [session]);

  const snapshot = useSyncExternalStore(
    session.subscribe,
    session.getSnapshot,
    () => IDLE_SNAPSHOT,
  );

  const start = useCallback(
    () => void session.start(deviceId, { quality: tier, frameRate }),
    [deviceId, tier, frameRate, session],
  );
  const stop = useCallback(() => session.stop(), [session]);
  const toggle = useCallback(() => {
    if (session.isRunning()) {
      session.stop();
      return;
    }

    void session.start(deviceId, { quality: tier, frameRate });
  }, [deviceId, tier, frameRate, session]);

  return { ...snapshot, start, stop, toggle };
}
