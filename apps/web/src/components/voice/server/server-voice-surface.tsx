"use client";

import { screenSharePresenterLabel } from "@/lib/voice/screen-share-label";
import type { ScreenShareStreamInfo } from "@wizards/types";
import React from "react";
import Link from "next/link";
import { buildSettingsHref } from "@/lib/settings/navigation";
import { calculateVoiceGrid, type VoiceLayout } from "@/lib/servers/voice-layout";

import { Avatar } from "@/components/ui/avatar";
import { useI18n } from "@/components/providers/locale-provider";
import { SettingSelect } from "@/components/settings/rows/setting-select";
import type { VoiceParticipantViewModel } from "@/components/providers/voice-provider";
import { DISPLAY_FONT, DISPLAY_TRACKING } from "@/components/servers/shared/typography";
import { SERVER_METRICS, hairline, pxToEm, pxToRem } from "@/lib/servers/metrics";
import {
  selectVoiceLatencyBarsForTier,
  selectVoiceTileStatus,
  type VoiceLatencyTier,
  type VoiceSubtitleModel,
} from "@/lib/servers/voice-presentation";

/**
 * SPEC-SUNUCU §5 — sunucu ses kanalının **sunum** katmanı.
 *
 * **K5.** LiveKit bağlantısı, katılımcı eşlemesi, cihaz seçimi, abonelik ve codec/bitrate
 * mantığı `lib/voice/*` altında. Bu bileşenler katılımcı verisini prop olarak alır;
 * yerel durum yalnız görünüm ve menü içindir, medya track'lerine dokunmaz.
 *
 * **Neden yeni dosya, neden `voice-room-primitives.tsx` değil.** O dosyanın `VoiceParticipantTile`,
 * `VoiceControlBar` ve `ScreenShareStage` bileşenlerini **`dm-call-view.tsx` de kullanıyor** ve
 * Ş7'nin sınırı "ses odası (DM/grup çağrısı) yüzeyi kapsam dışı" diyor. Paylaşılan bileşeni
 * SPEC-SUNUCU'ya göre yeniden çizmek, dokunulmaması söylenen yüzeyi de yeniden çizmek olurdu.
 * Sunucu kanalı kendi dilini burada taşıyor; iki yüzey aynı **veriyi** paylaşıyor, aynı
 * pikselleri değil.
 *
 * Ölçüler `SERVER_METRICS.{voiceHeader,voiceGrid,screenShare,voiceControls}`ten; bileşende
 * çıplak sayı yok (00 §3). Renk yalnız `hsl(var(--token))` (00 §2.7).
 */

const { voiceControls, voiceGrid, voiceHeader, screenShare, textHeader } = SERVER_METRICS;

const SPEAKER_PATH = "M11 5 6 9H2v6h4l5 4zM15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13";
const SHIELD_PATH = "M12 3l7 3v5.6c0 4.3-3 7.5-7 9.4-4-1.9-7-5.1-7-9.4V6zM9.2 12.2l2.1 2.2L15 10.6";
const USERS_PATH =
  "M16 20v-1.5a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4V20M13 7.5a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0M21 20v-1.5a4 4 0 0 0-3-3.9";
const MIC_PATH =
  "M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zM5 11a7 7 0 0 0 14 0M12 18v3";
const MIC_OFF_PATH =
  "M3 3l18 18M9 9v3a3 3 0 0 0 4.5 2.6M15 11.5V6a3 3 0 0 0-5.7-1.3M5 11a7 7 0 0 0 10.3 6.2M19 11a7 7 0 0 1-.6 2.8M12 18v3";
const SPEAKER_OFF_PATH = "M11 5 6 9H2v6h4l5 4zM17 9l5 6M22 9l-5 6";
const CAMERA_PATH =
  "M2.5 6h13a2.5 2.5 0 0 1 2.5 2.5v7a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 0 15.5v-7A2.5 2.5 0 0 1 2.5 6zM15.5 11l6-3.5v9l-6-3.5z";
const MONITOR_PATH =
  "M4 4h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM9 20h6M12 16v4";
const VIDEO_OFF_PATH = "M3 3l18 18M2.5 7.5h9.5M16.5 11l5-3v8M14.5 16.5h-12a2 2 0 0 1-2-2v-5";
const SETTINGS_PATH =
  "M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2v.1a2 2 0 1 1-4 0v-.2a1.7 1.7 0 0 0-3-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9H3a2 2 0 1 1 0-4h.2a1.7 1.7 0 0 0 1.1-3l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 2.9-1.2V3a2 2 0 1 1 4 0v.2a1.7 1.7 0 0 0 3 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.2 2.9H21a2 2 0 1 1 0 4h-.2a1.7 1.7 0 0 0-1.5 1z";
const LEAVE_PATH =
  "M10.7 13.3a11 11 0 0 0 4.6 2.7l1.6-1.6a1.3 1.3 0 0 1 1.4-.3l3 1.2c.5.2.8.7.8 1.2v2.6c0 .8-.7 1.4-1.5 1.3C11.6 19.6 4.4 12.4 3.6 3.4 3.5 2.6 4.1 2 4.9 2h2.6c.5 0 1 .3 1.2.8l1.2 3c.2.5.1 1-.3 1.4L8 8.7M21 3 3 21";
const FULLSCREEN_PATH = "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5";

function Glyph({ path, size, base }: { path: string; size: number; base?: number }) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={base === undefined ? pxToEm(size) : pxToEm(size, base)}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.9}
      viewBox="0 0 24 24"
      width={base === undefined ? pxToEm(size) : pxToEm(size, base)}
    >
      <path d={path} />
    </svg>
  );
}

/**
 * §5.2 — dört çubuklu canlı dalga. Animasyon `globals.css`teki `@keyframes wbar`; süre ve
 * çubuk başına gecikme sözlükten satır içi değişkenle geliyor. Sınıf **yalnız** konuşan
 * karta takılır: susan kart bir animasyon karesi bile harcamaz (PROMPT §11).
 */
function SpeakingWave({ compact = false }: { compact?: boolean }) {
  const count = compact ? voiceGrid.waveBarCountCamera : voiceGrid.waveBarCount;
  const height = compact ? voiceGrid.waveBarHeightCamera : voiceGrid.waveBarHeight;

  return (
    <span
      aria-hidden="true"
      className="flex flex-none items-center"
      data-testid="server-voice-wave"
      style={{ gap: pxToRem(voiceGrid.waveBarGap), height: pxToRem(height) }}
    >
      {Array.from({ length: count }, (_, index) => (
        <span
          className="voice-wave-bar"
          key={index}
          style={
            {
              "--wbar-delay": `${index * voiceGrid.waveStaggerMs}ms`,
              "--wbar-duration": `${voiceGrid.waveDurationMs}ms`,
              background: "hsl(var(--success))",
              borderRadius: pxToRem(voiceGrid.waveBarRadius),
              display: "block",
              height: pxToRem(height),
              width: pxToRem(voiceGrid.waveBarWidth),
            } as React.CSSProperties
          }
        />
      ))}
    </span>
  );
}

