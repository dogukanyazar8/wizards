import { useCallback, useEffect, useRef, useState } from "react";
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
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

export type MobileVoiceMessageRecorder = {
  discard(): Promise<void>;
  readonly isRecording: boolean;
  /** Newest-last loudness samples, 0…1, for the "1h" recording waveform. */
  readonly levels: readonly number[];
  readonly phase: "error" | "idle" | "preparing" | "recording" | "stopping";
  start(): Promise<"denied" | "error" | "recording">;
  stop(): Promise<MobilePickedMessageAttachment | null>;
};

export function useMobileVoiceMessageRecorder(): MobileVoiceMessageRecorder {
  const recorder = useAudioRecorder(VOICE_MESSAGE_RECORDING_OPTIONS);
  const recorderState = useAudioRecorderState(recorder, VOICE_MESSAGE_METER_INTERVAL_MS);
  const [phase, setPhase] = useState<MobileVoiceMessageRecorder["phase"]>("idle");
  const [levels, setLevels] = useState<readonly number[]>([]);
  const recordingStartedAtRef = useRef<number | null>(null);

  const isRecording = phase === "recording" || recorderState.isRecording;
  const metering = recorderState.metering;

  useEffect(() => {
    if (!isRecording) {
      return;
    }
    setLevels((current) =>
      appendMobileVoiceMeterLevel(current, normalizeMobileVoiceMeterLevel(metering)),
    );
    // `durationMillis` advances on every poll, so it is what makes this effect
    // sample at the polling rate even while someone holds a steady note.
  }, [isRecording, metering, recorderState.durationMillis]);

  const start = useCallback(async () => {
    if (phase === "preparing" || phase === "recording" || phase === "stopping") {
      return "error" as const;
    }

    setPhase("preparing");
    setLevels([]);
    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted) {
        setPhase("idle");
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
      setPhase("recording");
      return "recording" as const;
    } catch {
      setPhase("error");
      return "error" as const;
    }
  }, [phase, recorder]);

  const stop = useCallback(async (): Promise<MobilePickedMessageAttachment | null> => {
    if (phase !== "recording" && !recorderState.isRecording) {
      return null;
    }

    setPhase("stopping");
    try {
      const startedAt = recordingStartedAtRef.current;
      recordingStartedAtRef.current = null;
      const durationSeconds =
        startedAt !== null ? Math.max(0, (Date.now() - startedAt) / 1_000) : 0;
      await recorder.stop();
      const uri = recorder.uri;
      if (!uri) {
        throw new Error("recording-uri-unavailable");
      }

      const recordingFile = new ExpoFile(uri);
      if (durationSeconds < VOICE_MESSAGE_MIN_DURATION_SECONDS) {
        if (recordingFile.exists) {
          recordingFile.delete();
        }
        return null;
      }

      const size = recordingFile.size;
      validateMobileMessageAttachment({
        contentType: VOICE_MESSAGE_CONTENT_TYPE,
        name: VOICE_MESSAGE_FILE_NAME,
        size,
        uri,
      });

      return {
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
      };
    } finally {
      await setAudioModeAsync({ allowsRecording: false, shouldPlayInBackground: false }).catch(
        () => undefined,
      );
      setPhase("idle");
    }
  }, [phase, recorder, recorderState.isRecording]);

  const discard = useCallback(async (): Promise<void> => {
    if (phase !== "recording" && !recorderState.isRecording) {
      return;
    }

    setPhase("stopping");
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
    } finally {
      await setAudioModeAsync({ allowsRecording: false, shouldPlayInBackground: false }).catch(
        () => undefined,
      );
      setPhase("idle");
    }
  }, [phase, recorder, recorderState.isRecording]);

  return {
    discard,
    isRecording,
    levels,
    phase,
    start,
    stop,
  };
}
