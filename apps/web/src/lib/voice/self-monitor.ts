import {
  acquireMicrophoneTestSource,
  releaseMicrophoneTestSource,
  routeMicrophoneTestOutput,
  type MicrophoneTestSource,
} from "@/lib/voice/microphone-test";
import type { VoiceAudioPreferences } from "@/store/voice-store";

export type SelfMonitorStatus =
  "idle" | "starting" | "listening" | "denied" | "unavailable" | "output-error" | "error";

/** Owns only the settings preview; never publishes or stops a call's microphone. */
export class SelfMonitorSession {
  private generation = 0;
  private source: MicrophoneTestSource | null = null;
  private audio: HTMLAudioElement | null = null;
  private status: SelfMonitorStatus = "idle";
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly dependencies: {
      acquire?: (preferences: VoiceAudioPreferences) => Promise<MicrophoneTestSource>;
      createAudio?: () => HTMLAudioElement;
    } = {},
  ) {}

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): SelfMonitorStatus => this.status;

  private publish(status: SelfMonitorStatus) {
    if (this.status === status) return;
    this.status = status;
    for (const listener of this.listeners) listener();
  }

  private ended = () => {
    this.stop();
    this.publish("unavailable");
  };

  start = async (preferences: VoiceAudioPreferences): Promise<void> => {
    this.stop();
    const generation = this.generation;
    this.publish("starting");
    let phase: "capture" | "output" | "play" = "capture";
    try {
      if (!this.dependencies.acquire && !globalThis.navigator?.mediaDevices?.getUserMedia) {
        this.publish("unavailable");
        return;
      }
      const source = await (this.dependencies.acquire
        ? this.dependencies.acquire(preferences)
        : acquireMicrophoneTestSource({ activeTrack: null, isMuted: true, preferences }));
      if (generation !== this.generation) {
        releaseMicrophoneTestSource(source);
        return;
      }
      this.source = source;
      source.track.addEventListener("ended", this.ended);
      const audio = this.dependencies.createAudio?.() ?? new Audio();
      this.audio = audio;
      audio.srcObject = source.stream;
      audio.volume = 0.5;
      phase = "output";
      if (
        !audio.setSinkId &&
        preferences.outputDeviceId !== "default" &&
        preferences.outputDeviceId !== ""
      ) {
        throw new Error("Output selection unavailable");
      }
      await routeMicrophoneTestOutput(audio, preferences.outputDeviceId);
      if (generation !== this.generation) return;
      phase = "play";
      await audio.play();
      if (generation !== this.generation) return;
      this.publish("listening");
    } catch (error) {
      if (generation !== this.generation) return;
      this.stop();
      this.publish(
        phase === "output"
          ? "output-error"
          : error instanceof Error && ["NotAllowedError", "SecurityError"].includes(error.name)
            ? "denied"
            : error instanceof Error &&
                ["NotFoundError", "NotReadableError", "OverconstrainedError"].includes(error.name)
              ? "unavailable"
              : "error",
      );
    }
  };

  stop = () => {
    this.generation += 1;
    if (this.audio) {
      this.audio.pause();
      this.audio.srcObject = null;
      this.audio = null;
    }
    if (this.source) {
      this.source.track.removeEventListener("ended", this.ended);
      releaseMicrophoneTestSource(this.source);
      this.source = null;
    }
    this.publish("idle");
  };
}
