"use client";

import React, { useId } from "react";
import { Play } from "lucide-react";

import { useI18n } from "@/components/providers/locale-provider";
import { SETTINGS_METRICS, hairline, pxToEm, pxToRem } from "@/lib/settings/metrics";
import { cn } from "@/lib/utils";

/**
 * Ses satırının ikinci sırası — SPEC-AYARLAR §4.4 (`snd`).
 *
 * Anahtar satırın sağ ekseninde durur (tek kontrol ekseni bozulmaz); profil segmenti, seviye
 * rayı ve `Önizle` satırın **altına**, kendi şeridine iner. Üçünü de sağ yuvaya sıkıştırmak
 * ekseni 220 px kaydırırdı ve `Bildirim sesi` satırı diğer 169 satırla hizasını kaybederdi.
 *
 * Üç kontrol **ayrı ayrı etiketli**: `aria-labelledby` ile satır başlığına bağlanan tek bir grup
 * olsaydı ekran okuyucu üç farklı kontrolü de "Bildirim sesi" diye okur, hangisinin profil,
 * hangisinin seviye olduğu duyulmazdı.
 *
 * Seviye rayı `SettingSlider` değil: geometrisi ayrı (22 px düğme, 26 px değer, esneyen ray) ve
 * `controls.sound` altında kendi kaydı var. Anlam katmanı aynı — `role="slider"` + birimli
 * `aria-valuetext`.
 */

const { sound } = SETTINGS_METRICS.controls;

/** Ses seviyesi ondan ona gezer (referans `volDec`/`volInc`). */
export const SETTING_SOUND_VOLUME_STEP = 10;

export type SettingSoundProfile = "classic" | "whispr";

export const SETTING_SOUND_PROFILES: readonly SettingSoundProfile[] = ["whispr", "classic"];

const PROFILE_LABEL_KEY: Readonly<Record<SettingSoundProfile, string>> = {
  classic: "settings.control.sound.profile.classic",
  whispr: "settings.control.sound.profile.whispr",
};

export type SettingSoundRowProps = {
  readonly disabled?: boolean;
  readonly labelledById?: string | undefined;
  readonly onPreview: () => void;
  readonly onProfileChange: (profile: SettingSoundProfile) => void;
  readonly onVolumeChange: (volume: number) => void;
  readonly profile: SettingSoundProfile;
  readonly testId?: string;
  readonly volume: number;
};

