import type Ionicons from "@expo/vector-icons/Ionicons";
import type { ComponentProps } from "react";

import { activeMobileCopy } from "../../locale/mobile-locale-preferences";
import type { MobileDMCallSession } from "../../voice/mobile-dm-call-state";
import type { MobileVoiceInviteReceived } from "../../voice/mobile-voice-room-contract";
import type { ButtonVariant } from "../components/kit/button";

const copy = activeMobileCopy;

type IoniconsName = ComponentProps<typeof Ionicons>["name"];

/** A queued voice-room invite the sheet may render; errors ride along the entry. */
export type MobileVoiceInviteOverlayEntry = MobileVoiceInviteReceived & {
  readonly errorMessage?: string | null;
};

export type MobileIncomingRequestSource = "call" | "invite";
export type MobileIncomingRequestKind = "video-call" | "voice-call" | "voice-invite";

export interface MobileIncomingRequestAction {
  readonly icon: IoniconsName;
  readonly label: string;
  readonly variant: ButtonVariant;
}

/**
 * Normalized shape both an inbound DM call and a voice-room invite collapse into,
 * so a single sheet renders either without branching on the source in the view.
 */
export interface MobileIncomingRequestPresentation {
  readonly accept: MobileIncomingRequestAction;
  readonly avatarLabel: string;
  readonly avatarUrl: string | null;
  readonly badgeIcon: IoniconsName;
  readonly decline: MobileIncomingRequestAction;
  readonly errorMessage: string | null;
  readonly identityId: string;
  readonly kind: MobileIncomingRequestKind;
  /** Only a live call rings: the avatar pulses and the phone can vibrate. */
  readonly ringing: boolean;
  readonly source: MobileIncomingRequestSource;
  readonly subtitle: string;
  readonly title: string;
}

/** Tone A: answering a call is the phone metaphor — green accept, red decline. */
function resolveMobileIncomingCallPresentation(
  call: MobileDMCallSession,
): MobileIncomingRequestPresentation {
  const name = call.title;
  const isVideo = call.isVideo;

  return {
    accept: {
      icon: isVideo ? "videocam" : "call",
      label: copy.directCallAcceptAction,
      variant: "success",
    },
    avatarLabel: name,
    avatarUrl: call.peer?.avatarUrl ?? null,
    badgeIcon: isVideo ? "videocam" : "call",
    decline: { icon: "close", label: copy.directCallDeclineAction, variant: "danger" },
    errorMessage: null,
    identityId: call.peer?.id ?? call.conversationId,
    kind: isVideo ? "video-call" : "voice-call",
    ringing: true,
    source: "call",
    subtitle: copy.directCallIncomingDescription.replace("{name}", name),
    title: isVideo ? copy.directCallIncomingVideoTitle : copy.directCallIncomingVoiceTitle,
  };
}

/** A voice-room invite is not a ring: accent join, neutral dismiss. */
function resolveMobileVoiceInvitePresentation(
  invite: MobileVoiceInviteOverlayEntry,
): MobileIncomingRequestPresentation {
  const name = invite.fromUser.displayName ?? invite.fromUser.username;

  return {
    accept: { icon: "enter", label: copy.voiceInviteAcceptAction, variant: "primary" },
    avatarLabel: name,
    avatarUrl: invite.fromUser.avatarUrl,
    badgeIcon: "people",
    decline: { icon: "close", label: copy.voiceInviteDeclineAction, variant: "secondary" },
    errorMessage: invite.errorMessage ?? null,
    identityId: invite.fromUser.id,
    kind: "voice-invite",
    ringing: false,
    source: "invite",
    subtitle: copy.voiceInviteIncomingDescription
      .replace("{name}", name)
      .replace("{server}", invite.serverName)
      .replace("{channel}", invite.channelName),
    title: copy.voiceInviteIncomingTitle,
  };
}

/**
 * Picks the one request the sheet shows. A live inbound ring outranks an invite:
 * a call is time-critical, an invite can wait its turn behind it.
 */
export function resolveMobileIncomingRequest(input: {
  readonly call: MobileDMCallSession | null;
  readonly invite: MobileVoiceInviteOverlayEntry | null;
}): MobileIncomingRequestPresentation | null {
  if (input.call && input.call.status === "ringing-in" && input.call.peer) {
    return resolveMobileIncomingCallPresentation(input.call);
  }

  if (input.invite) {
    return resolveMobileVoiceInvitePresentation(input.invite);
  }

  return null;
}
