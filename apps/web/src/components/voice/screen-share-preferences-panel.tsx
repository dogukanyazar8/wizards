"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import {
  AlertCircle,
  Check,
  Loader2,
  MonitorUp,
  Radio,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";
import { useI18n } from "@/components/providers/locale-provider";
import { useVoiceParticipants, useVoiceState } from "@/components/providers/voice-provider";
import { isScreenShareSupported } from "@/lib/voice/media-capabilities";
import { SCREEN_SHARE_QUALITY_OPTIONS, type ScreenShareQualityId } from "@/lib/voice/screen-share";
import { cn } from "@/lib/utils";

type ScreenShareStatusTone = "danger" | "muted" | "primary" | "success" | "warning";

type ScreenShareStatus = {
  descriptionKey: string;
  icon: "alert" | "check" | "loader" | "monitor" | "radio";
  labelKey: string;
  tone: ScreenShareStatusTone;
};

const subscribeToBrowserCapabilities = () => () => {};
const getMountedSnapshot = () => true;
const getServerMountedSnapshot = () => false;
const getServerScreenShareSupportSnapshot = () => false;

function getStatusToneClass(tone: ScreenShareStatusTone) {
  switch (tone) {
    case "danger":
      return "border-[hsl(var(--danger)/0.24)] bg-[hsl(var(--danger)/0.08)] text-[hsl(var(--danger))]";
    case "muted":
      return "border-[hsl(var(--border)/0.72)] bg-[hsl(var(--surface-soft)/0.54)] text-app-muted";
    case "success":
      return "border-[hsl(var(--success)/0.28)] bg-[hsl(var(--success)/0.12)] text-[hsl(var(--success))]";
    case "warning":
      return "border-[hsl(var(--warning)/0.28)] bg-[hsl(var(--warning)/0.10)] text-[hsl(var(--warning))]";
    case "primary":
    default:
      return "border-[hsl(var(--primary)/0.26)] bg-[hsl(var(--primary)/0.10)] text-[hsl(var(--primary))]";
  }
}

function resolveScreenShareStatus({
  activeShareCount,
  hasLocalShare,
  hasRoom,
  hasSupport,
  isMounted,
  screenShareError,
}: {
  activeShareCount: number;
  hasLocalShare: boolean;
  hasRoom: boolean;
  hasSupport: boolean;
  isMounted: boolean;
  screenShareError: string | null;
}): ScreenShareStatus {
  if (!isMounted) {
    return {
      descriptionKey: "settings.voice.screenShare.status.checking.description",
      icon: "loader",
      labelKey: "settings.voice.screenShare.status.checking.title",
      tone: "primary",
    };
  }

  if (screenShareError) {
    return {
      descriptionKey: "settings.voice.screenShare.status.error.description",
      icon: "alert",
      labelKey: "settings.voice.screenShare.status.error.title",
      tone: "danger",
    };
  }

  if (!hasSupport) {
    return {
      descriptionKey: "settings.voice.screenShare.status.unsupported.description",
      icon: "alert",
      labelKey: "settings.voice.screenShare.status.unsupported.title",
      tone: "warning",
    };
  }

  if (hasLocalShare) {
    return {
      descriptionKey: "settings.voice.screenShare.status.live.description",
      icon: "radio",
      labelKey: "settings.voice.screenShare.status.live.title",
      tone: "success",
    };
  }

  if (activeShareCount > 0) {
    return {
      descriptionKey: "settings.voice.screenShare.status.viewing.description",
      icon: "monitor",
      labelKey: "settings.voice.screenShare.status.viewing.title",
      tone: "primary",
    };
  }

  if (!hasRoom) {
    return {
      descriptionKey: "settings.voice.screenShare.status.notConnected.description",
      icon: "monitor",
      labelKey: "settings.voice.screenShare.status.notConnected.title",
      tone: "muted",
    };
  }

  return {
    descriptionKey: "settings.voice.screenShare.status.ready.description",
    icon: "check",
    labelKey: "settings.voice.screenShare.status.ready.title",
    tone: "success",
  };
}

function StatusIcon({ status }: { status: ScreenShareStatus }) {
  if (status.icon === "alert") {
    return <AlertCircle className="h-5 w-5" aria-hidden="true" />;
  }

  if (status.icon === "check") {
    return <Check className="h-5 w-5" aria-hidden="true" />;
  }

  if (status.icon === "loader") {
    return <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />;
  }

  if (status.icon === "radio") {
    return <Radio className="h-5 w-5" aria-hidden="true" />;
  }

  return <MonitorUp className="h-5 w-5" aria-hidden="true" />;
}

function InlineMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-[hsl(var(--border)/0.58)] bg-[hsl(var(--surface-card)/0.56)] px-2.5 py-1.5">
      <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-app-soft">{label}</p>
      <p className="mt-0.5 truncate text-xs font-semibold text-app-foreground">{value}</p>
    </div>
  );
}

