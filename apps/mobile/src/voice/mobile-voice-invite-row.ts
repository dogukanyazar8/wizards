/**
 * How one candidate row in the "invite to room" sheet reads at a glance. The
 * label stays with the screen because it is copy; the tone, the glyph and the
 * pressability are decisions, so they live here where they can be proven.
 */

import type { MobileVoiceInviteStatus } from "./mobile-voice-room-contract";

export type MobileVoiceInviteRowTone = "accent" | "danger" | "neutral" | "success";

export type MobileVoiceInviteRowIcon =
  "checkmark" | "close" | "paper-plane-outline" | "person-add-outline" | "refresh";

export interface MobileVoiceInviteRowPresentation {
  /** Drives the spinner in place of a glyph while the request is open. */
  readonly busy: boolean;
  readonly disabled: boolean;
  readonly icon: MobileVoiceInviteRowIcon | null;
  readonly tone: MobileVoiceInviteRowTone;
}

export function getMobileVoiceInviteRowPresentation(
  status: MobileVoiceInviteStatus | undefined,
): MobileVoiceInviteRowPresentation {
  switch (status) {
    case "sending":
      return { busy: true, disabled: true, icon: null, tone: "neutral" };
    case "sent":
      return { busy: false, disabled: true, icon: "paper-plane-outline", tone: "neutral" };
    case "accepted":
      return { busy: false, disabled: true, icon: "checkmark", tone: "success" };
    // Declining is the invitee's answer, not a dead end: the host may ask again.
    case "declined":
      return { busy: false, disabled: false, icon: "close", tone: "neutral" };
    case "failed":
      return { busy: false, disabled: false, icon: "refresh", tone: "danger" };
    default:
      return { busy: false, disabled: false, icon: "person-add-outline", tone: "accent" };
  }
}
