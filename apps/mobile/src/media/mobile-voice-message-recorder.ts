import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioRecorder } from "expo-audio";
import { File as ExpoFile } from "expo-file-system";

import {
  getMobileMessageAttachmentKind,
  validateMobileMessageAttachment,
  type MobilePickedMessageAttachment,
} from "./mobile-message-attachment-contract";
import {
  appendMobileVoiceMeterLevel,
  normalizeMobileVoiceMeterLevel,
  VOICE_MESSAGE_METER_INTERVAL_MS,
} from "./mobile-voice-meter";

const VOICE_MESSAGE_CONTENT_TYPE = "audio/mp4";
const VOICE_MESSAGE_FILE_NAME = "voice-message.m4a";
/** 8b: taps shorter than this are treated as accidental and discarded. */
const VOICE_MESSAGE_MIN_DURATION_SECONDS = 1;
const VOICE_MESSAGE_RECORDING_OPTIONS = {
  ...RecordingPresets.HIGH_QUALITY,
  directory: "cache" as const,
  /**
   * §2 "1h".2: the recording bar draws the microphone's actual loudness, so the
   * recorder has to report it. `RecordingPresets` leaves metering off, which is
   * what left the bar animating a canned shape regardless of what was said.
   */
  isMeteringEnabled: true,
};

/**
 * What a stop attempt actually did.
 *
 * `idle` is the important one: a press-and-hold fires `onPressOut` *and*
 * `onPress`, so the second call arrives with nothing left to stop. Returning
 * null for both "there was no take" and "the take was too short" is what put
 * two different error toasts on screen for one tap.
 */
export type MobileVoiceStopOutcome =
  | { readonly attachment: MobilePickedMessageAttachment; readonly status: "recorded" }
  | { readonly status: "failed" }
  | { readonly status: "idle" }
  | { readonly status: "too-short" };

export type MobileVoiceMessageRecorderPhase =
  "error" | "idle" | "preparing" | "recording" | "stopping";

export type MobileVoiceMessageRecorder = {
  discard(): Promise<void>;
  /** Latest loudness window, for a subscriber that mounts mid-take. */
  getLevels(): readonly number[];
  /**
   * True from the moment the button is pressed, not from the moment the
   * microphone is live: preparing costs a permission check and a native
   * `prepareToRecordAsync`, and hiding the bar until then reads as a freeze.
   */
  readonly isRecording: boolean;
  readonly phase: MobileVoiceMessageRecorderPhase;
  start(): Promise<"denied" | "error" | "recording">;
  stop(): Promise<MobileVoiceStopOutcome>;
  /**
   * Loudness updates, delivered straight to the waveform.
   *
   * Deliberately not React state: sampling runs ten times a second, and holding
   * it in the composer re-rendered the entire composer subtree — attachment
   * chips, mention panel, sheets — at that rate, which is what made the
   * recording bar look like a stuttering app.
   */
  subscribeToLevels(listener: (levels: readonly number[]) => void): () => void;
};