function FeaturePill({ children }: { children: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[hsl(var(--border)/0.6)] bg-[hsl(var(--surface-card)/0.48)] px-2.5 py-1 text-[11px] font-semibold text-app-muted">
      <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-[hsl(var(--success))]" aria-hidden="true" />
      <span className="truncate">{children}</span>
    </span>
  );
}

export function ScreenSharePreferencesPanel() {
  const { t } = useI18n();
  const hasMounted = useSyncExternalStore(
    subscribeToBrowserCapabilities,
    getMountedSnapshot,
    getServerMountedSnapshot,
  );
  const hasScreenShareSupport = useSyncExternalStore(
    subscribeToBrowserCapabilities,
    isScreenShareSupported,
    getServerScreenShareSupportSnapshot,
  );
  const [isTogglingShare, setIsTogglingShare] = useState(false);
  const [pendingQualityId, setPendingQualityId] = useState<ScreenShareQualityId | null>(null);
  const {
    activeChannelId,
    isApplyingScreenShareQuality,
    isScreenSharing,
    room,
    screenShareError,
    screenShareQuality,
    setScreenShareQuality,
    toggleScreenShare,
  } = useVoiceState();
  const { screenShares } = useVoiceParticipants();

  const localShare = screenShares.find((share) => share.isLocal) ?? null;
  const activeShareCount = Math.max(screenShares.length, isScreenSharing ? 1 : 0);
  const selectedQuality = useMemo(
    () =>
      SCREEN_SHARE_QUALITY_OPTIONS.find((option) => option.id === screenShareQuality) ??
      SCREEN_SHARE_QUALITY_OPTIONS[0],
    [screenShareQuality],
  );
  const hasRoom = Boolean(room && activeChannelId);
  const status = resolveScreenShareStatus({
    activeShareCount,
    hasLocalShare: isScreenSharing || Boolean(localShare),
    hasRoom,
    hasSupport: hasScreenShareSupport,
    isMounted: hasMounted,
    screenShareError,
  });
  const isQualityBusy = Boolean(pendingQualityId) || isApplyingScreenShareQuality;
  const canToggleShare = hasRoom && hasScreenShareSupport && !isTogglingShare;

  const handleQualityChange = async (qualityId: ScreenShareQualityId) => {
    if (isQualityBusy || screenShareQuality === qualityId) {
      return;
    }

    setPendingQualityId(qualityId);
    try {
      await setScreenShareQuality(qualityId);
    } finally {
      setPendingQualityId(null);
    }
  };

  const handleToggleShare = async () => {
    if (!canToggleShare) {
      return;
    }

    setIsTogglingShare(true);
    try {
      await toggleScreenShare();
    } finally {
      setIsTogglingShare(false);
    }
  };

  const actionLabel = isTogglingShare
    ? t("settings.voice.screenShare.action.working")
    : isScreenSharing
      ? t("settings.voice.screenShare.action.stop")
      : !hasRoom
        ? t("settings.voice.screenShare.action.joinRequired")
        : hasScreenShareSupport
          ? t("settings.voice.screenShare.action.start")
          : t("settings.voice.screenShare.action.unavailable");

  return (
    <div className="space-y-3" data-testid="screen-share-preferences-panel">
      <div className="overflow-hidden rounded-[20px] border border-[hsl(var(--primary)/0.18)] bg-[linear-gradient(135deg,hsl(var(--surface-card)/0.92),hsl(var(--primary)/0.06))]">
        <div className="flex flex-col gap-3 p-3 sm:flex-row sm:items-start">
          <div
            className={cn(
              "grid h-10 w-10 shrink-0 place-items-center rounded-xl border",
              getStatusToneClass(status.tone),
            )}
          >
            <StatusIcon status={status} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-col gap-2.5 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-app-foreground">
                  {t(status.labelKey)}
                </p>
                <p className="mt-0.5 text-xs leading-4 text-app-muted">
                  {screenShareError ?? t(status.descriptionKey)}
                </p>
              </div>
              <button
                className={cn(
                  "inline-flex min-h-9 shrink-0 items-center justify-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]",
                  isScreenSharing
                    ? "border-[hsl(var(--danger)/0.28)] bg-[hsl(var(--danger)/0.10)] text-[hsl(var(--danger))] hover:bg-[hsl(var(--danger)/0.14)]"
                    : "border-[hsl(var(--primary)/0.32)] bg-[hsl(var(--primary)/0.12)] text-[hsl(var(--primary))] hover:bg-[hsl(var(--primary)/0.18)]",
                  !canToggleShare && "cursor-not-allowed opacity-60",
                )}
                data-testid="settings-screen-share-toggle"
                disabled={!canToggleShare}
                onClick={() => void handleToggleShare()}
                type="button"
              >
                {isTogglingShare ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <MonitorUp className="h-4 w-4" aria-hidden="true" />
                )}
                {actionLabel}
              </button>
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <InlineMetric
                label={t("settings.voice.screenShare.metric.activeShares")}
                value={t("settings.voice.screenShare.metric.activeSharesValue", {
                  count: activeShareCount,
                })}
              />
              <InlineMetric
                label={t("settings.voice.screenShare.metric.defaultQuality")}
                value={selectedQuality ? t(selectedQuality.labelKey) : screenShareQuality}
              />
              <InlineMetric
                label={t("settings.voice.screenShare.metric.liveApply")}
                value={
                  isScreenSharing || localShare
                    ? t("settings.voice.screenShare.metric.liveApplyOn")
                    : t("settings.voice.screenShare.metric.liveApplyNext")
                }
              />
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-[18px] border border-[hsl(var(--border)/0.66)] bg-[hsl(var(--surface-soft)/0.32)] p-3">
        <div className="flex items-start gap-2.5">
          <div className="rounded-xl border border-[hsl(var(--border)/0.6)] bg-[hsl(var(--surface-card)/0.62)] p-2 text-app-muted">
            <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-app-foreground">
              {t("settings.voice.screenShare.quality.title")}
            </p>
            <p className="mt-0.5 text-xs leading-4 text-app-muted">
              {t("settings.voice.screenShare.quality.description")}
            </p>
          </div>
        </div>

        <div className="mt-3 grid gap-2 lg:grid-cols-3">
          {SCREEN_SHARE_QUALITY_OPTIONS.map((option) => {
            const isSelected = option.id === screenShareQuality;
            const isPending = pendingQualityId === option.id;

            return (
              <button
                aria-pressed={isSelected}
                className={cn(
                  "min-h-[5.75rem] rounded-[16px] border p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]",
                  isSelected
                    ? "border-[hsl(var(--primary)/0.42)] bg-[hsl(var(--primary)/0.12)] shadow-[0_16px_36px_hsl(var(--primary)/0.10)]"
                    : "border-[hsl(var(--border)/0.68)] bg-[hsl(var(--background)/0.58)] hover:border-[hsl(var(--primary)/0.30)] hover:bg-[hsl(var(--primary)/0.06)]",
                  isQualityBusy && !isPending && "opacity-70",
                )}
                data-testid={`settings-screen-share-quality-${option.id}`}
                disabled={isQualityBusy && !isPending}
                key={option.id}
                onClick={() => void handleQualityChange(option.id)}
                type="button"
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-black uppercase tracking-[0.14em] text-[hsl(var(--primary))]">
                    {option.shortLabel}
                  </span>
                  {isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin text-app-muted" aria-hidden="true" />
                  ) : isSelected ? (
                    <span className="grid h-5 w-5 place-items-center rounded-full bg-[hsl(var(--primary)/0.16)] text-[hsl(var(--primary))]">
                      <Check className="h-3.5 w-3.5" aria-hidden="true" />
                    </span>
                  ) : null}
                </span>
                <span className="mt-2 block text-[13px] font-semibold text-app-foreground">
                  {t(option.labelKey)}
                </span>
                <span className="mt-1 block text-[11px] leading-4 text-app-muted">
                  {t(option.descriptionKey)}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-[18px] border border-[hsl(var(--warning)/0.22)] bg-[hsl(var(--warning)/0.07)] p-3">
        <div className="flex items-start gap-2.5">
          <div className="rounded-xl border border-[hsl(var(--warning)/0.24)] bg-[hsl(var(--warning)/0.10)] p-2 text-[hsl(var(--warning))]">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-app-foreground">
              {t("settings.voice.screenShare.nativeResearch.title")}
            </p>
            <p className="mt-0.5 text-xs leading-4 text-app-muted">
              {t("settings.voice.screenShare.nativeResearch.description")}
            </p>
            <p className="mt-1.5 text-[11px] leading-4 text-app-soft">
              {t("settings.voice.screenShare.nativeResearch.hardwareEncode")}
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <FeaturePill>{t("settings.voice.screenShare.feature.voiceRooms")}</FeaturePill>
        <FeaturePill>{t("settings.voice.screenShare.feature.directMessages")}</FeaturePill>
        <FeaturePill>{t("settings.voice.screenShare.feature.surfaceSwitching")}</FeaturePill>
        <FeaturePill>{t("settings.voice.screenShare.feature.selfBrowserSurface")}</FeaturePill>
        <FeaturePill>{t("settings.voice.screenShare.feature.detailMode")}</FeaturePill>
        <FeaturePill>{t("settings.voice.screenShare.feature.noSystemAudio")}</FeaturePill>
        <FeaturePill>{t("settings.voice.screenShare.feature.shareLimit")}</FeaturePill>
      </div>
    </div>
  );
}
