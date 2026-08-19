"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  AlertTriangle,
  ChevronDown,
  EyeOff,
  Gamepad2,
  Keyboard,
  Radio,
  RotateCcw,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import {
  useVoiceState,
  type KrispAvailability,
  type NoiseFilterTier,
} from "@/components/providers/voice-provider";
import { useI18n } from "@/components/providers/locale-provider";
import {
  launchDesktopControlSection,
  type DesktopControlLaunchState,
} from "@/components/desktop/desktop-control-launch";
import { AudioDeviceSelect } from "@/components/voice/audio-device-select";
import { MicrophoneTestPanel } from "@/components/voice/microphone-test-panel";
import {
  hideDesktopGameOverlaySurface,
  openDesktopControl,
  refreshDesktopCompanionSurfacesWithLayout,
  testDesktopGameOverlaySurface,
  testDesktopVoiceMiniSurface,
} from "@/lib/desktop/controls";
import { DESKTOP_GAME_OVERLAY_EXECUTABLE_NAMES } from "@/lib/desktop/game-overlay-process";
import { isWhisprDesktopRuntime } from "@/lib/desktop/runtime";
import { cn } from "@/lib/utils";

const subscribeToRuntimeCapabilities = () => () => {};
const getServerCapabilitySnapshot = () => false;
import { supportsMediaConstraint } from "@/lib/voice/media-capabilities";
import { isScreenShareAudioSupported } from "@/lib/voice/screen-share";
import {
  ENHANCED_NOISE_FILTER_MODES,
  isKrispNoiseFilterTier,
  type EnhancedNoiseFilterMode,
} from "@/lib/voice/noise-filter";
import {
  DEFAULT_PUSH_TO_TALK_HANGOVER_MS,
  MAX_PUSH_TO_TALK_HANGOVER_MS,
  MIN_PUSH_TO_TALK_HANGOVER_MS,
  useVoiceStore,
  type VoiceInputMode,
} from "@/store/voice-store";
import type { VoiceOverlayAnchor, VoiceOverlayPreferences, VoiceOverlaySize } from "@wizards/types";

const SHOW_NOISE_FILTER_EXPERIMENTS =
  process.env.NEXT_PUBLIC_VOICE_NOISE_FILTER_EXPERIMENTS === "true" ||
  process.env.NODE_ENV !== "production";

const DESKTOP_GAME_OVERLAY_ANCHORS: VoiceOverlayAnchor[] = [
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right",
];

const DESKTOP_GAME_OVERLAY_SIZES: VoiceOverlaySize[] = ["compact", "normal", "large"];

const DESKTOP_GAME_OVERLAY_GAME_LABELS: Record<
  (typeof DESKTOP_GAME_OVERLAY_EXECUTABLE_NAMES)[number],
  string
> = {
  "cs2.exe": "Counter-Strike 2",
  "dota2.exe": "Dota 2",
  "fortniteclient-win64-shipping.exe": "Fortnite",
  "javaw.exe": "Minecraft Java",
  "league of legends.exe": "League of Legends",
  "minecraft.exe": "Minecraft",
  "osu!.exe": "osu!",
  "osu.exe": "osu!",
  "rocketleague.exe": "Rocket League",
  "valorant-win64-shipping.exe": "VALORANT",
};

type VoicePreferenceToggleRowProps = {
  checked: boolean;
  description: string;
  disabled?: boolean;
  helperText?: string | null;
  label: string;
  onToggle: () => void;
};

export type VoicePreferencesPanelMode = "all" | "audio" | "desktop";

function resolveKrispHelperText(status: KrispAvailability, t: (key: string) => string) {
  switch (status) {
    case "available":
      return t("voice.settings.krispAvailable");
    case "checking":
      return t("voice.settings.krispChecking");
    case "blocked_by_security_policy":
      return t("voice.settings.krispBlockedBySecurityPolicy");
    case "requires_livekit_cloud":
      return t("voice.settings.krispRequiresCloud");
    case "unsupported_browser":
      return t("voice.settings.krispUnsupportedBrowser");
    case "unavailable":
    default:
      return t("voice.settings.krispUnavailable");
  }
}

function resolveCleanVoiceStatus(args: {
  activeNoiseFilterTier: NoiseFilterTier;
  krispAvailability: KrispAvailability;
  krispEnabled: boolean;
  t: (key: string) => string;
}) {
  if (
    args.krispAvailability === "checking" &&
    args.krispEnabled &&
    !isKrispNoiseFilterTier(args.activeNoiseFilterTier)
  ) {
    return {
      description: args.t("voice.settings.cleanVoiceCheckingDescription"),
      label: args.t("voice.settings.cleanVoiceChecking"),
    };
  }

  switch (args.activeNoiseFilterTier) {
    case "krisp_high":
      return {
        description: args.t("voice.settings.cleanVoiceKrispHighDescription"),
        label: args.t("voice.settings.cleanVoiceKrispHigh"),
      };
    case "krisp_medium":
      return {
        description: args.t("voice.settings.cleanVoiceKrispMediumDescription"),
        label: args.t("voice.settings.cleanVoiceKrispMedium"),
      };
    case "krisp_low":
      return {
        description: args.t("voice.settings.cleanVoiceKrispLowDescription"),
        label: args.t("voice.settings.cleanVoiceKrispLow"),
      };
    case "browser_native":
      return {
        description:
          args.krispEnabled && args.krispAvailability !== "available"
            ? resolveKrispHelperText(args.krispAvailability, args.t)
            : args.t("voice.settings.cleanVoiceWebRtcDescription"),
        label: args.t("voice.settings.cleanVoiceWebRtc"),
      };
    case "off":
    default:
      return {
        description: args.t("voice.settings.cleanVoiceLimitedDescription"),
        label: args.t("voice.settings.cleanVoiceLimited"),
      };
  }
}

function resolveNoiseFilterTierLabel(tier: NoiseFilterTier, t: (key: string) => string) {
  return t(`voice.settings.noiseFilterTier.${tier}`);
}

function resolveKrispRetryUnavailableReason(status: KrispAvailability, t: (key: string) => string) {
  switch (status) {
    case "blocked_by_security_policy":
      return t("voice.settings.retryKrispBlocked");
    case "requires_livekit_cloud":
      return t("voice.settings.retryKrispRequiresCloud");
    case "unsupported_browser":
      return t("voice.settings.retryKrispUnsupported");
    default:
      return null;
  }
}

