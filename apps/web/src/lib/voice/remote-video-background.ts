import { Track } from "livekit-client";

/**
 * Remote-video half of the web background rule, mirroring
 * `apps/mobile/src/voice/mobile-remote-video-background.ts`.
 *
 * livekit pauses remote video on a hidden tab through
 * `adaptiveStream.pauseVideoInBackground` — but only while adaptive stream is
 * on. Direct calls turn it off on purpose (one remote video, shown full size,
 * where adaptive measurement costs sharpness and buys nothing), which also
 * takes the background pause with it. This module is the replacement for those
 * sessions, driven by the document's own `visibilitychange`.
 *
 * `setEnabled(false)` is used rather than `setSubscribed(false)`: it tells the
 * server to stop sending data for the track while the subscription — and the
 * negotiated transceiver — stays in place, so coming back to the tab is a
 * server-side flag flip instead of a renegotiation followed by black tiles.
 *
 * Audio is never touched (filtered by kind), so a call keeps its voice while
 * the tab sits in the background.
 */

/**
 * The subset of `RemoteTrackPublication` this rule needs. Kept duck-typed so the
 * rule is testable without a livekit room; only the `Track.Kind` enum is
 * imported.
 */
export type BackgroundVideoPublication = {
  readonly isEnabled?: boolean;
  readonly isSubscribed?: boolean;
  readonly kind?: string;
  readonly trackSid?: string;
  setEnabled?: (enabled: boolean) => void;
};

export type BackgroundVideoParticipant = {
  readonly trackPublications?: ReadonlyMap<string, BackgroundVideoPublication>;
};

export type BackgroundVideoRoom = {
  readonly remoteParticipants?: ReadonlyMap<string, BackgroundVideoParticipant>;
};

/**
 * livekit's own bookkeeping behind `setEnabled`, reached through a cast because
 * `requestedDisabled` is `protected` on `RemoteTrackPublication`.
 *
 * `setEnabled(x)` writes `requestedDisabled = !x`, and `isEnabled` reads
 * `requestedDisabled !== undefined ? !requestedDisabled : isAdaptiveStream ? visible : true`.
 * Calling `setEnabled(true)` on the way back would therefore pin the
 * publication to "enabled" forever, so a channel room that later re-enables
 * adaptive stream could never pause that track by viewport again. Clearing the
 * field hands the decision back and the public `emitTrackUpdate()` re-sends
 * whatever the current mode wants.
 */
type BackgroundVideoPublicationInternals = {
  emitTrackUpdate?: () => void;
  requestedDisabled?: boolean | undefined;
};

/**
 * Returns ownership of the publication to livekit, or false when this build no
 * longer has the fields to hand it back.
 */
function restoreLiveKitControl(publication: BackgroundVideoPublication): boolean {
  const internals = publication as unknown as BackgroundVideoPublicationInternals;

  if (typeof internals.emitTrackUpdate !== "function" || !("requestedDisabled" in internals)) {
    return false;
  }

  internals.requestedDisabled = undefined;
  internals.emitTrackUpdate();

  return true;
}

function collectRemoteVideoPublications(
  room: BackgroundVideoRoom | null | undefined,
): BackgroundVideoPublication[] {
  const publications: BackgroundVideoPublication[] = [];
  const participants = room?.remoteParticipants;

  if (!participants) {
    return publications;
  }

  for (const participant of participants.values()) {
    const participantPublications = participant?.trackPublications;
    if (!participantPublications) {
      continue;
    }

    for (const publication of participantPublications.values()) {
      // Audio is never suspended: a backgrounded call must keep its voice.
      if (!publication || publication.kind !== Track.Kind.Video) {
        continue;
      }

      publications.push(publication);
    }
  }

  return publications;
}

/**
 * Read through a function so the check is re-evaluated against the live object:
 * `setEnabled` flips `isEnabled` underneath, which narrowing would hide.
 */
function isPublicationDisabled(publication: BackgroundVideoPublication): boolean {
  return publication.isEnabled === false;
}

function isOperablePublication(publication: BackgroundVideoPublication): boolean {
  // Local publications have no `setEnabled`; they belong to the local-media rule.
  if (typeof publication.setEnabled !== "function") {
    return false;
  }

  // livekit refuses (and warns about) settings changes on an unsubscribed track.
  return publication.isSubscribed !== false;
}

/**
 * Stops the server from sending remote video while the tab is hidden, and
 * returns the track sids that were actually turned off.
 *
 * A publication that is already disabled is left alone: a track the user (or
 * adaptive stream) already paused is not ours to resume. A sid is only recorded
 * once `isEnabled` confirms the track really went down, so a publication livekit
 * refused to change is never claimed.
 */
export function suspendRemoteVideoForBackground(
  room: BackgroundVideoRoom | null | undefined,
): string[] {
  const suspendedTrackSids: string[] = [];

  for (const publication of collectRemoteVideoPublications(room)) {
    const trackSid = publication.trackSid;

    if (!trackSid || !isOperablePublication(publication)) {
      continue;
    }

    if (isPublicationDisabled(publication)) {
      continue;
    }

    publication.setEnabled?.(false);

    // livekit ignores settings changes on a publication it does not consider
    // desired; claiming that sid would mean resuming a track we never paused.
    if (!isPublicationDisabled(publication)) {
      continue;
    }

    suspendedTrackSids.push(trackSid);
  }

  return suspendedTrackSids;
}

/**
 * Hands exactly the publications this rule suspended back to livekit, and
 * returns the track sids it released. A sid that is no longer in the room (the
 * participant left, or turned their camera off while the tab was hidden) simply
 * drops out.
 *
 * Deliberately not `setEnabled(true)`: see
 * `BackgroundVideoPublicationInternals`. A build that no longer exposes those
 * fields falls back to `setEnabled(true)`, which still restores the video — it
 * just costs livekit's own pausing for the rest of the call.
 */
export function resumeRemoteVideoFromBackground(
  room: BackgroundVideoRoom | null | undefined,
  suspendedTrackSids: Iterable<string> | null | undefined,
): string[] {
  const wantedTrackSids = new Set(suspendedTrackSids ?? []);
  const resumedTrackSids: string[] = [];

  if (wantedTrackSids.size === 0) {
    return resumedTrackSids;
  }

  for (const publication of collectRemoteVideoPublications(room)) {
    const trackSid = publication.trackSid;

    if (!trackSid || !wantedTrackSids.has(trackSid) || !isOperablePublication(publication)) {
      continue;
    }

    if (!restoreLiveKitControl(publication)) {
      publication.setEnabled?.(true);
    }

    resumedTrackSids.push(trackSid);
  }

  return resumedTrackSids;
}
