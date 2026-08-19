"use client";

import { Headphones, Mic, Square } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/components/providers/locale-provider";
import { useVoiceState } from "@/components/providers/voice-provider";
import {
  isMicrophoneDeviceUnavailable,
  isMicrophonePermissionDenied,
} from "@/lib/voice/error-classification";
import { getLocalMicrophoneTrack } from "@/lib/voice/livekit-track-helpers";
import {
  acquireMicrophoneTestSource,
  getMicrophoneTestLevelState,
  MicrophoneTestSourceUnavailableError,
  releaseMicrophoneTestSource,
  routeMicrophoneTestOutput,
  type MicrophoneTestSource,
} from "@/lib/voice/microphone-test";
import {
  createVoiceAudioContext,
  createVoiceAudioLevelMonitor,
  VOICE_AUDIO_LEVEL_SYNC_INTERVAL_MS,
  type VoiceAudioLevelMonitor,
} from "@/lib/voice/provider-lifecycle";
import { cn } from "@/lib/utils";

type MicrophoneTestError = "capture" | "device" | "output" | "permission" | null;
type MicrophoneTestStatus = "active" | "idle" | "starting";

function resolveMicrophoneTestError(error: unknown): Exclude<MicrophoneTestError, null> {
  if (isMicrophonePermissionDenied(error)) {
    return "permission";
  }
  if (
    error instanceof MicrophoneTestSourceUnavailableError ||
    isMicrophoneDeviceUnavailable(error)
  ) {
    return "device";
  }
  return "capture";
}

