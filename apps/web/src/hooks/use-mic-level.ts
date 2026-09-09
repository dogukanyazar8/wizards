"use client";

import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";

import { createVoiceAudioLevelMonitor } from "@/lib/voice/provider-lifecycle";

/**
 * Mikrofon seviye ölçeri — K13'ün satır motoruna sığmayan iki parçasından biri.
 *
 * `VoicePreferencesPanel` silindi; ölçerin işi buraya indi. Mantık React'ten **bağımsız** bir
 * oturum sınıfında duruyor (`MicLevelSession`), çünkü bu şeritteki en sert kural bir görünüm
 * kuralı değil bir kaynak kuralı: *test bittiğinde stream kapanır*. Bir DOM koşucusu olmadan
 * "sekme değişince mikrofon ışığı söndü mü" sorusunu ancak saf bir sınıfa sorabiliyoruz —
 * `useEffect` temizliğinin ne yaptığını iddia etmek yerine `track.stop()`'un çağrıldığını
 * **ölçüyoruz**.
 */

export type MicLevelStatus = "denied" | "error" | "idle" | "listening" | "starting" | "unsupported";

/** Kapatılabilen her şey; testler sahte track verir, tarayıcı `MediaStreamTrack`. */
export type StoppableTrack = { stop: () => void };

export type CapturedAudioStream = { getTracks: () => readonly StoppableTrack[] };

export type MicLevelMonitor = {
  dispose: () => void;
  /** 0…1 aralığında normalize edilmiş seviye. */
  readLevel: () => number;
};

export type MicLevelSnapshot = {
  readonly error: MicLevelStatus | null;
  /** 0…1; ölçer segmentleri ve `aria-valuenow` bunu okur. */
  readonly level: number;
  readonly status: MicLevelStatus;
};

export type MicLevelSessionOptions = {
  /** Varsayılan `navigator.mediaDevices.getUserMedia`. */
  capture?: (deviceId: string | undefined) => Promise<CapturedAudioStream>;
  /** Varsayılan `createVoiceAudioLevelMonitor`; ilk canlı ses track'iyle çağrılır. */
  createMonitor?: (stream: CapturedAudioStream) => MicLevelMonitor | null;
  /** Ölçüm aralığı; testler sahte zamanlayıcı verir. */
  scheduler?: {
    clearTimer: (handle: unknown) => void;
    setTimer: (callback: () => void, delayMs: number) => unknown;
  };
  sampleIntervalMs?: number;
};

/** Referans ölçeri 14 segment; 33 ms tarayıcıdaki mevcut ölçüm aralığıdır. */
export const MIC_LEVEL_SAMPLE_INTERVAL_MS = 33;

/** Sessizlik tabanı — `-60 dBFS` altındaki her şey ölçekte sıfırdır. */
export const MIC_LEVEL_SILENCE_DBFS = -60;

const IDLE_SNAPSHOT: MicLevelSnapshot = { error: null, level: 0, status: "idle" };

const DEFAULT_SCHEDULER = {
  clearTimer: (handle: unknown) => clearInterval(handle as ReturnType<typeof setInterval>),
  setTimer: (callback: () => void, delayMs: number) => setInterval(callback, delayMs),
};

/** 0…1 seviyesini dBFS'e çevirir; sıfır seviye taban değerdir, `-Infinity` değil. */
export function toMicLevelDbfs(level: number): number {
  if (!Number.isFinite(level) || level <= 0) {
    return MIC_LEVEL_SILENCE_DBFS;
  }

  return Math.max(MIC_LEVEL_SILENCE_DBFS, 20 * Math.log10(Math.min(1, level)));
}

/**
 * Ölçerin **kaç** segmentinin yanacağı. Sunum bunu bilmez; segment sayısı ölçü sözlüğünden
 * gelir ve eşik hesabı burada tek yerde durur.
 */
export function countLitMicSegments(level: number, segmentCount: number): number {
  if (segmentCount <= 0) {
    return 0;
  }

  const clamped = Math.min(1, Math.max(0, level));
  return Math.min(segmentCount, Math.round(clamped * segmentCount));
}

function defaultCapture(deviceId: string | undefined): Promise<CapturedAudioStream> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    return Promise.reject(new Error("mic-level/unsupported"));
  }

  return navigator.mediaDevices.getUserMedia({
    audio: deviceId && deviceId !== "default" ? { deviceId: { exact: deviceId } } : true,
    video: false,
  });
}

function defaultCreateMonitor(stream: CapturedAudioStream): MicLevelMonitor | null {
  const track = (stream as MediaStream).getAudioTracks?.()[0];

  return track ? createVoiceAudioLevelMonitor(track) : null;
}

function classifyCaptureError(error: unknown): MicLevelStatus {
  if (error instanceof Error && error.message === "mic-level/unsupported") {
    return "unsupported";
  }

  if (
    typeof DOMException !== "undefined" &&
    error instanceof DOMException &&
    ["NotAllowedError", "SecurityError"].includes(error.name)
  ) {
    return "denied";
  }

  return "error";
}

