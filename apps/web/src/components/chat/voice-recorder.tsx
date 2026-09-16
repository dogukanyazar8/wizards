"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Mic, Send, Square, Trash2 } from "lucide-react";
import { VOICE_MESSAGE_MAX_MS, formatVoiceDuration } from "@wizards/types";

import { useI18n } from "@/components/providers/locale-provider";
import { MESSAGES_METRICS, pxToRem } from "@/lib/messages/metrics";
import {
  VOICE_MAX_SAMPLES,
  VOICE_SAMPLE_INTERVAL_MS,
  buildVoiceMessageFilename,
  computeRms,
  createIdempotentVoiceCleanup,
  createVoiceCaptureGeneration,
  createVoiceRecordingDraft,
  hasReachedRecordingLimit,
  requestVoiceCaptureStream,
  selectRecorderMimeType,
  toLiveWaveform,
  toStoredWaveform,
} from "@/lib/messages/voice-capture";
import { cn } from "@/lib/utils";

/**
 * Sesli mesaj kaydı — karar #5.
 *
 * Web tarafında bu düğme bugüne kadar pasifti ("Sesli mesajlar henüz
 * kullanılabilir değil"); mobil çalışıyordu ama dalga formunu ekin kimliğinden
 * **türetiyordu** — aynı uzunlukta iki kayıt aynı silüeti çiziyordu. Buradaki
 * kayıt gerçek genlikleri ölçer ve `Attachment.waveform` kolonuna yazar.
 *
 * ## Kaynak temizliği
 *
 * Açık kalan bir mikrofon, sekme göstergesinde durur ve kullanıcıya gizlice
 * kaydediliyor izlenimi verir. `stopEverything` üç şeyi birden kapatır —
 * `MediaRecorder`, her `MediaStreamTrack` ve `AudioContext` — ve unmount da dâhil
 * her çıkış yolundan çağrılır.
 */

const { composer } = MESSAGES_METRICS;

/** Kayıt sırasında sekme arka plana geçerse kayıt durur (aşağıdaki §). */
const STOP_ON_HIDDEN = true;

export type VoiceRecording = {
  readonly blob: Blob;
  readonly durationMs: number;
  readonly filename: string;
  readonly mimeType: string;
  /** 0–100, tam 64 kova. */
  readonly waveform: number[];
};

export type VoiceRecorderProps = {
  disabled?: boolean;
  onActiveChange?: (active: boolean) => void;
  /** Kayıt hazır; çağıran yükler ve gönderir. */
  onRecorded: (recording: VoiceRecording) => void;
};

type RecorderState = "idle" | "requesting" | "recording" | "preview" | "error";

type VoiceRecordingPreview = {
  readonly generation: number;
  readonly recording: VoiceRecording;
  readonly url: string;
};

type ActiveCaptureSession = {
  cleanup(): void;
  readonly generation: number;
  readonly recorder: MediaRecorder;
  discard: boolean;
  stopRequested: boolean;
  stopSampling(): void;
};

