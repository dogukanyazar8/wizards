"use client";

import { ChevronDown, Radio, ShieldCheck, SlidersHorizontal, Sparkles } from "lucide-react";
import {
  useVoiceConnection,
  type KrispAvailability,
} from "@/components/providers/voice-provider";
import { useI18n } from "@/components/providers/locale-provider";
import { AudioDeviceSelect } from "@/components/voice/audio-device-select";
import { cn } from "@/lib/utils";

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
  isKrispNoiseCancellationActive: boolean;
  krispAvailability: KrispAvailability;
  krispEnabled: boolean;
  t: (key: string) => string;
}) {
  if (args.isKrispNoiseCancellationActive) {
    return {
      description: args.t("voice.settings.cleanVoiceKrispDescription"),
      label: args.t("voice.settings.cleanVoiceKrisp"),
    };
  }

  if (args.krispAvailability === "checking") {
    return {
      description: args.t("voice.settings.cleanVoiceCheckingDescription"),
      label: args.t("voice.settings.cleanVoiceChecking"),
    };
  }

  if (args.krispEnabled) {
    return {
      description: args.t("voice.settings.cleanVoiceWebRtcDescription"),
      label: args.t("voice.settings.cleanVoiceWebRtc"),
    };
  }

  return {
    description: args.t("voice.settings.cleanVoiceLimitedDescription"),
    label: args.t("voice.settings.cleanVoiceLimited"),
  };
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
  const {
    audioPreferences,
    isApplyingAudioPreferences,
    isKrispNoiseCancellationActive,
    krispAvailability,
    setAudioPreference,
  } = useVoiceConnection();

  const krispEnabled = audioPreferences.krispNoiseCancellation;
  const krispAvailable = krispAvailability === "available";
  const cleanVoiceStatus = resolveCleanVoiceStatus({
    isKrispNoiseCancellationActive,
    krispAvailability,
    krispEnabled,
    t,
  });
  const applyCleanVoiceProfile = () => {
    setAudioPreference("noiseSuppression", true);
    setAudioPreference("voiceIsolation", true);
    setAudioPreference("echoCancellation", true);
    setAudioPreference("autoGainControl", true);
    setAudioPreference("krispNoiseCancellation", true);
  };

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

            <button
              className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-2xl border border-[hsl(var(--primary)/0.3)] bg-[hsl(var(--primary)/0.12)] px-4 py-2 text-sm font-semibold text-[hsl(var(--primary))] transition hover:-translate-y-0.5 hover:bg-[hsl(var(--primary)/0.18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
              data-testid="voice-clean-voice-profile"
              onClick={applyCleanVoiceProfile}
              type="button"
            >
              <Sparkles className="h-4 w-4" />
              {t("voice.settings.applyCleanVoiceProfile")}
            </button>
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
            checked={audioPreferences.voiceIsolation}
            description={t("voice.settings.voiceIsolationDesc")}
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
