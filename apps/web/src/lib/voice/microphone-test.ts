import { buildAudioCaptureOptions } from "@/lib/voice/media-capabilities";
import type { VoiceAudioPreferences } from "@/store/voice-store";

type AudioElementWithSinkId = HTMLAudioElement & {
  setSinkId?: (sinkId: string) => Promise<void>;
};

export type MicrophoneTestSource = {
  owned: boolean;
  stream: MediaStream;
  track: MediaStreamTrack;
  released: boolean;
};

type AcquireMicrophoneTestSourceInput = {
  activeTrack: MediaStreamTrack | null;
  createMediaStream?: (tracks: MediaStreamTrack[]) => MediaStream;
  getUserMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  isMuted: boolean;
  preferences: VoiceAudioPreferences;
};

export class MicrophoneTestSourceUnavailableError extends Error {
  constructor() {
    super("Microphone test source is unavailable");
    this.name = "MicrophoneTestSourceUnavailableError";
  }
}

export async function acquireMicrophoneTestSource({
  activeTrack,
  createMediaStream = (tracks) => new MediaStream(tracks),
  getUserMedia = (constraints) => navigator.mediaDevices.getUserMedia(constraints),
  isMuted,
  preferences,
}: AcquireMicrophoneTestSourceInput): Promise<MicrophoneTestSource> {
  if (!isMuted && activeTrack?.readyState === "live") {
    return {
      owned: false,
      released: false,
      stream: createMediaStream([activeTrack]),
      track: activeTrack,
    };
  }

  const stream = await getUserMedia({
    audio: buildAudioCaptureOptions(preferences),
    video: false,
  });
  const track = stream.getAudioTracks()[0];
  if (!track) {
    for (const streamTrack of stream.getTracks()) {
      streamTrack.stop();
    }
    throw new MicrophoneTestSourceUnavailableError();
  }

  return {
    owned: true,
    released: false,
    stream,
    track,
  };
}

export function releaseMicrophoneTestSource(source: MicrophoneTestSource) {
  if (!source.owned || source.released) {
    return;
  }

  source.released = true;
  for (const track of source.stream.getTracks()) {
    track.stop();
  }
}

export async function routeMicrophoneTestOutput(element: HTMLAudioElement, outputDeviceId: string) {
  const routableElement = element as AudioElementWithSinkId;
  if (!routableElement.setSinkId) {
    return;
  }

  await routableElement.setSinkId(outputDeviceId);
}

export function getMicrophoneTestLevelState(level: number): "active" | "quiet" {
  return level >= 0.01 ? "active" : "quiet";
}