/** §5.2 — kamera açık kartın çapraz şeritli yer tutucusu. Gerçek akış varsa çizilmez. */
function stripeBackground(size: number, cycle: number, alpha: number): string {
  return `repeating-linear-gradient(135deg, hsl(var(--surface-secondary)) 0 ${size}px, hsl(var(--surface-tertiary)/${alpha}) ${size}px ${cycle}px)`;
}

/* ------------------------------------------------------------------ §5.1 başlık */

export type ServerVoiceHeaderProps = {
  readonly layoutControl?: React.ReactNode;
  readonly channelName: string;
  readonly categoryName: string | null;
  readonly krispActive: boolean;
  readonly krispLabel: string;
  /**
   * §5.1 gecikme çipi. `tier` LiveKit'in gerçek bağlantı kalitesinden gelir; `ms` **yok**
   * (Ş4 TODO 1 — odanın RTT'sini veren bir alan yok) ve `null` iken sayı yazılmaz.
   * `latency` bütünüyle `null` ise çip hiç çizilmez.
   */
  readonly latency: { readonly ms: number | null; readonly tier: VoiceLatencyTier } | null;
  readonly membersActive: boolean;
  readonly onOpenMembers: () => void;
  readonly subtitle: VoiceSubtitleModel;
};

export function ServerVoiceHeader({
  layoutControl,
  channelName,
  categoryName,
  krispActive,
  krispLabel,
  latency,
  membersActive,
  onOpenMembers,
  subtitle,
}: ServerVoiceHeaderProps) {
  const { t } = useI18n();

  const durationPart =
    subtitle.minutes === null
      ? null
      : t("server.voice.header.minutes", { count: subtitle.minutes });

  const subtitleText = [
    subtitle.kind === "screenShare" && subtitle.sharerName
      ? t("server.voice.header.sharing", { name: subtitle.sharerName })
      : null,
    subtitle.kind === "camera"
      ? t("server.voice.header.cameras", { count: subtitle.cameraCount })
      : null,
    t("server.voice.header.participants", { count: subtitle.participantCount }),
    durationPart,
  ]
    .filter((part): part is string => Boolean(part))
    .join(" · ");

  const litBars = latency ? selectVoiceLatencyBarsForTier(latency.tier) : 0;

  return (
    <header
      className="flex min-w-0 flex-none items-center"
      data-testid="server-voice-channel"
      style={{
        height: pxToRem(SERVER_METRICS.headerHeight),
        borderBottom: `${hairline()} solid hsl(var(--border)/${textHeader.borderBottomAlpha})`,
        gap: pxToRem(textHeader.gap),
        padding: `${pxToRem(textHeader.paddingY)} ${pxToRem(textHeader.paddingX)}`,
      }}
    >
      <span aria-hidden="true" className="flex flex-none items-center text-[hsl(var(--success))]">
        <Glyph path={SPEAKER_PATH} size={textHeader.iconSize} />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center" style={{ gap: pxToRem(textHeader.titleGap) }}>
          <h1
            className="truncate font-semibold text-[hsl(var(--foreground))]"
            data-testid="server-voice-title"
            style={{
              fontFamily: DISPLAY_FONT,
              fontSize: pxToRem(textHeader.nameFontSize),
              letterSpacing: DISPLAY_TRACKING,
              lineHeight: textHeader.nameLineHeight,
            }}
          >
            {channelName}
          </h1>
          {categoryName ? (
            <span
              className="flex-none font-semibold whitespace-nowrap text-[hsl(var(--text-secondary))] uppercase"
              data-testid="server-voice-category-chip"
              style={{
                background: "hsl(var(--surface-soft))",
                borderRadius: pxToRem(textHeader.categoryChipRadius),
                fontFamily: DISPLAY_FONT,
                fontSize: pxToRem(textHeader.categoryChipFontSize),
                lineHeight: 1,
                padding: `${pxToRem(textHeader.categoryChipPaddingY)} ${pxToRem(
                  textHeader.categoryChipPaddingX,
                )}`,
              }}
            >
              {categoryName}
            </span>
          ) : null}
        </div>
        <p
          className="truncate font-medium text-[hsl(var(--text-muted))]"
          data-testid="server-voice-subtitle"
          style={{
            fontSize: pxToRem(textHeader.subtitleFontSize),
            lineHeight: textHeader.subtitleLineHeight,
            marginTop: pxToRem(textHeader.subtitleMarginTop),
          }}
        >
          {subtitleText}
        </p>
      </div>

      <div className="flex flex-none items-center" style={{ gap: pxToRem(voiceHeader.chipsGap) }}>
        {layoutControl}
        <span
          className="flex items-center font-semibold whitespace-nowrap"
          data-krisp-active={krispActive ? "true" : "false"}
          data-testid="server-voice-krisp-chip"
          style={{
            background: krispActive
              ? `hsl(var(--success)/${voiceHeader.krispChipBackgroundAlpha})`
              : "hsl(var(--surface-soft))",
            border: `${hairline()} solid ${
              krispActive
                ? `hsl(var(--success)/${voiceHeader.krispChipBorderAlpha})`
                : `hsl(var(--border)/${voiceHeader.latencyChipBorderAlpha})`
            }`,
            borderRadius: pxToRem(voiceHeader.krispChipRadius),
            color: krispActive ? "hsl(var(--success))" : "hsl(var(--text-muted))",
            fontFamily: DISPLAY_FONT,
            fontSize: pxToRem(voiceHeader.krispChipFontSize),
            gap: pxToRem(voiceHeader.krispChipGap),
            lineHeight: 1,
            padding: `${pxToRem(voiceHeader.krispChipPaddingY)} ${pxToRem(
              voiceHeader.krispChipPaddingX,
            )}`,
          }}
        >
          <Glyph base={voiceHeader.krispChipFontSize} path={SHIELD_PATH} size={13} />
          <span className="sr-only md:not-sr-only">{krispLabel}</span>
        </span>

        {/*
          TODO(api): odanın RTT'sini veren bir alan yok (Ş4 TODO 1). Sayı uydurulmuyor —
          `latencyMs` `null` iken çip **hiç** çizilmez. Değer geldiği gün burada tek değişecek
          şey prop'un dolması.
        */}
        {latency ? (
          <span
            className="flex items-center font-semibold whitespace-nowrap"
            data-latency-tier={latency.tier}
            data-testid="server-voice-latency-chip"
            style={{
              background: "hsl(var(--surface-soft))",
              border: `${hairline()} solid hsl(var(--border)/${voiceHeader.latencyChipBorderAlpha})`,
              borderRadius: pxToRem(voiceHeader.latencyChipRadius),
              color: "hsl(var(--text-secondary))",
              fontFamily: DISPLAY_FONT,
              fontSize: pxToRem(voiceHeader.latencyChipFontSize),
              gap: pxToRem(voiceHeader.latencyChipGap),
              lineHeight: 1,
              padding: `${pxToRem(voiceHeader.latencyChipPaddingY)} ${pxToRem(
                voiceHeader.latencyChipPaddingX,
              )}`,
            }}
          >
            <span
              aria-hidden="true"
              className="flex items-end"
              style={{ gap: pxToRem(voiceHeader.latencyBarsGap) }}
            >
              {voiceHeader.latencyBarHeights.map((height, index) => (
                <span
                  key={height}
                  style={{
                    background: index < litBars ? "hsl(var(--success))" : "hsl(var(--border))",
                    borderRadius: pxToRem(voiceHeader.latencyBarRadius),
                    display: "block",
                    height: pxToRem(height),
                    width: pxToRem(voiceHeader.latencyBarWidth),
                  }}
                />
              ))}
            </span>
            <span className="sr-only md:not-sr-only">
              {latency.ms === null
                ? t(`server.voice.latency.${latency.tier}`)
                : t("server.voice.header.latency", {
                    ms: latency.ms,
                    quality: t(`server.voice.latency.${latency.tier}`),
                  })}
            </span>
          </span>
        ) : null}

        <span
          aria-hidden="true"
          className="flex-none"
          style={{
            background: "hsl(var(--border))",
            height: pxToRem(textHeader.dividerHeight),
            marginInline: pxToRem(textHeader.dividerMarginX),
            width: hairline(textHeader.dividerWidth),
          }}
        />

        <button
          aria-pressed={membersActive}
          className="flex cursor-pointer items-center border-0 font-semibold whitespace-nowrap transition-colors hover:bg-[hsl(var(--surface-soft))] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
          data-testid="server-voice-members"
          onClick={onOpenMembers}
          style={{
            background: membersActive
              ? `hsl(var(--primary)/${textHeader.actionActiveBackgroundAlpha})`
              : "transparent",
            borderRadius: pxToRem(textHeader.membersButtonRadius),
            color: membersActive ? "hsl(var(--primary))" : "hsl(var(--text-secondary))",
            fontFamily: DISPLAY_FONT,
            fontSize: pxToRem(textHeader.membersButtonFontSize),
            gap: pxToRem(textHeader.membersButtonGap),
            height: pxToRem(textHeader.membersButtonHeight),
            lineHeight: 1,
            padding: `0 ${pxToRem(textHeader.membersButtonPaddingX)}`,
          }}
          type="button"
        >
          <Glyph
            base={textHeader.membersButtonFontSize}
            path={USERS_PATH}
            size={textHeader.actionIconSize}
          />
          <span className="sr-only md:not-sr-only">{t("server.channel.header.members")}</span>
        </button>
      </div>
    </header>
  );
}