export function MicrophoneTestPanel() {
  const { t } = useI18n();
  const { audioPreferences, isMuted, room } = useVoiceState();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const generationRef = useRef(0);
  const intervalRef = useRef<number | null>(null);
  const monitoringRequestRef = useRef(0);
  const monitorRef = useRef<VoiceAudioLevelMonitor | null>(null);
  const sourceRef = useRef<MicrophoneTestSource | null>(null);
  const previousCaptureKeyRef = useRef<string | null>(null);
  const [error, setError] = useState<MicrophoneTestError>(null);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [level, setLevel] = useState(0);
  const [status, setStatus] = useState<MicrophoneTestStatus>("idle");

  const detachMonitoring = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }
    audio.pause();
    audio.srcObject = null;
  }, []);

  const disposeSession = useCallback(() => {
    generationRef.current += 1;
    monitoringRequestRef.current += 1;
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    monitorRef.current?.dispose();
    monitorRef.current = null;
    detachMonitoring();
    if (sourceRef.current) {
      releaseMicrophoneTestSource(sourceRef.current);
      sourceRef.current = null;
    }
  }, [detachMonitoring]);

  const resetTestState = useCallback(() => {
    setError(null);
    setIsMonitoring(false);
    setLevel(0);
    setStatus("idle");
  }, []);

  const stopTest = useCallback(() => {
    disposeSession();
    resetTestState();
  }, [disposeSession, resetTestState]);

  useEffect(() => () => disposeSession(), [disposeSession]);

  useEffect(() => {
    const captureKey = `${audioPreferences.inputDeviceId}:${isMuted}:${room?.name ?? "none"}`;
    if (previousCaptureKeyRef.current === null) {
      previousCaptureKeyRef.current = captureKey;
      return;
    }
    if (previousCaptureKeyRef.current !== captureKey) {
      previousCaptureKeyRef.current = captureKey;
      if (status !== "idle") {
        // Invalidate pending media work immediately. React state resets on the next task so the
        // effect remains an external-system synchronization rather than a cascading render.
        disposeSession();
        const resetTimer = window.setTimeout(resetTestState, 0);
        return () => window.clearTimeout(resetTimer);
      }
    }
  }, [audioPreferences.inputDeviceId, disposeSession, isMuted, resetTestState, room, status]);

  useEffect(() => {
    if (!isMonitoring || !audioRef.current) {
      return;
    }
    const request = ++monitoringRequestRef.current;
    void routeMicrophoneTestOutput(audioRef.current, audioPreferences.outputDeviceId).catch(() => {
      if (request !== monitoringRequestRef.current) {
        return;
      }
      detachMonitoring();
      setError("output");
      setIsMonitoring(false);
    });
  }, [audioPreferences.outputDeviceId, detachMonitoring, isMonitoring]);

  const startTest = async () => {
    disposeSession();
    const generation = generationRef.current;
    let audioContext = createVoiceAudioContext();
    const resumeAudioContext = audioContext?.resume().catch(() => undefined);
    setError(null);
    setIsMonitoring(false);
    setLevel(0);
    setStatus("starting");

    let source: MicrophoneTestSource | null = null;
    try {
      source = await acquireMicrophoneTestSource({
        activeTrack: getLocalMicrophoneTrack(room)?.mediaStreamTrack ?? null,
        isMuted,
        preferences: audioPreferences,
      });
      if (generation !== generationRef.current) {
        releaseMicrophoneTestSource(source);
        void audioContext?.close().catch(() => undefined);
        return;
      }

      await resumeAudioContext;
      if (generation !== generationRef.current) {
        releaseMicrophoneTestSource(source);
        void audioContext?.close().catch(() => undefined);
        return;
      }

      const monitor = createVoiceAudioLevelMonitor(source.track, audioContext);
      if (!monitor) {
        releaseMicrophoneTestSource(source);
        throw new MicrophoneTestSourceUnavailableError();
      }

      audioContext = null;
      sourceRef.current = source;
      monitorRef.current = monitor;
      intervalRef.current = window.setInterval(() => {
        setLevel(monitor.readLevel());
      }, VOICE_AUDIO_LEVEL_SYNC_INTERVAL_MS);
      setStatus("active");
    } catch (captureError) {
      void audioContext?.close().catch(() => undefined);
      if (source) {
        releaseMicrophoneTestSource(source);
      }
      if (generation !== generationRef.current) {
        return;
      }
      setError(resolveMicrophoneTestError(captureError));
      setStatus("idle");
    }
  };

  const toggleMonitoring = async () => {
    if (isMonitoring) {
      monitoringRequestRef.current += 1;
      detachMonitoring();
      setIsMonitoring(false);
      return;
    }

    const audio = audioRef.current;
    const source = sourceRef.current;
    if (!audio || !source) {
      return;
    }

    const request = ++monitoringRequestRef.current;
    try {
      await routeMicrophoneTestOutput(audio, audioPreferences.outputDeviceId);
      if (
        request !== monitoringRequestRef.current ||
        sourceRef.current !== source ||
        audioRef.current !== audio
      ) {
        return;
      }
      audio.srcObject = source.stream;
      await audio.play();
      if (
        request !== monitoringRequestRef.current ||
        sourceRef.current !== source ||
        audioRef.current !== audio
      ) {
        audio.pause();
        audio.srcObject = null;
        return;
      }
      setError(null);
      setIsMonitoring(true);
    } catch {
      if (request !== monitoringRequestRef.current) {
        return;
      }
      detachMonitoring();
      setError("output");
      setIsMonitoring(false);
    }
  };

  const levelState = getMicrophoneTestLevelState(level);
  const levelPercent = Math.round(level * 100);
  const errorMessage =
    error === "permission"
      ? t("voice.microphoneTest.permissionError")
      : error === "device"
        ? t("voice.microphoneTest.deviceError")
        : error === "output"
          ? t("voice.microphoneTest.outputError")
          : error === "capture"
            ? t("voice.microphoneTest.captureError")
            : null;

  return (
    <section
      aria-labelledby="voice-microphone-test-title"
      className="app-panel-soft rounded-[20px] border p-3"
      data-testid="voice-microphone-test"
    >
      <div className="flex items-start gap-2.5">
        <span className="rounded-xl border border-[hsl(var(--primary)/0.24)] bg-[hsl(var(--primary)/0.1)] p-2 text-[hsl(var(--primary))]">
          <Mic aria-hidden="true" className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h3
            className="text-[13px] font-semibold text-app-foreground"
            id="voice-microphone-test-title"
          >
            {t("voice.microphoneTest.title")}
          </h3>
          <p className="mt-0.5 text-xs leading-4 text-app-muted">
            {t("voice.microphoneTest.description")}
          </p>
        </div>
      </div>

      <div className="mt-3 rounded-xl border border-[hsl(var(--border)/0.58)] bg-[hsl(var(--surface-card)/0.62)] p-2.5">
        <div className="flex items-center justify-between gap-3 text-[11px] font-semibold">
          <span className="text-app-muted">{t("voice.microphoneTest.level")}</span>
          <span aria-live="polite" className="text-app-foreground">
            {status === "starting"
              ? t("voice.microphoneTest.starting")
              : status === "active"
                ? t(
                    levelState === "active"
                      ? "voice.microphoneTest.signalActive"
                      : "voice.microphoneTest.signalQuiet",
                  )
                : t("voice.microphoneTest.idle")}
          </span>
        </div>
        <div
          aria-label={t("voice.microphoneTest.level")}
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={levelPercent}
          className="mt-2 h-2.5 overflow-hidden rounded-full bg-[hsl(var(--surface-raised)/0.82)]"
          role="meter"
        >
          <div
            className={cn(
              "h-full rounded-full transition-[width,background-color] duration-75",
              levelState === "active"
                ? "bg-[hsl(var(--success))]"
                : "bg-[hsl(var(--primary)/0.52)]",
            )}
            style={{ width: `${levelPercent}%` }}
          />
        </div>
      </div>

      {errorMessage ? (
        <p
          className="mt-2 rounded-xl border border-[hsl(var(--danger)/0.3)] bg-[hsl(var(--danger)/0.1)] px-2.5 py-2 text-[11px] font-semibold leading-4 text-app-foreground"
          role="alert"
        >
          {errorMessage}
        </p>
      ) : null}

      {status === "active" ? (
        <label className="mt-3 flex cursor-pointer items-start gap-2.5 rounded-xl border border-[hsl(var(--border)/0.58)] bg-[hsl(var(--surface-card)/0.52)] p-2.5">
          <input
            checked={isMonitoring}
            className="mt-0.5 h-4 w-4 accent-[hsl(var(--primary))]"
            onChange={() => void toggleMonitoring()}
            type="checkbox"
          />
          <span className="min-w-0">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-app-foreground">
              <Headphones aria-hidden="true" className="h-3.5 w-3.5" />
              {t("voice.microphoneTest.hearMyself")}
            </span>
            <span className="mt-0.5 block text-[11px] leading-4 text-app-muted">
              {t("voice.microphoneTest.headphoneWarning")}
            </span>
          </span>
        </label>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        {status === "active" ? (
          <button
            className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-xl border border-[hsl(var(--danger)/0.3)] bg-[hsl(var(--danger)/0.08)] px-3 text-xs font-semibold text-app-foreground transition hover:bg-[hsl(var(--danger)/0.14)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
            onClick={stopTest}
            type="button"
          >
            <Square aria-hidden="true" className="h-3.5 w-3.5" />
            {t("voice.microphoneTest.stop")}
          </button>
        ) : (
          <button
            className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-xl border border-[hsl(var(--primary)/0.3)] bg-[hsl(var(--primary)/0.12)] px-3 text-xs font-semibold text-[hsl(var(--primary))] transition hover:bg-[hsl(var(--primary)/0.18)] disabled:cursor-wait disabled:opacity-60 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
            disabled={status === "starting"}
            onClick={() => void startTest()}
            type="button"
          >
            <Mic aria-hidden="true" className="h-3.5 w-3.5" />
            {status === "starting"
              ? t("voice.microphoneTest.starting")
              : t("voice.microphoneTest.start")}
          </button>
        )}
      </div>

      <audio aria-hidden="true" playsInline ref={audioRef} />
    </section>
  );
}
