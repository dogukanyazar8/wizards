import type { MobileFriendPresenceStatus, MobileUserProfile } from "../mobile-social-client";

/** Which of the handoff card layouts a payload selects: 1a/1b, 1d, or the blocked crop. */
export type MobileProfileCardVariant = "blocked" | "friend" | "self" | "stranger";

export type MobileProfileCardPrimaryAction =
  | "addFriend"
  | "editProfile"
  | "message"
  | "requestSent"
  | "respondToRequest"
  | "unblock";

export interface MobileProfileCardActionSet {
  /** 44px voice + video squares; friends only (README 1a). */
  readonly calls: boolean;
  /** "Arkadaş olmadığınız için sesli arama kapalı" info line (README 1b). */
  readonly callsDisabledNotice: boolean;
  readonly primary: MobileProfileCardPrimaryAction | null;
  readonly primaryDisabled: boolean;
  /** 44px message square that replaces the calls when the primary is "add friend". */
  readonly secondaryMessage: boolean;
  readonly viewProfile: boolean;
}

const BLOCKED_ACTIONS: MobileProfileCardActionSet = {
  calls: false,
  callsDisabledNotice: false,
  primary: "unblock",
  primaryDisabled: false,
  secondaryMessage: false,
  viewProfile: false,
};

/** Being blocked leaves nothing to act on — not even an unblock. */
const BLOCKED_BY_ACTIONS: MobileProfileCardActionSet = {
  ...BLOCKED_ACTIONS,
  primary: null,
};

const SELF_ACTIONS: MobileProfileCardActionSet = {
  calls: false,
  callsDisabledNotice: false,
  primary: "editProfile",
  primaryDisabled: false,
  secondaryMessage: false,
  viewProfile: true,
};

const FRIEND_ACTIONS: MobileProfileCardActionSet = {
  calls: true,
  callsDisabledNotice: false,
  primary: "message",
  primaryDisabled: false,
  secondaryMessage: false,
  viewProfile: true,
};

/** Everything short of friendship shares one shape; only the primary label moves. */
function nonFriendActions(
  primary: MobileProfileCardPrimaryAction,
  primaryDisabled = false,
): MobileProfileCardActionSet {
  return {
    calls: false,
    callsDisabledNotice: true,
    primary,
    primaryDisabled,
    secondaryMessage: true,
    viewProfile: true,
  };
}

export function getMobileProfileCardVariant(
  profile: Pick<MobileUserProfile, "blocked" | "blockedBy" | "relationship" | "self">,
): MobileProfileCardVariant {
  if (profile.blocked || profile.blockedBy) {
    return "blocked";
  }

  if (profile.self) {
    return "self";
  }

  return profile.relationship === "friend" ? "friend" : "stranger";
}

export function getMobileProfileCardActions(
  profile: Pick<MobileUserProfile, "blocked" | "blockedBy" | "relationship" | "self">,
): MobileProfileCardActionSet {
  if (profile.blockedBy && !profile.blocked) {
    return BLOCKED_BY_ACTIONS;
  }

  if (profile.blocked || profile.relationship === "blocked") {
    return BLOCKED_ACTIONS;
  }

  if (profile.self) {
    return SELF_ACTIONS;
  }

  switch (profile.relationship) {
    case "friend":
      return FRIEND_ACTIONS;
    case "outgoing":
      return nonFriendActions("requestSent", true);
    case "incoming":
      return nonFriendActions("respondToRequest");
    default:
      return nonFriendActions("addFriend");
  }
}

/**
 * Role chips are a server-context fact. The card only draws them when it was
 * opened from a server surface AND the server confirmed both memberships.
 */
export function shouldShowMobileProfileRoles(
  profile: Pick<MobileUserProfile, "blocked" | "blockedBy" | "serverContext">,
  serverId: string | undefined,
): boolean {
  if (!serverId || profile.blocked || profile.blockedBy) {
    return false;
  }

  return (
    profile.serverContext !== null &&
    profile.serverContext.serverId === serverId &&
    profile.serverContext.roles.length > 0
  );
}

/**
 * `RoleBadge.color` is a packed 24-bit integer; 0 means "no colour set", which
 * the handoff draws with the neutral chip dot instead of black.
 */
export function toMobileProfileRoleColor(color: number): string | null {
  if (!Number.isFinite(color) || color <= 0) {
    return null;
  }

  return `#${Math.trunc(color).toString(16).padStart(6, "0").slice(-6)}`;
}

export type MobileProfileStatusTone = "dnd" | "idle" | "offline" | "online";

export function toMobileProfileStatusTone(
  status: MobileFriendPresenceStatus,
): MobileProfileStatusTone {
  switch (status) {
    case "ONLINE":
      return "online";
    case "IDLE":
      return "idle";
    case "DND":
      return "dnd";
    default:
      return "offline";
  }
}

/**
 * "Çevrimiçi — {durum mesajı}" on one ellipsised line. An offline user reads as
 * plain "Çevrimdışı": last-seen is not part of this contract, and a stale custom
 * status next to an offline dot is noise.
 */
export function formatMobileProfileStatusLine(input: {
  customStatus: string | null;
  labels: Record<MobileProfileStatusTone, string>;
  status: MobileFriendPresenceStatus;
  template: string;
}): string {
  const tone = toMobileProfileStatusTone(input.status);
  const label = input.labels[tone];
  const message = input.customStatus?.trim();
  if (tone === "offline" || !message) {
    return label;
  }

  return input.template.replace("{status}", label).replace("{message}", message);
}

export function formatMobileProfileMutualSummary(input: {
  friendCount: number;
  friendsNone: string;
  friendsTemplate: string;
  serverCount: number;
  serversNone: string;
  serversTemplate: string;
  summaryTemplate: string;
}): string {
  const servers =
    input.serverCount > 0
      ? input.serversTemplate.replace("{count}", String(input.serverCount))
      : input.serversNone;
  const friends =
    input.friendCount > 0
      ? input.friendsTemplate.replace("{count}", String(input.friendCount))
      : input.friendsNone;

  return input.summaryTemplate.replace("{servers}", servers).replace("{friends}", friends);
}

/** The row is hidden outright when there is nothing shared to report (README "Empty"). */
export function hasMobileProfileMutuals(
  profile: Pick<MobileUserProfile, "mutualFriends" | "mutualServers">,
): boolean {
  return profile.mutualServers.count > 0 || profile.mutualFriends.count > 0;
}
