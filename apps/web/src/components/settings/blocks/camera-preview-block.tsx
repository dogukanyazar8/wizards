"use client";

import React, { useEffect, useId, useRef, useState } from "react";
import { FlipHorizontal2, RotateCcw, RotateCw, VideoOff } from "lucide-react";

import { SettingSelect } from "@/components/settings/rows/setting-select";
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

/** Local device test; capture lifetime is owned by useCameraPreview. */

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
  const { status, stream, toggle } = useCameraPreview(
    cameraPreferences.deviceId,
    cameraPreferences,
  );
  const [openSelect, setOpenSelect] = useState<"quality" | "fps" | null>(null);
  const qualityLabel = useId();
  const fpsLabel = useId();
  const actual = (stream as MediaStream | null)?.getVideoTracks?.()[0]?.getSettings();
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
    <div className="flex flex-wrap" data-block="camera" style={{ gap: pxToRem(14) }}>
      <div
        className="relative grid max-w-full flex-none place-items-center overflow-hidden"
        data-testid="settings-camera-preview"
        style={{
          aspectRatio: `${cameraPreview.aspectWidth} / ${cameraPreview.aspectHeight}`,
          background: "hsl(var(--surface-secondary))",
          border: `${hairline()} solid hsl(var(--border) / ${cameraPreview.borderAlpha})`,
          borderRadius: pxToRem(cameraPreview.radius),
          width: "100%",
          maxWidth: pxToRem(520),
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

      <div className="flex min-w-0 flex-1 basis-48 flex-col" style={{ gap: pxToRem(12) }}>
        <div className="flex flex-wrap gap-3">
          <div className="min-w-0 max-w-full space-y-2">
            <p id={qualityLabel} className="text-sm font-medium">
              {t("settings.camera.quality")}
            </p>
            <SettingSelect
              labelledById={qualityLabel}
              options={[{ label: "720p" }, { label: "1080p" }]}
              value={cameraPreferences.quality === "h720" ? 0 : 1}
              open={openSelect === "quality"}
              onOpenChange={(open) => setOpenSelect(open ? "quality" : null)}
              onChange={(index) => setCameraPreference("quality", index === 0 ? "h720" : "h1080")}
            />
          </div>
          <div className="min-w-0 max-w-full space-y-2">
            <p id={fpsLabel} className="text-sm font-medium">
              {t("settings.camera.fps")}
            </p>
            <SettingSelect
              labelledById={fpsLabel}
              options={[{ label: "15 FPS" }, { label: "30 FPS" }]}
              value={cameraPreferences.frameRate === 15 ? 0 : 1}
              open={openSelect === "fps"}
              onOpenChange={(open) => setOpenSelect(open ? "fps" : null)}
              onChange={(index) => setCameraPreference("frameRate", index === 0 ? 15 : 30)}
            />
          </div>
        </div>
        <button
          className="transition-[filter] hover:brightness-90 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
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
          {t("settings.block.camera.note")} {t("settings.camera.qualityHelp")}
        </span>

        <span
          className="text-xs text-[hsl(var(--text-secondary))]"
          data-testid="settings-camera-status"
          role="status"
        >
          {t(STATUS_MESSAGE_KEY[status])}
          {actual?.width && actual?.height
            ? ` · ${actual.width} × ${actual.height}${actual.frameRate ? ` · ${Math.round(actual.frameRate)} FPS` : ""}`
            : ""}
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
      className="grid flex-1 place-items-center transition-[filter] hover:brightness-90 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
      data-testid={testId}
      onClick={onClick}
      style={{
        background: active === false ? "hsl(var(--surface-base))" : "hsl(var(--primary))",
        border: `${hairline()} solid hsl(var(--border) / ${action.borderAlpha})`,
        borderRadius: pxToRem(action.radius),
        color: active === false ? "hsl(var(--text-secondary))" : "hsl(var(--primary-foreground))",
        height: pxToRem(action.height),
      }}
      title={label}
      type="button"
    >
      {icon}
    </button>
  );
}