/* ------------------------------------------------------------ §5.2 katılımcı kartı */

export type ServerVoiceTileProps = {
  /** Gerçek kamera akışı; `null` iken **boş `<video>` mount edilmez** (PROMPT §11). */
  readonly fill?: boolean;
  readonly cameraSlot: React.ReactNode | null;
  readonly participant: VoiceParticipantViewModel;
  readonly roleBadge: "admin" | "owner" | null;
  /**
   * Katılımcı başına yerel ses düzeyi. SPEC §5.2 kartın **durağan** hâlinde böyle bir kontrol
   * çizmiyor; kaldırmak ise sessiz bir yetenek kaybı olurdu (kablolama `voice-store`da ve
   * K5 gereği duruyor). Çözüm: kontrol yalnız **hover/odak** anında beliriyor — kartın
   * durağan kompozisyonu SPEC'teki gibi kalıyor, yetenek klavyeyle de erişilebilir kalıyor.
   * Yerel katılımcıda verilmez (kendi sesini kısmak anlamsız).
   */
  readonly volume?: {
    readonly onReset: () => void;
    readonly onSet: (value: number) => void;
    readonly value: number;
  };
};

export function ServerVoiceTile({
  fill = false,
  cameraSlot,
  participant,
  roleBadge,
  volume,
}: ServerVoiceTileProps) {
  const { t } = useI18n();
  const displayName = participant.displayName ?? participant.username;
  const status = selectVoiceTileStatus(participant);
  const speaking = status === "speaking";
  const showStatusBadge = participant.isMuted || participant.isDeafened;
  const cameraVariant = participant.isCameraEnabled;

  const cardStyle: React.CSSProperties = {
    aspectRatio: fill ? undefined : `${voiceGrid.cardAspectWidth} / ${voiceGrid.cardAspectHeight}`,
    height: fill ? "100%" : undefined,
    width: fill ? "100%" : undefined,
    background: cameraVariant
      ? stripeBackground(
          voiceGrid.cameraStripeSize,
          voiceGrid.cameraStripeCycle,
          voiceGrid.cameraStripeAlpha,
        )
      : "hsl(var(--surface-card))",
    borderColor: speaking
      ? `hsl(var(--success)/${voiceGrid.cardSpeakingBorderAlpha})`
      : "hsl(var(--border))",
    borderRadius: pxToRem(voiceGrid.cardRadius),
    borderStyle: "solid",
    borderWidth: pxToRem(voiceGrid.cardBorderWidth),
    boxShadow: speaking
      ? `0 0 0 ${pxToRem(voiceGrid.cardSpeakingGlowSpread)} hsl(var(--success)/${voiceGrid.cardSpeakingGlowAlpha}), ${pxToRem(voiceGrid.cardShadow.x)} ${pxToRem(voiceGrid.cardShadow.y)} ${pxToRem(voiceGrid.cardShadow.blur)} ${pxToRem(voiceGrid.cardShadow.spread)} hsl(var(--shadow-color))`
      : undefined,
  };

  return (
    <article
      className="group/tile relative flex min-w-0 flex-col items-center justify-center overflow-hidden"
      data-camera={cameraVariant ? "true" : "false"}
      data-speaking={speaking ? "true" : "false"}
      data-testid="server-voice-tile"
      data-user-id={participant.userId}
      style={cardStyle}
    >
      {/*
        §12 — "konuşma halkası tek görsel ipucu olamaz". Ekran okuyucu cümleyi her durumda
        okur; halka ve dalga onun görsel karşılığı.
      */}
      <span className="sr-only" data-testid="server-voice-tile-status">
        {t(`server.voice.tile.${status}`, { name: displayName })}
      </span>

      {participant.isLocal ? (
        <span
          className="absolute font-semibold uppercase"
          data-testid="server-voice-self-chip"
          style={{
            background: `hsl(var(--primary)/${voiceGrid.selfChipBackgroundAlpha})`,
            borderRadius: pxToRem(voiceGrid.selfChipRadius),
            color: "hsl(var(--primary))",
            fontFamily: DISPLAY_FONT,
            fontSize: pxToRem(voiceGrid.selfChipFontSize),
            left: pxToRem(voiceGrid.selfChipInset),
            lineHeight: 1,
            padding: `${pxToRem(voiceGrid.selfChipPaddingY)} ${pxToRem(voiceGrid.selfChipPaddingX)}`,
            top: pxToRem(voiceGrid.selfChipInset),
          }}
        >
          {t("server.voice.tile.you")}
        </span>
      ) : null}

      {showStatusBadge ? (
        <span
          aria-hidden="true"
          className="absolute grid place-items-center"
          data-testid="server-voice-status-badge"
          style={{
            background: `hsl(var(--danger)/${voiceGrid.statusBadgeBackgroundAlpha})`,
            borderRadius: pxToRem(voiceGrid.statusBadgeRadius),
            color: "hsl(var(--danger))",
            height: pxToRem(voiceGrid.statusBadgeSize),
            right: pxToRem(voiceGrid.statusBadgeInset),
            top: pxToRem(voiceGrid.statusBadgeInset),
            width: pxToRem(voiceGrid.statusBadgeSize),
          }}
        >
          <Glyph path={participant.isDeafened ? SPEAKER_OFF_PATH : MIC_OFF_PATH} size={14} />
        </span>
      ) : null}

      {volume ? (
        <span
          className="absolute inset-x-0 bottom-0 flex translate-y-full items-center opacity-0 transition group-hover/tile:translate-y-0 group-hover/tile:opacity-100 group-focus-within/tile:translate-y-0 group-focus-within/tile:opacity-100 motion-reduce:transition-none"
          data-testid="server-voice-tile-volume"
          style={{
            background: `hsl(var(--surface-card)/${voiceGrid.cameraBadgeBackgroundAlpha})`,
            gap: pxToRem(voiceGrid.nameRowGap),
            padding: `${pxToRem(voiceGrid.cameraBadgePaddingY)} ${pxToRem(
              voiceGrid.cameraBadgePaddingX,
            )}`,
          }}
        >
          <input
            aria-label={t("voice.grid.remoteVolume")}
            className="h-1 min-w-0 flex-1 cursor-pointer appearance-none rounded-full bg-[hsl(var(--surface-soft))] accent-[hsl(var(--primary))]"
            max={100}
            min={0}
            onChange={(event) => volume.onSet(Number(event.target.value))}
            step={5}
            type="range"
            value={volume.value}
          />
          <button
            aria-label={t("voice.grid.resetVolume")}
            className="flex-none cursor-pointer border-0 bg-transparent text-[hsl(var(--text-muted))] transition-colors hover:text-[hsl(var(--foreground))] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
            data-testid="server-voice-tile-volume-reset"
            onClick={volume.onReset}
            style={{ fontSize: pxToRem(voiceGrid.statusFontSize), lineHeight: 1 }}
            type="button"
          >
            {volume.value}%
          </button>
        </span>
      ) : null}

      {cameraVariant ? (
        <>
          {/* Akış varsa gerçek `<video>`; yoksa yalnız yer tutucu — boş `<video>` mount edilmez. */}
          {cameraSlot ? (
            <div className="absolute inset-0" data-testid="server-voice-camera-slot">
              {cameraSlot}
            </div>
          ) : (
            <div
              className="flex flex-col items-center text-[hsl(var(--text-muted))]"
              data-testid="server-voice-camera-placeholder"
              style={{ gap: pxToRem(voiceGrid.cameraContentGap) }}
            >
              <Glyph path={CAMERA_PATH} size={voiceGrid.avatarFontSize + 8} />
              <span style={{ fontSize: pxToRem(voiceGrid.cameraLabelFontSize), lineHeight: 1 }}>
                {t("server.voice.tile.cameraPlaceholder")}
              </span>
            </div>
          )}

          <span
            className="absolute flex items-center"
            data-testid="server-voice-camera-badge"
            style={{
              background: `hsl(var(--surface-card)/${voiceGrid.cameraBadgeBackgroundAlpha})`,
              border: `${hairline()} solid hsl(var(--border)/${voiceGrid.cameraBadgeBorderAlpha})`,
              borderRadius: pxToRem(voiceGrid.cameraBadgeRadius),
              bottom: pxToRem(voiceGrid.cameraBadgeBottom),
              color: "hsl(var(--foreground))",
              fontFamily: DISPLAY_FONT,
              fontSize: pxToRem(voiceGrid.cameraBadgeNameFontSize),
              gap: pxToRem(voiceGrid.cameraBadgeGap),
              left: pxToRem(voiceGrid.cameraBadgeLeft),
              lineHeight: 1.4,
              padding: `${pxToRem(voiceGrid.cameraBadgePaddingY)} ${pxToRem(
                voiceGrid.cameraBadgePaddingX,
              )}`,
            }}
          >
            <span className="max-w-[10ch] truncate" data-testid="server-voice-tile-name">
              {displayName}
            </span>
            {speaking ? <SpeakingWave compact /> : null}
          </span>
        </>
      ) : (
        <div
          className="flex min-w-0 flex-col items-center"
          style={{ gap: pxToRem(voiceGrid.cardContentGap) }}
        >
          <span
            className="grid place-items-center"
            style={{
              borderRadius: "50%",
              boxShadow: speaking
                ? `0 0 0 ${pxToRem(Math.abs(voiceGrid.avatarRingInset))} hsl(var(--success)/${voiceGrid.avatarRingAlpha})`
                : undefined,
            }}
          >
            <Avatar
              alt={displayName}
              className="border-0"
              fallback={displayName}
              src={participant.avatarUrl}
              style={{
                fontFamily: DISPLAY_FONT,
                fontSize: pxToRem(voiceGrid.avatarFontSize),
                height: pxToRem(voiceGrid.avatarSize),
                width: pxToRem(voiceGrid.avatarSize),
              }}
            />
          </span>

          <div
            className="flex min-w-0 items-center justify-center"
            style={{
              gap: pxToRem(voiceGrid.nameRowGap),
              paddingInline: pxToRem(voiceGrid.nameRowPaddingX),
            }}
          >
            <span
              className="min-w-0 truncate font-semibold text-[hsl(var(--foreground))]"
              data-testid="server-voice-tile-name"
              style={{
                fontSize: pxToRem(voiceGrid.nameFontSize),
                lineHeight: 1.4,
              }}
            >
              {displayName}
            </span>
            {roleBadge ? (
              <span
                className="flex-none font-semibold uppercase whitespace-nowrap"
                data-testid={`server-voice-role-${roleBadge}`}
                style={{
                  background: `hsl(var(--${roleBadge === "owner" ? "primary" : "danger"})/0.16)`,
                  borderRadius: pxToRem(voiceGrid.roleChipRadius),
                  color: `hsl(var(--${roleBadge === "owner" ? "primary" : "danger"}))`,
                  fontFamily: DISPLAY_FONT,
                  fontSize: pxToRem(voiceGrid.roleChipFontSize),
                  lineHeight: 1,
                  padding: `${pxToRem(voiceGrid.roleChipPaddingY)} ${pxToRem(
                    voiceGrid.roleChipPaddingX,
                  )}`,
                }}
              >
                {t(`server.voice.tile.role.${roleBadge}`)}
              </span>
            ) : null}
          </div>

          {speaking ? (
            <SpeakingWave />
          ) : (
            <span
              aria-hidden="true"
              className="text-[hsl(var(--text-muted))]"
              data-testid="server-voice-tile-status-text"
              style={{ fontSize: pxToRem(voiceGrid.statusFontSize), lineHeight: 1 }}
            >
              {t(`server.voice.tile.${status}Short`)}
            </span>
          )}
        </div>
      )}
    </article>
  );
}

