"use client";

import { Check, ChevronDown, Mic, RefreshCw, Volume2 } from "lucide-react";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { useI18n } from "@/components/providers/locale-provider";
import { useVoiceState } from "@/components/providers/voice-provider";
import {
  useAudioDevices,
  type AudioDeviceOption,
} from "@/hooks/use-audio-devices";
import {
  DEFAULT_COMMUNICATIONS_DEVICE_ID,
  resolveAudioDeviceFallback,
} from "@/lib/voice/audio-device-fallback";
import { cn } from "@/lib/utils";
import { DEFAULT_AUDIO_DEVICE_ID } from "@/store/voice-store";

type AudioDeviceSelectProps = {
  kind: "input" | "output";
  showIcon?: boolean;
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

function getCommunicationsDeviceLabel(
  kind: "input" | "output",
  t: (key: string) => string,
) {
  return kind === "input"
    ? t("voice.devices.communicationsInput")
    : t("voice.devices.communicationsOutput");
}

function withDefaultOption(
  kind: "input" | "output",
  devices: AudioDeviceOption[],
  t: (key: string, values?: Record<string, number | string>) => string,
) {
  const defaultLabel = getDefaultDeviceLabel(kind, t);
  const normalizedDevices = devices.map((device, index) => ({
    ...device,
    label:
      device.deviceId === DEFAULT_AUDIO_DEVICE_ID
        ? defaultLabel
        : device.deviceId === DEFAULT_COMMUNICATIONS_DEVICE_ID
          ? getCommunicationsDeviceLabel(kind, t)
          : getFallbackLabel(device, index, t),
  }));

  if (
    normalizedDevices.some(
      (device) => device.deviceId === DEFAULT_AUDIO_DEVICE_ID,
    )
  ) {
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
  showIcon = true,
  variant = "panel",
}: AudioDeviceSelectProps) {
  const { t } = useI18n();
  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isMounted, setIsMounted] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const { audioPreferences, setAudioPreference } = useVoiceState();
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
    !isMounted ||
    !supportsDeviceEnumeration ||
    isOutputUnsupported ||
    options.length === 0;
  const Icon = kind === "input" ? Mic : Volume2;
  const title =
    kind === "input"
      ? t("voice.devices.inputTitle")
      : t("voice.devices.outputTitle");
  const label =
    kind === "input"
      ? t("voice.devices.inputLabel")
      : t("voice.devices.outputLabel");
  const description =
    kind === "input"
      ? t("voice.devices.inputDescription")
      : t("voice.devices.outputDescription");
  const statusText = isOutputUnsupported
    ? t("voice.devices.outputUnsupported")
    : supportsDeviceEnumeration
      ? null
      : t("voice.devices.enumerationUnsupported");
  const selectedIndex = Math.max(
    options.findIndex((device) => device.deviceId === selectedDeviceId),
    0,
  );

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    const fallback = resolveAudioDeviceFallback({
      devices,
      preferredDeviceId: selectedDeviceId,
    });

    if (!fallback.changed) {
      return;
    }

    if (kind === "input") {
      setAudioPreference("inputDeviceId", fallback.deviceId);
    } else {
      setAudioPreference("outputDeviceId", fallback.deviceId);
    }
  }, [devices, kind, selectedDeviceId, setAudioPreference]);

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

  useEffect(() => {
    if (isDisabled) {
      setIsOpen(false);
    }
  }, [isDisabled]);

  const handleChange = (value: string) => {
    if (kind === "input") {
      setAudioPreference("inputDeviceId", value);
      return;
    }

    setAudioPreference("outputDeviceId", value);
  };

  const handleSelect = (value: string) => {
    handleChange(value);
    setIsOpen(false);
  };

  const handleRefresh = () => {
    void (kind === "input" ? requestMicrophoneLabels() : refreshDevices());
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (isDisabled) {
      return;
    }

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

  const renderMenu = (position: "compact" | "panel") => (
    <div
      className={cn(
        "absolute z-[95] overflow-hidden rounded-[16px] border border-[hsl(var(--border)/0.52)] bg-[linear-gradient(180deg,hsl(var(--surface-overlay)/0.98),hsl(var(--surface-panel)/0.94))] p-1 shadow-[0_16px_44px_hsl(var(--shadow-color)/0.13)] backdrop-blur-xl",
        position === "compact" &&
          "bottom-[calc(100%+0.45rem)] left-auto right-0 w-[min(18rem,calc(100vw-1.5rem))]",
        position === "panel" && "left-auto right-0 top-[calc(100%+0.75rem)] w-[min(20rem,100%)]",
      )}
      data-testid={`audio-device-select-${kind}-menu`}
    >
      <div className="flex items-center justify-between gap-2 border-b border-[hsl(var(--border)/0.38)] px-2 py-1.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-xl bg-[hsl(var(--primary)/0.11)] text-[hsl(var(--primary))] shadow-inner shadow-white/20">
            <Icon className="h-3.5 w-3.5" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-bold text-app-foreground">
              {title}
            </p>
            <p className="truncate text-[11px] font-medium text-app-muted">
              {isLoading ? t("voice.devices.loading") : selectedLabel}
            </p>
          </div>
        </div>
        <button
          aria-label={t("voice.devices.refresh")}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-xl border border-[hsl(var(--border)/0.46)] bg-[hsl(var(--surface-soft)/0.42)] text-app-muted transition hover:bg-[hsl(var(--surface-soft)/0.74)] hover:text-app-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)] disabled:cursor-wait disabled:opacity-60"
          disabled={isLoading}
          data-testid={`audio-device-select-${kind}-menu-refresh`}
          onClick={handleRefresh}
          type="button"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", isLoading && "animate-spin")} />
        </button>
      </div>

      <div
        aria-label={label}
        aria-activedescendant={`${listboxId}-${options[activeIndex]?.deviceId ?? "none"}`}
        className="mt-1 max-h-[min(18rem,60vh)] overflow-y-auto pr-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
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
                "group/device-option flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.5)]",
                isSelected
                  ? "bg-[hsl(var(--primary)/0.13)] text-app-foreground"
                  : "text-app-muted hover:bg-[hsl(var(--surface-soft)/0.64)] hover:text-app-foreground",
                isActive && !isSelected && "bg-[hsl(var(--surface-soft)/0.52)]",
              )}
              data-device-id={device.deviceId}
              data-testid={`audio-device-select-${kind}-option`}
              id={`${listboxId}-${device.deviceId}`}
              key={device.deviceId}
              onClick={() => handleSelect(device.deviceId)}
              onMouseEnter={() => setActiveIndex(index)}
              role="option"
              title={device.label}
              type="button"
            >
              <span
                className={cn(
                  "grid h-6 w-6 shrink-0 place-items-center rounded-[10px] border transition",
                  isSelected
                    ? "border-[hsl(var(--primary)/0.3)] bg-[hsl(var(--primary)/0.16)] text-[hsl(var(--primary))]"
                    : "border-[hsl(var(--border)/0.55)] bg-[hsl(var(--surface-soft)/0.38)] text-app-muted group-hover/device-option:text-app-foreground",
                )}
              >
                <Icon className="h-3 w-3" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block overflow-hidden text-ellipsis text-xs font-bold leading-4 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">
                  {device.label}
                </span>
              </span>
              <span
                className={cn(
                  "grid h-5 w-5 shrink-0 place-items-center rounded-full border transition",
                  isSelected
                    ? "border-[hsl(var(--primary)/0.35)] bg-[hsl(var(--primary)/0.17)] text-[hsl(var(--primary))] opacity-100"
                    : "border-transparent text-app-muted opacity-0 group-hover/device-option:opacity-50",
                )}
              >
                <Check className="h-3 w-3" />
              </span>
            </button>
          );
        })}
      </div>

      {statusText ? (
        <p className="mt-1.5 border-t border-[hsl(var(--border)/0.4)] px-2 pb-1.5 pt-2 text-[10.5px] leading-4 text-app-soft">
          {statusText}
        </p>
      ) : null}
    </div>
  );

  if (variant === "compact") {
    return (
      <div
        className={cn("relative min-w-0", isOpen && "z-[96]")}
        data-testid={`audio-device-select-${kind}-compact`}
        onKeyDown={handleKeyDown}
        ref={rootRef}
      >
        <button
          aria-controls={isOpen ? listboxId : undefined}
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          aria-label={label}
          className={cn(
            "group/device flex min-h-8 w-full min-w-0 items-center gap-2 rounded-[14px] border border-[hsl(var(--border)/0.48)] bg-[hsl(var(--surface-soft)/0.34)] px-2.5 py-1.5 text-app-muted transition hover:bg-[hsl(var(--surface-soft)/0.68)] hover:text-app-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]",
            isOpen &&
              "border-[hsl(var(--primary)/0.32)] bg-[hsl(var(--primary)/0.1)] text-app-foreground shadow-[0_10px_28px_hsl(var(--primary)/0.1)]",
            isDisabled && "cursor-not-allowed opacity-60",
          )}
          disabled={isDisabled}
          data-testid={`audio-device-select-${kind}-trigger`}
          onClick={() => setIsOpen((current) => !current)}
          title={selectedLabel}
          type="button"
        >
          {showIcon ? <Icon className="h-3.5 w-3.5 shrink-0" /> : null}
          <span className="min-w-0 flex-1 truncate text-[11px] font-semibold">
            {isLoading ? t("voice.devices.loading") : selectedLabel}
          </span>
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 shrink-0 opacity-70 transition",
              isOpen && "rotate-180 opacity-100",
            )}
          />
        </button>
        {isOpen && renderMenu("compact")}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "app-panel-soft relative rounded-[18px] border p-2.5 sm:p-3",
        isOpen && "z-[96]",
      )}
      data-testid={`audio-device-select-${kind}-panel`}
      onKeyDown={handleKeyDown}
      ref={rootRef}
    >
      <div className="flex items-start gap-2.5">
        <div className="rounded-xl bg-[hsl(var(--primary)/0.12)] p-2 text-[hsl(var(--primary))]">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-app-foreground">
                {title}
              </p>
              <p className="mt-0.5 text-xs leading-4 text-app-muted">
                {description}
              </p>
            </div>
            <button
              className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-[hsl(var(--border)/0.62)] bg-[hsl(var(--surface-soft)/0.42)] px-2.5 text-[11px] font-semibold text-app-soft transition hover:bg-[hsl(var(--surface-soft)/0.72)] hover:text-app-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)] disabled:cursor-wait disabled:opacity-60"
              disabled={isLoading}
              data-testid={`audio-device-select-${kind}-refresh`}
              onClick={handleRefresh}
              type="button"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", isLoading && "animate-spin")} />
              {t("voice.devices.refresh")}
            </button>
          </div>

          <div className="relative mt-2.5">
            <button
              aria-controls={isOpen ? listboxId : undefined}
              aria-expanded={isOpen}
              aria-haspopup="listbox"
              aria-label={label}
              className={cn(
                "flex min-h-10 w-full items-center gap-2.5 rounded-xl border border-[hsl(var(--border)/0.68)] bg-[hsl(var(--surface-card)/0.68)] px-2.5 text-left text-xs font-semibold text-app-foreground transition hover:bg-[hsl(var(--surface-card)/0.88)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)] disabled:cursor-not-allowed disabled:opacity-60",
                isOpen &&
                  "border-[hsl(var(--primary)/0.34)] bg-[hsl(var(--primary)/0.09)] shadow-[0_18px_46px_hsl(var(--primary)/0.12)]",
              )}
              disabled={isDisabled}
              data-testid={`audio-device-select-${kind}-trigger`}
              onClick={() => setIsOpen((current) => !current)}
              type="button"
            >
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-[hsl(var(--surface-soft)/0.72)] text-app-muted">
                <Icon className="h-3.5 w-3.5" />
              </span>
              <span className="min-w-0 flex-1 truncate">
                {isLoading ? t("voice.devices.loading") : selectedLabel}
              </span>
              <ChevronDown
                className={cn(
                  "h-4 w-4 shrink-0 text-app-muted transition",
                  isOpen && "rotate-180 text-app-foreground",
                )}
              />
            </button>
            {isOpen && renderMenu("panel")}
          </div>

          {statusText ? (
            <p className="mt-1.5 text-[11px] leading-4 text-app-soft">{statusText}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
