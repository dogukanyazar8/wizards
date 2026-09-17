import { LocalAudioTrack, LocalVideoTrack, Track, type LocalTrack } from "livekit-client";

type CaptureControllerLike = { setFocusBehavior(value: "focus-captured-surface"): void };

/** Called synchronously from the click: no probe or native invocation before the picker. */
export async function captureGoLiveTracks(input: {
  width: number;
  height: number;
  frameRate: number;
  shareSystemAudio: boolean;
}): Promise<LocalTrack[]> {
  const Controller = (
    globalThis as typeof globalThis & { CaptureController?: new () => CaptureControllerLike }
  ).CaptureController;
  const controller = Controller ? new Controller() : undefined;
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: {
      displaySurface: "window",
      width: { ideal: input.width },
      height: { ideal: input.height },
      frameRate: { ideal: input.frameRate },
    },
    audio: input.shareSystemAudio ? { suppressLocalAudioPlayback: true } : false,
    preferCurrentTab: false,
    selfBrowserSurface: "exclude",
    surfaceSwitching: "include",
    systemAudio: input.shareSystemAudio ? "include" : "exclude",
    controller,
  } as DisplayMediaStreamOptions);
  try {
    // Optional focus control must not discard otherwise valid capture.
    try {
      controller?.setFocusBehavior("focus-captured-surface");
    } catch {
      /* Unsupported surface or expired focus window. */
    }
    return stream.getTracks().map((mediaTrack) => {
      const track =
        mediaTrack.kind === "video"
          ? new LocalVideoTrack(mediaTrack, undefined, false)
          : new LocalAudioTrack(mediaTrack, undefined, false);
      track.source =
        mediaTrack.kind === "video" ? Track.Source.ScreenShare : Track.Source.ScreenShareAudio;
      if (mediaTrack.kind === "video") mediaTrack.contentHint = "motion";
      // LiveKit's specialized processor optionality is narrower than its base type.
      return track as unknown as LocalTrack;
    });
  } catch (error) {
    for (const track of stream.getTracks()) track.stop();
    throw error;
  }
}