/**
 * Mikrofon testinin ömrü.
 *
 * `stop()` üç şeyi **bu sırayla** yapar: zamanlayıcı, analiz düğümü, track. Ters sırada
 * kapatmak, kapanmış bir düğümden okuyan bir tick bırakır. `start()` uçarken gelen bir `stop()`
 * kuşak sayacıyla yakalanır: geç gelen stream sahipsiz kalmaz, hemen durdurulur — sekme
 * değişimi tam da bu ana denk gelir.
 */
export class MicLevelSession {
  private readonly listeners = new Set<() => void>();

  private readonly capture: (deviceId: string | undefined) => Promise<CapturedAudioStream>;

  private readonly createMonitor: (stream: CapturedAudioStream) => MicLevelMonitor | null;

  private readonly scheduler: NonNullable<MicLevelSessionOptions["scheduler"]>;

  private readonly sampleIntervalMs: number;

  private snapshot: MicLevelSnapshot = IDLE_SNAPSHOT;

  private stream: CapturedAudioStream | null = null;

  private monitor: MicLevelMonitor | null = null;

  private timer: unknown = null;

  private generation = 0;

  constructor(options: MicLevelSessionOptions = {}) {
    this.capture = options.capture ?? defaultCapture;
    this.createMonitor = options.createMonitor ?? defaultCreateMonitor;
    this.scheduler = options.scheduler ?? DEFAULT_SCHEDULER;
    this.sampleIntervalMs = options.sampleIntervalMs ?? MIC_LEVEL_SAMPLE_INTERVAL_MS;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): MicLevelSnapshot => this.snapshot;

  isRunning = (): boolean =>
    this.snapshot.status === "listening" || this.snapshot.status === "starting";

  start = async (deviceId?: string): Promise<void> => {
    if (this.isRunning()) {
      return;
    }

    const generation = ++this.generation;
    this.write({ error: null, level: 0, status: "starting" });

    let stream: CapturedAudioStream;

    try {
      stream = await this.capture(deviceId);
    } catch (error) {
      if (generation === this.generation) {
        const status = classifyCaptureError(error);
        this.write({ error: status, level: 0, status });
      }

      return;
    }

    // Bekleme sırasında `stop()` geldiyse stream **hiç** görünmeden kapanır.
    if (generation !== this.generation) {
      stopTracks(stream);
      return;
    }

    this.stream = stream;
    this.monitor = this.createMonitor(stream);
    this.timer = this.scheduler.setTimer(this.tick, this.sampleIntervalMs);
    this.write({ error: null, level: 0, status: "listening" });
  };

  stop = (): void => {
    this.generation += 1;

    if (this.timer !== null) {
      this.scheduler.clearTimer(this.timer);
      this.timer = null;
    }

    this.monitor?.dispose();
    this.monitor = null;

    if (this.stream) {
      stopTracks(this.stream);
      this.stream = null;
    }

    this.write(IDLE_SNAPSHOT);
  };

  /** Sökülme kapısı — `useEffect` temizliği ve testler aynı kapıdan geçer. */
  dispose = (): void => {
    this.stop();
    this.listeners.clear();
  };

  private tick = (): void => {
    if (!this.monitor) {
      return;
    }

    const level = this.monitor.readLevel();
    this.write({ error: null, level: Number.isFinite(level) ? level : 0, status: "listening" });
  };

  private write(next: MicLevelSnapshot): void {
    if (
      this.snapshot.status === next.status &&
      this.snapshot.level === next.level &&
      this.snapshot.error === next.error
    ) {
      return;
    }

    this.snapshot = next;

    for (const listener of this.listeners) {
      listener();
    }
  }
}

function stopTracks(stream: CapturedAudioStream): void {
  for (const track of stream.getTracks()) {
    track.stop();
  }
}

export type UseMicLevelResult = MicLevelSnapshot & {
  readonly start: () => void;
  readonly stop: () => void;
  readonly toggle: () => void;
};

/**
 * Ölçerin React kapısı.
 *
 * Sökülme temizliği `dispose()` çağırır — sekme değişimi bileşeni söker, bu yüzden mikrofon
 * ışığı sekme değişiminde de söner. Cihaz kimliği değişirse oturum kapanır: açık bir testin
 * ortasında cihaz değiştirmek, eski cihazı açık bırakırdı.
 */
export function useMicLevel(deviceId?: string): UseMicLevelResult {
  const session = useMemo(() => new MicLevelSession(), []);

  useEffect(() => () => session.dispose(), [session]);
  useEffect(() => () => session.stop(), [deviceId, session]);

  const snapshot = useSyncExternalStore(
    session.subscribe,
    session.getSnapshot,
    () => IDLE_SNAPSHOT,
  );

  const start = useCallback(() => void session.start(deviceId), [deviceId, session]);
  const stop = useCallback(() => session.stop(), [session]);
  const toggle = useCallback(() => {
    if (session.isRunning()) {
      session.stop();
      return;
    }

    void session.start(deviceId);
  }, [deviceId, session]);

  return { ...snapshot, start, stop, toggle };
}
