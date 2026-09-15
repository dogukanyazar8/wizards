import { parseVoiceMiniSnapshot, type VoiceMiniSnapshot } from "@wizards/types";
import {
  WHISPR_DESKTOP_GAME_OVERLAY_SNAPSHOT_EVENT,
  WHISPR_DESKTOP_VOICE_MINI_SNAPSHOT_EVENT,
} from "./runtime";

type SnapshotTarget = EventTarget & {
  __WHISPR_DESKTOP_SNAPSHOTS__?: Record<string, unknown>;
};

/** Listen before replaying native data: React can mount after the first publication. */
function subscribeSnapshots(
  eventName: string,
  target: SnapshotTarget,
  onSnapshot: (snapshot: VoiceMiniSnapshot) => void,
) {
  const accept = (value: unknown) => {
    const snapshot = parseVoiceMiniSnapshot(value);
    if (snapshot) onSnapshot(snapshot);
  };
  const handleSnapshot = (event: Event) => accept((event as CustomEvent<unknown>).detail);
  target.addEventListener(eventName, handleSnapshot);
  accept(target.__WHISPR_DESKTOP_SNAPSHOTS__?.[eventName]);
  return () => target.removeEventListener(eventName, handleSnapshot);
}

export function subscribeVoiceMiniSnapshots(
  target: SnapshotTarget,
  onSnapshot: (snapshot: VoiceMiniSnapshot) => void,
) {
  return subscribeSnapshots(WHISPR_DESKTOP_VOICE_MINI_SNAPSHOT_EVENT, target, onSnapshot);
}

export function subscribeGameOverlaySnapshots(
  target: SnapshotTarget,
  onSnapshot: (snapshot: VoiceMiniSnapshot) => void,
) {
  return subscribeSnapshots(WHISPR_DESKTOP_GAME_OVERLAY_SNAPSHOT_EVENT, target, onSnapshot);
}
