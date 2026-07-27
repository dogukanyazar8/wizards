/**
 * Where the room's audio is actually coming out of, derived from the device list
 * the platform reports rather than from the speaker button the user last pressed.
 * The 5a/5b dock icon and the participant status badge both read this, so pulling
 * a headset out changes the screen even though nothing in the app was toggled.
 *
 * Pure on purpose: the priority rules are provable without a device or a renderer.
 */

import type { MobileVoiceOutputOption } from "./mobile-voice-device-contract";
import type {
  MobileVoiceAudioOutputMode,
  MobileVoiceRoomParticipant,
} from "./mobile-voice-room-contract";

export type MobileVoiceAudioRoute = "default" | "earpiece" | "headset" | "speaker";

export type MobileVoiceAudioRouteIcon =
  "headset-outline" | "volume-high-outline" | "volume-mute-outline";

export type MobileVoiceParticipantBadgeIcon = MobileVoiceAudioRouteIcon | "mic-off" | "pulse";

export interface MobileVoiceParticipantBadge {
  readonly icon: MobileVoiceParticipantBadgeIcon;
  readonly tone: "danger" | "muted" | "success";
}

/** The device facts a route is derived from; also the diff-guard's comparison key. */
export interface MobileVoiceAudioRouteInput {
  readonly availableAudioOutputs: readonly MobileVoiceOutputOption[];
  readonly selectedAudioOutputId: string | null;
}

export interface MobileVoiceAudioRouteSource extends MobileVoiceAudioRouteInput {
  readonly selfAudioOutput: MobileVoiceAudioOutputMode;
}

function getRouteForOutputId(id: string): MobileVoiceAudioRoute | null {
  if (id === "speaker" || id === "force_speaker") {
    return "speaker";
  }

  if (id === "bluetooth" || id === "headset") {
    return "headset";
  }

  return id === "earpiece" ? "earpiece" : null;
}

export function getMobileVoiceAudioRoute({
  availableAudioOutputs,
  selectedAudioOutputId,
  selfAudioOutput,
}: MobileVoiceAudioRouteSource): MobileVoiceAudioRoute {
  const selected = availableAudioOutputs.some(({ id }) => id === selectedAudioOutputId)
    ? selectedAudioOutputId
    : null;
  const selectedRoute = selected ? getRouteForOutputId(selected) : null;
  if (selectedRoute) {
    return selectedRoute;
  }

  // Nothing explicit: the OS has already moved the audio, so the presence of a
  // headset outranks a speaker mode the system silently overrode.
  if (
    availableAudioOutputs.some(({ labelKey }) => labelKey === "bluetooth" || labelKey === "headset")
  ) {
    return "headset";
  }

  if (selfAudioOutput === "speaker") {
    return "speaker";
  }

  return availableAudioOutputs.some(({ labelKey }) => labelKey === "earpiece")
    ? "earpiece"
    : "default";
}

export function getMobileVoiceAudioRouteIcon(
  route: MobileVoiceAudioRoute,
): MobileVoiceAudioRouteIcon {
  switch (route) {
    case "speaker":
      return "volume-high-outline";
    // No headset and no loudspeaker: the call is on the earpiece, which reads to
    // the user as "speaker off".
    case "earpiece":
      return "volume-mute-outline";
    case "headset":
    // iOS only ever reports `default` / `force_speaker`, so `default` is the
    // neutral hand-off the design draws rather than a distinct route.
    case "default":
      return "headset-outline";
  }
}

export function getMobileVoiceParticipantBadge(
  participant: MobileVoiceRoomParticipant,
  route: MobileVoiceAudioRoute,
): MobileVoiceParticipantBadge {
  if (participant.isMuted) {
    return { icon: "mic-off", tone: "danger" };
  }

  if (participant.isSpeaking) {
    return { icon: "pulse", tone: "success" };
  }

  return {
    // A remote member's output device never reaches this client, so everyone else
    // keeps the design's neutral "listening" headset.
    icon: participant.isSelf ? getMobileVoiceAudioRouteIcon(route) : "headset-outline",
    tone: "muted",
  };
}

/**
 * Guards the polled route sync: a tick that reports the same devices in the same
 * order must not touch state, or the room re-renders every few seconds forever.
 */
export function hasMobileVoiceAudioRouteInputChanged(
  current: MobileVoiceAudioRouteInput,
  next: MobileVoiceAudioRouteInput,
): boolean {
  if (current.selectedAudioOutputId !== next.selectedAudioOutputId) {
    return true;
  }

  if (current.availableAudioOutputs.length !== next.availableAudioOutputs.length) {
    return true;
  }

  return current.availableAudioOutputs.some(
    (option, index) => option.id !== next.availableAudioOutputs[index]?.id,
  );
}
