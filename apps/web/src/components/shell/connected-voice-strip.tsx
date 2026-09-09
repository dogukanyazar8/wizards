"use client";

import React from "react";
import { PhoneOff } from "lucide-react";

import { useI18n } from "@/components/providers/locale-provider";
import { useVoiceActivitySets } from "@/components/shell/voice-activity";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import { SERVER_METRICS, hairline, pxToRem } from "@/lib/servers/metrics";

/**
 * Bağlı ses şeridi — SPEC-SUNUCU §2.5. Yalnız kullanıcı bir ses kanalındayken çizilir.
 *
 * Dört çubuklu gösterge **seviye** okur, animasyon çalıştırmaz: yükseklikler sözlükten
 * (`voiceStrip.barHeights`) sabit gelir, değişen tek şey kaç çubuğun dolu olduğu. Seviye
 * kaynağı yerel katılımcının `audioLevel`'i — `useVoiceAudioLevels`'in sağlayıcı içinde
 * doldurduğu alan. `prefers-reduced-motion` altında çubuk sayısı referansın durağan hâlinde
 * (üç dolu, biri sönük) donar; 00 §8 "dalga durur" diyor, "gösterge kaybolur" demiyor.
 *
 * Gecikme (`32 ms`) üründe **yok**: LiveKit odasının RTT'sini okuyan bir yüzey hiç yazılmamış
 * (`getStats` / `roundTripTime` deposun hiçbir yerinde geçmiyor). Değer `null` geldiğinde alt
 * satır yalnız sunucu adını taşır — uydurma bir sayı yazmaktansa satırı kısaltmak doğru.
 * `TODO(api)` raporda.
 */

/** `prefers-reduced-motion` altındaki durağan hâl — referansın çizdiği dolu çubuk sayısı. */
const REDUCED_MOTION_LIT_BARS = 3;

export function resolveVoiceStripLitBars(level: number, reducedMotion: boolean): number {
  if (reducedMotion) {
    return REDUCED_MOTION_LIT_BARS;
  }

  const bars = SERVER_METRICS.voiceStrip.barHeights.length;

  return Math.max(1, Math.min(bars, Math.ceil(level * bars)));
}

export type ConnectedVoiceStripProps = {
  channelName: string;
  /** Yerel katılımcının anlık ses seviyesi, 0–1. */
  level: number;
  /** Gecikme ms; ürün karşılığı yoksa `null` — bkz. dosya başlığı. */
  latencyMs: number | null;
  leaving?: boolean;
  onLeave: () => void;
  serverName: string;
};

export function ConnectedVoiceStrip({
  channelName,
  latencyMs,
  level,
  leaving = false,
  onLeave,
  serverName,
}: ConnectedVoiceStripProps) {
  const { t } = useI18n();
  const reducedMotion = usePrefersReducedMotion();
  const { voiceStrip } = SERVER_METRICS;
  const litBars = resolveVoiceStripLitBars(level, reducedMotion);
  const meta =
    latencyMs === null
      ? serverName
      : t("server.sidebar.voiceStrip.meta", { latency: latencyMs, server: serverName });

  return (
    <div
      data-testid="connected-voice-strip"
      style={{
        background: `hsl(var(--success) / ${voiceStrip.backgroundAlpha})`,
        border: `${hairline()} solid hsl(var(--success) / ${voiceStrip.borderAlpha})`,
        borderRadius: pxToRem(voiceStrip.radius),
        margin: `0 ${pxToRem(voiceStrip.marginX)} ${pxToRem(voiceStrip.marginBottom)}`,
        padding: `${pxToRem(voiceStrip.paddingY)} ${pxToRem(voiceStrip.paddingX)}`,
      }}
    >
      <div className="flex items-center" style={{ gap: pxToRem(voiceStrip.contentGap) }}>
        <span
          aria-hidden="true"
          className="flex flex-none items-end"
          style={{ gap: pxToRem(voiceStrip.barsGap), height: pxToRem(voiceStrip.barsHeight) }}
        >
          {voiceStrip.barHeights.map((barHeight, index) => (
            <span
              key={barHeight}
              style={{
                background:
                  index < litBars
                    ? "hsl(var(--success))"
                    : `hsl(var(--success) / ${voiceStrip.barIdleAlpha})`,
                borderRadius: pxToRem(voiceStrip.barRadius),
                height: pxToRem(barHeight),
                width: pxToRem(voiceStrip.barWidth),
              }}
            />
          ))}
        </span>

        <div className="min-w-0 flex-1">
          <div
            className="truncate"
            style={{
              color: "hsl(var(--success))",
              fontSize: pxToRem(voiceStrip.nameFontSize),
              fontWeight: 600,
              lineHeight: voiceStrip.nameLineHeight,
            }}
          >
            {channelName}
          </div>
          <div
            className="truncate"
            style={{
              color: "hsl(var(--text-muted))",
              fontSize: pxToRem(voiceStrip.metaFontSize),
              fontWeight: 500,
              lineHeight: 1,
              marginTop: pxToRem(voiceStrip.metaMarginTop),
            }}
          >
            {meta}
          </div>
        </div>

        <button
          aria-label={t("server.sidebar.voiceStrip.leave")}
          className="grid flex-none place-items-center transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)] disabled:cursor-not-allowed"
          data-testid="connected-voice-strip-leave"
          disabled={leaving}
          onClick={onLeave}
          style={{
            background: "hsl(var(--danger) / 0.14)",
            borderRadius: pxToRem(voiceStrip.leaveButtonRadius),
            color: "hsl(var(--danger))",
            height: pxToRem(voiceStrip.leaveButtonSize),
            width: pxToRem(voiceStrip.leaveButtonSize),
          }}
          title={t("server.sidebar.voiceStrip.leave")}
          type="button"
        >
          <PhoneOff
            aria-hidden="true"
            style={{
              height: pxToRem(voiceStrip.leaveIconSize),
              width: pxToRem(voiceStrip.leaveIconSize),
            }}
          />
        </button>
      </div>
    </div>
  );
}

/**
 * Şeridin canlı sürümü. Seviye aboneliği burada duruyor ki kenar çubuğunun gövdesi her ses
 * tikinde yeniden render olmasın (`voice-activity.tsx`'in gerekçesi).
 */
export function ConnectedVoiceStripLive(props: Omit<ConnectedVoiceStripProps, "level">) {
  const { localLevel } = useVoiceActivitySets();

  return <ConnectedVoiceStrip {...props} level={localLevel} />;
}
