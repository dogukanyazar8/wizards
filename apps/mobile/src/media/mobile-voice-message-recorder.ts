import { useCallback, useState } from "react";
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

const VOICE_MESSAGE_CONTENT_TYPE = "audio/mp4";
const VOICE_MESSAGE_FILE_NAME = "voice-message.m4a";
const VOICE_MESSAGE_RECORDING_OPTIONS = {
  ...RecordingPresets.HIGH_QUALITY,
  directory: "cache" as const,
};

export type MobileVoiceMessageRecorder = {
  readonly isRecording: boolean;
  readonly phase: "error" | "idle" | "preparing" | "recording" | "stopping";
  start(): Promise<"denied" | "error" | "recording">;
  stop(): Promise<MobilePickedMessageAttachment | null>;
};

export function useMobileVoiceMessageRecorder(): MobileVoiceMessageRecorder {
  const recorder = useAudioRecorder(VOICE_MESSAGE_RECORDING_OPTIONS);
  const recorderState = useAudioRecorderState(recorder);
  const [phase, setPhase] = useState<MobileVoiceMessageRecorder["phase"]>("idle");

  const start = useCallback(async () => {
    if (phase === "preparing" || phase === "recording" || phase === "stopping") {
      return "error" as const;
    }

    setPhase("preparing");
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
      await recorder.stop();
      const uri = recorder.uri;
      if (!uri) {
        throw new Error("recording-uri-unavailable");
      }

      const recordingFile = new ExpoFile(uri);
      const size = recordingFile.size;
      validateMobileMessageAttachment({
        contentType: VOICE_MESSAGE_CONTENT_TYPE,
        name: VOICE_MESSAGE_FILE_NAME,
        size,
        uri,
      });

      return {
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

  return {
    isRecording: phase === "recording" || recorderState.isRecording,
    phase,
    start,
    stop,
  };
}