export function useMobileVoiceMessageRecorder(): MobileVoiceMessageRecorder {
  const recorder = useAudioRecorder(VOICE_MESSAGE_RECORDING_OPTIONS);
  const [phase, setPhase] = useState<MobileVoiceMessageRecorderPhase>("idle");
  /** Guards read synchronously; `phase` state lands a render too late for them. */
  const phaseRef = useRef<MobileVoiceMessageRecorderPhase>("idle");
  const recordingStartedAtRef = useRef<number | null>(null);
  const startPromiseRef = useRef<Promise<"denied" | "error" | "recording"> | null>(null);
  const levelsRef = useRef<readonly number[]>([]);
  const levelListenersRef = useRef(new Set<(levels: readonly number[]) => void>());
  const meterTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const applyPhase = useCallback((next: MobileVoiceMessageRecorderPhase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  const publishLevels = useCallback((next: readonly number[]) => {
    levelsRef.current = next;
    for (const listener of levelListenersRef.current) {
      listener(next);
    }
  }, []);

  const stopMetering = useCallback(() => {
    if (meterTimerRef.current) {
      clearInterval(meterTimerRef.current);
      meterTimerRef.current = null;
    }
  }, []);

  const startMetering = useCallback(() => {
    stopMetering();
    meterTimerRef.current = setInterval(() => {
      let metering: number | undefined;
      try {
        metering = recorder.getStatus().metering;
      } catch {
        // A recorder torn down between ticks simply stops contributing samples.
        return;
      }
      publishLevels(
        appendMobileVoiceMeterLevel(levelsRef.current, normalizeMobileVoiceMeterLevel(metering)),
      );
    }, VOICE_MESSAGE_METER_INTERVAL_MS);
  }, [publishLevels, recorder, stopMetering]);

  useEffect(() => stopMetering, [stopMetering]);

  const start = useCallback(async () => {
    if (phaseRef.current !== "idle" && phaseRef.current !== "error") {
      return "error" as const;
    }

    applyPhase("preparing");
    publishLevels([]);
    const attempt = (async () => {
      try {
        const permission = await AudioModule.requestRecordingPermissionsAsync();
        if (!permission.granted) {
          applyPhase("idle");
          return "denied" as const;
        }

        await setAudioModeAsync({
          allowsRecording: true,
          playsInSilentMode: true,
          shouldPlayInBackground: false,
        });
        await recorder.prepareToRecordAsync();
        recorder.record();
        recordingStartedAtRef.current = Date.now();
        applyPhase("recording");
        startMetering();
        return "recording" as const;
      } catch {
        applyPhase("error");
        return "error" as const;
      }
    })();

    startPromiseRef.current = attempt;
    try {
      return await attempt;
    } finally {
      if (startPromiseRef.current === attempt) {
        startPromiseRef.current = null;
      }
    }
  }, [applyPhase, publishLevels, recorder, startMetering]);

  /**
   * Releasing the button while the recorder is still preparing is normal — the
   * permission dialog and `prepareToRecordAsync` take real time. Waiting for the
   * start to settle is what stops a take from running on with nobody left to
   * end it.
   */
  const settleStart = useCallback(async () => {
    const pending = startPromiseRef.current;
    if (pending) {
      await pending.catch(() => undefined);
    }
  }, []);

  const releaseAudioMode = useCallback(async () => {
    await setAudioModeAsync({ allowsRecording: false, shouldPlayInBackground: false }).catch(
      () => undefined,
    );
  }, []);

  const stop = useCallback(async (): Promise<MobileVoiceStopOutcome> => {
    await settleStart();
    if (phaseRef.current !== "recording") {
      return { status: "idle" };
    }

    applyPhase("stopping");
    stopMetering();
    try {
      const startedAt = recordingStartedAtRef.current;
      recordingStartedAtRef.current = null;
      // The native duration is the honest one; the wall clock only covers the
      // window between `record()` returning and this call.
      let nativeDurationSeconds = 0;
      try {
        nativeDurationSeconds = Math.max(0, recorder.getStatus().durationMillis / 1_000);
      } catch {
        nativeDurationSeconds = 0;
      }
      const wallClockSeconds =
        startedAt !== null ? Math.max(0, (Date.now() - startedAt) / 1_000) : 0;
      const durationSeconds = Math.max(nativeDurationSeconds, wallClockSeconds);

      await recorder.stop();
      const uri = recorder.uri;
      if (!uri) {
        return { status: "failed" };
      }

      const recordingFile = new ExpoFile(uri);
      if (durationSeconds < VOICE_MESSAGE_MIN_DURATION_SECONDS) {
        if (recordingFile.exists) {
          recordingFile.delete();
        }
        return { status: "too-short" };
      }

      const size = recordingFile.size;
      validateMobileMessageAttachment({
        contentType: VOICE_MESSAGE_CONTENT_TYPE,
        name: VOICE_MESSAGE_FILE_NAME,
        size,
        uri,
      });

      return {
        attachment: {
          durationSeconds: Math.round(durationSeconds * 10) / 10,
          file: {
            lastModified: Date.now(),
            name: VOICE_MESSAGE_FILE_NAME,
            size,
            type: VOICE_MESSAGE_CONTENT_TYPE,
            uri,
          } as unknown as File,
          kind: getMobileMessageAttachmentKind(VOICE_MESSAGE_CONTENT_TYPE),
          localUri: uri,
        },
        status: "recorded",
      };
    } catch {
      return { status: "failed" };
    } finally {
      await releaseAudioMode();
      publishLevels([]);
      applyPhase("idle");
    }
  }, [applyPhase, publishLevels, recorder, releaseAudioMode, settleStart, stopMetering]);

  const discard = useCallback(async (): Promise<void> => {
    await settleStart();
    if (phaseRef.current !== "recording") {
      return;
    }

    applyPhase("stopping");
    stopMetering();
    try {
      recordingStartedAtRef.current = null;
      await recorder.stop();
      const uri = recorder.uri;
      if (uri) {
        const recordingFile = new ExpoFile(uri);
        if (recordingFile.exists) {
          recordingFile.delete();
        }
      }
    } catch {
      // A discard that cannot reach the file still ends the take.
    } finally {
      await releaseAudioMode();
      publishLevels([]);
      applyPhase("idle");
    }
  }, [applyPhase, publishLevels, recorder, releaseAudioMode, settleStart, stopMetering]);

  const getLevels = useCallback(() => levelsRef.current, []);

  const subscribeToLevels = useCallback((listener: (levels: readonly number[]) => void) => {
    levelListenersRef.current.add(listener);
    return () => {
      levelListenersRef.current.delete(listener);
    };
  }, []);

  // Stable across renders so the waveform's subscription is not torn down and
  // rebuilt every time anything else in the composer changes.
  return useMemo(
    () => ({
      discard,
      getLevels,
      isRecording: phase === "recording" || phase === "preparing",
      phase,
      start,
      stop,
      subscribeToLevels,
    }),
    [discard, getLevels, phase, start, stop, subscribeToLevels],
  );
}
