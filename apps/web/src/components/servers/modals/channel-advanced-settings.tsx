"use client";

import React from "react";
import { Camera, Clock, Globe, Users, Waves } from "lucide-react";
import {
  CHANNEL_BITRATE_OPTIONS,
  CHANNEL_SLOW_MODE_DELAYS,
  CHANNEL_USER_LIMIT_MAX,
  type WorkspaceChannel,
} from "@wizards/types";

import { useI18n } from "@/components/providers/locale-provider";
import { OptionChipGroup } from "@/components/servers/shared/option-chip-group";
import { SERVER_METRICS, pxToEm, pxToRem } from "@/lib/servers/metrics";
import type { ChannelAdvancedSettings } from "./channel-form-model";

/**
 * Kanal sihirbazının 4. adımı — SPEC-SUNUCU §6.2 `Gelişmiş ayarlar` / `Sesli kanal ayarları`.
 *
 * `components/shell/channel-advanced-settings.tsx`'ten **taşındı**. Taşınan şey davranış:
 * prop sözleşmesi (`availableRtcRegions` · `channelType` · `onChange` · `value`), `userLimit`
 * aralık denetimi ve `rtcRegion` beyaz listesi aynen duruyor; değişen yalnız sunum —
 * `<details>` + dört `<select>` yerine SPEC'in dört kartı ve `OptionChipGroup`'u.
 *
 * **RTC bölgesi — TODO(api).** SPEC §6.2 altı çip veriyor (`Otomatik` + beş şehir). Üründe
 * bölge listesi dağıtımın `LIVEKIT_RTC_REGION_*` ortam değişkenlerinden geliyor
 * (`getLiveKitRtcRegionKeys`) ve `assertLiveKitRtcRegionAvailable` bu kümede olmayan her
 * bölgeye **400 `RTC_REGION_UNAVAILABLE`** dönüyor. SPEC'in beş şehri sabit çizilseydi, uç
 * onları tanımadığı sürece her kaydetme denemesi hata verirdi — kesikli bir "yakında" çipinden
 * beter, çalışıyormuş gibi duran bir çip. Bu yüzden liste dağıtımın yayımladığı anahtarlardan
 * kuruluyor; anahtar yoksa yalnız `Otomatik` çizilir ve nedeni yazılır. Uç şehir listesini
 * yayımladığında burada değişecek tek şey `server.channel.rtcRegion.*` çevirileridir.
 */

const SLOW_MODE_MINUTE = 60;

export type ChannelAdvancedSettingsProps = {
  availableRtcRegions: readonly string[];
  channelType: WorkspaceChannel["type"];
  onChange: (settings: ChannelAdvancedSettings) => void;
  value: ChannelAdvancedSettings;
};

const RTC_AUTO = "AUTO";