export function VoicePreferenceToggleRow({
  checked,
  description,
  disabled = false,
  helperText,
  label,
  onToggle,
}: VoicePreferenceToggleRowProps) {
  return (
    <div className="app-panel-soft rounded-[18px] border p-2.5 sm:p-3">
      <div className="flex items-start justify-between gap-2.5 sm:gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-app-foreground">{label}</p>
          <p className="mt-0.5 text-xs leading-4 text-app-muted">{description}</p>
          {helperText ? (
            <p className="mt-1.5 text-[11px] leading-4 text-app-soft">{helperText}</p>
          ) : null}
        </div>

        <button
          aria-checked={checked}
          className={cn(
            "relative mt-0.5 inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]",
            checked
              ? "border-[hsl(var(--primary)/0.45)] bg-[hsl(var(--primary)/0.18)]"
              : "border-[hsl(var(--border)/0.72)] bg-[hsl(var(--surface-soft)/0.56)]",
            disabled && "cursor-not-allowed opacity-55",
          )}
          disabled={disabled}
          onClick={onToggle}
          role="switch"
          type="button"
        >
          <span
            className={cn(
              "absolute left-1 h-5 w-5 rounded-full bg-white shadow-[0_5px_14px_hsl(var(--shadow-color)/0.14)] transition",
              checked && "translate-x-5 bg-[hsl(var(--primary))]",
            )}
          />
        </button>
      </div>
    </div>
  );
}

function VoiceInputModeButton({
  active,
  description,
  label,
  onClick,
}: {
  active: boolean;
  description: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-pressed={active}
      className={cn(
        "min-h-[4.25rem] rounded-xl border px-2.5 py-2 text-left transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]",
        active
          ? "border-[hsl(var(--primary)/0.38)] bg-[hsl(var(--primary)/0.12)] text-app-foreground"
          : "border-[hsl(var(--border)/0.62)] bg-[hsl(var(--surface-card)/0.54)] text-app-muted hover:border-[hsl(var(--primary)/0.24)] hover:bg-[hsl(var(--primary)/0.06)]",
      )}
      onClick={onClick}
      type="button"
    >
      <span className="block text-[11px] font-semibold uppercase tracking-[0.1em]">{label}</span>
      <span className="mt-1 block text-[11px] leading-4">{description}</span>
    </button>
  );
}

