"use client";

import {
  Camera,
  CameraOff,
  Check,
  ChevronDown,
  FlipHorizontal,
  RefreshCw,
  RotateCcw,
  RotateCw,
  ShieldCheck,
  Sparkles,
  Video,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import { useShallow } from "zustand/react/shallow";
import { useI18n } from "@/components/providers/locale-provider";
import { useCameraDevices, type CameraDeviceOption } from "@/hooks/use-camera-devices";
import { cn } from "@/lib/utils";
import {
  DEFAULT_CAMERA_DEVICE_ID,
  type VoiceCameraRotation,
  useVoiceStore,
} from "@/store/voice-store";

type CameraPreviewStatus =
  | "device-unavailable"
  | "error"
  | "idle"
  | "permission-denied"
  | "ready"
  | "starting"
  | "unsupported";

function getFallbackCameraLabel(
  device: CameraDeviceOption,
  index: number,
  t: (key: string, values?: Record<string, number | string>) => string,
) {
  return device.label || t("voice.camera.deviceFallback", { count: index + 1 });
}

function withDefaultCameraOption(
  devices: CameraDeviceOption[],
  t: (key: string, values?: Record<string, number | string>) => string,
) {
  const normalizedDevices = devices.map((device, index) => ({
    ...device,
    label:
      device.deviceId === DEFAULT_CAMERA_DEVICE_ID
        ? t("voice.camera.defaultDevice")
        : getFallbackCameraLabel(device, index, t),
  }));

  if (normalizedDevices.some((device) => device.deviceId === DEFAULT_CAMERA_DEVICE_ID)) {
    return normalizedDevices;
  }

  return [
    {
      deviceId: DEFAULT_CAMERA_DEVICE_ID,
      groupId: "",
      kind: "videoinput",
      label: t("voice.camera.defaultDevice"),
    } satisfies CameraDeviceOption,
    ...normalizedDevices,
  ];
}

function buildCameraPreviewConstraints(deviceId: string): MediaStreamConstraints {
  const video: MediaTrackConstraints = {
    facingMode: { ideal: "user" },
    frameRate: { ideal: 30, max: 30 },
    height: { ideal: 720 },
    width: { ideal: 1280 },
  };

  if (deviceId !== DEFAULT_CAMERA_DEVICE_ID) {
    video.deviceId = { exact: deviceId };
  }

  return {
    audio: false,
    video,
  };
}

function isPermissionDenied(error: unknown) {
  return error instanceof DOMException && ["NotAllowedError", "SecurityError"].includes(error.name);
}

function isDeviceUnavailable(error: unknown) {
  return (
    error instanceof DOMException &&
    ["NotFoundError", "NotReadableError", "OverconstrainedError"].includes(error.name)
  );
}

function rotateCamera(current: VoiceCameraRotation, delta: -90 | 90): VoiceCameraRotation {
  return (((current + delta + 360) % 360) || 0) as VoiceCameraRotation;
}

function getVideoTransform({
  mirrored,
  rotation,
  scale = 1,
}: {
  mirrored: boolean;
  rotation: VoiceCameraRotation;
  scale?: number;
}) {
  return `scale(${scale}) scaleX(${mirrored ? -1 : 1}) rotate(${rotation}deg)`;
}

function CameraDeviceSelect({
  devices,
  isLoading,
  onRefresh,
  onSelect,
  selectedDeviceId,
}: {
  devices: CameraDeviceOption[];
  isLoading: boolean;
  onRefresh: () => void;
  onSelect: (deviceId: string) => void;
  selectedDeviceId: string;
}) {
  const { t } = useI18n();
  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const options = useMemo(() => withDefaultCameraOption(devices, t), [devices, t]);
  const selectedIndex = Math.max(
    options.findIndex((device) => device.deviceId === selectedDeviceId),
    0,
  );
  const selectedLabel =
    options.find((device) => device.deviceId === selectedDeviceId)?.label ??
    t("voice.camera.defaultDevice");

  useEffect(() => {
    if (isOpen) {
      setActiveIndex(selectedIndex);
    }
  }, [isOpen, selectedIndex]);

  useEffect(() => {
    if (!isOpen || !rootRef.current) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [isOpen]);

  const handleSelect = (deviceId: string) => {
    onSelect(deviceId);
    setIsOpen(false);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!isOpen) {
      if (
        event.key === "ArrowDown" ||
        event.key === "ArrowUp" ||
        event.key === "Enter" ||
        event.key === " "
      ) {
        event.preventDefault();
        setIsOpen(true);
      }

      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      setIsOpen(false);
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => (current + 1) % options.length);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => (current - 1 + options.length) % options.length);
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      const activeOption = options[activeIndex];
      if (activeOption) {
        handleSelect(activeOption.deviceId);
      }
    }
  };

  return (
    <div className="app-panel-soft relative rounded-[18px] border p-3" onKeyDown={handleKeyDown} ref={rootRef}>
      <div className="flex items-start justify-between gap-2.5">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-app-foreground">
            {t("voice.camera.deviceTitle")}
          </p>
          <p className="mt-0.5 text-xs leading-4 text-app-muted">
            {t("voice.camera.deviceDescription")}
          </p>
        </div>
        <button
          aria-label={t("voice.camera.refresh")}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-[hsl(var(--border)/0.64)] bg-[hsl(var(--surface-card)/0.62)] text-app-muted transition hover:bg-[hsl(var(--surface-card)/0.9)] hover:text-app-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)] disabled:cursor-wait disabled:opacity-60"
          disabled={isLoading}
          onClick={onRefresh}
          type="button"
        >
          <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
        </button>
      </div>

      <div className="relative mt-3">
        <button
          aria-controls={isOpen ? listboxId : undefined}
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          aria-label={t("voice.camera.deviceLabel")}
          className={cn(
            "flex min-h-10 w-full items-center gap-2.5 rounded-xl border border-[hsl(var(--border)/0.68)] bg-[hsl(var(--surface-card)/0.68)] px-2.5 text-left text-xs font-semibold text-app-foreground transition hover:bg-[hsl(var(--surface-card)/0.9)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]",
            isOpen &&
              "border-[hsl(var(--primary)/0.34)] bg-[hsl(var(--primary)/0.1)] shadow-[0_18px_46px_hsl(var(--primary)/0.12)]",
          )}
          data-testid="camera-device-select-trigger"
          onClick={() => setIsOpen((current) => !current)}
          type="button"
        >
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-[hsl(var(--surface-soft)/0.72)] text-app-muted">
            <Camera className="h-3.5 w-3.5" />
          </span>
          <span className="min-w-0 flex-1 truncate">
            {isLoading ? t("voice.camera.loading") : selectedLabel}
          </span>
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 text-app-muted transition",
              isOpen && "rotate-180 text-app-foreground",
            )}
          />
        </button>

        {isOpen ? (
          <div
            className="absolute left-0 right-0 top-[calc(100%+0.55rem)] z-[95] overflow-hidden rounded-[16px] border border-[hsl(var(--border)/0.62)] bg-[hsl(var(--surface-card)/0.96)] p-1.5 shadow-[0_18px_54px_hsl(var(--shadow-color)/0.18)] backdrop-blur-2xl"
            data-testid="camera-device-select-menu"
          >
            <div
              aria-activedescendant={`${listboxId}-${options[activeIndex]?.deviceId ?? "none"}`}
              aria-label={t("voice.camera.deviceLabel")}
              className="max-h-56 overflow-y-auto pr-1"
              id={listboxId}
              role="listbox"
            >
              {options.map((device, index) => {
                const isSelected = device.deviceId === selectedDeviceId;
                const isActive = index === activeIndex;

                return (
                  <button
                    aria-selected={isSelected}
                    className={cn(
                      "group/camera-option flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.5)]",
                      isSelected
                        ? "bg-[hsl(var(--primary)/0.13)] text-app-foreground"
                        : "text-app-muted hover:bg-[hsl(var(--surface-soft)/0.64)] hover:text-app-foreground",
                      isActive && !isSelected && "bg-[hsl(var(--surface-soft)/0.52)]",
                    )}
                    data-testid="camera-device-select-option"
                    id={`${listboxId}-${device.deviceId}`}
                    key={device.deviceId}
                    onClick={() => handleSelect(device.deviceId)}
                    onMouseEnter={() => setActiveIndex(index)}
                    role="option"
                    type="button"
                  >
                    <span
                      className={cn(
                        "grid h-7 w-7 shrink-0 place-items-center rounded-lg border transition",
                        isSelected
                          ? "border-[hsl(var(--primary)/0.3)] bg-[hsl(var(--primary)/0.16)] text-[hsl(var(--primary))]"
                          : "border-[hsl(var(--border)/0.55)] bg-[hsl(var(--surface-soft)/0.38)] text-app-muted group-hover/camera-option:text-app-foreground",
                      )}
                    >
                      <Video className="h-3.5 w-3.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-semibold">{device.label}</span>
                      {device.deviceId === DEFAULT_CAMERA_DEVICE_ID ? (
                        <span className="mt-0.5 block truncate text-[11px] font-medium text-app-soft">
                          {t("voice.camera.liveUpdateHint")}
                        </span>
                      ) : null}
                    </span>
                    <span
                      className={cn(
                        "grid h-6 w-6 shrink-0 place-items-center rounded-full border transition",
                        isSelected
                          ? "border-[hsl(var(--primary)/0.35)] bg-[hsl(var(--primary)/0.17)] text-[hsl(var(--primary))] opacity-100"
                          : "border-transparent text-app-muted opacity-0 group-hover/camera-option:opacity-50",
                      )}
                    >
                      <Check className="h-3.5 w-3.5" />
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>

      <p className="mt-2 text-[11px] leading-4 text-app-soft">{t("voice.camera.liveUpdateHint")}</p>
    </div>
  );
}

function CameraOptionButton({
  active,
  description,
  disabled = false,
  icon: Icon,
  label,
  onClick,
}: {
  active?: boolean;
  description: string;
  disabled?: boolean;
  icon: typeof Camera;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-pressed={active}
      className={cn(
        "group/camera-control flex min-h-[5.25rem] flex-col items-start justify-between rounded-[18px] border p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]",
        active
          ? "border-[hsl(var(--primary)/0.38)] bg-[hsl(var(--primary)/0.12)] shadow-[0_18px_46px_hsl(var(--primary)/0.12)]"
          : "border-[hsl(var(--border)/0.66)] bg-[hsl(var(--surface-card)/0.54)] hover:-translate-y-0.5 hover:border-[hsl(var(--primary)/0.26)] hover:bg-[hsl(var(--surface-card)/0.82)]",
        disabled && "cursor-not-allowed opacity-55 hover:translate-y-0",
      )}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <span
        className={cn(
          "grid h-8 w-8 place-items-center rounded-xl border transition",
          active
            ? "border-[hsl(var(--primary)/0.28)] bg-[hsl(var(--primary)/0.18)] text-[hsl(var(--primary))]"
            : "border-[hsl(var(--border)/0.58)] bg-[hsl(var(--surface-soft)/0.46)] text-app-muted group-hover/camera-control:text-app-foreground",
        )}
      >
        <Icon className="h-4 w-4" />
      </span>
      <span className="mt-2 block text-[13px] font-semibold text-app-foreground">{label}</span>
      <span className="mt-0.5 block text-[11px] leading-4 text-app-muted">{description}</span>
    </button>
  );
}

export function CameraPreferencesPanel() {
  const { t } = useI18n();
  const foregroundVideoRef = useRef<HTMLVideoElement | null>(null);
  const backdropVideoRef = useRef<HTMLVideoElement | null>(null);
  const previewStreamRef = useRef<MediaStream | null>(null);
  const previewDeviceIdRef = useRef<string | null>(null);
  const isMountedRef = useRef(false);
  const [previewStatus, setPreviewStatus] = useState<CameraPreviewStatus>("idle");
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewStream, setPreviewStream] = useState<MediaStream | null>(null);
  const {
    cameraPreferences,
    resetCameraPreferences,
    setCameraPreference,
  } = useVoiceStore(
    useShallow((state) => ({
      cameraPreferences: state.cameraPreferences,
      resetCameraPreferences: state.resetCameraPreferences,
      setCameraPreference: state.setCameraPreference,
    })),
  );
  const {
    devices,
    isLoading,
    refreshDevices,
    requestCameraLabels,
    supportsDeviceEnumeration,
    supportsPreview,
  } = useCameraDevices();
  const selectedDeviceLabel =
    withDefaultCameraOption(devices, t).find(
      (device) => device.deviceId === cameraPreferences.deviceId,
    )?.label ?? t("voice.camera.defaultDevice");
  const isPreviewRunning = previewStatus === "ready" || previewStatus === "starting";
  const previewTitle =
    previewStatus === "ready"
      ? t("voice.camera.previewReady")
      : previewStatus === "starting"
        ? t("voice.camera.previewStarting")
        : t("voice.camera.previewIdleTitle");
  const previewDescription =
    previewStatus === "ready"
      ? t("voice.camera.previewReadyDescription", { device: selectedDeviceLabel })
      : previewError ?? t("voice.camera.previewIdleDescription");
  const foregroundVideoStyle = useMemo<CSSProperties>(
    () => ({
      transform: getVideoTransform({
        mirrored: cameraPreferences.mirrorPreview,
        rotation: cameraPreferences.rotation,
        scale: cameraPreferences.backgroundBlur ? 0.86 : 1,
      }),
    }),
    [cameraPreferences.backgroundBlur, cameraPreferences.mirrorPreview, cameraPreferences.rotation],
  );
  const backdropVideoStyle = useMemo<CSSProperties>(
    () => ({
      transform: getVideoTransform({
        mirrored: cameraPreferences.mirrorPreview,
        rotation: cameraPreferences.rotation,
        scale: 1.12,
      }),
    }),
    [cameraPreferences.mirrorPreview, cameraPreferences.rotation],
  );

  const stopCurrentStream = useCallback(() => {
    if (previewStreamRef.current) {
      for (const track of previewStreamRef.current.getTracks()) {
        track.stop();
      }
    }

    previewStreamRef.current = null;
    setPreviewStream(null);
  }, []);

  const stopPreview = useCallback(() => {
    stopCurrentStream();
    setPreviewStatus("idle");
    setPreviewError(null);
  }, [stopCurrentStream]);

  const startPreview = useCallback(async () => {
    if (!supportsPreview) {
      setPreviewStatus("unsupported");
      setPreviewError(t("voice.camera.previewUnsupported"));
      return;
    }

    setPreviewStatus("starting");
    setPreviewError(null);
    stopCurrentStream();

    try {
      const stream = await navigator.mediaDevices.getUserMedia(
        buildCameraPreviewConstraints(cameraPreferences.deviceId),
      );

      if (!isMountedRef.current) {
        for (const track of stream.getTracks()) {
          track.stop();
        }
        return;
      }

      previewStreamRef.current = stream;
      setPreviewStream(stream);
      setPreviewStatus("ready");
      await refreshDevices();
    } catch (error) {
      const nextStatus: CameraPreviewStatus = isPermissionDenied(error)
        ? "permission-denied"
        : isDeviceUnavailable(error)
          ? "device-unavailable"
          : "error";

      setPreviewStatus(nextStatus);
      setPreviewError(
        nextStatus === "permission-denied"
          ? t("voice.camera.previewDenied")
          : nextStatus === "device-unavailable"
            ? t("voice.camera.previewDeviceUnavailable")
            : t("voice.camera.previewError"),
      );
    }
  }, [cameraPreferences.deviceId, refreshDevices, stopCurrentStream, supportsPreview, t]);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
      stopCurrentStream();
    };
  }, [stopCurrentStream]);

  useEffect(() => {
    const videos = [foregroundVideoRef.current, backdropVideoRef.current];

    for (const video of videos) {
      if (!video) {
        continue;
      }

      video.srcObject = previewStream;
      if (previewStream) {
        video.play().catch(() => undefined);
      }
    }

    return () => {
      for (const video of videos) {
        if (video) {
          video.srcObject = null;
        }
      }
    };
  }, [previewStream]);

  useEffect(() => {
    if (
      cameraPreferences.deviceId !== DEFAULT_CAMERA_DEVICE_ID &&
      devices.length > 0 &&
      !devices.some((device) => device.deviceId === cameraPreferences.deviceId)
    ) {
      setCameraPreference("deviceId", DEFAULT_CAMERA_DEVICE_ID);
    }
  }, [cameraPreferences.deviceId, devices, setCameraPreference]);

  useEffect(() => {
    if (previewDeviceIdRef.current === cameraPreferences.deviceId) {
      return;
    }

    previewDeviceIdRef.current = cameraPreferences.deviceId;

    if (previewStatus === "ready") {
      void startPreview();
    }
  }, [cameraPreferences.deviceId, previewStatus, startPreview]);

  const handlePreviewToggle = () => {
    if (isPreviewRunning) {
      stopPreview();
      return;
    }

    void startPreview();
  };

  const handleRefresh = () => {
    void requestCameraLabels();
  };

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-[18px] border border-[hsl(var(--primary)/0.18)] bg-[linear-gradient(135deg,hsl(var(--surface-card)/0.96),hsl(var(--primary)/0.08)_58%,hsl(var(--accent)/0.08))] shadow-[0_12px_32px_hsl(var(--shadow-color)/0.06)]">
        <div className="grid gap-0 lg:grid-cols-[minmax(0,1.2fr)_minmax(20rem,0.8fr)]">
          <div className="relative min-h-[12rem] overflow-hidden bg-black sm:min-h-[16rem] lg:min-h-[20rem]">
            {previewStream && cameraPreferences.backgroundBlur ? (
              <video
                aria-hidden="true"
                autoPlay
                className="absolute inset-0 h-full w-full object-cover opacity-55 blur-2xl saturate-125"
                muted
                playsInline
                ref={backdropVideoRef}
                style={backdropVideoStyle}
              />
            ) : null}

            {previewStream ? (
              <video
                autoPlay
                className={cn(
                  "relative z-10 h-full w-full object-cover transition duration-500",
                  cameraPreferences.backgroundBlur &&
                    "rounded-[22px] border border-white/18 shadow-[0_20px_70px_rgba(0,0,0,0.38)]",
                )}
                data-testid="camera-settings-preview-video"
                muted
                playsInline
                ref={foregroundVideoRef}
                style={foregroundVideoStyle}
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center p-3">
                <div className="max-w-sm text-center">
                  <div className="mx-auto grid h-14 w-14 place-items-center rounded-[18px] border border-white/14 bg-white/8 text-white shadow-[0_16px_48px_rgba(0,0,0,0.22)] backdrop-blur-xl">
                    {previewStatus === "starting" ? (
                      <RefreshCw className="h-6 w-6 animate-spin" />
                    ) : (
                      <CameraOff className="h-6 w-6" />
                    )}
                  </div>
                  <p className="mt-3 text-sm font-semibold text-white">{previewTitle}</p>
                  <p className="mt-1.5 text-xs leading-5 text-white/64">{previewDescription}</p>
                </div>
              </div>
            )}

            <div className="pointer-events-none absolute inset-x-3 top-3 z-20 flex flex-wrap items-center gap-1.5">
              <span className="rounded-full border border-white/14 bg-black/35 px-2.5 py-1 text-[11px] font-semibold text-white shadow-[0_10px_28px_rgba(0,0,0,0.18)] backdrop-blur-xl">
                {selectedDeviceLabel}
              </span>
              {cameraPreferences.mirrorPreview ? (
                <span className="rounded-full border border-white/14 bg-white/12 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur-xl">
                  {t("voice.camera.mirrorBadge")}
                </span>
              ) : null}
              {cameraPreferences.rotation !== 0 ? (
                <span className="rounded-full border border-white/14 bg-white/12 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur-xl">
                  {t("voice.camera.rotationBadge", { degrees: cameraPreferences.rotation })}
                </span>
              ) : null}
            </div>
          </div>

          <div className="flex flex-col justify-between gap-3 p-3">
            <div>
              <div className="inline-flex items-center gap-1.5 rounded-full border border-[hsl(var(--primary)/0.22)] bg-[hsl(var(--primary)/0.12)] px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[hsl(var(--primary))]">
                <Sparkles className="h-3.5 w-3.5" />
                {t("voice.camera.previewBadge")}
              </div>
              <h3 className="mt-2.5 text-lg font-semibold tracking-tight text-app-foreground">
                {t("voice.camera.previewTitle")}
              </h3>
              <p className="mt-1.5 text-xs leading-5 text-app-muted">
                {t("voice.camera.previewDescription")}
              </p>
            </div>

            <div className="grid gap-2.5">
              <button
                className={cn(
                  "inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border px-3 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]",
                  isPreviewRunning
                    ? "border-[hsl(var(--danger)/0.34)] bg-[hsl(var(--danger)/0.1)] text-app-danger hover:bg-[hsl(var(--danger)/0.15)]"
                    : "border-[hsl(var(--primary)/0.34)] bg-[hsl(var(--primary)/0.13)] text-[hsl(var(--primary))] hover:-translate-y-0.5 hover:bg-[hsl(var(--primary)/0.18)]",
                )}
                data-testid="camera-settings-preview-toggle"
                disabled={previewStatus === "starting"}
                onClick={handlePreviewToggle}
                type="button"
              >
                {previewStatus === "starting" ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : isPreviewRunning ? (
                  <CameraOff className="h-4 w-4" />
                ) : (
                  <Camera className="h-4 w-4" />
                )}
                {previewStatus === "starting"
                  ? t("voice.camera.previewStarting")
                  : isPreviewRunning
                    ? t("voice.camera.stopPreview")
                    : t("voice.camera.startPreview")}
              </button>

              <div className="rounded-[18px] border border-[hsl(var(--border)/0.6)] bg-[hsl(var(--surface-card)/0.52)] p-3">
                <p className="text-[13px] font-semibold text-app-foreground">{previewTitle}</p>
                <p className="mt-0.5 text-xs leading-4 text-app-muted">{previewDescription}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-2.5 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <CameraDeviceSelect
          devices={devices}
          isLoading={isLoading}
          onRefresh={handleRefresh}
          onSelect={(deviceId) => setCameraPreference("deviceId", deviceId)}
          selectedDeviceId={cameraPreferences.deviceId}
        />

        <div className="grid gap-2.5 sm:grid-cols-2">
          <CameraOptionButton
            active={cameraPreferences.mirrorPreview}
            description={t("voice.camera.mirrorDescription")}
            icon={FlipHorizontal}
            label={t("voice.camera.mirrorTitle")}
            onClick={() => setCameraPreference("mirrorPreview", !cameraPreferences.mirrorPreview)}
          />
          <CameraOptionButton
            active={cameraPreferences.backgroundBlur}
            description={t("voice.camera.blurDescription")}
            icon={Sparkles}
            label={t("voice.camera.blurTitle")}
            onClick={() => setCameraPreference("backgroundBlur", !cameraPreferences.backgroundBlur)}
          />
          <CameraOptionButton
            description={t("voice.camera.rotateLeftDescription")}
            icon={RotateCcw}
            label={t("voice.camera.rotateLeft")}
            onClick={() =>
              setCameraPreference("rotation", rotateCamera(cameraPreferences.rotation, -90))
            }
          />
          <CameraOptionButton
            description={t("voice.camera.rotateRightDescription")}
            icon={RotateCw}
            label={t("voice.camera.rotateRight")}
            onClick={() =>
              setCameraPreference("rotation", rotateCamera(cameraPreferences.rotation, 90))
            }
          />
        </div>
      </div>

      <div className="grid gap-2.5 md:grid-cols-[minmax(0,1fr)_auto]">
        <div className="app-panel-soft flex items-start gap-2.5 rounded-[18px] border p-3">
          <div className="rounded-xl bg-[hsl(var(--success)/0.12)] p-2 text-[hsl(var(--success))]">
            <ShieldCheck className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-app-foreground">
              {t("voice.camera.privacyTitle")}
            </p>
            <p className="mt-0.5 text-xs leading-4 text-app-muted">
              {supportsDeviceEnumeration
                ? t("voice.camera.privacyDescription")
                : t("voice.camera.enumerationUnsupported")}
            </p>
          </div>
        </div>

        <button
          className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-[hsl(var(--border)/0.66)] bg-[hsl(var(--surface-card)/0.64)] px-3 text-xs font-semibold text-app-foreground transition hover:border-[hsl(var(--primary)/0.28)] hover:bg-[hsl(var(--primary)/0.08)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
          onClick={resetCameraPreferences}
          type="button"
        >
          <RotateCcw className="h-4 w-4" />
          {t("voice.camera.reset")}
        </button>
      </div>
    </div>
  );
}
