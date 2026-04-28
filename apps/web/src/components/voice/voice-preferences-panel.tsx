"use client";

import { Sparkles, Volume2 } from "lucide-react";
import {
  useVoiceConnection,
  type KrispAvailability,
} from "@/components/providers/voice-provider";
import { useI18n } from "@/components/providers/locale-provider";
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

export function VoicePreferenceToggleRow({
  checked,
  description,
  disabled = false,
  helperText,
  label,
  onToggle,
}: VoicePreferenceToggleRowProps) {
  return (
    <div className="app-panel-soft rounded-[24px] border p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-app-foreground">{label}</p>
          <p className="mt-1 text-sm leading-6 text-app-muted">{description}</p>
          {helperText ? <p className="mt-2 text-xs leading-5 text-app-soft">{helperText}</p> : null}
        </div>

        <button
          aria-checked={checked}
          className={cn(
            "relative mt-1 inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]",
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
              "absolute left-1 h-5 w-5 rounded-full bg-white shadow-[0_6px_16px_hsl(var(--shadow-color)/0.16)] transition",
              checked && "translate-x-5 bg-[hsl(var(--primary))]",
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

  return (
    <div className="space-y-4">
      <div className="app-panel rounded-[24px] border p-4">
        <div className="flex items-start gap-3">
          <div className="app-panel-soft mt-0.5 rounded-2xl border p-2.5 text-[hsl(var(--primary))]">
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-app-foreground">
              {t("voice.settings.processingTitle")}
            </p>
            <p className="mt-1 text-sm leading-6 text-app-muted">
              {t("voice.settings.processingDescription")}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="rounded-full border border-[hsl(var(--border)/0.72)] bg-[hsl(var(--surface-soft)/0.48)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-app-soft">
                {isApplyingAudioPreferences
                  ? t("voice.settings.badgeApplying")
                  : t("voice.settings.badgeReady")}
              </span>
              <span className="rounded-full border border-[hsl(var(--border)/0.72)] bg-[hsl(var(--surface-soft)/0.48)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-app-soft">
                {isKrispNoiseCancellationActive
                  ? t("voice.settings.badgeKrispActive")
                  : t("voice.settings.badgeWebRtc")}
              </span>
            </div>
          </div>
        </div>
      </div>

      <VoicePreferenceToggleRow
        checked={audioPreferences.noiseSuppression}
        description={t("voice.settings.noiseSuppressionDesc")}
        label={t("voice.settings.noiseSuppression")}
        onToggle={() =>
          setAudioPreference("noiseSuppression", !audioPreferences.noiseSuppression)
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

      <div className="app-panel-soft flex items-start gap-3 rounded-[24px] border p-4">
        <div className="rounded-2xl bg-[hsl(var(--primary)/0.12)] p-2 text-[hsl(var(--primary))]">
          <Volume2 className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-app-foreground">
            {t("voice.settings.localOnlyTitle")}
          </p>
          <p className="mt-1 text-sm leading-6 text-app-muted">
            {t("voice.settings.localOnlyDescription")}
          </p>
        </div>
      </div>
    </div>
  );
}