export function ChannelAdvancedSettingsFields({
  availableRtcRegions,
  channelType,
  onChange,
  value,
}: ChannelAdvancedSettingsProps) {
  const { t } = useI18n();
  const { channelWizard } = SERVER_METRICS;
  const update = <Key extends keyof ChannelAdvancedSettings>(
    key: Key,
    nextValue: ChannelAdvancedSettings[Key],
  ) => onChange({ ...value, [key]: nextValue });

  const iconStyle = {
    height: pxToEm(channelWizard.settingIconGlyphSize, channelWizard.settingTitleFontSize),
    width: pxToEm(channelWizard.settingIconGlyphSize, channelWizard.settingTitleFontSize),
  } as const;

  if (channelType === "TEXT") {
    return (
      <div
        className="flex flex-col"
        data-testid="channel-advanced-settings"
        style={{
          gap: pxToRem(channelWizard.settingsListGap),
          marginTop: pxToRem(channelWizard.settingsListMarginTop),
        }}
      >
        <OptionChipGroup
          description={t("server.channel.slowMode.description")}
          icon={<Clock aria-hidden="true" style={iconStyle} />}
          onChange={(next) => update("slowModeDelay", Number(next))}
          options={CHANNEL_SLOW_MODE_DELAYS.map((delay) => ({
            label: slowModeLabel(t, delay),
            value: String(delay),
          }))}
          testId="channel-slow-mode"
          title={t("server.channel.slowMode.title")}
          value={String(value.slowModeDelay)}
        />
      </div>
    );
  }

  // `rtcRegion` `null` = otomatik. Çip değerleri metin olmak zorunda, bu yüzden `AUTO` sentinel'i
  // yalnız bu bileşenin içinde yaşar ve dışarıya `null` olarak çıkar.
  const rtcOptions = [
    { label: t("server.channel.rtcRegion.auto"), value: RTC_AUTO },
    ...availableRtcRegions.map((region) => ({ label: rtcRegionLabel(t, region), value: region })),
  ];
  const rtcRegionUnknown =
    value.rtcRegion !== null && !availableRtcRegions.includes(value.rtcRegion);

  return (
    <div
      className="flex flex-col"
      data-testid="channel-advanced-settings"
      style={{
        gap: pxToRem(channelWizard.settingsListGap),
        marginTop: pxToRem(channelWizard.settingsListMarginTop),
      }}
    >
      <OptionChipGroup
        description={t("server.channel.bitrate.description")}
        icon={<Waves aria-hidden="true" style={iconStyle} />}
        onChange={(next) => update("bitrate", Number(next))}
        options={CHANNEL_BITRATE_OPTIONS.map((bitrate) => ({
          label: t("server.channel.bitrate.option", { kbps: bitrate / 1000 }),
          value: String(bitrate),
        }))}
        testId="channel-bitrate"
        title={t("server.channel.bitrate.title")}
        value={String(value.bitrate)}
      />

      <OptionChipGroup
        description={t("server.channel.userLimit.description", { max: CHANNEL_USER_LIMIT_MAX })}
        icon={<Users aria-hidden="true" style={iconStyle} />}
        onChange={(next) => update("userLimit", Number(next))}
        // Çipler düz sayı yazar (`0`…`10`); başlıktaki primary çip `0` için
        // `10 kişi (varsayılan)`, diğerleri için `N kişi` (SPEC §6.2 — referansın kendi ayrımı).
        options={Array.from({ length: CHANNEL_USER_LIMIT_MAX + 1 }, (_, limit) => ({
          label: String(limit),
          value: String(limit),
        }))}
        testId="channel-user-limit"
        title={t("server.channel.userLimit.title")}
        value={String(value.userLimit)}
        valueLabel={
          value.userLimit === 0
            ? t("server.channel.userLimit.default", { max: CHANNEL_USER_LIMIT_MAX })
            : t("server.channel.userLimit.option", { count: value.userLimit })
        }
      />

      <OptionChipGroup
        description={
          availableRtcRegions.length === 0
            ? t("server.channel.rtcRegion.unavailable")
            : t("server.channel.rtcRegion.description")
        }
        icon={<Globe aria-hidden="true" style={iconStyle} />}
        onChange={(next) => update("rtcRegion", next === RTC_AUTO ? null : next)}
        options={
          rtcRegionUnknown
            ? [...rtcOptions, { label: value.rtcRegion!, value: value.rtcRegion! }]
            : rtcOptions
        }
        testId="channel-rtc-region"
        title={t("server.channel.rtcRegion.title")}
        value={value.rtcRegion ?? RTC_AUTO}
      />

      <OptionChipGroup
        icon={<Camera aria-hidden="true" style={iconStyle} />}
        onChange={(next) => update("videoQualityMode", next === "FULL" ? "FULL" : "AUTO")}
        options={[
          { label: t("server.channel.videoQuality.auto"), value: "AUTO" },
          { label: t("server.channel.videoQuality.full"), value: "FULL" },
        ]}
        testId="channel-video-quality"
        title={t("server.channel.videoQuality.title")}
        value={value.videoQualityMode}
      />

      {rtcRegionUnknown ? (
        <p
          className="font-semibold text-[hsl(var(--danger))]"
          data-testid="channel-rtc-region-error"
          role="alert"
          style={{
            fontSize: pxToRem(channelWizard.settingDescriptionFontSize),
            lineHeight: channelWizard.settingDescriptionLineHeight,
          }}
        >
          {t("server.channel.rtcRegion.unknown")}
        </p>
      ) : null}
    </div>
  );
}

type Translate = (key: string, values?: Record<string, number | string>) => string;

/** SPEC §6.2'nin on iki etiketi; eşik `CHANNEL_SLOW_MODE_DELAYS`'ten gelir, listeden değil. */
function slowModeLabel(t: Translate, delay: number): string {
  if (delay === 0) {
    return t("server.channel.slowMode.off");
  }

  return delay < SLOW_MODE_MINUTE
    ? t("server.channel.slowMode.seconds", { count: delay })
    : t("server.channel.slowMode.minutes", { count: delay / SLOW_MODE_MINUTE });
}

/**
 * Bölge anahtarının okunur adı. Çevirisi olmayan anahtar **ham** görünür: dağıtım yeni bir
 * bölge yayımladığında çip kaybolmaz, yalnız adı çevrilmemiş olur.
 */
function rtcRegionLabel(t: Translate, region: string): string {
  const key = `server.channel.rtcRegion.${region}`;
  const label = t(key);

  return label === key ? region : label;
}
