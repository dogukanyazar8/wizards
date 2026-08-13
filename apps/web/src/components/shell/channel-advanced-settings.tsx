"use client";

import React from "react";
import {
  CHANNEL_BITRATE_OPTIONS,
  CHANNEL_SLOW_MODE_DELAYS,
  CHANNEL_USER_LIMIT_MAX,
  type WorkspaceChannel,
} from "@wizards/types";

import { useI18n } from "@/components/providers/locale-provider";
import { Input } from "@/components/ui/input";
import type { ChannelAdvancedSettings } from "@/components/shell/channel-form-model";

type ChannelAdvancedSettingsProps = {
  availableRtcRegions: readonly string[];
  channelType: WorkspaceChannel["type"];
  onChange: (settings: ChannelAdvancedSettings) => void;
  value: ChannelAdvancedSettings;
};

function selectClassName() {
  return "h-11 w-full rounded-2xl border border-[hsl(var(--border)/0.82)] bg-[hsl(var(--surface-soft)/0.55)] px-4 text-sm text-[hsl(var(--foreground))] outline-hidden transition focus:border-[hsl(var(--ring)/0.55)] focus:ring-4 focus:ring-[hsl(var(--ring)/0.12)]";
}

export function ChannelAdvancedSettingsFields({
  availableRtcRegions,
  channelType,
  onChange,
  value,
}: ChannelAdvancedSettingsProps) {
  const { t } = useI18n();
  const update = <Key extends keyof ChannelAdvancedSettings>(
    key: Key,
    nextValue: ChannelAdvancedSettings[Key],
  ) => onChange({ ...value, [key]: nextValue });
  const userLimitInvalid =
    !Number.isInteger(value.userLimit) ||
    value.userLimit < 0 ||
    value.userLimit > CHANNEL_USER_LIMIT_MAX;
  const rtcRegionInvalid =
    value.rtcRegion !== null && !availableRtcRegions.includes(value.rtcRegion);

  return (
    <details
      className="app-panel-soft group rounded-[24px] border p-4"
      data-testid="channel-advanced-settings"
    >
      <summary className="cursor-pointer list-none rounded-xl text-sm font-semibold text-app-foreground outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]">
        <span>{t("workspace.modal.channelAdvancedTitle")}</span>
        <span className="mt-1 block text-xs font-normal leading-5 text-app-muted">
          {t("workspace.modal.channelAdvancedDescription")}
        </span>
      </summary>

      <div className="mt-4 grid gap-4 border-t border-[hsl(var(--border)/0.58)] pt-4 sm:grid-cols-2">
        {channelType === "TEXT" ? (
          <label className="space-y-2 sm:col-span-2">
            <span className="text-app-soft text-xs font-semibold uppercase tracking-[0.2em]">
              {t("workspace.modal.channelSlowMode")}
            </span>
            <select
              className={selectClassName()}
              id="channel-slow-mode"
              onChange={(event) => update("slowModeDelay", Number(event.target.value))}
              value={value.slowModeDelay}
            >
              {CHANNEL_SLOW_MODE_DELAYS.map((delay) => (
                <option key={delay} value={delay}>
                  {delay === 0
                    ? t("workspace.modal.channelSlowModeOff")
                    : delay < 60
                      ? t("workspace.modal.channelSlowModeSeconds", { count: delay })
                      : t("workspace.modal.channelSlowModeMinutes", { count: delay / 60 })}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <>
            <label className="space-y-2">
              <span className="text-app-soft text-xs font-semibold uppercase tracking-[0.2em]">
                {t("workspace.modal.channelBitrate")}
              </span>
              <select
                className={selectClassName()}
                id="channel-bitrate"
                onChange={(event) => update("bitrate", Number(event.target.value))}
                value={value.bitrate}
              >
                {CHANNEL_BITRATE_OPTIONS.map((bitrate) => (
                  <option key={bitrate} value={bitrate}>
                    {bitrate / 1000} kbps
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-2">
              <span className="text-app-soft text-xs font-semibold uppercase tracking-[0.2em]">
                {t("workspace.modal.channelUserLimit")}
              </span>
              <Input
                aria-describedby="channel-user-limit-hint channel-user-limit-error"
                aria-invalid={userLimitInvalid}
                id="channel-user-limit"
                max={CHANNEL_USER_LIMIT_MAX}
                min={0}
                onChange={(event) => update("userLimit", Number(event.target.value))}
                step={1}
                type="number"
                value={value.userLimit}
              />
              <span className="block text-xs leading-5 text-app-muted" id="channel-user-limit-hint">
                {t("workspace.modal.channelUserLimitHint")}
              </span>
              {userLimitInvalid ? (
                <span
                  className="block text-xs font-semibold text-app-danger"
                  id="channel-user-limit-error"
                >
                  {t("workspace.modal.channelUserLimitError")}
                </span>
              ) : null}
            </label>

            <label className="space-y-2">
              <span className="text-app-soft text-xs font-semibold uppercase tracking-[0.2em]">
                {t("workspace.modal.channelRtcRegion")}
              </span>
              <select
                aria-describedby={rtcRegionInvalid ? "channel-rtc-region-error" : undefined}
                aria-invalid={rtcRegionInvalid}
                className={selectClassName()}
                id="channel-rtc-region"
                onChange={(event) => update("rtcRegion", event.target.value || null)}
                value={value.rtcRegion ?? ""}
              >
                <option value="">{t("workspace.modal.channelRtcAuto")}</option>
                {rtcRegionInvalid ? (
                  <option value={value.rtcRegion!}>{value.rtcRegion}</option>
                ) : null}
                {availableRtcRegions.map((region) => (
                  <option key={region} value={region}>
                    {region}
                  </option>
                ))}
              </select>
              {rtcRegionInvalid ? (
                <span
                  className="block text-xs font-semibold text-app-danger"
                  id="channel-rtc-region-error"
                >
                  {t("workspace.modal.channelRtcUnavailable")}
                </span>
              ) : null}
            </label>

            <label className="space-y-2">
              <span className="text-app-soft text-xs font-semibold uppercase tracking-[0.2em]">
                {t("workspace.modal.channelVideoQuality")}
              </span>
              <select
                className={selectClassName()}
                id="channel-video-quality"
                onChange={(event) =>
                  update("videoQualityMode", event.target.value === "FULL" ? "FULL" : "AUTO")
                }
                value={value.videoQualityMode}
              >
                <option value="AUTO">{t("workspace.modal.channelVideoAuto")}</option>
                <option value="FULL">{t("workspace.modal.channelVideoFull")}</option>
              </select>
            </label>
          </>
        )}
      </div>
    </details>
  );
}