export function SettingSoundRow({
  disabled = false,
  labelledById,
  onPreview,
  onProfileChange,
  onVolumeChange,
  profile,
  testId,
  volume,
}: SettingSoundRowProps) {
  const { t } = useI18n();
  const scope = useId();
  const levelLabelId = `${scope}-level`;
  const clamp = (next: number) => Math.min(100, Math.max(0, next));

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const map: Record<string, number | undefined> = {
      ArrowDown: volume - SETTING_SOUND_VOLUME_STEP,
      ArrowLeft: volume - SETTING_SOUND_VOLUME_STEP,
      ArrowRight: volume + SETTING_SOUND_VOLUME_STEP,
      ArrowUp: volume + SETTING_SOUND_VOLUME_STEP,
      End: 100,
      Home: 0,
      PageDown: volume - SETTING_SOUND_VOLUME_STEP * 2,
      PageUp: volume + SETTING_SOUND_VOLUME_STEP * 2,
    };
    const next = map[event.key];

    if (next === undefined) {
      return;
    }

    event.preventDefault();
    onVolumeChange(clamp(next));
  };

  return (
    <div
      aria-disabled={disabled || undefined}
      className="flex flex-wrap items-center"
      data-testid={testId}
      style={{
        borderTop: `${hairline()} solid hsl(var(--border) / ${sound.borderTopAlpha})`,
        gap: pxToRem(sound.gap),
        marginTop: pxToRem(sound.marginTop),
        paddingTop: pxToRem(sound.paddingTop),
      }}
    >
      <div
        aria-label={t("settings.control.sound.profileLabel")}
        className="flex shrink-0 bg-[hsl(var(--surface-secondary))]"
        role="radiogroup"
        style={{
          border: `${hairline()} solid hsl(var(--border) / 0.6)`,
          borderRadius: pxToRem(SETTINGS_METRICS.controls.segment.radius),
          gap: pxToRem(SETTINGS_METRICS.controls.segment.gap),
          padding: pxToRem(SETTINGS_METRICS.controls.segment.padding),
        }}
      >
        {SETTING_SOUND_PROFILES.map((entry) => {
          const active = entry === profile;

          return (
            <button
              aria-checked={active}
              aria-disabled={disabled || undefined}
              className={cn(
                "transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]",
                active ? "bg-[hsl(var(--primary))]" : "text-[hsl(var(--text-secondary))]",
              )}
              data-testid={testId ? `${testId}-profile-${entry}` : undefined}
              key={entry}
              onClick={() => {
                if (!disabled) onProfileChange(entry);
              }}
              role="radio"
              style={{
                borderRadius: pxToRem(sound.profileOptionRadius),
                color: active ? "#fff" : undefined,
                fontSize: pxToRem(sound.profileOptionFontSize),
                fontWeight: 600,
                height: pxToRem(sound.profileOptionHeight),
                padding: `0 ${pxToRem(sound.profileOptionPaddingX)}`,
              }}
              tabIndex={disabled ? -1 : active ? 0 : -1}
              type="button"
            >
              {t(PROFILE_LABEL_KEY[entry])}
            </button>
          );
        })}
      </div>

      <div
        className="flex min-w-0 max-w-full flex-1 items-center"
        style={{ gap: pxToRem(sound.gap), flexBasis: pxToRem(240) }}
      >
        <span
          className="shrink-0 whitespace-nowrap text-[hsl(var(--text-muted))]"
          id={levelLabelId}
          style={{
            fontSize: pxToRem(sound.levelLabelFontSize),
            fontWeight: 500,
            lineHeight: 1,
          }}
        >
          {t("settings.control.sound.level")}
        </span>

        <SoundStepButton
          disabled={disabled}
          label={t("settings.control.slider.decrease")}
          onClick={() => onVolumeChange(clamp(volume - SETTING_SOUND_VOLUME_STEP))}
          symbol="−"
          testId={testId ? `${testId}-decrease` : undefined}
        />

        <div
          aria-labelledby={levelLabelId}
          aria-disabled={disabled || undefined}
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={volume}
          aria-valuetext={`${volume}%`}
          className="relative flex-1 rounded-full bg-[hsl(var(--surface-tertiary))] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
          data-testid={testId ? `${testId}-level` : undefined}
          onKeyDown={(event) => {
            if (!disabled) handleKeyDown(event);
          }}
          role="slider"
          style={{ height: pxToRem(sound.trackHeight), minWidth: 0 }}
          tabIndex={disabled ? -1 : 0}
        >
          <span
            aria-hidden="true"
            className="absolute inset-y-0 left-0 rounded-full bg-[hsl(var(--primary))]"
            style={{ width: `${volume}%` }}
          />
          <span
            aria-hidden="true"
            className="absolute rounded-full bg-white"
            style={{
              border: `${hairline(sound.knobBorderWidth)} solid hsl(var(--primary))`,
              height: pxToRem(sound.knob),
              left: `calc(${volume}% - ${pxToRem(sound.knob / 2)})`,
              top: pxToRem(sound.knobOffsetTop),
              width: pxToRem(sound.knob),
            }}
          />
        </div>

        <SoundStepButton
          disabled={disabled}
          label={t("settings.control.slider.increase")}
          onClick={() => onVolumeChange(clamp(volume + SETTING_SOUND_VOLUME_STEP))}
          symbol="+"
          testId={testId ? `${testId}-increase` : undefined}
        />

        <span
          aria-hidden="true"
          className="font-display shrink-0 text-right text-[hsl(var(--foreground))]"
          style={{
            fontSize: pxToRem(sound.valueFontSize),
            fontWeight: 600,
            lineHeight: 1,
            width: pxToRem(sound.valueWidth),
          }}
        >
          {volume}
        </span>
      </div>
      <button
        aria-describedby={labelledById}
        className="flex shrink-0 items-center bg-[hsl(var(--surface-base))] text-[hsl(var(--text-secondary))] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
        data-testid={testId ? `${testId}-preview` : undefined}
        disabled={disabled}
        onClick={onPreview}
        style={{
          border: `${hairline()} solid hsl(var(--border) / 0.75)`,
          borderRadius: pxToRem(sound.previewRadius),
          fontSize: pxToRem(sound.previewFontSize),
          fontWeight: 600,
          gap: pxToRem(sound.previewGap),
          height: pxToRem(sound.previewHeight),
          lineHeight: 1,
          padding: `0 ${pxToRem(sound.previewPaddingX)}`,
        }}
        type="button"
      >
        <Play
          aria-hidden="true"
          style={{
            height: pxToEm(sound.previewIconSize, sound.previewFontSize),
            width: pxToEm(sound.previewIconSize, sound.previewFontSize),
          }}
        />
        {t("settings.control.sound.preview")}
      </button>
    </div>
  );
}

function SoundStepButton({
  disabled,
  label,
  onClick,
  symbol,
  testId,
}: {
  disabled: boolean;
  label: string;
  onClick: () => void;
  symbol: string;
  testId: string | undefined;
}) {
  return (
    <button
      aria-label={label}
      className="font-display grid shrink-0 place-items-center bg-[hsl(var(--surface-base))] text-[hsl(var(--text-secondary))] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
      data-testid={testId}
      disabled={disabled}
      onClick={onClick}
      style={{
        border: `${hairline()} solid hsl(var(--border) / 0.75)`,
        borderRadius: pxToRem(sound.stepRadius),
        fontSize: pxToRem(sound.stepFontSize),
        fontWeight: 600,
        height: pxToRem(sound.stepSize),
        lineHeight: 1,
        width: pxToRem(sound.stepSize),
      }}
      type="button"
    >
      <span aria-hidden="true">{symbol}</span>
    </button>
  );
}
