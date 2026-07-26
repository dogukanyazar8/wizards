/**
 * Pure invite-liveness rules shared by the mobile invite sheet (handoff 2a/2b),
 * the targeted-invite writes and the search's server context. Kept free of
 * Prisma so the rule that decides "is this invite still usable?" is stated once
 * and tested directly instead of being re-derived at each call site.
 */

export interface InviteLifetimeFields {
  readonly expiresAt: Date | null;
  readonly maxUses: number | null;
  readonly uses: number;
}

/** Live = not past its expiry and not out of seats. */
export function isLiveInvite(invite: InviteLifetimeFields, now: number): boolean {
  if (invite.expiresAt !== null && invite.expiresAt.getTime() <= now) {
    return false;
  }

  return invite.maxUses === null || invite.uses < invite.maxUses;
}

export interface LinkInviteCandidate extends InviteLifetimeFields {
  readonly createdAt: Date;
  readonly targetUserId: string | null;
}

/**
 * The link card shows one reusable invite: the newest live invite that is not
 * aimed at a specific person. A targeted invite is single-use and private to
 * its recipient, so it can never become the shared link.
 */
export function selectActiveLinkInvite<TInvite extends LinkInviteCandidate>(
  invites: readonly TInvite[],
  now: number,
): TInvite | null {
  let selected: TInvite | null = null;

  for (const invite of invites) {
    if (invite.targetUserId !== null || !isLiveInvite(invite, now)) {
      continue;
    }
    if (!selected || invite.createdAt.getTime() > selected.createdAt.getTime()) {
      selected = invite;
    }
  }

  return selected;
}