export function VoicePreferencesPanel({ mode = "all" }: { mode?: VoicePreferencesPanelMode }) {
  const { t } = useI18n();
  const [cleanVoiceFeedbackVisible, setCleanVoiceFeedbackVisible] = useState(false);
  const [desktopSurfaceFeedback, setDesktopSurfaceFeedback] = useState<
    "failure" | "focus" | "hide" | "overlay" | "refresh" | "voice-mini" | null
  >(null);
  const [desktopSurfacePending, setDesktopSurfacePending] = useState<
    "hide" | "overlay" | "refresh" | "voice-mini" | null
  >(null);
  const [desktopControlState, setDesktopControlState] = useState<DesktopControlLaunchState>("idle");
  const isDesktopRuntime = useSyncExternalStore(
    subscribeToRuntimeCapabilities,
    isWhisprDesktopRuntime,
    getServerCapabilitySnapshot,
  );
  const voiceIsolationSupported = useSyncExternalStore(
    subscribeToRuntimeCapabilities,
    () => supportsMediaConstraint("voiceIsolation"),
    getServerCapabilitySnapshot,
  );
  // The share panel only exists while a share is running, and the preference
  // applies to the next share — so this is the only place a user can turn share
  // audio on before their first share.
  const screenShareAudioSupported = useSyncExternalStore(
    subscribeToRuntimeCapabilities,
    isScreenShareAudioSupported,
    getServerCapabilitySnapshot,
  );
  const cleanVoiceFeedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const desktopSurfaceFeedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const {
    activeNoiseFilterTier,
    audioPreferences,
    isApplyingAudioPreferences,
    isRecoveringKrispNoiseCancellation,
    krispAvailability,
    preloadVoiceProcessing,
    retryKrispNoiseCancellation,
    setAudioPreference,
  } = useVoiceState();
  const screenShareAudioEnabled = useVoiceStore((state) => state.screenShareAudioEnabled);
  const setScreenShareAudioEnabled = useVoiceStore((state) => state.setScreenShareAudioEnabled);
  const desktopGameOverlayAnchor = useVoiceStore((state) => state.desktopGameOverlayAnchor);
  const desktopGameOverlayEnabled = useVoiceStore((state) => state.desktopGameOverlayEnabled);
  const desktopGameOverlayGameSettings = useVoiceStore(
    (state) => state.desktopGameOverlayGameSettings,
  );
  const desktopGameOverlayProcessDetectionEnabled = useVoiceStore(
    (state) => state.desktopGameOverlayProcessDetectionEnabled,
  );
  const desktopGameOverlaySize = useVoiceStore((state) => state.desktopGameOverlaySize);
  const desktopGameOverlaySpeakingOnly = useVoiceStore(
    (state) => state.desktopGameOverlaySpeakingOnly,
  );
  const desktopVoiceMiniEnabled = useVoiceStore((state) => state.desktopVoiceMiniEnabled);
  const pushToTalkHangoverMs = useVoiceStore((state) => state.pushToTalkHangoverMs);
  const voiceInputMode = useVoiceStore((state) => state.voiceInputMode);
  const setDesktopGameOverlayAnchor = useVoiceStore((state) => state.setDesktopGameOverlayAnchor);
  const setDesktopGameOverlayEnabled = useVoiceStore((state) => state.setDesktopGameOverlayEnabled);
  const setDesktopGameOverlayGamePreference = useVoiceStore(
    (state) => state.setDesktopGameOverlayGamePreference,
  );
  const setDesktopGameOverlayProcessDetectionEnabled = useVoiceStore(
    (state) => state.setDesktopGameOverlayProcessDetectionEnabled,
  );
  const setDesktopGameOverlaySize = useVoiceStore((state) => state.setDesktopGameOverlaySize);
  const setDesktopGameOverlaySpeakingOnly = useVoiceStore(
    (state) => state.setDesktopGameOverlaySpeakingOnly,
  );
  const setDesktopVoiceMiniEnabled = useVoiceStore((state) => state.setDesktopVoiceMiniEnabled);
  const setPushToTalkHangoverMs = useVoiceStore((state) => state.setPushToTalkHangoverMs);
  const setVoiceInputMode = useVoiceStore((state) => state.setVoiceInputMode);

  const krispEnabled = audioPreferences.krispNoiseCancellation;
  const krispAvailable = krispAvailability === "available";
  const noiseFilterTierLabel = resolveNoiseFilterTierLabel(activeNoiseFilterTier, t);
  const krispRetryUnavailableReason = resolveKrispRetryUnavailableReason(krispAvailability, t);
  const krispRetryDisabled =
    isRecoveringKrispNoiseCancellation || krispRetryUnavailableReason !== null;
  const shouldHighlightKrispRetry =
    krispEnabled && krispAvailability !== "available" && krispAvailability !== "checking";
  const cleanVoiceStatus = resolveCleanVoiceStatus({
    activeNoiseFilterTier,
    krispAvailability,
    krispEnabled,
    t,
  });
  const desktopGameOverlayPreferences: VoiceOverlayPreferences = {
    anchor: desktopGameOverlayAnchor,
    size: desktopGameOverlaySize,
    speakingOnly: desktopGameOverlaySpeakingOnly,
  };
  const getDesktopGameOverlayGamePreference = (executableName: string) =>
    desktopGameOverlayGameSettings[executableName] ?? {
      anchor: desktopGameOverlayAnchor,
      enabled: desktopGameOverlayEnabled,
      size: desktopGameOverlaySize,
      speakingOnly: desktopGameOverlaySpeakingOnly,
    };
  const applyCleanVoiceProfile = () => {
    setAudioPreference("noiseSuppression", true);
    if (voiceIsolationSupported) {
      setAudioPreference("voiceIsolation", true);
    }
    setAudioPreference("echoCancellation", true);
    setAudioPreference("autoGainControl", true);
    setAudioPreference("krispNoiseCancellation", true);
    void retryKrispNoiseCancellation();
    setCleanVoiceFeedbackVisible(true);

    if (cleanVoiceFeedbackTimerRef.current) {
      clearTimeout(cleanVoiceFeedbackTimerRef.current);
    }

    cleanVoiceFeedbackTimerRef.current = setTimeout(() => {
      setCleanVoiceFeedbackVisible(false);
      cleanVoiceFeedbackTimerRef.current = null;
    }, 3200);
  };

  const showDesktopSurfaceFeedback = (
    nextFeedback: "failure" | "focus" | "hide" | "overlay" | "refresh" | "voice-mini",
  ) => {
    setDesktopSurfaceFeedback(nextFeedback);

    if (desktopSurfaceFeedbackTimerRef.current) {
      clearTimeout(desktopSurfaceFeedbackTimerRef.current);
    }

    desktopSurfaceFeedbackTimerRef.current = setTimeout(() => {
      setDesktopSurfaceFeedback(null);
      desktopSurfaceFeedbackTimerRef.current = null;
    }, 3600);
  };

  const runDesktopSurfaceAction = async (
    action: "hide" | "overlay" | "refresh" | "voice-mini",
    task: () => Promise<unknown>,
  ) => {
    if (!isDesktopRuntime || desktopSurfacePending) {
      return;
    }

    setDesktopSurfacePending(action);
    try {
      const result = await task();
      showDesktopSurfaceFeedback(result === false ? "focus" : action);
    } catch {
      showDesktopSurfaceFeedback("failure");
    } finally {
      setDesktopSurfacePending(null);
    }
  };

  useEffect(() => {
    void preloadVoiceProcessing().catch(() => undefined);
  }, [audioPreferences.enhancedNoiseFilterMode, krispEnabled, preloadVoiceProcessing]);

  useEffect(
    () => () => {
      if (cleanVoiceFeedbackTimerRef.current) {
        clearTimeout(cleanVoiceFeedbackTimerRef.current);
      }
      if (desktopSurfaceFeedbackTimerRef.current) {
        clearTimeout(desktopSurfaceFeedbackTimerRef.current);
      }
    },
    [],
  );

  const showAudioControls = mode !== "desktop";
  const showDesktopControls = mode !== "audio";

  return (
    <div className="space-y-3">
      {showAudioControls ? (
        <>
          <div
            className="overflow-hidden rounded-[22px] border border-[hsl(var(--primary)/0.18)] bg-[linear-gradient(135deg,hsl(var(--surface-card)/0.94),hsl(var(--primary)/0.07))] shadow-[0_14px_36px_hsl(var(--shadow-color)/0.06)]"
            data-testid="voice-clean-voice-status"
          >
            <div className="flex flex-col gap-3 p-3 sm:flex-row sm:items-start">
              <div className="rounded-2xl border border-[hsl(var(--primary)/0.22)] bg-[hsl(var(--primary)/0.12)] p-2.5 text-[hsl(var(--primary))]">
                <ShieldCheck className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-[13px] font-semibold text-app-foreground">
                      {cleanVoiceStatus.label}
                    </p>
                    <p className="mt-0.5 text-xs leading-4 text-app-muted">
                      {cleanVoiceStatus.description}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span
                      className={cn(
                        "inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]",
                        isApplyingAudioPreferences
                          ? "border-[hsl(var(--warning)/0.28)] bg-[hsl(var(--warning)/0.1)] text-app-foreground"
                          : "border-[hsl(var(--success)/0.28)] bg-[hsl(var(--success)/0.1)] text-app-foreground",
                      )}
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-current" />
                      {isApplyingAudioPreferences
                        ? t("voice.settings.badgeApplying")
                        : t("voice.settings.badgeReady")}
                    </span>
                    <span
                      className="inline-flex w-fit items-center gap-1.5 rounded-full border border-[hsl(var(--border)/0.62)] bg-[hsl(var(--surface-card)/0.7)] px-2.5 py-0.5 text-[10px] font-semibold text-app-muted"
                      data-testid="voice-noise-filter-tier"
                      title={t("voice.settings.activeNoiseFilter")}
                    >
                      <ShieldCheck className="h-3.5 w-3.5" />
                      {noiseFilterTierLabel}
                    </span>
                  </div>
                </div>

                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  {[
                    t("voice.settings.cleanVoiceFeatureNoise"),
                    t("voice.settings.cleanVoiceFeatureEcho"),
                    t("voice.settings.cleanVoiceFeatureGain"),
                  ].map((feature) => (
                    <div
                      className="rounded-xl border border-[hsl(var(--border)/0.54)] bg-[hsl(var(--surface-card)/0.52)] px-2.5 py-1.5 text-[11px] font-semibold text-app-muted"
                      key={feature}
                    >
                      {feature}
                    </div>
                  ))}
                </div>

                <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                  <button
                    className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-xl border border-[hsl(var(--primary)/0.3)] bg-[hsl(var(--primary)/0.12)] px-3 py-1.5 text-xs font-semibold text-[hsl(var(--primary))] transition hover:bg-[hsl(var(--primary)/0.18)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
                    data-testid="voice-clean-voice-profile"
                    onClick={applyCleanVoiceProfile}
                    type="button"
                  >
                    <Sparkles className="h-4 w-4" />
                    {t("voice.settings.applyCleanVoiceProfile")}
                  </button>
                  <button
                    className={cn(
                      "inline-flex min-h-9 items-center justify-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]",
                      shouldHighlightKrispRetry
                        ? "border-[hsl(var(--warning)/0.38)] bg-[hsl(var(--warning)/0.1)] text-app-foreground hover:bg-[hsl(var(--warning)/0.16)]"
                        : "border-[hsl(var(--border)/0.68)] bg-[hsl(var(--surface-card)/0.72)] text-app-foreground hover:border-[hsl(var(--primary)/0.28)] hover:bg-[hsl(var(--primary)/0.08)]",
                    )}
                    data-testid="voice-krisp-retry"
                    disabled={krispRetryDisabled}
                    onClick={() => void retryKrispNoiseCancellation()}
                    title={krispRetryUnavailableReason ?? t("voice.settings.retryKrisp")}
                    type="button"
                  >
                    {shouldHighlightKrispRetry && !isRecoveringKrispNoiseCancellation ? (
                      <AlertTriangle className="h-4 w-4" />
                    ) : (
                      <RotateCcw
                        className={cn(
                          "h-4 w-4",
                          isRecoveringKrispNoiseCancellation && "animate-spin",
                        )}
                      />
                    )}
                    {isRecoveringKrispNoiseCancellation
                      ? t("voice.settings.retryingKrisp")
                      : t("voice.settings.retryKrisp")}
                  </button>
                </div>
                {cleanVoiceFeedbackVisible ? (
                  <p
                    className="mt-2.5 rounded-xl border border-[hsl(var(--success)/0.24)] bg-[hsl(var(--success)/0.1)] px-2.5 py-1.5 text-[11px] font-semibold leading-4 text-app-foreground"
                    data-testid="voice-clean-voice-feedback"
                  >
                    {t("voice.settings.cleanVoiceProfileApplied")}
                  </p>
                ) : null}
              </div>
            </div>
          </div>

          <div className="grid gap-2.5 sm:grid-cols-2">
            <AudioDeviceSelect kind="input" />
            <AudioDeviceSelect kind="output" />
          </div>

          <MicrophoneTestPanel />

          {/*
            Sits above the collapsed advanced block on purpose: the share panel
            only exists while a share is running and the preference applies to
            the next share, so this is the one place a user can turn share audio
            on before their first share. Buried behind a disclosure it would not
            be found in time to matter.
          */}
          {screenShareAudioSupported ? (
            <div data-testid="voice-screen-share-audio">
              <VoicePreferenceToggleRow
                checked={screenShareAudioEnabled}
                description={t("voice.screenShare.audio.description")}
                label={t("voice.screenShare.audio.title")}
                onToggle={() => setScreenShareAudioEnabled(!screenShareAudioEnabled)}
              />
            </div>
          ) : null}

          <details
            className="group app-panel-soft rounded-[20px] border p-3"
            data-testid="voice-advanced-controls"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
              <span className="flex min-w-0 items-center gap-2.5">
                <span className="rounded-xl border border-[hsl(var(--border)/0.64)] bg-[hsl(var(--surface-card)/0.62)] p-2 text-app-muted">
                  <SlidersHorizontal className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold text-app-foreground">
                    {t("voice.settings.advancedTitle")}
                  </span>
                  <span className="mt-0.5 block text-xs leading-4 text-app-muted">
                    {t("voice.settings.advancedDescription")}
                  </span>
                </span>
              </span>
              <ChevronDown className="h-4 w-4 shrink-0 text-app-muted transition group-open:rotate-180" />
            </summary>

            <div className="mt-3 grid gap-2.5">
              <VoicePreferenceToggleRow
                checked={audioPreferences.noiseSuppression}
                description={t("voice.settings.noiseSuppressionDesc")}
                label={t("voice.settings.noiseSuppression")}
                onToggle={() =>
                  setAudioPreference("noiseSuppression", !audioPreferences.noiseSuppression)
                }
              />

              <VoicePreferenceToggleRow
                checked={voiceIsolationSupported && audioPreferences.voiceIsolation}
                description={t("voice.settings.voiceIsolationDesc")}
                disabled={!voiceIsolationSupported}
                helperText={
                  voiceIsolationSupported ? null : t("voice.settings.voiceIsolationUnsupported")
                }
                label={t("voice.settings.voiceIsolation")}
                onToggle={() =>
                  setAudioPreference("voiceIsolation", !audioPreferences.voiceIsolation)
                }
              />

              <VoicePreferenceToggleRow
                checked={audioPreferences.echoCancellation}
                description={t("voice.settings.echoCancellationDesc")}
                label={t("voice.settings.echoCancellation")}
                onToggle={() =>
                  setAudioPreference("echoCancellation", !audioPreferences.echoCancellation)
                }
              />

              <VoicePreferenceToggleRow
                checked={audioPreferences.autoGainControl}
                description={t("voice.settings.autoGainControlDesc")}
                label={t("voice.settings.autoGainControl")}
                onToggle={() =>
                  setAudioPreference("autoGainControl", !audioPreferences.autoGainControl)
                }
              />

              <VoicePreferenceToggleRow
                checked={krispEnabled}
                description={t("voice.settings.krispDesc")}
                disabled={!krispAvailable && !krispEnabled}
                helperText={resolveKrispHelperText(krispAvailability, t)}
                label={t("voice.settings.krisp")}
                onToggle={() => setAudioPreference("krispNoiseCancellation", !krispEnabled)}
              />

              {SHOW_NOISE_FILTER_EXPERIMENTS ? (
                <div
                  className="app-panel-soft rounded-[18px] border p-2.5 sm:p-3"
                  data-testid="voice-noise-filter-mode"
                >
                  <div className="flex flex-col gap-1">
                    <p className="text-[13px] font-semibold text-app-foreground">
                      {t("voice.settings.noiseFilterMode")}
                    </p>
                    <p className="text-xs leading-4 text-app-muted">
                      {t("voice.settings.noiseFilterModeDesc")}
                    </p>
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-3">
                    {ENHANCED_NOISE_FILTER_MODES.map((mode) => {
                      const isActive = audioPreferences.enhancedNoiseFilterMode === mode;
                      return (
                        <button
                          aria-pressed={isActive}
                          className={cn(
                            "min-h-[4.25rem] rounded-xl border px-2.5 py-2 text-left transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]",
                            isActive
                              ? "border-[hsl(var(--primary)/0.38)] bg-[hsl(var(--primary)/0.12)] text-app-foreground"
                              : "border-[hsl(var(--border)/0.62)] bg-[hsl(var(--surface-card)/0.54)] text-app-muted hover:border-[hsl(var(--primary)/0.24)] hover:bg-[hsl(var(--primary)/0.06)]",
                          )}
                          key={mode}
                          onClick={() =>
                            setAudioPreference(
                              "enhancedNoiseFilterMode",
                              mode as EnhancedNoiseFilterMode,
                            )
                          }
                          type="button"
                        >
                          <span className="block text-[11px] font-semibold uppercase tracking-[0.1em]">
                            {t(`voice.settings.noiseFilterMode.${mode}`)}
                          </span>
                          <span className="mt-1 block text-[11px] leading-4">
                            {t(`voice.settings.noiseFilterMode.${mode}.desc`)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>
          </details>
        </>
      ) : null}

      {showDesktopControls && isDesktopRuntime ? (
        <details
          className="group app-panel-soft rounded-[20px] border p-3"
          data-testid="voice-desktop-controls"
        >
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2.5">
              <span className="rounded-xl border border-[hsl(var(--border)/0.64)] bg-[hsl(var(--surface-card)/0.62)] p-2 text-app-muted">
                <Keyboard className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-[13px] font-semibold text-app-foreground">
                  {t("voice.settings.desktopControlsTitle")}
                </span>
                <span className="mt-0.5 block text-xs leading-4 text-app-muted">
                  {t("voice.settings.desktopControlsDescription")}
                </span>
              </span>
            </span>
            <ChevronDown className="h-4 w-4 shrink-0 text-app-muted transition group-open:rotate-180" />
          </summary>

          <div className="mt-3 grid gap-2.5">
            <div className="app-panel-soft rounded-[18px] border p-2.5 sm:p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-app-foreground">
                    {t("voice.settings.desktopShortcuts")}
                  </p>
                  <p className="mt-0.5 text-xs leading-4 text-app-muted">
                    {t("voice.settings.desktopShortcutsDesc")}
                  </p>
                  {desktopControlState === "error" ? (
                    <p className="mt-1.5 text-[11px] font-semibold text-rose-600">
                      {t("desktop.control.openError")}
                    </p>
                  ) : null}
                </div>
                <button
                  className="inline-flex min-h-9 items-center justify-center rounded-xl bg-[hsl(var(--primary))] px-3 text-[11px] font-black text-white transition hover:bg-[hsl(var(--primary)/0.92)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)] disabled:cursor-wait disabled:opacity-65"
                  disabled={desktopControlState === "pending"}
                  onClick={() => {
                    void launchDesktopControlSection(
                      "shortcuts",
                      openDesktopControl,
                      setDesktopControlState,
                    );
                  }}
                  type="button"
                >
                  {t("desktop.control.openShortcuts")}
                </button>
              </div>
            </div>

            <VoicePreferenceToggleRow
              checked={desktopVoiceMiniEnabled}
              description={t("voice.settings.desktopVoiceMiniDesc")}
              helperText={t("voice.settings.desktopVoiceMiniHelper")}
              label={t("voice.settings.desktopVoiceMini")}
              onToggle={() => setDesktopVoiceMiniEnabled(!desktopVoiceMiniEnabled)}
            />

            <div className="order-5 app-panel-soft rounded-[18px] border p-2.5 sm:p-3">
              <div className="flex items-start justify-between gap-2.5 sm:gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-[13px] font-semibold text-app-foreground">
                    <Gamepad2 className="h-4 w-4 text-[hsl(var(--primary))]" />
                    {t("voice.settings.desktopGameOverlay")}
                  </p>
                  <p className="mt-0.5 text-xs leading-4 text-app-muted">
                    {t("voice.settings.desktopGameOverlayDesc")}
                  </p>
                  <p className="mt-1.5 text-[11px] leading-4 text-app-soft">
                    {t("voice.settings.desktopGameOverlayHelper")}
                  </p>
                </div>

                <button
                  aria-checked={desktopGameOverlayEnabled}
                  className={cn(
                    "relative mt-0.5 inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]",
                    desktopGameOverlayEnabled
                      ? "border-[hsl(var(--primary)/0.45)] bg-[hsl(var(--primary)/0.18)]"
                      : "border-[hsl(var(--border)/0.72)] bg-[hsl(var(--surface-soft)/0.56)]",
                  )}
                  onClick={() => setDesktopGameOverlayEnabled(!desktopGameOverlayEnabled)}
                  role="switch"
                  type="button"
                >
                  <span
                    className={cn(
                      "absolute left-1 h-5 w-5 rounded-full bg-white shadow-[0_5px_14px_hsl(var(--shadow-color)/0.14)] transition",
                      desktopGameOverlayEnabled && "translate-x-5 bg-[hsl(var(--primary))]",
                    )}
                  />
                </button>
              </div>
              <div className="mt-3 grid gap-2.5 lg:grid-cols-[1.2fr_0.8fr]">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-app-soft">
                    {t("voice.settings.desktopOverlayPosition")}
                  </p>
                  <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                    {DESKTOP_GAME_OVERLAY_ANCHORS.map((anchor) => (
                      <button
                        className={cn(
                          "min-h-9 rounded-xl border px-2.5 text-[11px] font-semibold transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.48)]",
                          desktopGameOverlayAnchor === anchor
                            ? "border-[hsl(var(--primary)/0.5)] bg-[hsl(var(--primary)/0.14)] text-[hsl(var(--primary))]"
                            : "border-[hsl(var(--border)/0.68)] bg-[hsl(var(--surface-card)/0.7)] text-app-muted hover:border-[hsl(var(--primary)/0.34)] hover:bg-[hsl(var(--primary)/0.07)]",
                        )}
                        key={anchor}
                        onClick={() => setDesktopGameOverlayAnchor(anchor)}
                        type="button"
                      >
                        {t(`voice.settings.desktopOverlayPosition.${anchor}`)}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-app-soft">
                    {t("voice.settings.desktopOverlaySize")}
                  </p>
                  <div className="mt-1.5 grid grid-cols-3 gap-1.5 lg:grid-cols-1">
                    {DESKTOP_GAME_OVERLAY_SIZES.map((size) => (
                      <button
                        className={cn(
                          "min-h-9 rounded-xl border px-2.5 text-[11px] font-semibold transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.48)]",
                          desktopGameOverlaySize === size
                            ? "border-[hsl(var(--primary)/0.5)] bg-[hsl(var(--primary)/0.14)] text-[hsl(var(--primary))]"
                            : "border-[hsl(var(--border)/0.68)] bg-[hsl(var(--surface-card)/0.7)] text-app-muted hover:border-[hsl(var(--primary)/0.34)] hover:bg-[hsl(var(--primary)/0.07)]",
                        )}
                        key={size}
                        onClick={() => setDesktopGameOverlaySize(size)}
                        type="button"
                      >
                        {t(`voice.settings.desktopOverlaySize.${size}`)}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="mt-3 flex items-start justify-between gap-2.5 rounded-xl border border-[hsl(var(--border)/0.54)] bg-[hsl(var(--surface-card)/0.5)] p-2.5">
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold text-app-foreground">
                    {t("voice.settings.desktopOverlaySpeakingOnly")}
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-4 text-app-muted">
                    {t("voice.settings.desktopOverlaySpeakingOnlyDesc")}
                  </span>
                </span>
                <button
                  aria-checked={desktopGameOverlaySpeakingOnly}
                  className={cn(
                    "relative mt-0.5 inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]",
                    desktopGameOverlaySpeakingOnly
                      ? "border-[hsl(var(--primary)/0.45)] bg-[hsl(var(--primary)/0.18)]"
                      : "border-[hsl(var(--border)/0.72)] bg-[hsl(var(--surface-soft)/0.56)]",
                  )}
                  onClick={() => setDesktopGameOverlaySpeakingOnly(!desktopGameOverlaySpeakingOnly)}
                  role="switch"
                  type="button"
                >
                  <span
                    className={cn(
                      "absolute left-1 h-5 w-5 rounded-full bg-white shadow-[0_5px_14px_hsl(var(--shadow-color)/0.14)] transition",
                      desktopGameOverlaySpeakingOnly && "translate-x-5 bg-[hsl(var(--primary))]",
                    )}
                  />
                </button>
              </div>
              <div className="mt-2 flex items-start justify-between gap-2.5 rounded-xl border border-[hsl(var(--border)/0.54)] bg-[hsl(var(--surface-card)/0.5)] p-2.5">
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold text-app-foreground">
                    {t("voice.settings.desktopOverlayProcessDetection")}
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-4 text-app-muted">
                    {t("voice.settings.desktopOverlayProcessDetectionDesc")}
                  </span>
                </span>
                <button
                  aria-checked={desktopGameOverlayProcessDetectionEnabled}
                  className={cn(
                    "relative mt-0.5 inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]",
                    desktopGameOverlayProcessDetectionEnabled
                      ? "border-[hsl(var(--primary)/0.45)] bg-[hsl(var(--primary)/0.18)]"
                      : "border-[hsl(var(--border)/0.72)] bg-[hsl(var(--surface-soft)/0.56)]",
                  )}
                  onClick={() =>
                    setDesktopGameOverlayProcessDetectionEnabled(
                      !desktopGameOverlayProcessDetectionEnabled,
                    )
                  }
                  role="switch"
                  type="button"
                >
                  <span
                    className={cn(
                      "absolute left-1 h-5 w-5 rounded-full bg-white shadow-[0_5px_14px_hsl(var(--shadow-color)/0.14)] transition",
                      desktopGameOverlayProcessDetectionEnabled &&
                        "translate-x-5 bg-[hsl(var(--primary))]",
                    )}
                  />
                </button>
              </div>
              <div
                className={cn(
                  "mt-2 rounded-xl border border-[hsl(var(--border)/0.54)] bg-[hsl(var(--surface-card)/0.42)] p-2.5 transition",
                  !desktopGameOverlayProcessDetectionEnabled && "opacity-60",
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <span className="min-w-0">
                    <span className="block text-[13px] font-semibold text-app-foreground">
                      {t("voice.settings.desktopOverlayPerGame")}
                    </span>
                    <span className="mt-0.5 block text-[11px] leading-4 text-app-muted">
                      {t("voice.settings.desktopOverlayPerGameDesc")}
                    </span>
                  </span>
                  <span className="rounded-full border border-[hsl(var(--border)/0.56)] bg-[hsl(var(--surface-soft)/0.58)] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-app-soft">
                    {t("voice.settings.desktopOverlayLocalOnly")}
                  </span>
                </div>

                <div className="mt-2 grid gap-1.5">
                  {DESKTOP_GAME_OVERLAY_EXECUTABLE_NAMES.map((executableName) => {
                    const preference = getDesktopGameOverlayGamePreference(executableName);
                    const gameLabel = DESKTOP_GAME_OVERLAY_GAME_LABELS[executableName];

                    return (
                      <div
                        className="grid gap-1.5 rounded-xl border border-[hsl(var(--border)/0.42)] bg-[hsl(var(--surface-card)/0.54)] p-2 lg:grid-cols-[minmax(0,1.15fr)_74px_90px_92px_96px]"
                        key={executableName}
                      >
                        <div className="min-w-0">
                          <p className="truncate text-[12px] font-semibold text-app-foreground">
                            {gameLabel}
                          </p>
                          <p className="truncate font-mono text-[10px] text-app-soft">
                            {executableName}
                          </p>
                        </div>

                        <button
                          aria-checked={preference.enabled}
                          className={cn(
                            "inline-flex min-h-8 items-center justify-center rounded-lg border px-2 text-[10px] font-semibold transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.48)] disabled:cursor-not-allowed disabled:opacity-55",
                            preference.enabled
                              ? "border-[hsl(var(--primary)/0.46)] bg-[hsl(var(--primary)/0.13)] text-[hsl(var(--primary))]"
                              : "border-[hsl(var(--border)/0.6)] bg-[hsl(var(--surface-soft)/0.54)] text-app-muted",
                          )}
                          disabled={!desktopGameOverlayProcessDetectionEnabled}
                          onClick={() =>
                            setDesktopGameOverlayGamePreference(executableName, {
                              ...preference,
                              enabled: !preference.enabled,
                            })
                          }
                          role="switch"
                          type="button"
                        >
                          {preference.enabled
                            ? t("voice.settings.desktopOverlayGameEnabled")
                            : t("voice.settings.desktopOverlayGameDisabled")}
                        </button>

                        <select
                          aria-label={`${gameLabel} ${t("voice.settings.desktopOverlayPosition")}`}
                          className="min-h-8 rounded-lg border border-[hsl(var(--border)/0.58)] bg-[hsl(var(--surface-card)/0.72)] px-2 text-[10px] font-semibold text-app-muted outline-hidden transition focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.48)] disabled:cursor-not-allowed disabled:opacity-55"
                          disabled={!desktopGameOverlayProcessDetectionEnabled}
                          onChange={(event) =>
                            setDesktopGameOverlayGamePreference(executableName, {
                              ...preference,
                              anchor: event.target.value as VoiceOverlayAnchor,
                            })
                          }
                          value={preference.anchor}
                        >
                          {DESKTOP_GAME_OVERLAY_ANCHORS.map((anchor) => (
                            <option key={anchor} value={anchor}>
                              {t(`voice.settings.desktopOverlayPosition.${anchor}`)}
                            </option>
                          ))}
                        </select>

                        <select
                          aria-label={`${gameLabel} ${t("voice.settings.desktopOverlaySize")}`}
                          className="min-h-8 rounded-lg border border-[hsl(var(--border)/0.58)] bg-[hsl(var(--surface-card)/0.72)] px-2 text-[10px] font-semibold text-app-muted outline-hidden transition focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.48)] disabled:cursor-not-allowed disabled:opacity-55"
                          disabled={!desktopGameOverlayProcessDetectionEnabled}
                          onChange={(event) =>
                            setDesktopGameOverlayGamePreference(executableName, {
                              ...preference,
                              size: event.target.value as VoiceOverlaySize,
                            })
                          }
                          value={preference.size}
                        >
                          {DESKTOP_GAME_OVERLAY_SIZES.map((size) => (
                            <option key={size} value={size}>
                              {t(`voice.settings.desktopOverlaySize.${size}`)}
                            </option>
                          ))}
                        </select>

                        <button
                          aria-checked={preference.speakingOnly}
                          className={cn(
                            "inline-flex min-h-8 items-center justify-center rounded-lg border px-2 text-[10px] font-semibold transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.48)] disabled:cursor-not-allowed disabled:opacity-55",
                            preference.speakingOnly
                              ? "border-[hsl(var(--success)/0.42)] bg-[hsl(var(--success)/0.12)] text-[hsl(var(--success))]"
                              : "border-[hsl(var(--border)/0.6)] bg-[hsl(var(--surface-soft)/0.54)] text-app-muted",
                          )}
                          disabled={!desktopGameOverlayProcessDetectionEnabled}
                          onClick={() =>
                            setDesktopGameOverlayGamePreference(executableName, {
                              ...preference,
                              speakingOnly: !preference.speakingOnly,
                            })
                          }
                          role="switch"
                          type="button"
                        >
                          {t("voice.settings.desktopOverlayGameSpeakingOnly")}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="mt-3 grid gap-1.5 sm:grid-cols-2 xl:grid-cols-4">
                <button
                  className={cn(
                    "inline-flex min-h-9 items-center justify-center gap-1.5 rounded-xl border border-[hsl(var(--border)/0.64)] bg-[hsl(var(--surface-card)/0.68)] px-2.5 text-[11px] font-semibold text-app-foreground transition hover:border-[hsl(var(--primary)/0.38)] hover:bg-[hsl(var(--primary)/0.08)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.48)] disabled:cursor-not-allowed disabled:opacity-55",
                    desktopSurfacePending === "overlay" && "text-[hsl(var(--primary))]",
                  )}
                  disabled={!isDesktopRuntime || desktopSurfacePending !== null}
                  onClick={() =>
                    void runDesktopSurfaceAction("overlay", () =>
                      testDesktopGameOverlaySurface(desktopGameOverlayPreferences),
                    )
                  }
                  type="button"
                >
                  <Gamepad2 className="h-3.5 w-3.5" />
                  {desktopSurfacePending === "overlay"
                    ? t("voice.settings.desktopOverlayTesting")
                    : t("voice.settings.desktopOverlayTest")}
                </button>
                <button
                  className={cn(
                    "inline-flex min-h-9 items-center justify-center gap-1.5 rounded-xl border border-[hsl(var(--border)/0.64)] bg-[hsl(var(--surface-card)/0.68)] px-2.5 text-[11px] font-semibold text-app-foreground transition hover:border-[hsl(var(--primary)/0.38)] hover:bg-[hsl(var(--primary)/0.08)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.48)] disabled:cursor-not-allowed disabled:opacity-55",
                    desktopSurfacePending === "voice-mini" && "text-[hsl(var(--primary))]",
                  )}
                  disabled={!isDesktopRuntime || desktopSurfacePending !== null}
                  onClick={() =>
                    void runDesktopSurfaceAction("voice-mini", testDesktopVoiceMiniSurface)
                  }
                  type="button"
                >
                  <Radio className="h-3.5 w-3.5" />
                  {desktopSurfacePending === "voice-mini"
                    ? t("voice.settings.desktopMiniTesting")
                    : t("voice.settings.desktopMiniTest")}
                </button>
                <button
                  className={cn(
                    "inline-flex min-h-9 items-center justify-center gap-1.5 rounded-xl border border-[hsl(var(--border)/0.64)] bg-[hsl(var(--surface-card)/0.68)] px-2.5 text-[11px] font-semibold text-app-foreground transition hover:border-[hsl(var(--primary)/0.38)] hover:bg-[hsl(var(--primary)/0.08)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.48)] disabled:cursor-not-allowed disabled:opacity-55",
                    desktopSurfacePending === "refresh" && "text-[hsl(var(--primary))]",
                  )}
                  disabled={!isDesktopRuntime || desktopSurfacePending !== null}
                  onClick={() =>
                    void runDesktopSurfaceAction("refresh", () =>
                      refreshDesktopCompanionSurfacesWithLayout({
                        anchor: desktopGameOverlayAnchor,
                        size: desktopGameOverlaySize,
                      }),
                    )
                  }
                  type="button"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  {desktopSurfacePending === "refresh"
                    ? t("voice.settings.desktopSurfacesRefreshing")
                    : t("voice.settings.desktopSurfacesRefresh")}
                </button>
                <button
                  className={cn(
                    "inline-flex min-h-9 items-center justify-center gap-1.5 rounded-xl border border-[hsl(var(--warning)/0.28)] bg-[hsl(var(--warning)/0.08)] px-2.5 text-[11px] font-semibold text-app-foreground transition hover:border-[hsl(var(--warning)/0.46)] hover:bg-[hsl(var(--warning)/0.14)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.48)] disabled:cursor-not-allowed disabled:opacity-55",
                    desktopSurfacePending === "hide" && "text-[hsl(var(--warning))]",
                  )}
                  disabled={!isDesktopRuntime || desktopSurfacePending !== null}
                  onClick={() =>
                    void runDesktopSurfaceAction("hide", async () => {
                      setDesktopGameOverlayEnabled(false);
                      await hideDesktopGameOverlaySurface();
                    })
                  }
                  type="button"
                >
                  <EyeOff className="h-3.5 w-3.5" />
                  {desktopSurfacePending === "hide"
                    ? t("voice.settings.desktopOverlayHiding")
                    : t("voice.settings.desktopOverlayHide")}
                </button>
              </div>
              {desktopSurfaceFeedback ? (
                <p
                  className={cn(
                    "mt-2.5 rounded-xl border px-2.5 py-1.5 text-[11px] font-semibold leading-4",
                    desktopSurfaceFeedback === "failure" || desktopSurfaceFeedback === "focus"
                      ? "border-amber-200 bg-amber-50 text-amber-700"
                      : "border-emerald-200 bg-emerald-50 text-emerald-700",
                  )}
                >
                  {t(`voice.settings.desktopSurfaceFeedback.${desktopSurfaceFeedback}`)}
                </p>
              ) : null}
            </div>

            <div className="order-1 app-panel-soft rounded-[18px] border p-2.5 sm:p-3">
              <div className="flex flex-col gap-1">
                <p className="text-[13px] font-semibold text-app-foreground">
                  {t("voice.settings.inputMode")}
                </p>
                <p className="text-xs leading-4 text-app-muted">
                  {t("voice.settings.inputModeDesc")}
                </p>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {(["voice-activity", "push-to-talk"] as VoiceInputMode[]).map((mode) => (
                  <VoiceInputModeButton
                    active={voiceInputMode === mode}
                    description={t(`voice.settings.inputMode.${mode}.desc`)}
                    key={mode}
                    label={t(`voice.settings.inputMode.${mode}`)}
                    onClick={() => setVoiceInputMode(mode)}
                  />
                ))}
              </div>
            </div>

            <label className="order-3 app-panel-soft rounded-[18px] border p-2.5 sm:p-3">
              <div className="flex flex-wrap items-start justify-between gap-2.5">
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold text-app-foreground">
                    {t("voice.settings.pushToTalkHangover")}
                  </span>
                  <span className="mt-0.5 block text-xs leading-4 text-app-muted">
                    {t("voice.settings.pushToTalkHangoverDesc")}
                  </span>
                </span>
                <span className="rounded-full border border-[hsl(var(--border)/0.62)] bg-[hsl(var(--surface-card)/0.72)] px-2.5 py-0.5 text-[11px] font-semibold text-app-muted">
                  {pushToTalkHangoverMs} ms
                </span>
              </div>
              <input
                className="mt-3 w-full accent-[hsl(var(--primary))]"
                max={MAX_PUSH_TO_TALK_HANGOVER_MS}
                min={MIN_PUSH_TO_TALK_HANGOVER_MS}
                onChange={(event) => setPushToTalkHangoverMs(event.target.valueAsNumber)}
                step={50}
                type="range"
                value={
                  Number.isFinite(pushToTalkHangoverMs)
                    ? pushToTalkHangoverMs
                    : DEFAULT_PUSH_TO_TALK_HANGOVER_MS
                }
              />
            </label>
          </div>
        </details>
      ) : null}

      {showDesktopControls && !isDesktopRuntime ? (
        <div className="app-panel-soft flex items-start gap-2.5 rounded-[18px] border p-2.5 sm:p-3">
          <div className="rounded-xl bg-[hsl(var(--primary)/0.12)] p-2 text-[hsl(var(--primary))]">
            <Keyboard className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-app-foreground">
              {t("voice.settings.desktopControlsTitle")}
            </p>
            <p className="mt-0.5 text-xs leading-4 text-app-muted">
              {t("voice.settings.desktopControlsDescription")}
            </p>
          </div>
        </div>
      ) : null}

      {showAudioControls ? (
        <div className="app-panel-soft flex items-start gap-2.5 rounded-[18px] border p-2.5 sm:p-3">
          <div className="rounded-xl bg-[hsl(var(--primary)/0.12)] p-2 text-[hsl(var(--primary))]">
            <Radio className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-app-foreground">
              {t("voice.settings.localOnlyTitle")}
            </p>
            <p className="mt-0.5 text-xs leading-4 text-app-muted">
              {t("voice.settings.localOnlyDescription")}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
