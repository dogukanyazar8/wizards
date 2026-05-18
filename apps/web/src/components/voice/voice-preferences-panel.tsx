"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
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
import { AudioDeviceSelect } from "@/components/voice/audio-device-select";
import { cn } from "@/lib/utils";
import { supportsMediaConstraint } from "@/lib/voice/media-capabilities";
import {
  ENHANCED_NOISE_FILTER_MODES,
  isKrispNoiseFilterTier,
  type EnhancedNoiseFilterMode,
} from "@/lib/voice/noise-filter";

const SHOW_NOISE_FILTER_EXPERIMENTS =
  process.env.NEXT_PUBLIC_VOICE_NOISE_FILTER_EXPERIMENTS === "true" ||
  process.env.NODE_ENV !== "production";

type VoicePreferenceToggleRowProps = {
  checked: boolean;
  description: string;
  disabled?: boolean;
  helperText?: string | null;
  label: string;
  onToggle: () => void;
};

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

function resolveKrispRetryUnavailableReason(
  status: KrispAvailability,
  t: (key: string) => string,
) {
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
    <div className="app-panel-soft rounded-[22px] border p-3 sm:rounded-[24px] sm:p-4">
      <div className="flex items-start justify-between gap-3 sm:gap-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-app-foreground">{label}</p>
          <p className="mt-1 text-sm leading-5 text-app-muted sm:leading-6">{description}</p>
          {helperText ? <p className="mt-2 text-xs leading-5 text-app-soft">{helperText}</p> : null}
        </div>

        <button
          aria-checked={checked}
          className={cn(
            "relative mt-1 inline-flex h-8 w-14 shrink-0 items-center rounded-full border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)] sm:h-7 sm:w-12",
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
              "absolute left-1 h-6 w-6 rounded-full bg-white shadow-[0_6px_16px_hsl(var(--shadow-color)/0.16)] transition sm:h-5 sm:w-5",
              checked && "translate-x-6 bg-[hsl(var(--primary))] sm:translate-x-5",
            )}
          />
        </button>
      </div>
    </div>
  );
}

