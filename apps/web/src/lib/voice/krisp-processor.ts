import type { KrispNoiseFilterProcessor } from "@livekit/krisp-noise-filter";
import type { AudioProcessorOptions, LocalAudioTrack, Track, TrackProcessor } from "livekit-client";

export const KRISP_PROCESSOR_NAME = "livekit-noise-filter";

// LiveKit locks setProcessor, but its getProcessor check happens before that lock.
// Two callers can both observe an empty track and reinstall (destroy) the same instance.
const trackOperations = new WeakMap<LocalAudioTrack, Promise<unknown>>();

function withTrackLock<T>(track: LocalAudioTrack, operation: () => Promise<T>): Promise<T> {
  const previous = trackOperations.get(track) ?? Promise.resolve();
  const pending = previous.then(operation, operation);
  const settled = pending.then(
    () => undefined,
    () => undefined,
  );
  trackOperations.set(track, settled);
  void settled.then(() => {
    if (trackOperations.get(track) === settled) trackOperations.delete(track);
  });
  return pending;
}

export function enableKrispProcessor(
  track: LocalAudioTrack,
  processor: KrispNoiseFilterProcessor,
): Promise<boolean> {
  return withTrackLock(track, async () => {
    const currentProcessor = track.getProcessor();
    if (currentProcessor?.name === KRISP_PROCESSOR_NAME && currentProcessor !== processor) {
      await track.stopProcessor();
    }
    if (track.getProcessor() !== processor) {
      await track.setProcessor(
        processor as unknown as TrackProcessor<Track.Kind.Audio, AudioProcessorOptions>,
      );
    }
    const enabled = await processor.setEnabled(true);
    return (enabled ?? processor.isEnabled()) === true;
  });
}

export function detachKrispProcessor(track: LocalAudioTrack): Promise<void> {
  return withTrackLock(track, async () => {
    if (track.getProcessor()?.name === KRISP_PROCESSOR_NAME) await track.stopProcessor();
  });
}
