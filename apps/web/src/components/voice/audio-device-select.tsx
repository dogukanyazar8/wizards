"use client";

import { ChevronDown, Mic, RefreshCw, Volume2 } from "lucide-react";
import { useEffect, useMemo } from "react";
import { useI18n } from "@/components/providers/locale-provider";
import { useVoiceConnection } from "@/components/providers/voice-provider";
import {
  useAudioDevices,
  type AudioDeviceOption,
} from "@/hooks/use-audio-devices";
import { cn } from "@/lib/utils";
import { DEFAULT_AUDIO_DEVICE_ID } from "@/store/voice-store";

type AudioDeviceSelectProps = {
  kind: "input" | "output";
  variant?: "compact" | "panel";
};

function getFallbackLabel(
  device: AudioDeviceOption,
  index: number,
  t: (key: string, values?: Record<string, number | string>) => string,
) {
  if (device.label) {
    return device.label;
  }

  if (device.kind === "audioinput") {
    return t("voice.devices.inputFallback", { count: index + 1 });
  }

  return t("voice.devices.outputFallback", { count: index + 1 });
}

function getDefaultDeviceLabel(
  kind: "input" | "output",
  t: (key: string) => string,
) {
  return kind === "input"
    ? t("voice.devices.defaultInput")
    : t("voice.devices.defaultOutput");
}

function withDefaultOption(
  kind: "input" | "output",
  devices: AudioDeviceOption[],
  t: (key: string, values?: Record<string, number | string>) => string,
) {
  const defaultLabel = getDefaultDeviceLabel(kind, t);
  const normalizedDevices = devices.map((device, index) => ({
    ...device,
    label: device.deviceId === DEFAULT_AUDIO_DEVICE_ID
      ? defaultLabel
      : getFallbackLabel(device, index, t),
  }));

  if (normalizedDevices.some((device) => device.deviceId === DEFAULT_AUDIO_DEVICE_ID)) {
    return normalizedDevices;
  }

  return [
    {
      deviceId: DEFAULT_AUDIO_DEVICE_ID,
      groupId: "",
      kind: kind === "input" ? "audioinput" : "audiooutput",
      label: defaultLabel,
    } satisfies AudioDeviceOption,
    ...normalizedDevices,
  ];
}

