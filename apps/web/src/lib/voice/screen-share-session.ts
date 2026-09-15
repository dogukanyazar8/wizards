import {
  Track,
  LocalTrack,
  type Room,
  type ScreenShareCaptureOptions,
  type TrackPublishOptions,
} from "livekit-client";

export type ScreenShareOperationStatus = "idle" | "starting" | "switching" | "stopping";

function sharedTracks(room: Room): LocalTrack[] {
  return room.localParticipant
    .getTrackPublications()
    .filter(
      (publication) =>
        publication.source === Track.Source.ScreenShare ||
        publication.source === Track.Source.ScreenShareAudio,
    )
    .flatMap((publication) => (publication.track instanceof LocalTrack ? [publication.track] : []));
}

function release(tracks: readonly LocalTrack[]) {
  for (const track of tracks) {
    track.stop();
    track.detach();
  }
}

async function unpublish(room: Room, tracks: readonly LocalTrack[]) {
  // Release capture before network I/O: a failed unpublish must never keep recording.
  release(tracks);
  const results = await Promise.allSettled(
    tracks.map((track) => room.localParticipant.unpublishTrack(track, true)),
  );
  const failures = results.filter(
    (result): result is PromiseRejectedResult => result.status === "rejected",
  );
  if (failures.length)
    throw new AggregateError(
      failures.map((result) => result.reason),
      "SCREEN_SHARE_UNPUBLISH_FAILED",
    );
}

/** Serializes picker/publication operations and owns every newly captured track until publication. */
export class ScreenShareSession {
  private request: {
    room: Room;
    cancelled: boolean;
    tracks: LocalTrack[];
    kind: "starting" | "switching";
  } | null = null;
  private stopping: Promise<void> | null = null;
  private readonly listeners = new Set<() => void>();
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getSnapshot = (): ScreenShareOperationStatus =>
    this.stopping || this.request?.cancelled ? "stopping" : (this.request?.kind ?? "idle");
  private notify() {
    for (const listener of this.listeners) listener();
  }

  cancel = () => {
    if (this.request) {
      this.request.cancelled = true;
      release(this.request.tracks);
      this.notify();
    }
  };

  stop = (room: Room): Promise<void> => {
    if (this.request?.room === room) this.cancel();
    if (this.stopping) return this.stopping;
    const work = unpublish(room, sharedTracks(room));
    this.stopping = work.finally(() => {
      this.stopping = null;
      this.notify();
    });
    this.notify();
    return this.stopping;
  };

  start = async (
    room: Room,
    options: {
      capture: ScreenShareCaptureOptions;
      publish: TrackPublishOptions;
      replace: boolean;
      isCurrent: () => boolean;
      canPublish: () => boolean;
      onEnded: () => void;
    },
  ): Promise<boolean> => {
    if (this.request || this.stopping) return false;
    const request = {
      room,
      cancelled: false,
      tracks: [] as LocalTrack[],
      kind: options.replace ? ("switching" as const) : ("starting" as const),
    };
    this.request = request;
    this.notify();
    const current = () => !request.cancelled && options.isCurrent();
    let published = false;
    let replacing = false;
    try {
      // Calling capture before the first await preserves the user's activation.
      request.tracks = await room.localParticipant.createScreenTracks(options.capture);
      if (!current()) return false;
      if (!options.canPublish()) throw new Error("SCREEN_SHARE_NOT_ALLOWED");
      const video = request.tracks.find((track) => track.source === Track.Source.ScreenShare);
      if (!video || video.mediaStreamTrack.readyState !== "live")
        throw new Error("SCREEN_SHARE_SOURCE_ENDED");
      if (options.replace) {
        // Keep the old source until the picker succeeds. Cancel never interrupts the old share.
        replacing = true;
        await unpublish(room, sharedTracks(room));
        if (!current()) return false;
      }
      video.mediaStreamTrack.addEventListener(
        "ended",
        () => {
          if (options.isCurrent() && sharedTracks(room).includes(video)) options.onEnded();
        },
        { once: true },
      );
      for (const track of request.tracks) {
        if (!current()) return false;
        await room.localParticipant.publishTrack(track, {
          ...options.publish,
          source: track.source,
        });
      }
      if (!current() || video.mediaStreamTrack.readyState !== "live") return false;
      published = true;
      return true;
    } catch (error) {
      if (!current()) return false;
      // Picker dismissal and denied capture cannot be distinguished reliably by the browser.
      if (
        !replacing &&
        request.tracks.length === 0 &&
        error instanceof Error &&
        ["NotAllowedError", "AbortError"].includes(error.name)
      )
        return false;
      throw error;
    } finally {
      try {
        if (!published && request.tracks.length) await unpublish(room, request.tracks);
      } finally {
        if (this.request === request) this.request = null;
        this.notify();
      }
    }
  };
}
