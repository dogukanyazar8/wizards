"use client";

import React, { useEffect, useRef } from "react";
import { FlipHorizontal2, RotateCcw, RotateCw, VideoOff } from "lucide-react";

import { useI18n } from "@/components/providers/locale-provider";
import type { SettingsBlockProps } from "@/components/settings/rows/setting-custom-block";
import {
  buildCameraPreviewTransform,
  rotateCameraPreview,
  useCameraPreview,
  type CameraPreviewStatus,
} from "@/hooks/use-camera-preview";
import { SETTINGS_METRICS, hairline, pxToEm, pxToRem } from "@/lib/settings/metrics";
import { useVoiceStore } from "@/store/voice-store";

/**
 * Kamera önizleme çerçevesi (`k2`) — K13'ün ikinci parçası.
 *
 * 220 px 16:9 çerçeve, yanında `Önizlemeyi başlat` ve üç dönüşüm düğmesi. Önizleme yalnız bu
 * pencerede yaşar ve **kapanınca track durur** — durdurmayı bileşen değil `useCameraPreview`
 * yapar, çünkü bileşen sökülürken çalışan bir temizlik iddia edilebilir ama ölçülemez;
 * oturum sınıfı ölçülebilir (`use-camera-preview.test.ts`).
 */

const { action } = SETTINGS_METRICS.controls;
const { cameraPreview } = SETTINGS_METRICS.blocks;

const STATUS_MESSAGE_KEY: Readonly<Record<CameraPreviewStatus, string>> = {
  denied: "settings.block.camera.denied",
  "device-unavailable": "settings.block.camera.unavailable",
  error: "settings.block.camera.error",
  idle: "settings.block.camera.off",
  ready: "settings.block.camera.live",
  starting: "settings.block.camera.starting",
  unsupported: "settings.block.camera.unsupported",
};

export function CameraPreviewBlock({ row: rowDef }: SettingsBlockProps) {
  const { t } = useI18n();
  const cameraPreferences = useVoiceStore((state) => state.cameraPreferences);
  const setCameraPreference = useVoiceStore((state) => state.setCameraPreference);
  const { status, stream, toggle } = useCameraPreview(cameraPreferences.deviceId);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const running = status === "ready" || status === "starting";

  // Stream'i `<video>`'ya bağlamak bir DOM yazımıdır, render'ın çıktısı değil.
  useEffect(() => {
    const video = videoRef.current;

    if (!video) {
      return;
    }

    video.srcObject = (stream as MediaStream | null) ?? null;

    if (stream) {
      void video.play().catch(() => undefined);
    }

    return () => {
      video.srcObject = null;
    };
  }, [stream]);

  const transform = buildCameraPreviewTransform({
    mirrored: cameraPreferences.mirrorPreview,
    rotation: cameraPreferences.rotation,
  });

  return (
    <div className="flex" data-block="camera" style={{ gap: pxToRem(14) }}>
      <div
        className="relative grid flex-none place-items-center overflow-hidden"
        data-testid="settings-camera-preview"
        style={{
          aspectRatio: `${cameraPreview.aspectWidth} / ${cameraPreview.aspectHeight}`,
          background: "hsl(var(--surface-secondary))",
          border: `${hairline()} solid hsl(var(--border) / ${cameraPreview.borderAlpha})`,
          borderRadius: pxToRem(cameraPreview.radius),
          width: pxToRem(cameraPreview.width),
        }}
      >
        {stream ? (
          <video
            className="absolute inset-0 h-full w-full object-cover"
            muted
            playsInline
            ref={videoRef}
            style={{ transform }}
          />
        ) : (
          <span
            className="flex flex-col items-center"
            style={{ color: "hsl(var(--text-muted))", gap: pxToRem(7) }}
          >
            <VideoOff aria-hidden="true" size={pxToEm(24)} strokeWidth={1.6} />
            <span style={{ fontSize: pxToRem(11), fontWeight: 500, lineHeight: 1 }}>
              {t(STATUS_MESSAGE_KEY[status])}
            </span>
          </span>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col" style={{ gap: pxToRem(7) }}>
        <button
          data-testid={`setting-actions-${rowDef.key}`}
          onClick={toggle}
          style={{
            background: "hsl(var(--primary))",
            border: 0,
            borderRadius: pxToRem(action.radius),
            color: "hsl(var(--primary-foreground))",
            fontSize: pxToRem(action.fontSize),
            fontWeight: action.weight,
            height: pxToRem(action.height),
            lineHeight: 1,
          }}
          type="button"
        >
          {running ? t("settings.block.camera.stop") : t("settings.block.camera.start")}
        </button>

        <div className="flex" style={{ gap: pxToRem(6) }}>
          <TransformButton
            active={cameraPreferences.mirrorPreview}
            icon={<FlipHorizontal2 aria-hidden="true" size={pxToEm(15)} strokeWidth={1.8} />}
            label={t("settings.block.camera.mirror")}
            onClick={() => setCameraPreference("mirrorPreview", !cameraPreferences.mirrorPreview)}
            testId="settings-camera-mirror"
          />
          <TransformButton
            icon={<RotateCcw aria-hidden="true" size={pxToEm(15)} strokeWidth={1.8} />}
            label={t("settings.block.camera.rotateLeft")}
            onClick={() =>
              setCameraPreference("rotation", rotateCameraPreview(cameraPreferences.rotation, -90))
            }
            testId="settings-camera-rotate-left"
          />
          <TransformButton
            icon={<RotateCw aria-hidden="true" size={pxToEm(15)} strokeWidth={1.8} />}
            label={t("settings.block.camera.rotateRight")}
            onClick={() =>
              setCameraPreference("rotation", rotateCameraPreview(cameraPreferences.rotation, 90))
            }
            testId="settings-camera-rotate-right"
          />
        </div>

        <span
          style={{
            color: "hsl(var(--text-muted))",
            fontSize: pxToRem(10.5),
            lineHeight: 1.45,
            textWrap: "pretty",
          }}
        >
          {t("settings.block.camera.note")}
        </span>

        <span className="sr-only" data-testid="settings-camera-status" role="status">
          {t(STATUS_MESSAGE_KEY[status])}
        </span>
      </div>
    </div>
  );
}

function TransformButton({
  active = false,
  icon,
  label,
  onClick,
  testId,
}: {
  readonly active?: boolean;
  readonly icon: React.ReactNode;
  readonly label: string;
  readonly onClick: () => void;
  readonly testId: string;
}) {
  return (
    <button
      aria-label={label}
      aria-pressed={active}
      className="grid flex-1 place-items-center"
      data-testid={testId}
      onClick={onClick}
      style={{
        background: active ? `hsl(var(--primary) / 0.12)` : "hsl(var(--surface-base))",
        border: `${hairline()} solid hsl(var(--border) / ${action.borderAlpha})`,
        borderRadius: pxToRem(action.radius),
        color: active ? "hsl(var(--primary))" : "hsl(var(--text-secondary))",
        height: pxToRem(action.height),
      }}
      title={label}
      type="button"
    >
      {icon}
    </button>
  );
}
