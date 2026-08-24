"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { VOICE_MESSAGE_WAVEFORM_BUCKETS, formatVoiceDuration, parseWaveform } from "@wizards/types";

import { useI18n } from "@/components/providers/locale-provider";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import { MESSAGES_METRICS, pxToRem } from "@/lib/messages/metrics";

/**
 * Sesli mesaj oynatıcısı — karar #5.
 *
 * Dalga formu `Attachment.waveform` kolonundan gelir; boşsa düz çubuk çizilir.
 * Boş bir dalga formunu ekin kimliğinden türetilen sahte bir silüetle doldurmak
 * (mobilin bugüne kadar yaptığı) aynı uzunluktaki iki kaydı aynı gösterir ve
 * kullanıcıya "bu benim sesim" diye yanlış bir şey söyler.
 *
 * ## Tek seferde tek ses
 *
 * Modül seviyesinde tek bir "şu an çalan" kaydı var. İki sesli mesajın üst üste
 * çalması, ikisini de anlaşılmaz yapar ve kullanıcı hangisini durduracağını
 * bilemez.
 */

const { messageList } = MESSAGES_METRICS;

const WAVEFORM_HEIGHT = 26;
const WAVEFORM_MIN_BAR = 2;
/** `←`/`→` ile atlanan saniye. */
const SEEK_STEP_SECONDS = 5;

let currentlyPlaying: HTMLAudioElement | null = null;

function stopOthers(audio: HTMLAudioElement) {
  if (currentlyPlaying && currentlyPlaying !== audio) {
    currentlyPlaying.pause();
  }

  currentlyPlaying = audio;
}

export type VoiceMessagePlayerProps = {
  /** Sunucudan gelen kodlanmış dalga formu; boş olabilir. */
  waveform: string | null | undefined;
  /** Saniye cinsinden; ek kaydedilirken yazıldı. */
  durationSeconds: number | null | undefined;
  /** Tarama beklerken ya da engellenmişken null olur. */
  url: string | null;
};