/* ------------------------------------------------------------------ §5.2 ızgara */

export function ServerVoiceGrid({
  children,
  participantCount,
  layout = "fit",
  featuredIndex = 0,
}: {
  children: React.ReactNode;
  participantCount: number;
  layout?: VoiceLayout;
  featuredIndex?: number;
}) {
  const host = React.useRef<HTMLDivElement>(null);
  const [size, setSize] = React.useState<{ width: number; height: number; gap: number }>({
    width: 960,
    height: 600,
    gap: voiceGrid.gap,
  });
  React.useLayoutEffect(() => {
    const node = host.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry || entry.contentRect.width <= 0 || entry.contentRect.height <= 0) return;
      const { width, height } = entry.contentRect;
      const gap = Number.parseFloat(getComputedStyle(node).rowGap) || voiceGrid.gap;
      setSize((previous) =>
        previous.width === width && previous.height === height && previous.gap === gap
          ? previous
          : { width, height, gap },
      );
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const grid = calculateVoiceGrid(
    participantCount,
    size.width,
    size.height,
    layout === "compact",
    size.gap,
  );
  const speaker = layout === "speaker" && participantCount > 1;
  const rows = Math.max(1, participantCount - 1);
  const stacked = speaker && size.width < 600;
  const featured = Math.max(0, Math.min(participantCount - 1, featuredIndex));
  return (
    <div
      ref={host}
      className="grid min-h-0 w-full flex-1 overflow-auto"
      data-columns={speaker ? (stacked ? 1 : 2) : grid.columns}
      data-layout={layout}
      data-testid="server-voice-grid"
      style={{
        alignContent: layout === "compact" || speaker ? "start" : "center",
        justifyContent: layout === "compact" ? "start" : "center",
        gap: pxToRem(voiceGrid.gap),
        gridTemplateColumns: speaker
          ? stacked
            ? "minmax(0, 1fr)"
            : "minmax(0, 3fr) minmax(0, 1fr)"
          : `repeat(${grid.columns}, ${grid.tileWidth}px)`,
        gridTemplateRows: speaker
          ? stacked
            ? `${Math.max(180, size.height * 0.6)}px repeat(${rows}, 150px)`
            : `repeat(${rows}, minmax(96px, 1fr))`
          : `repeat(${grid.rows}, ${grid.tileHeight}px)`,
        padding: `${pxToRem(voiceGrid.paddingTop)} ${pxToRem(voiceGrid.paddingX)} ${pxToRem(voiceGrid.paddingBottom)}`,
      }}
    >
      {React.Children.map(children, (child, index) => {
        const primary = speaker && index === featured;
        const secondaryRow = index < featured ? index + 1 : index;
        return (
          <div
            className="min-h-0 min-w-0"
            data-featured={primary || undefined}
            style={
              speaker
                ? {
                    gridColumn: stacked ? 1 : primary ? 1 : 2,
                    gridRow: primary
                      ? stacked
                        ? "1"
                        : `1 / span ${rows}`
                      : String(secondaryRow + (stacked ? 1 : 0)),
                  }
                : undefined
            }
          >
            {child}
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------- §5.3 ekran paylaşımı sahnesi */

export type ServerScreenShareStageProps = {
  readonly stream?: ScreenShareStreamInfo | null | undefined;
  readonly viewerCount?: number;
  readonly isLocalShare?: boolean;
  readonly cameraName?: string | undefined;
  readonly cameraSlot?: React.ReactNode | null | undefined;
  readonly fps: number | null;
  readonly onToggleFullscreen: () => void;
  readonly qualityControl?:
    | {
        readonly disabled: boolean;
        readonly onChange: (id: string) => void;
        readonly options: readonly { readonly id: string; readonly label: string }[];
        readonly selectedId: string;
      }
    | undefined;
  readonly resolutionLabel: string | null;
  readonly sharerAvatarUrl: string | null;
  readonly sharerName: string;
  readonly stageRef?: React.RefObject<HTMLDivElement | null>;
  readonly strip: React.ReactNode;
  /** Gerçek akış; `null` iken yer tutucu çizilir ve boş `<video>` mount edilmez. */
  readonly videoSlot: React.ReactNode | null;
};

export function ServerScreenShareStage({
  stream,
  viewerCount = 0,
  isLocalShare = false,
  cameraName,
  cameraSlot,
  fps,
  onToggleFullscreen,
  qualityControl,
  resolutionLabel,
  sharerAvatarUrl,
  sharerName,
  stageRef,
  strip,
  videoSlot,
}: ServerScreenShareStageProps) {
  const { t } = useI18n();
  const [qualityOpen, setQualityOpen] = React.useState(false);
  const qualityLabelId = React.useId();
  const qualityIndex = qualityControl
    ? Math.max(
        0,
        qualityControl.options.findIndex((option) => option.id === qualityControl.selectedId),
      )
    : 0;
  const metaLabel =
    resolutionLabel && fps
      ? t("server.voice.share.meta", { fps, resolution: resolutionLabel })
      : resolutionLabel;

  return (
    <div
      className="flex min-h-0 flex-1 flex-col"
      data-testid="server-voice-share"
      style={{
        gap: pxToRem(screenShare.stageGap),
        padding: `${pxToRem(screenShare.paddingTop)} ${pxToRem(screenShare.paddingX)} ${pxToRem(
          screenShare.paddingBottom,
        )}`,
      }}
    >
      <div
        className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden"
        data-testid="server-voice-share-stage"
        ref={stageRef}
        style={{
          background: stripeBackground(
            screenShare.stageStripeSize,
            screenShare.stageStripeCycle,
            screenShare.stageStripeAlpha,
          ),
          border: `${pxToRem(screenShare.stageBorderWidth)} solid hsl(var(--primary)/${screenShare.stageBorderAlpha})`,
          borderRadius: pxToRem(screenShare.stageRadius),
          boxShadow: `${pxToRem(screenShare.stageShadow.x)} ${pxToRem(screenShare.stageShadow.y)} ${pxToRem(screenShare.stageShadow.blur)} ${pxToRem(screenShare.stageShadow.spread)} hsl(var(--shadow-color))`,
        }}
      >
        {videoSlot ? (
          <div className="absolute inset-0">{videoSlot}</div>
        ) : (
          <span
            className="flex flex-col items-center text-[hsl(var(--text-muted))]"
            data-testid="server-voice-share-placeholder"
            style={{
              fontSize: pxToRem(screenShare.stageLabelFontSize),
              gap: pxToRem(screenShare.stageContentGap),
            }}
          >
            <Glyph base={screenShare.stageLabelFontSize} path={MONITOR_PATH} size={26} />
            {t("server.voice.share.placeholder")}
          </span>
        )}

        {cameraSlot ? (
          <div
            aria-label={cameraName}
            className="absolute z-10 overflow-hidden bg-black shadow-[0_18px_48px_hsl(var(--shadow-color)/0.28)]"
            data-testid="server-voice-share-camera-pip"
            style={{
              aspectRatio: "16 / 9",
              border: `${hairline()} solid hsl(var(--border)/${screenShare.cameraPipBorderAlpha})`,
              borderRadius: pxToRem(screenShare.cameraPipRadius),
              bottom: pxToRem(screenShare.cameraPipInset),
              right: pxToRem(screenShare.cameraPipInset),
              width: pxToRem(screenShare.cameraPipWidth),
            }}
          >
            <div className="absolute inset-0">{cameraSlot}</div>
            {cameraName ? (
              <span
                className="absolute inset-x-0 bottom-0 truncate bg-linear-to-t from-black/80 to-transparent font-semibold text-white"
                style={{
                  fontSize: pxToRem(screenShare.cameraPipLabelFontSize),
                  padding: `${pxToRem(screenShare.cameraPipLabelPaddingY)} ${pxToRem(
                    screenShare.cameraPipLabelPaddingX,
                  )}`,
                }}
              >
                {cameraName}
              </span>
            ) : null}
          </div>
        ) : null}

        <span
          className="absolute flex items-center"
          data-testid="server-voice-share-presenter"
          style={{
            background: `hsl(var(--surface-card)/${screenShare.presenterBackgroundAlpha})`,
            border: `${hairline()} solid hsl(var(--border)/${screenShare.presenterBorderAlpha})`,
            borderRadius: pxToRem(screenShare.presenterRadius),
            gap: pxToRem(screenShare.presenterGap),
            left: pxToRem(screenShare.presenterInset),
            padding: `${pxToRem(screenShare.presenterPaddingY)} ${pxToRem(
              screenShare.presenterPaddingX,
            )}`,
            top: pxToRem(screenShare.presenterInset),
          }}
        >
          <Avatar
            alt={sharerName}
            className="border-0"
            fallback={sharerName}
            src={sharerAvatarUrl}
            style={{
              fontFamily: DISPLAY_FONT,
              fontSize: pxToRem(screenShare.presenterAvatarFontSize),
              height: pxToRem(screenShare.presenterAvatarSize),
              width: pxToRem(screenShare.presenterAvatarSize),
            }}
          />
          <span
            className="truncate font-semibold text-[hsl(var(--foreground))]"
            style={{
              fontFamily: DISPLAY_FONT,
              fontSize: pxToRem(screenShare.presenterNameFontSize),
              lineHeight: 1.4,
            }}
          >
            {screenSharePresenterLabel(stream, sharerName, t)}
          </span>
          <span
            className="flex-none font-semibold uppercase"
            data-testid="server-voice-share-live"
            style={{
              background: `hsl(var(--danger)/${screenShare.liveChipBackgroundAlpha})`,
              borderRadius: pxToRem(screenShare.liveChipRadius),
              color: "hsl(var(--danger))",
              fontFamily: DISPLAY_FONT,
              fontSize: pxToRem(screenShare.liveChipFontSize),
              lineHeight: 1,
              padding: `${pxToRem(screenShare.liveChipPaddingY)} ${pxToRem(
                screenShare.liveChipPaddingX,
              )}`,
            }}
          >
            {t("server.voice.share.live")}
          </span>
          {(viewerCount > 0 || isLocalShare) && (
            <span data-testid="voice-stage-viewer-count">
              {t(
                viewerCount ? "voice.screenShare.viewers.count" : "voice.screenShare.viewers.none",
                { count: viewerCount },
              )}
            </span>
          )}
        </span>

        <span
          className="absolute flex items-center"
          style={{
            gap: pxToRem(screenShare.metaGap),
            right: pxToRem(screenShare.metaInset),
            top: pxToRem(screenShare.metaInset),
          }}
        >
          {qualityControl && qualityControl.options.length > 0 ? (
            <>
              <span className="sr-only" id={qualityLabelId}>
                {t("voice.screenShare.quality.title")}
              </span>
              <SettingSelect
                disabled={qualityControl.disabled}
                labelledById={qualityLabelId}
                onChange={(index) => {
                  const selected = qualityControl.options[index];
                  if (selected) {
                    qualityControl.onChange(selected.id);
                  }
                }}
                onOpenChange={setQualityOpen}
                open={qualityOpen}
                options={qualityControl.options.map((option) => ({ label: option.label }))}
                testId="server-voice-share-quality"
                value={qualityIndex}
                width={screenShare.qualitySelectWidth}
              />
            </>
          ) : metaLabel ? (
            <span
              className="font-semibold whitespace-nowrap"
              data-testid="server-voice-share-meta"
              style={{
                background: `hsl(var(--surface-card)/${screenShare.presenterBackgroundAlpha})`,
                border: `${hairline()} solid hsl(var(--border)/${screenShare.presenterBorderAlpha})`,
                borderRadius: pxToRem(screenShare.metaChipRadius),
                color: "hsl(var(--text-secondary))",
                fontFamily: DISPLAY_FONT,
                fontSize: pxToRem(screenShare.metaChipFontSize),
                lineHeight: 1,
                padding: `${pxToRem(screenShare.metaChipPaddingY)} ${pxToRem(
                  screenShare.metaChipPaddingX,
                )}`,
              }}
            >
              {metaLabel}
            </span>
          ) : null}
          <button
            aria-label={t("server.voice.share.fullscreen")}
            className="grid cursor-pointer place-items-center transition-colors hover:bg-[hsl(var(--surface-soft))] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
            data-testid="server-voice-share-fullscreen"
            onClick={onToggleFullscreen}
            style={{
              background: `hsl(var(--surface-card)/${screenShare.presenterBackgroundAlpha})`,
              border: `${hairline()} solid hsl(var(--border)/${screenShare.presenterBorderAlpha})`,
              borderRadius: pxToRem(screenShare.fullscreenRadius),
              color: "hsl(var(--text-secondary))",
              height: pxToRem(screenShare.fullscreenSize),
              width: pxToRem(screenShare.fullscreenSize),
            }}
            type="button"
          >
            <Glyph path={FULLSCREEN_PATH} size={15} />
          </button>
        </span>
      </div>

      <div
        className="flex flex-none overflow-x-auto"
        data-testid="server-voice-share-strip"
        style={{
          gap: pxToRem(screenShare.stripGap),
          paddingBottom: pxToRem(screenShare.stripPaddingBottom),
        }}
      >
        {strip}
      </div>
    </div>
  );
}

/** §5.3 altındaki yatay şeridin kartı — 162 genişlik, konuşanda success çerçeve + glow. */
export function ServerScreenShareStripCard({
  participant,
}: {
  participant: VoiceParticipantViewModel;
}) {
  const { t } = useI18n();
  const displayName = participant.displayName ?? participant.username;
  const speaking = participant.isSpeaking;

  return (
    <span
      className="flex flex-none items-center"
      data-speaking={speaking ? "true" : "false"}
      data-testid="server-voice-strip-card"
      style={{
        background: "hsl(var(--surface-card))",
        borderColor: speaking
          ? `hsl(var(--success)/${voiceGrid.cardSpeakingBorderAlpha})`
          : "hsl(var(--border))",
        borderRadius: pxToRem(screenShare.stripCardRadius),
        borderStyle: "solid",
        borderWidth: pxToRem(screenShare.stripCardBorderWidth),
        boxShadow: speaking
          ? `0 0 0 ${pxToRem(voiceGrid.cardSpeakingGlowSpread)} hsl(var(--success)/${voiceGrid.cardSpeakingGlowAlpha})`
          : undefined,
        gap: pxToRem(screenShare.stripCardGap),
        padding: `${pxToRem(screenShare.stripCardPaddingY)} ${pxToRem(
          screenShare.stripCardPaddingX,
        )}`,
        width: pxToRem(screenShare.stripCardWidth),
      }}
    >
      <Avatar
        alt={displayName}
        className="border-0 flex-none"
        fallback={displayName}
        src={participant.avatarUrl}
        style={{
          fontFamily: DISPLAY_FONT,
          fontSize: pxToRem(screenShare.stripAvatarFontSize),
          height: pxToRem(screenShare.stripAvatarSize),
          width: pxToRem(screenShare.stripAvatarSize),
        }}
      />
      <span
        className="min-w-0 flex-1 truncate font-semibold text-[hsl(var(--foreground))]"
        style={{ fontSize: pxToRem(screenShare.stripNameFontSize), lineHeight: 1.4 }}
      >
        {displayName}
      </span>
      {speaking ? (
        <>
          <SpeakingWave compact />
          <span className="sr-only">{t("server.voice.tile.speaking", { name: displayName })}</span>
        </>
      ) : null}
    </span>
  );
}

/* ------------------------------------------------------------ §5.4 kontrol çubuğu */

type ControlTone = "danger" | "neutral" | "primary";

function controlButtonStyle(tone: ControlTone): React.CSSProperties {
  const token = tone === "neutral" ? "--border" : tone === "danger" ? "--danger" : "--primary";

  return {
    background: tone === "neutral" ? "hsl(var(--surface-card))" : `hsl(var(${token})/0.14)`,
    border: `${pxToRem(voiceControls.buttonBorderWidth)} solid ${
      tone === "neutral" ? "hsl(var(--border))" : `hsl(var(${token})/0.4)`
    }`,
    borderRadius: pxToRem(voiceControls.buttonRadius),
    color: tone === "neutral" ? "hsl(var(--text-secondary))" : `hsl(var(${token}))`,
    fontFamily: DISPLAY_FONT,
    fontSize: pxToRem(voiceControls.buttonFontSize),
    gap: pxToRem(voiceControls.buttonGap),
    height: pxToRem(voiceControls.buttonHeight),
    lineHeight: 1,
    padding: `0 ${pxToRem(voiceControls.buttonPaddingX)}`,
  };
}

function ControlButton({
  disabled,
  glyph,
  label,
  onClick,
  pressed,
  testId,
  tone,
}: {
  disabled?: boolean;
  glyph: string;
  label: string;
  onClick: () => void;
  pressed: boolean;
  testId: string;
  tone: ControlTone;
}) {
  return (
    <button
      aria-label={label}
      aria-pressed={pressed}
      className="flex cursor-pointer items-center font-semibold whitespace-nowrap transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)] disabled:cursor-not-allowed disabled:opacity-55"
      data-testid={testId}
      data-tone={tone}
      disabled={disabled}
      onClick={onClick}
      style={controlButtonStyle(tone)}
      type="button"
    >
      <Glyph base={voiceControls.buttonFontSize} path={glyph} size={17} />
      {label}
    </button>
  );
}

export type ServerVoiceControlsProps = {
  readonly cameraBusy: boolean;
  readonly isCameraEnabled: boolean;
  readonly isDeafened: boolean;
  readonly isMuted: boolean;
  readonly isScreenSharing: boolean;
  readonly onLeave: () => void;
  readonly onToggleCamera: () => void;
  readonly onToggleDeafen: () => void;
  readonly onToggleMute: () => void;
  readonly onToggleScreenShare: () => void;
};

export function ServerVoiceControls({
  cameraBusy,
  isCameraEnabled,
  isDeafened,
  isMuted,
  isScreenSharing,
  onLeave,
  onToggleCamera,
  onToggleDeafen,
  onToggleMute,
  onToggleScreenShare,
}: ServerVoiceControlsProps) {
  const { t } = useI18n();

  return (
    <div
      className="flex flex-none flex-wrap items-center justify-center"
      data-testid="server-voice-controls"
      style={{
        gap: pxToRem(voiceControls.gap),
        padding: `${pxToRem(voiceControls.paddingTop)} ${pxToRem(voiceControls.paddingX)} ${pxToRem(
          voiceControls.paddingBottom,
        )}`,
      }}
    >
      <ControlButton
        glyph={isMuted ? MIC_OFF_PATH : MIC_PATH}
        label={isMuted ? t("server.voice.controls.unmute") : t("server.voice.controls.mute")}
        onClick={onToggleMute}
        pressed={isMuted}
        testId="server-voice-control-mic"
        tone={isMuted ? "danger" : "neutral"}
      />
      <ControlButton
        glyph={isDeafened ? SPEAKER_OFF_PATH : SPEAKER_PATH}
        label={isDeafened ? t("server.voice.controls.undeafen") : t("server.voice.controls.deafen")}
        onClick={onToggleDeafen}
        pressed={isDeafened}
        testId="server-voice-control-speaker"
        tone={isDeafened ? "danger" : "neutral"}
      />
      <ControlButton
        glyph={MONITOR_PATH}
        label={
          isScreenSharing ? t("server.voice.controls.stopShare") : t("server.voice.controls.share")
        }
        onClick={onToggleScreenShare}
        pressed={isScreenSharing}
        testId="server-voice-control-share"
        tone={isScreenSharing ? "primary" : "neutral"}
      />
      <ControlButton
        disabled={cameraBusy}
        glyph={isCameraEnabled ? VIDEO_OFF_PATH : CAMERA_PATH}
        label={
          isCameraEnabled
            ? t("server.voice.controls.stopCamera")
            : t("server.voice.controls.camera")
        }
        onClick={onToggleCamera}
        pressed={isCameraEnabled}
        testId="server-voice-control-camera"
        tone={isCameraEnabled ? "primary" : "neutral"}
      />

      <Link
        aria-label={t("server.voice.controls.settings")}
        className="grid cursor-pointer place-items-center transition-colors hover:bg-[hsl(var(--surface-soft))] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
        data-testid="server-voice-control-settings"
        href={buildSettingsHref("av", "audio")}
        prefetch={true}
        style={{
          background: "hsl(var(--surface-card))",
          border: `${pxToRem(voiceControls.buttonBorderWidth)} solid hsl(var(--border))`,
          borderRadius: pxToRem(voiceControls.settingsRadius),
          color: "hsl(var(--text-secondary))",
          height: pxToRem(voiceControls.settingsSize),
          width: pxToRem(voiceControls.settingsSize),
        }}
      >
        <Glyph path={SETTINGS_PATH} size={18} />
      </Link>

      <span
        aria-hidden="true"
        className="flex-none"
        style={{
          background: "hsl(var(--border))",
          height: pxToRem(voiceControls.dividerHeight),
          marginInline: pxToRem(voiceControls.dividerMarginX),
          width: hairline(voiceControls.dividerWidth),
        }}
      />

      <button
        className="flex cursor-pointer items-center border-0 font-semibold whitespace-nowrap transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
        data-testid="server-voice-control-leave"
        onClick={onLeave}
        style={{
          background: "hsl(var(--danger))",
          borderRadius: pxToRem(voiceControls.leaveRadius),
          boxShadow: `${pxToRem(voiceControls.leaveShadow.x)} ${pxToRem(voiceControls.leaveShadow.y)} ${pxToRem(voiceControls.leaveShadow.blur)} ${pxToRem(voiceControls.leaveShadow.spread)} hsl(var(--danger))`,
          color: "hsl(var(--danger-foreground))",
          fontFamily: DISPLAY_FONT,
          fontSize: pxToRem(voiceControls.leaveFontSize),
          gap: pxToRem(voiceControls.leaveGap),
          height: pxToRem(voiceControls.leaveHeight),
          lineHeight: 1,
          padding: `0 ${pxToRem(voiceControls.leavePaddingX)}`,
        }}
        type="button"
      >
        <Glyph base={voiceControls.leaveFontSize} path={LEAVE_PATH} size={16} />
        {t("server.voice.controls.leave")}
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------- §6 boş durum */

export function ServerVoiceEmptyState() {
  const { t } = useI18n();

  return (
    <div
      className="flex min-h-0 flex-1 flex-col items-center justify-center text-center"
      data-testid="server-voice-empty"
      style={{
        gap: pxToRem(voiceGrid.cardContentGap),
        padding: `${pxToRem(voiceGrid.paddingTop)} ${pxToRem(voiceGrid.paddingX)}`,
      }}
    >
      <span
        className="grid place-items-center text-[hsl(var(--text-muted))]"
        style={{
          background: "hsl(var(--surface-card))",
          border: `${pxToRem(voiceGrid.cardBorderWidth)} dashed hsl(var(--border))`,
          borderRadius: pxToRem(voiceGrid.cardRadius),
          height: pxToRem(voiceGrid.avatarSize),
          width: pxToRem(voiceGrid.avatarSize),
        }}
      >
        <Glyph path={SPEAKER_PATH} size={26} />
      </span>
      <p
        className="font-semibold text-[hsl(var(--foreground))]"
        style={{
          fontFamily: DISPLAY_FONT,
          fontSize: pxToRem(voiceGrid.nameFontSize),
          lineHeight: 1.2,
        }}
      >
        {t("server.voice.empty.title")}
      </p>
      <p
        className="text-[hsl(var(--text-muted))]"
        style={{ fontSize: pxToRem(voiceGrid.statusFontSize), lineHeight: 1.4 }}
      >
        {t("server.voice.empty.description")}
      </p>
    </div>
  );
}

export function ServerVoiceDisconnectedState({ onReconnect }: { onReconnect: () => void }) {
  const { t } = useI18n();
  return (
    <div
      className="flex h-full items-center justify-center p-6"
      data-testid="voice-disconnected-state"
    >
      <section
        className="flex w-full max-w-sm flex-col items-center border bg-[hsl(var(--surface-card))] p-8 text-center"
        style={{
          borderColor: "hsl(var(--border))",
          borderRadius: pxToRem(voiceGrid.cardRadius),
          gap: pxToRem(voiceGrid.cardContentGap),
        }}
      >
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[hsl(var(--surface-soft))] text-[hsl(var(--text-muted))]">
          <Glyph path={SPEAKER_PATH} size={24} />
        </span>
        <h2
          className="font-semibold text-[hsl(var(--foreground))]"
          style={{
            fontFamily: DISPLAY_FONT,
            fontSize: pxToRem(18),
            letterSpacing: DISPLAY_TRACKING,
          }}
        >
          {t("voice.view.disconnectedTitle")}
        </h2>
        <p className="text-sm leading-relaxed text-[hsl(var(--text-muted))]">
          {t("voice.view.disconnectedDescription")}
        </p>
        <button
          className="mt-3 rounded-xl bg-[hsl(var(--primary))] px-4 py-2.5 text-sm font-semibold text-[hsl(var(--primary-foreground))] transition hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--primary))]"
          style={{ fontFamily: DISPLAY_FONT }}
          type="button"
          onClick={onReconnect}
        >
          {t("voice.view.reconnectAction")}
        </button>
      </section>
    </div>
  );
}