export function VoicePreferencesPanel() {
  const { t } = useI18n();
  const [cleanVoiceFeedbackVisible, setCleanVoiceFeedbackVisible] = useState(false);
  const [voiceIsolationSupported, setVoiceIsolationSupported] = useState(false);
  const cleanVoiceFeedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  const krispEnabled = audioPreferences.krispNoiseCancellation;
  const krispAvailable = krispAvailability === "available";
  const noiseFilterTierLabel = resolveNoiseFilterTierLabel(activeNoiseFilterTier, t);
  const krispRetryUnavailableReason = resolveKrispRetryUnavailableReason(krispAvailability, t);
  const krispRetryDisabled =
    isRecoveringKrispNoiseCancellation || krispRetryUnavailableReason !== null;
  const shouldHighlightKrispRetry =
    krispEnabled &&
    krispAvailability !== "available" &&
    krispAvailability !== "checking";
  const cleanVoiceStatus = resolveCleanVoiceStatus({
    activeNoiseFilterTier,
    krispAvailability,
    krispEnabled,
    t,
  });
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

  useEffect(() => {
    setVoiceIsolationSupported(supportsMediaConstraint("voiceIsolation"));
  }, []);

  useEffect(() => {
    void preloadVoiceProcessing().catch(() => undefined);
  }, [
    audioPreferences.enhancedNoiseFilterMode,
    krispEnabled,
    preloadVoiceProcessing,
  ]);

  useEffect(
    () => () => {
      if (cleanVoiceFeedbackTimerRef.current) {
        clearTimeout(cleanVoiceFeedbackTimerRef.current);
      }
    },
    [],
  );

  return (
    <div className="space-y-4">
      <div
        className="overflow-hidden rounded-[28px] border border-[hsl(var(--primary)/0.22)] bg-[linear-gradient(135deg,hsl(var(--surface-card)/0.94),hsl(var(--primary)/0.08))] shadow-[0_18px_48px_hsl(var(--shadow-color)/0.08)]"
        data-testid="voice-clean-voice-status"
      >
        <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start sm:p-5">
          <div className="rounded-3xl border border-[hsl(var(--primary)/0.24)] bg-[hsl(var(--primary)/0.12)] p-3 text-[hsl(var(--primary))]">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-app-foreground">
                  {cleanVoiceStatus.label}
                </p>
                <p className="mt-1 text-sm leading-6 text-app-muted">
                  {cleanVoiceStatus.description}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <span
                  className={cn(
                    "inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em]",
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
                  className="inline-flex w-fit items-center gap-2 rounded-full border border-[hsl(var(--border)/0.62)] bg-[hsl(var(--surface-card)/0.7)] px-3 py-1 text-[11px] font-semibold text-app-muted"
                  data-testid="voice-noise-filter-tier"
                  title={t("voice.settings.activeNoiseFilter")}
                >
                  <ShieldCheck className="h-3.5 w-3.5" />
                  {noiseFilterTierLabel}
                </span>
              </div>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              {[
                t("voice.settings.cleanVoiceFeatureNoise"),
                t("voice.settings.cleanVoiceFeatureEcho"),
                t("voice.settings.cleanVoiceFeatureGain"),
              ].map((feature) => (
                <div
                  className="rounded-2xl border border-[hsl(var(--border)/0.58)] bg-[hsl(var(--surface-card)/0.54)] px-3 py-2 text-xs font-semibold text-app-muted"
                  key={feature}
                >
                  {feature}
                </div>
              ))}
            </div>

            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <button
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-2xl border border-[hsl(var(--primary)/0.3)] bg-[hsl(var(--primary)/0.12)] px-4 py-2 text-sm font-semibold text-[hsl(var(--primary))] transition hover:-translate-y-0.5 hover:bg-[hsl(var(--primary)/0.18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
                data-testid="voice-clean-voice-profile"
                onClick={applyCleanVoiceProfile}
                type="button"
              >
                <Sparkles className="h-4 w-4" />
                {t("voice.settings.applyCleanVoiceProfile")}
              </button>
              <button
                className={cn(
                  "inline-flex min-h-10 items-center justify-center gap-2 rounded-2xl border px-4 py-2 text-sm font-semibold transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]",
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
                className="mt-3 rounded-2xl border border-[hsl(var(--success)/0.26)] bg-[hsl(var(--success)/0.1)] px-3 py-2 text-xs font-semibold leading-5 text-app-foreground"
                data-testid="voice-clean-voice-feedback"
              >
                {t("voice.settings.cleanVoiceProfileApplied")}
              </p>
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
        <AudioDeviceSelect kind="input" />
        <AudioDeviceSelect kind="output" />
      </div>

      <details
        className="group app-panel-soft rounded-[26px] border p-4"
        data-testid="voice-advanced-controls"
      >
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4">
          <span className="flex min-w-0 items-center gap-3">
            <span className="rounded-2xl border border-[hsl(var(--border)/0.68)] bg-[hsl(var(--surface-card)/0.62)] p-2 text-app-muted">
              <SlidersHorizontal className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-app-foreground">
                {t("voice.settings.advancedTitle")}
              </span>
              <span className="mt-1 block text-xs leading-5 text-app-muted">
                {t("voice.settings.advancedDescription")}
              </span>
            </span>
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-app-muted transition group-open:rotate-180" />
        </summary>

        <div className="mt-4 grid gap-3">
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
              className="app-panel-soft rounded-[22px] border p-3 sm:rounded-[24px] sm:p-4"
              data-testid="voice-noise-filter-mode"
            >
              <div className="flex flex-col gap-1">
                <p className="text-sm font-semibold text-app-foreground">
                  {t("voice.settings.noiseFilterMode")}
                </p>
                <p className="text-sm leading-5 text-app-muted sm:leading-6">
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
                        "min-h-20 rounded-2xl border px-3 py-2 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]",
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
                      <span className="block text-xs font-semibold uppercase tracking-[0.12em]">
                        {t(`voice.settings.noiseFilterMode.${mode}`)}
                      </span>
                      <span className="mt-1 block text-xs leading-5">
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

      <div className="app-panel-soft flex items-start gap-3 rounded-[22px] border p-3 sm:rounded-[24px] sm:p-4">
        <div className="rounded-2xl bg-[hsl(var(--primary)/0.12)] p-2 text-[hsl(var(--primary))]">
          <Radio className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-app-foreground">
            {t("voice.settings.localOnlyTitle")}
          </p>
          <p className="mt-1 text-sm leading-5 text-app-muted sm:leading-6">
            {t("voice.settings.localOnlyDescription")}
          </p>
        </div>
      </div>
    </div>
  );
}