export function VoiceMessagePlayer({ durationSeconds, url, waveform }: VoiceMessagePlayerProps) {
  const { t } = useI18n();
  const reducedMotion = usePrefersReducedMotion();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [positionSeconds, setPositionSeconds] = useState(0);

  const bars = useMemo(() => {
    const parsed = parseWaveform(waveform);

    // Boş dalga formu düz çubuk: dürüst olan bu. Şekil uydurmak, iki farklı
    // kaydı aynı gösterirdi.
    return parsed.length > 0
      ? parsed
      : Array.from({ length: VOICE_MESSAGE_WAVEFORM_BUCKETS }, () => 0);
  }, [waveform]);

  const totalSeconds = durationSeconds && durationSeconds > 0 ? durationSeconds : 0;
  const progress = totalSeconds > 0 ? Math.min(1, positionSeconds / totalSeconds) : 0;

  useEffect(() => {
    // `audioRef.current` temizlik çalışırken başka bir düğümü gösteriyor
    // olabilir; efektin içinde kopyalanan değer, kurulduğu andaki düğümdür ve
    // durdurulması gereken de odur.
    const audio = audioRef.current;

    return () => {
      if (!audio) {
        return;
      }

      audio.pause();

      if (currentlyPlaying === audio) {
        currentlyPlaying = null;
      }
    };
  }, []);

  const toggle = useCallback(() => {
    const audio = audioRef.current;

    if (!audio || !url) {
      return;
    }

    if (audio.paused) {
      stopOthers(audio);
      void audio.play().catch(() => setPlaying(false));
      return;
    }

    audio.pause();
  }, [url]);

  const seekBy = useCallback((seconds: number) => {
    const audio = audioRef.current;

    if (!audio) {
      return;
    }

    const limit = Number.isFinite(audio.duration) ? audio.duration : Number.POSITIVE_INFINITY;
    audio.currentTime = Math.max(0, Math.min(limit, audio.currentTime + seconds));
  }, []);

  const label = t("messages.composer.voice.progress", {
    duration: formatVoiceDuration(totalSeconds * 1000),
  });

  return (
    <div
      className="flex items-center bg-[hsl(var(--surface-card))]"
      data-testid="voice-message-player"
      style={{
        border: `1px solid hsl(var(--border)/0.6)`,
        borderRadius: pxToRem(messageList.attachmentRadius),
        gap: pxToRem(messageList.attachmentGap),
        maxWidth: pxToRem(messageList.attachmentMaxWidth),
        padding: `${pxToRem(messageList.attachmentPaddingY)} ${pxToRem(
          messageList.attachmentPaddingX,
        )}`,
      }}
    >
      <button
        aria-label={
          playing ? t("messages.composer.voice.pause") : t("messages.composer.voice.play")
        }
        className="grid shrink-0 place-items-center bg-[hsl(var(--primary))] text-white transition hover:brightness-110 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] disabled:opacity-55"
        data-testid="voice-message-toggle"
        disabled={!url}
        onClick={toggle}
        style={{
          borderRadius: pxToRem(messageList.attachmentTileRadius),
          height: pxToRem(messageList.attachmentTileSize),
          width: pxToRem(messageList.attachmentTileSize),
        }}
        type="button"
      >
        {playing ? (
          <Pause aria-hidden="true" style={{ height: pxToRem(15), width: pxToRem(15) }} />
        ) : (
          <Play aria-hidden="true" style={{ height: pxToRem(15), width: pxToRem(15) }} />
        )}
      </button>

      {/*
        Çubuklar bir `slider`: klavye kullanıcısı da ilerleyebilsin. Görsel
        katman `aria-hidden`, anlam `aria-valuenow`'da — yüzdeyi yalnız renkle
        anlatan bir yüzey kalmıyor.
      */}
      <div
        aria-label={label}
        aria-valuemax={Math.round(totalSeconds)}
        aria-valuemin={0}
        aria-valuenow={Math.round(positionSeconds)}
        aria-valuetext={`${formatVoiceDuration(positionSeconds * 1000)} / ${formatVoiceDuration(
          totalSeconds * 1000,
        )}`}
        className="flex min-w-0 flex-1 items-center outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
        data-testid="voice-message-progress"
        onKeyDown={(event) => {
          if (event.key === " " || event.key === "Enter") {
            event.preventDefault();
            toggle();
            return;
          }

          if (event.key === "ArrowRight") {
            event.preventDefault();
            seekBy(SEEK_STEP_SECONDS);
            return;
          }

          if (event.key === "ArrowLeft") {
            event.preventDefault();
            seekBy(-SEEK_STEP_SECONDS);
          }
        }}
        role="slider"
        style={{ gap: pxToRem(2), height: pxToRem(WAVEFORM_HEIGHT) }}
        tabIndex={0}
      >
        {bars.map((amplitude, index) => {
          const played = index / bars.length <= progress;

          return (
            <span
              aria-hidden="true"
              className="w-px shrink-0 rounded-full bg-[hsl(var(--primary))]"
              key={index}
              style={{
                height: pxToRem(
                  Math.max(WAVEFORM_MIN_BAR, Math.round((amplitude / 100) * WAVEFORM_HEIGHT)),
                ),
                opacity: played ? 1 : 0.32,
                // Azaltılmış harekette dolgu anlık atlar; çubuk çubuk yürüyen
                // bir geçiş bu ayarı açan kişinin kaçındığı şeyin ta kendisi.
                transition: reducedMotion ? "none" : "opacity .12s linear",
              }}
            />
          );
        })}
      </div>

      <span
        className="shrink-0 tabular-nums text-[hsl(var(--text-muted))]"
        data-testid="voice-message-duration"
        style={{ fontSize: pxToRem(messageList.attachmentMetaFontSize) }}
      >
        {formatVoiceDuration((playing ? positionSeconds : totalSeconds) * 1000)}
      </span>

      {url ? (
        <audio
          onEnded={() => {
            setPlaying(false);
            setPositionSeconds(0);
          }}
          onPause={() => setPlaying(false)}
          onPlay={() => setPlaying(true)}
          onTimeUpdate={(event) => setPositionSeconds(event.currentTarget.currentTime)}
          preload="metadata"
          ref={audioRef}
          src={url}
        />
      ) : null}
    </div>
  );
}
