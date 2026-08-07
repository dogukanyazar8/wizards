import { Track } from "livekit-client";

/**
 * Remote-video half of the mobile background rule.
 *
 * `adaptiveStream.pauseVideoInBackground` is inert on React Native: livekit only
 * installs an app-visibility listener when `document` exists (`isWeb()`), so
 * `isInBackground` never flips and the phone keeps downloading every remote
 * camera and screen share while the app sits in the background. This module is
 * the replacement, driven by the app's own `AppState` listener.
 *
 * `setEnabled(false)` is used rather than `setSubscribed(false)`: it tells the
 * server to stop sending data for the track while the subscription — and the
 * negotiated transceiver — stays in place, so coming back to the foreground is a
 * server-side flag flip instead of a renegotiation followed by black tiles.
 *
 * Local camera and screen share teardown stays with
 * `mobile-voice-background-media.ts`; this module never touches a local
 * publication (they carry no `setEnabled`) and never touches audio (filtered by
 * kind), so voice keeps flowing in the background.
 */

/**
 * The subset of `RemoteTrackPublication` this rule needs. Kept duck-typed so the
 * rule is testable without a livekit room; only the `Track.Kind` enum is
 * imported.
 */
export type MobileBackgroundVideoPublication = {
  readonly isEnabled?: boolean;
  readonly isSubscribed?: boolean;
  readonly kind?: string;
  readonly trackSid?: string;
  setEnabled?: (enabled: boolean) => void;
};

export type MobileBackgroundVideoParticipant = {
  readonly trackPublications?: ReadonlyMap<string, MobileBackgroundVideoPublication>;
};

export type MobileBackgroundVideoRoom = {
  readonly remoteParticipants?: ReadonlyMap<string, MobileBackgroundVideoParticipant>;
};

/**
 * livekit's own bookkeeping behind `setEnabled`, reached through a cast because
 * `requestedDisabled` is `protected` on `RemoteTrackPublication` (declaring it
 * on the duck type above would make a real room fail to typecheck).
 *
 * `setEnabled(x)` writes `requestedDisabled = !x`, and `isEnabled` reads
 * `requestedDisabled !== undefined ? !requestedDisabled : visible`. So calling
 * `setEnabled(true)` on the way back would not restore the status quo: it pins
 * the publication to "enabled" forever and adaptive stream's viewport signal
 * (`visible`, fed by `@livekit/react-native`'s `ViewPortDetector`) can never
 * pause that track again. Clearing the field instead hands the decision back,
 * and the public `emitTrackUpdate()` re-sends whatever adaptive stream currently
 * wants — which is why a tile that scrolled off screen while we were away stays
 * paused after the resume.
 */
type MobileBackgroundVideoPublicationInternals = {
  emitTrackUpdate?: () => void;
  requestedDisabled?: boolean | undefined;
};

/**
 * Returns adaptive stream's ownership of the publication, or false when this
 * livekit build no longer has the fields to hand it back.
 */
function restoreAdaptiveStreamControl(publication: MobileBackgroundVideoPublication): boolean {
  const internals = publication as unknown as MobileBackgroundVideoPublicationInternals;

  if (typeof internals.emitTrackUpdate !== "function" || !("requestedDisabled" in internals)) {
    return false;
  }

  internals.requestedDisabled = undefined;
  internals.emitTrackUpdate();

  return true;
}

function collectRemoteVideoPublications(
  room: MobileBackgroundVideoRoom | null | undefined,
): MobileBackgroundVideoPublication[] {
  const publications: MobileBackgroundVideoPublication[] = [];
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
function isPublicationDisabled(publication: MobileBackgroundVideoPublication): boolean {
  return publication.isEnabled === false;
}

function isOperablePublication(publication: MobileBackgroundVideoPublication): boolean {
  // Local publications have no `setEnabled`; they belong to the local-media rule.
  if (typeof publication.setEnabled !== "function") {
    return false;
  }

  // livekit refuses (and warns about) settings changes on an unsubscribed track.
  return publication.isSubscribed !== false;
}

/**
 * Stops the server from sending remote video while the app is backgrounded, and
 * returns the track sids that were actually turned off.
 *
 * A publication that is already disabled is left alone: a track the user (or
 * adaptive stream's viewport detector) already paused is not ours to resume.
 * A sid is only recorded once `isEnabled` confirms the track really went down,
 * so a publication livekit refused to change is never claimed.
 */
export function suspendRemoteVideoForBackground(
  room: MobileBackgroundVideoRoom | null | undefined,
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
 * Hands exactly the publications this rule suspended back to adaptive stream,
 * and returns the track sids it released. A sid that is no longer in the room
 * (the participant left, or turned their camera off while we were away) simply
 * drops out.
 *
 * This is deliberately not `setEnabled(true)`: see
 * `MobileBackgroundVideoPublicationInternals`. A build that no longer exposes
 * those fields falls back to `setEnabled(true)`, which still restores the video
 * — it just costs adaptive stream's viewport pausing for the rest of the call.
 */
export function resumeRemoteVideoFromBackground(
  room: MobileBackgroundVideoRoom | null | undefined,
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

    if (!restoreAdaptiveStreamControl(publication)) {
      publication.setEnabled?.(true);
    }

    resumedTrackSids.push(trackSid);
  }

  return resumedTrackSids;
}