export function VoiceRecorder({
  disabled = false,
  onActiveChange,
  onRecorded,
}: VoiceRecorderProps) {
  const { t } = useI18n();
  const [state, setState] = useState<RecorderState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [liveWaveform, setLiveWaveform] = useState<number[]>(() => toLiveWaveform([]));
  const [preview, setPreview] = useState<VoiceRecordingPreview | null>(null);
  const activeSessionRef = useRef<ActiveCaptureSession | null>(null);
  const previewRef = useRef<VoiceRecordingPreview | null>(null);
  const [draft] = useState(() =>
    createVoiceRecordingDraft<VoiceRecording>((url) => URL.revokeObjectURL(url)),
  );
  const requestGenerationRef = useRef<number | null>(null);
  const [lifecycle] = useState(createVoiceCaptureGeneration);

  useEffect(() => {
    onActiveChange?.(state === "requesting" || state === "recording" || state === "preview");
  }, [onActiveChange, state]);

  const resetMeters = useCallback(() => {
    setElapsedMs(0);
    setLiveWaveform(toLiveWaveform([]));
  }, []);

  const revokePreview = useCallback(() => {
    draft.discard();
    previewRef.current = null;
  }, [draft]);

  const discardPreview = useCallback(() => {
    const current = previewRef.current;
    if (current) {
      lifecycle.cancel(current.generation);
    }
    revokePreview();
    setPreview(null);
    setState("idle");
    resetMeters();
  }, [lifecycle, resetMeters, revokePreview]);

  const finish = useCallback(
    (discard: boolean) => {
      const requesting = requestGenerationRef.current;
      if (requesting !== null) {
        lifecycle.cancel(requesting);
        requestGenerationRef.current = null;
        setState("idle");
        resetMeters();
        return;
      }

      const session = activeSessionRef.current;
      if (!session || session.stopRequested) {
        return;
      }

      session.discard = discard;
      session.stopRequested = true;
      session.stopSampling();

      if (discard) {
        lifecycle.cancel(session.generation);
        activeSessionRef.current = null;
        session.cleanup();
        setState("idle");
        resetMeters();
        return;
      }

      // `stop()` emits the final data chunk. `onstop` stages a preview; it
      // never uploads or sends by itself.
      if (session.recorder.state !== "inactive") {
        session.recorder.stop();
      }
    },
    [lifecycle, resetMeters],
  );

  // Strict Mode may replay effect setup; `mount()` makes the same guard usable
  // after the development-only cleanup/setup pair.
  useEffect(() => {
    lifecycle.mount();
    return () => {
      lifecycle.unmount();
      requestGenerationRef.current = null;
      const session = activeSessionRef.current;
      activeSessionRef.current = null;
      session?.cleanup();
      revokePreview();
    };
  }, [lifecycle, revokePreview]);

  /**
   * Sekme arka plana geçince kayıt durur ve **gönderime hazır** hâle gelir.
   *
   * Atmak değil durdurmak: kullanıcı konuşmayı bitirmiş olabilir ve kaydı
   * silmek onun işini geri alınamaz biçimde çöpe atardı. Devam ettirmek de
   * olmaz — ne kaydedildiğini görmeyen birinin sesini göndermesini istemiyoruz.
   */
  useEffect(() => {
    if (!STOP_ON_HIDDEN || state !== "recording") {
      return;
    }

    const handleVisibility = () => {
      if (document.visibilityState === "hidden") {
        finish(false);
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [finish, state]);

  const start = useCallback(async () => {
    if (disabled || state === "recording" || state === "requesting") {
      return;
    }

    setError(null);
    setState("requesting");

    const mimeType =
      typeof MediaRecorder === "undefined"
        ? null
        : selectRecorderMimeType((candidate) => MediaRecorder.isTypeSupported(candidate));

    if (!mimeType) {
      setError(t("messages.errors.voiceFailed"));
      setState("error");
      return;
    }

    const generation = lifecycle.begin();
    requestGenerationRef.current = generation;

    const streamRequest = await requestVoiceCaptureStream(lifecycle, generation, () =>
      navigator.mediaDevices.getUserMedia({ audio: true }),
    );
    requestGenerationRef.current = null;

    if (streamRequest.kind === "stale") {
      return;
    }

    if (streamRequest.kind === "error") {
      lifecycle.cancel(generation);
      // İzin reddi bir hata durumu ama kalıcı değil: düğme pasifleşmez, tekrar
      // denenebilir.
      setError(t("messages.errors.micDenied"));
      setState("error");
      return;
    }

    const { stream } = streamRequest;

    let audioContext: AudioContext | null = null;
    let recorder: MediaRecorder | null = null;

    try {
      audioContext = new AudioContext();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048;
      audioContext.createMediaStreamSource(stream).connect(analyser);
      recorder = new MediaRecorder(stream, { mimeType });

      const chunks: Blob[] = [];
      const samples: number[] = [];
      const startedAt = Date.now();
      let sampleTimer: ReturnType<typeof setInterval> | null = null;
      const stopSampling = createIdempotentVoiceCleanup(() => {
        if (sampleTimer !== null) {
          clearInterval(sampleTimer);
          sampleTimer = null;
        }
      });
      const session = {} as ActiveCaptureSession;
      const cleanup = createIdempotentVoiceCleanup(() => {
        stopSampling();

        // Yerel kopya: `recorder` closure'ın dışında yeniden atanabilen bir
        // `let`, bu yüzden `recorder?.state` kontrolü altındaki erişimleri
        // daraltmıyor.
        const active = recorder;

        if (active && active.state !== "inactive") {
          if (!lifecycle.isCurrent(generation)) {
            active.ondataavailable = null;
            active.onerror = null;
            active.onstop = null;
          }
          active.stop();
        }
        stream.getTracks().forEach((track) => track.stop());
        void audioContext?.close().catch(() => undefined);
        if (active && active.state === "inactive") {
          active.ondataavailable = null;
          active.onerror = null;
          active.onstop = null;
        }
      });

      Object.assign(session, {
        cleanup,
        discard: false,
        generation,
        recorder,
        stopRequested: false,
        stopSampling,
      });
      activeSessionRef.current = session;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      recorder.onstop = () => {
        const durationMs = Date.now() - startedAt;
        cleanup();
        if (activeSessionRef.current === session) {
          activeSessionRef.current = null;
        }

        if (!lifecycle.isCurrent(generation)) {
          return;
        }

        resetMeters();
        if (!session.discard && chunks.length > 0 && durationMs > 0) {
          const blob = new Blob(chunks, { type: mimeType });
          const recording: VoiceRecording = {
            blob,
            durationMs: Math.min(durationMs, VOICE_MESSAGE_MAX_MS),
            filename: buildVoiceMessageFilename(mimeType, new Date()),
            mimeType,
            waveform: toStoredWaveform(samples),
          };
          const nextPreview = {
            generation,
            recording,
            url: URL.createObjectURL(blob),
          };
          revokePreview();
          draft.stage({ recording, url: nextPreview.url });
          previewRef.current = nextPreview;
          setPreview(nextPreview);
          setState("preview");
          return;
        }

        lifecycle.cancel(generation);
        setState("idle");
      };

      recorder.onerror = () => {
        cleanup();
        if (activeSessionRef.current === session) {
          activeSessionRef.current = null;
        }
        if (lifecycle.isCurrent(generation)) {
          lifecycle.cancel(generation);
          resetMeters();
          setError(t("messages.errors.voiceFailed"));
          setState("error");
        }
      };

      const buffer = new Uint8Array(analyser.fftSize);

      sampleTimer = setInterval(() => {
        if (!lifecycle.isCurrent(generation) || activeSessionRef.current !== session) {
          return;
        }

        analyser.getByteTimeDomainData(buffer);

        if (samples.length < VOICE_MAX_SAMPLES) {
          samples.push(computeRms(buffer));
        }

        setLiveWaveform(toLiveWaveform(samples));

        const nextElapsed = Date.now() - startedAt;
        setElapsedMs(nextElapsed);

        if (hasReachedRecordingLimit(nextElapsed)) {
          setError(t("messages.composer.voice.limitReached"));
          finish(false);
        }
      }, VOICE_SAMPLE_INTERVAL_MS);

      recorder.start();
      setState("recording");
    } catch {
      stream.getTracks().forEach((track) => track.stop());
      void audioContext?.close().catch(() => undefined);
      if (lifecycle.isCurrent(generation)) {
        lifecycle.cancel(generation);
        setError(t("messages.errors.voiceFailed"));
        setState("error");
      }
    }
  }, [disabled, draft, finish, lifecycle, resetMeters, revokePreview, state, t]);

  const sendPreview = useCallback(() => {
    const current = previewRef.current;
    if (!current || !lifecycle.isCurrent(current.generation)) {
      return;
    }

    previewRef.current = null;
    setPreview(null);
    lifecycle.cancel(current.generation);
    setState("idle");
    draft.send(onRecorded);
  }, [draft, lifecycle, onRecorded]);

  useEffect(() => {
    if (state !== "recording") {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        finish(true);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [finish, state]);

  if (state === "requesting") {
    return (
      <div
        aria-live="polite"
        className="flex min-w-0 flex-1 items-center justify-end"
        data-testid="voice-recorder-requesting"
        style={{ gap: pxToRem(composer.inputGap), minHeight: pxToRem(composer.sendSize) }}
      >
        <span className="text-[hsl(var(--text-muted))]">{t("messages.composer.voice.start")}</span>
        <button
          aria-label={t("messages.composer.voice.cancel")}
          className="grid shrink-0 place-items-center border-0 text-[hsl(var(--danger))] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
          data-testid="voice-recorder-cancel"
          onClick={() => finish(true)}
          style={{
            borderRadius: pxToRem(composer.actionRadius),
            height: pxToRem(composer.actionSize),
            width: pxToRem(composer.actionSize),
          }}
          type="button"
        >
          <Trash2
            aria-hidden="true"
            style={{
              height: pxToRem(composer.actionIconSize),
              width: pxToRem(composer.actionIconSize),
            }}
          />
        </button>
      </div>
    );
  }

  if (state === "preview" && preview) {
    return (
      <div
        aria-live="polite"
        className="flex min-w-0 flex-1 items-center"
        data-testid="voice-recorder-preview"
        style={{ gap: pxToRem(composer.inputGap) }}
      >
        <audio
          aria-label={t("messages.composer.voice.play")}
          className="min-w-0 flex-1"
          controls
          src={preview.url}
          style={{ height: pxToRem(composer.sendSize) }}
        />
        <button
          aria-label={t("messages.composer.voice.cancel")}
          className="grid shrink-0 place-items-center border-0 text-[hsl(var(--danger))] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
          data-testid="voice-recorder-cancel"
          onClick={discardPreview}
          style={{
            borderRadius: pxToRem(composer.actionRadius),
            height: pxToRem(composer.actionSize),
            width: pxToRem(composer.actionSize),
          }}
          type="button"
        >
          <Trash2
            aria-hidden="true"
            style={{
              height: pxToRem(composer.actionIconSize),
              width: pxToRem(composer.actionIconSize),
            }}
          />
        </button>
        <button
          aria-label={t("messages.composer.voice.send")}
          className="grid shrink-0 place-items-center border-0 bg-[hsl(var(--primary))] text-white focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
          data-testid="voice-recorder-send"
          onClick={sendPreview}
          style={{
            borderRadius: pxToRem(composer.sendRadius),
            height: pxToRem(composer.sendSize),
            width: pxToRem(composer.sendSize),
          }}
          type="button"
        >
          <Send
            aria-hidden="true"
            style={{
              height: pxToRem(composer.sendIconSize),
              width: pxToRem(composer.sendIconSize),
            }}
          />
        </button>
      </div>
    );
  }

  if (state === "recording") {
    return (
      <div
        aria-live="polite"
        className="flex min-w-0 flex-1 items-center"
        data-testid="voice-recorder-active"
        style={{ gap: pxToRem(composer.inputGap) }}
      >
        <span
          aria-hidden="true"
          className="shrink-0 animate-pulse rounded-full bg-[hsl(var(--danger))]"
          style={{ height: pxToRem(8), width: pxToRem(8) }}
        />
        <span
          className="shrink-0 tabular-nums text-[hsl(var(--foreground))]"
          data-testid="voice-recorder-elapsed"
          style={{ fontSize: pxToRem(composer.inputFontSize) }}
        >
          {t("messages.composer.voice.recording", { duration: formatVoiceDuration(elapsedMs) })}
        </span>

        <span
          aria-hidden="true"
          className="flex min-w-0 flex-1 items-center justify-end"
          style={{ gap: pxToRem(2), height: pxToRem(24) }}
        >
          {liveWaveform.map((amplitude, index) => (
            <span
              className="w-px shrink-0 rounded-full bg-[hsl(var(--primary))]"
              key={index}
              style={{
                // Sıfır yükseklikli bir çubuk hiç çizilmez ve şerit delik
                // görünür; taban 2px sessizliğin de bir çizgisi olduğunu söyler.
                height: pxToRem(Math.max(2, Math.round((amplitude / 100) * 24))),
                opacity: amplitude === 0 ? 0.35 : 1,
              }}
            />
          ))}
        </span>

        <button
          aria-label={t("messages.composer.voice.cancel")}
          className="grid shrink-0 place-items-center border-0 text-[hsl(var(--text-muted))] transition hover:bg-[hsl(var(--danger)/0.14)] hover:text-[hsl(var(--danger))] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
          data-testid="voice-recorder-cancel"
          onClick={() => finish(true)}
          style={{
            borderRadius: pxToRem(composer.actionRadius),
            height: pxToRem(composer.actionSize),
            width: pxToRem(composer.actionSize),
          }}
          type="button"
        >
          <Trash2
            aria-hidden="true"
            style={{
              height: pxToRem(composer.actionIconSize),
              width: pxToRem(composer.actionIconSize),
            }}
          />
        </button>
        <button
          aria-label={t("messages.composer.voice.stop")}
          className="grid shrink-0 place-items-center border-0 bg-[hsl(var(--primary))] text-white transition hover:brightness-110 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
          data-testid="voice-recorder-stop"
          onClick={() => finish(false)}
          style={{
            borderRadius: pxToRem(composer.sendRadius),
            height: pxToRem(composer.sendSize),
            width: pxToRem(composer.sendSize),
          }}
          type="button"
        >
          <Square
            aria-hidden="true"
            style={{
              height: pxToRem(composer.sendIconSize),
              width: pxToRem(composer.sendIconSize),
            }}
          />
        </button>
      </div>
    );
  }

  return (
    <>
      <button
        aria-label={t("messages.composer.voice.start")}
        className={cn(
          "grid shrink-0 place-items-center border-0 text-[hsl(var(--text-muted))] transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]",
          "hover:bg-[hsl(var(--danger)/0.14)] hover:text-[hsl(var(--danger))]",
          disabled && "cursor-not-allowed opacity-55",
        )}
        data-testid="voice-recorder-start"
        disabled={disabled}
        onClick={() => void start()}
        style={{
          borderRadius: pxToRem(composer.actionRadius),
          height: pxToRem(composer.actionSize),
          width: pxToRem(composer.actionSize),
        }}
        type="button"
      >
        <Mic
          aria-hidden="true"
          style={{
            height: pxToRem(composer.voiceIconSize),
            width: pxToRem(composer.voiceIconSize),
          }}
        />
      </button>
      {error ? (
        <span className="sr-only" data-testid="voice-recorder-error" role="status">
          {error}
        </span>
      ) : null}
    </>
  );
}