export function AudioDeviceSelect({
  kind,
  variant = "panel",
}: AudioDeviceSelectProps) {
  const { t } = useI18n();
  const { audioPreferences, setAudioPreference } = useVoiceConnection();
  const {
    inputDevices,
    isLoading,
    outputDevices,
    refreshDevices,
    requestMicrophoneLabels,
    supportsDeviceEnumeration,
    supportsOutputSelection,
  } = useAudioDevices();

  const devices = kind === "input" ? inputDevices : outputDevices;
  const selectedDeviceId =
    kind === "input"
      ? audioPreferences.inputDeviceId
      : audioPreferences.outputDeviceId;
  const options = useMemo(
    () => withDefaultOption(kind, devices, t),
    [devices, kind, t],
  );
  const selectedLabel =
    options.find((device) => device.deviceId === selectedDeviceId)?.label ??
    getDefaultDeviceLabel(kind, t);
  const isOutputUnsupported = kind === "output" && !supportsOutputSelection;
  const isDisabled =
    !supportsDeviceEnumeration || isLoading || isOutputUnsupported || options.length === 0;
  const Icon = kind === "input" ? Mic : Volume2;

  useEffect(() => {
    if (
      selectedDeviceId !== DEFAULT_AUDIO_DEVICE_ID &&
      devices.length > 0 &&
      !devices.some((device) => device.deviceId === selectedDeviceId)
    ) {
      if (kind === "input") {
        setAudioPreference("inputDeviceId", DEFAULT_AUDIO_DEVICE_ID);
      } else {
        setAudioPreference("outputDeviceId", DEFAULT_AUDIO_DEVICE_ID);
      }
    }
  }, [devices, kind, selectedDeviceId, setAudioPreference]);

  const handleChange = (value: string) => {
    if (kind === "input") {
      setAudioPreference("inputDeviceId", value);
      return;
    }

    setAudioPreference("outputDeviceId", value);
  };

  if (variant === "compact") {
    return (
      <label
        className={cn(
          "group/device relative flex min-w-0 items-center gap-2 rounded-2xl border border-[hsl(var(--border)/0.58)] bg-[hsl(var(--surface-soft)/0.3)] px-2.5 py-2 text-app-muted transition hover:bg-[hsl(var(--surface-soft)/0.68)] hover:text-app-foreground focus-within:ring-2 focus-within:ring-[hsl(var(--ring)/0.55)]",
          isDisabled && "opacity-60",
        )}
        title={selectedLabel}
      >
        <Icon className="h-3.5 w-3.5 shrink-0" />
        <span className="sr-only">
          {kind === "input" ? t("voice.devices.inputLabel") : t("voice.devices.outputLabel")}
        </span>
        <span className="min-w-0 flex-1 truncate text-[11px] font-semibold">
          {isLoading ? t("voice.devices.loading") : selectedLabel}
        </span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-70" />
        <select
          aria-label={
            kind === "input" ? t("voice.devices.inputLabel") : t("voice.devices.outputLabel")
          }
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
          disabled={isDisabled}
          onChange={(event) => handleChange(event.target.value)}
          value={selectedDeviceId}
        >
          {options.map((device) => (
            <option key={device.deviceId} value={device.deviceId}>
              {device.label}
            </option>
          ))}
        </select>
      </label>
    );
  }

  return (
    <div className="app-panel-soft rounded-[22px] border p-3 sm:rounded-[24px] sm:p-4">
      <div className="flex items-start gap-3">
        <div className="rounded-2xl bg-[hsl(var(--primary)/0.12)] p-2 text-[hsl(var(--primary))]">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-app-foreground">
                {kind === "input"
                  ? t("voice.devices.inputTitle")
                  : t("voice.devices.outputTitle")}
              </p>
              <p className="mt-1 text-sm leading-5 text-app-muted">
                {kind === "input"
                  ? t("voice.devices.inputDescription")
                  : t("voice.devices.outputDescription")}
              </p>
            </div>
            <button
              className="inline-flex min-h-10 items-center gap-2 rounded-2xl border border-[hsl(var(--border)/0.62)] bg-[hsl(var(--surface-soft)/0.42)] px-3 text-xs font-semibold text-app-soft transition hover:bg-[hsl(var(--surface-soft)/0.72)] hover:text-app-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)] disabled:cursor-wait disabled:opacity-60"
              disabled={isLoading}
              onClick={() => {
                void (kind === "input" ? requestMicrophoneLabels() : refreshDevices());
              }}
              type="button"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", isLoading && "animate-spin")} />
              {t("voice.devices.refresh")}
            </button>
          </div>

          <label className="mt-3 block">
            <span className="sr-only">
              {kind === "input" ? t("voice.devices.inputLabel") : t("voice.devices.outputLabel")}
            </span>
            <span className="relative block">
              <select
                className="min-h-12 w-full appearance-none rounded-2xl border border-[hsl(var(--border)/0.68)] bg-[hsl(var(--surface-card)/0.68)] px-3 pr-10 text-sm font-semibold text-app-foreground transition hover:bg-[hsl(var(--surface-card)/0.88)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)] disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isDisabled}
                onChange={(event) => handleChange(event.target.value)}
                value={selectedDeviceId}
              >
                {options.map((device) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-app-muted" />
            </span>
          </label>

          <p className="mt-2 text-xs leading-5 text-app-soft">
            {isOutputUnsupported
              ? t("voice.devices.outputUnsupported")
              : supportsDeviceEnumeration
                ? t("voice.devices.liveUpdateHint")
                : t("voice.devices.enumerationUnsupported")}
          </p>
        </div>
      </div>
    </div>
  );
}
