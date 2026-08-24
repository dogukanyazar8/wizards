import type { GroupInviteJoinBlockReason } from "@wizards/types";

import { ApiError } from "@/lib/api";

/**
 * Faz 2 §B5. The eight branches `/g/[code]` has to explain, as pure mappings.
 *
 * Kept out of the page because the page is a server component: a `reason` that
 * came back on a preview and an `ApiError` that came back from a join have to
 * produce the same sentence, and that is only checkable if the mapping is a
 * function rather than a JSX branch.
 */

/** Every branch the page can land on. `not-found` has no `reason` counterpart. */
export type GroupInvitePageReason = GroupInviteJoinBlockReason | "not-found" | "unavailable";

export function getGroupInvitePageMessageKey(reason: GroupInvitePageReason): string {
  switch (reason) {
    case "disabled":
      return "groupInvite.error.disabled";
    case "expired":
      return "groupInvite.error.expired";
    case "exhausted":
      return "groupInvite.error.exhausted";
    case "full":
      return "groupInvite.error.full";
    case "blocked":
      return "groupInvite.error.blocked";
    case "not-found":
      return "groupInvite.error.notFound";
    case "unavailable":
      return "groupInvite.error.unavailable";
  }
}

/**
 * A failed join back to the branch it failed on. The service's codes are the
 * contract; anything unrecognised is "unavailable" rather than a blank page,
 * because an unexplained failure is the one outcome the design has no card for.
 */
export function getGroupInvitePageReason(error: unknown): GroupInvitePageReason {
  if (!(error instanceof ApiError)) {
    return "unavailable";
  }

  switch (error.code) {
    case "INVITE_NOT_FOUND":
      return "not-found";
    case "INVITE_DISABLED":
      return "disabled";
    case "INVITE_EXPIRED":
      return "expired";
    case "INVITE_EXHAUSTED":
      return "exhausted";
    case "GROUP_FULL":
      return "full";
    case "BLOCKED":
      return "blocked";
    default:
      return "unavailable";
  }
}

/** Where a successful join lands. The web DM surface is `/messages/<id>`. */
export function getGroupInviteDestination(conversationId: string): string {
  return `/messages/${encodeURIComponent(conversationId)}`;
}

/**
 * The `callbackUrl` a signed-out visitor comes back through. Truncated for the
 * same reason the server-invite page truncates: the code is untrusted path input
 * and a long one has no business round-tripping through the login redirect.
 */
export function getGroupInvitePath(code: string): string {
  return `/g/${encodeURIComponent(code.slice(0, 96))}`;
}
